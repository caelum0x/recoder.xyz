# Terminal Unification — shared-tmux-server invariant + naming contract

> **Scope of this note (docs-only).** The terminal is the product, and the durable-shell
> lifecycle is load-bearing. This document establishes the *contract* the tractable
> unification work (Bucket A) converges on, and draws a hard, honest line between that
> work and the load-bearing lifecycle merge (Bucket B, owner-deferred). It describes the
> **true current state**, not an aspirational one: where the code says a guarantee is not
> yet wired, this note says so.

Recoder ships **two independent durable-session systems**. Both answer the same question —
"survive a backend/app restart" — with different machinery. This note names them, states
exactly where they diverge, defines the invariant that makes them share one tmux server,
locks the `recoder-<id>` naming contract, and records the Bucket A / Bucket B split.

---

## 1. The two mechanisms

| Dimension | **Wave Go shell** (`apps/desktop/server`, Go) | **Conductor tmux substrate** (`backend/src/domains/conductor`, TS) |
|---|---|---|
| Unit | `waveobj.Block` (`view:"term"`, `controller:"shell"`/`"cmd"`) in the block-controller registry | Workspace → `recoder-<workspaceId>` tmux session bound to a `git worktree` |
| PTY owner (local) | **In-process** `creack/pty` master in the Go server | **tmux** owns the PTY inside the tmux server; conductor drives it over the CLI |
| PTY owner (durable) | Remote `wsh` **JobManager** daemon opens its own `creack/pty` and self-daemonizes | tmux session (already daemon-like); survives backend restart by construction |
| Durability substrate | Home-grown: JobManager + unix socket + circular-seq replay buffer + sqlite `db_job` + WaveFS output | tmux `remain-on-exit` + deterministic session name + agent-os Postgres state-of-record |
| Restart recovery | Reconnect matched by `JobManagerPid`+`StartTs`+`AuthToken`; replay from last seq; `JobManagerGone` → `[session gone]` | `packages/substrate/src/reconcile/reconcile.ts`: scan live `recoder-*` sessions, rebind + relock survivors, finalize crashed orphans truthfully |
| Local durability today | **None** — local/WSL blocks are ephemeral; app restart kills the shell, only WaveFS scrollback is redisplayed and a fresh shell is spawned | Full — local `recoder-*` sessions survive backend restart and are reconciled |
| tmux usage | **Zero** in `pkg/` + `cmd/` (grep-confirmed) | Central; binary via `backend/src/domains/engines/tmux-path.ts`; **tmux default socket** (no `-L` / `-S <socket>` / `TMUX_TMPDIR` — the `-S` at `tmux-substrate.adapter.ts:284` is `capture-pane -S -<lines>`, a scrollback flag) |
| Reconciler | Per-block, on frontend re-render + conn-up handlers | One gated server-side reconciler over the whole box |

### Where they diverge (the crux)

1. **Durability engine.** Wave rolled its own daemon (JobManager) *only for remote SSH*;
   local blocks have **no durability at all**. The conductor solves the identical
   "survive a backend restart" problem with tmux — and `tmux-path.ts` documents *why*
   ("the node-pty session-mux attempt was reverted because it cannot survive a backend
   restart"). Two independent answers to one question.
2. **Where the PTY lives.** Wave local = in the Go server process (dies on restart).
   Conductor = in tmux (outlives everything). This is the single load-bearing difference.
3. **Reconciler count.** Wave reconciles per-block from the frontend; the conductor has one
   authoritative server-side reconciler. Unification wants **one**.

---

## 2. The shared-tmux-server invariant

For a single `recoder-*` session to be reachable identically from either language, every
process that drives tmux must talk to **the same tmux server**. A tmux server is identified
by **(binary, socket)**:

- **Same pinned binary.** `tmux-path.ts` resolves `CONDUCTOR_TMUX_BIN` →
  `RECODER_TMUX_BUILD_PATH` → vendored `apps/desktop/engines/tmux/tmux` → PATH `tmux`
  (last resort). `dmux/src/utils/tmuxBin.ts` uses the same chain, and
  `apps/desktop/app/emain/emain-wavesrv.ts` injects the same binary + PATH dir into the
  wavesrv child env.
- **Same socket.** The conductor uses tmux's **default** socket
  (`${TMUX_TMPDIR:-/tmp}/tmux-<effective-uid>/default`). The current "same server"
  guarantee therefore rests on both the Node backend and the Go wavesrv resolving the same
  `$TMUX_TMPDIR` and the same effective uid.

**What is convergent, and what only *looks* convergent (honest current state):**

- Binary pinning **exists** on the conductor side (`tmux-path.ts`), and an attach-block
  builder **ships** (`apps/desktop/app/frontend/app/view/recoder/recoder-open-terminal.ts`):
  it builds a `cmd` block running `tmux attach-session -t recoder-*`, prefix/allowlist
  validated, with `cmd:runonce=false` so it re-attaches after relaunch.
- **BUT the pin is not wired through the attach path today.** The builder reads the pinned
  binary from `GET /api/conductor/health/full` → `body.data.substrate.tmuxBin`
  (`recoder-open-terminal.ts:74-76`). That route/field **does not exist**: the conductor
  defines only `GET /api/conductor/health` returning `{available, tmux, reason?}`
  (`conductor.routes.ts:361-374`) and `/substrates`; the only `/health/full` is the
  observability aggregator mounted at root, which carries no substrate binary/socket. So the
  builder always falls through to `FallbackTmuxBin = "tmux"` (`recoder-open-terminal.ts:8`).
  Through this path the binary pin is a **silent no-op today** — PATH `tmux` may resolve to a
  different binary/server than the vendored one the conductor drives.

The invariant above is the *target* Bucket A makes real and asserted; it is not yet true
end-to-end. Bucket A's first, load-bearing step is to **create** the health field, not to
extend one that already exists.

---

## 3. The `recoder-<id>` session-naming contract

A durable workspace terminal is a tmux session named by a single, shared rule:

- **Prefix:** `SESSION_PREFIX = "recoder-"` (`tmux-substrate.adapter.ts:49`).
- **Producer:** `tmuxNameFor(id)` = `` `${SESSION_PREFIX}${id.replace(/[^a-zA-Z0-9_-]/g, '_')}` ``
  (`tmux-substrate.adapter.ts:52-53`) — every character outside `[a-zA-Z0-9_-]` becomes `_`.
- **Consumer / validator (wave side):** `recoder-open-terminal.ts` accepts only
  `^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$` and rejects everything else, keeping guest-supplied
  payloads from smuggling tmux flags or target syntax. `cmd` is the program the block runs,
  so the name is validated at the trust boundary, never taken from the guest for the binary.
- **Filtering by construction:** the read-only scan source
  (`tmux-scan-source.adapter.ts`) surfaces only sessions whose name carries the
  `recoder-` prefix; a user's unrelated tmux sessions are **never** touched.

The contract is: **the wave TS validator accepts exactly the set the conductor producer
emits, and rejects everything else.** A golden-vector test (same inputs → same names /
accept-reject) locks it at the contract level. This is a **TS-both-sides** contract; it does
**not** require editing the Go shell. A future Go-side producer/validator would be Bucket B.

---

## 4. Bucket A — tractable, behavior-preserving, verifiable now

Every Bucket A step must satisfy all three gates:

1. **Behavior-preserving.** The default terminal lifecycle, the durable-session identity
   (which server/socket a `recoder-*` session lives in), the PTY owner, and every restart
   path are unchanged in effect. Each step is additive: a new health field, a new
   const+test, a read-only bridge, or a flagged opt-in.
2. **Verifiable-now.** Provable by a focused unit/contract test **without** a packaged
   Electron e2e.
3. **No-Go-edit rule.** **No Bucket A step edits any Go file under `apps/desktop/server`**
   (`pkg/blockcontroller`, `pkg/shellexec`, `pkg/jobmanager`, `pkg/jobcontroller`). That
   surface is only fully exercised in the packaged app and needs `go build`; touching it is
   not verifiable-now and crosses into Bucket B by construction. Bucket A lives in **TS/Node
   backend, TS Electron-main, and TS frontend view code only**. It also never edits any
   vendored OSS under `apps/desktop/engines/tmux`.

| Step | What it adds | Behavior-preserving? | Touches Go? |
|---|---|---|---|
| **A1a** | Create `substrate.tmuxBin` (the resolved pin from `tmux-path.ts`) on a conductor health route, and point `recoder-open-terminal.ts` at the shipped shape. Closes the silent no-op: the attach action starts sourcing the *vendored* binary instead of PATH `tmux`. | Yes — only the explicit, opt-in attach action changes which binary it resolves; default controller selection is untouched. | No |
| **A1b** | Add `substrate.tmuxSocket` as the **default-socket mirror** — tmux's own algorithm `${TMUX_TMPDIR:-/tmp}/tmux-<effective-uid>/default`, emitting `null` when it cannot be replicated with confidence rather than a guess; propagate the **same `TMUX_TMPDIR`** to the wavesrv child in `emain-wavesrv.ts`. | Yes — codifies and asserts today's coincidence; selects no new socket, moves no session's home. | No |
| **A2** | Read-only list bridge: LIST `recoder-*` sessions via the pinned binary+socket (reuse the Node scan adapter over a read-only edge, **or** an Electron-main `execFile(tmuxBin, ['list-sessions', ...])`). Pure read, prefix-filtered, degrade-truthful (tmux absent → empty list + warn). | Yes — additive, unused by the default lifecycle. | No |
| **A3** | Generalize the shipped attach bridge behind an opt-in/flag: source `tmuxBin` + socket from A1's health payload, keep the prefix/allowlist validation, keep `cmd:shell=false`, `runonce=false`. Does **not** replace the default `ShellController`/`DurableShellController` selection. | Yes — default selection unchanged; attach stays opt-in. | No |
| **A4** | Session-naming contract as a shared, tested spec: golden input→output vectors where conductor `tmuxNameFor` and the wave TS validator agree (same accepts, rejects, sanitization). | Yes — test + doc only. | No |
| **A5** | This document. | Yes — doc only. | No |

### The default-socket-mirror-only rule (A1b)

A1b **mirrors and asserts** tmux's *default* socket. It must replicate tmux's algorithm
exactly; an approximation that yields the wrong path is **worse than emitting nothing** (it
asserts a false identity). If the algorithm cannot be replicated with confidence on a given
platform, emit `tmuxSocket: null` and let the client treat it as **"unknown"** — a truthful
state — never as a guessed default.

Pinning an **explicit** socket (`-L recoder` / `-S <path>`) is **NOT** Bucket A. Introducing
an explicit socket changes which server the conductor uses and would **orphan every existing
default-socket `recoder-*` session on the next restart**. That is a durable-session lifecycle
change — Bucket B (B5), owner-gated. A1b and B5 must not be conflated.

**Default Go durable-shell lifecycle is unchanged in Bucket A.** No Bucket A file alters
`ShellController`/`DurableShellController` default selection, the `db_job`/JobManager
lifecycle, the conductor's tmux socket, or any Go file under `apps/desktop/server`.

---

## 5. Bucket B — owner-deferred deep unification

These change the load-bearing default terminal lifecycle, the durable-session identity,
and/or retire a restart path. **Do not execute autonomously.** Each needs **owner sign-off**
**and** a **packaged-app integration test** (the failure modes are invisible to unit tests) —
per `.claude/rules/production.md`, a terminal-lifecycle change is customer-visible delivery
and requires an approval gate. Every step here either edits Go under `apps/desktop/server` or
changes which server/socket/PTY a durable session uses.

- **B1 — Route the *default* durable-shell block through tmux attach.** Make controller
  selection choose "attach to `recoder-<id>`" instead of spawning an in-process `creack/pty`
  for durable workspace terminals. This is the "terminal IS the product" seam: PTY ownership,
  input/resize forwarding, scrollback/WaveFS mirroring, signal handling, and the block status
  machine. Edits Go; only provable across a real app relaunch.
- **B2 — Retire / narrow the JobManager durability path.** Once tmux is the on-box durable
  substrate, the home-grown JobManager (daemonize, unix socket, seq-replay, `db_job`) is
  redundant for local/on-box work — but it is the *working* durability for **remote SSH**,
  where tmux may be absent. Scoping it is a product-capability decision. Edits Go.
- **B3 — Collapse to one reconciler.** Make wave's per-block resync a pure attach/view over
  `packages/substrate/src/reconcile/reconcile.ts`. Cross-language ordering, lock ownership,
  and orphan finalization must not double-fire or race. Edits Go; only provable on a packaged
  restart test.
- **B4 — Local durability parity.** Give local/WSL wave blocks the same tmux durability the
  conductor has (today they have none). Users *feel* this (shells now survive restart), so
  the owner decides whether that is the product.
- **B5 — Pin an explicit tmux socket.** Switch conductor + wave from the default socket to
  `-L recoder` / `-S <path>`. This **orphans every existing default-socket `recoder-*`
  session at the next restart** and needs a migration/reconcile story. Distinct from A1b,
  which only mirrors/asserts the default socket.

---

## 6. Verification (Bucket A)

- `pnpm check-types` (TS) for all Bucket A code. **No `go build` / `go test` is required** —
  Bucket A touches no Go. If a step needs `go build`, it is misfiled and belongs in Bucket B.
- Focused package tests: existing conductor substrate + `reconcile-scan-wiring` tests stay
  green untouched, plus the new A1a health-field, naming-golden, socket-identity, and
  list-bridge unit tests.
- **Silent-no-op proof:** a test showing the attach path resolves the **pinned** binary once
  A1a ships, instead of falling back to PATH `tmux`.
- **Degrade-truthful proof:** tmux-absent path returns a typed empty list + warn on both the
  conductor scan source and the new wave list bridge; unknown socket → `null`, never a
  guessed default.
- **Regression / scope guard:** default controller selection is unchanged, and the Bucket A
  diff changes **zero** files under `apps/desktop/server` (enforceable as a diff-scope check).

**Out of scope until Bucket B (needs the packaged app):** attach continuity across a real
Electron relaunch, replay-gap correctness, single-reconciler race behavior, SSH-durability
parity, and explicit-socket migration/orphaning.

---

## 7. Bottom line (honesty)

The unification is **partially scaffolded but not working end-to-end**: binary pinning exists
on the conductor side and an attach-block builder ships, but the health field that would feed
it the pinned binary **does not exist**, so today the attach path silently uses PATH `tmux`.
The safe, do-it-now work (Bucket A) is small: create `substrate.tmuxBin` on a conductor route
and wire the attach client to it, mirror-and-assert tmux's *default* socket only, add a
TS-only read-only list bridge, lock the naming contract with golden tests, generalize the
existing attach path behind a flag, and document it — all behavior-preserving, TS-only (no
Go), and unit-verifiable. The part that actually *unifies* — making the **default**
durable-shell block *be* the conductor session, retiring the JobManager restart path,
collapsing reconcilers, and pinning an explicit socket — is load-bearing, edits the Go shell,
and is only provable on the packaged app. That is Bucket B and must not be executed
autonomously.
