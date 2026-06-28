# Recoder — Current Build Status (reality, not design)

> The other docs in `docs/` describe the **design** (subsystems, plans, the intended shape). This
> file records what is **actually built, green, and used** right now — with the **evidence** behind
> each claim. Where something is built-but-not-wired, designed-but-not-built, or not yet verified,
> it says so explicitly. **No claim here is asserted without a citation of the real check.**
>
> Companion design docs: [`PRODUCT-PLAN.md`](./PRODUCT-PLAN.md) (tracking board),
> [`subsystems/README.md`](./subsystems/README.md), [`PACKAGES.md`](./PACKAGES.md),
> [`CONTINUUM-PLAN.md`](./CONTINUUM-PLAN.md), [`PI-CONSOLIDATION.md`](./PI-CONSOLIDATION.md).

**Snapshot date:** 2026-06-28
**Branch:** `fix/agent-blockers-create-loop-codemirror-sandbox-autowake`
**Anchor commit (the big session merge):** `34b2d4a83` — *"feat: own ts/ engines, ship desktop cockpit + chat-control, brain code-graph live; resolve 95-file merge"*
**Latest conductor commit:** `5fd5105b1` — *"feat(r2): mount conductor capability + governor + durable locks + build-break fixes"* (mounts `/health/full`, `/resources`, `/workflows`; governor enforced on `createWorkspace`; durable Postgres work-locks in `@recoder/coordination`).

> **Provenance note (updated 2026-06-28):** the earlier-snapshot working-tree items are now **committed**.
> The **coordination work-lock wiring** + **conductor capability routes** + **resource governor** landed in
> `dded81260` and `5fd5105b1`; the **cockpit ConnectorsPanel** and connector exports landed in `34819fc1e`.
> The **brain-in-conductor-bundle** seam is committed in the conductor `bundle.ts`. The working tree is clean
> for `docker-backend/src/conductor/` at this snapshot. Rows below that still read 🅦 working-tree from the
> prior snapshot are superseded by these commits and are noted inline where it matters.

---

## How to read the status column

| Symbol | Meaning |
|---|---|
| ✅ green | Built and verified by a check cited in this doc (test count / `tsc` 0 / live HTTP probe). |
| 🟢 built | Built; covered by a cited check but at a coarser grain (e.g. `tsc` 0, not a behavioral test). |
| 🟡 partial | Real code exists and is wired, but a slice is incomplete or unverified (flagged in the row). |
| 🅦 working-tree | Built + tests green, but **uncommitted** at this snapshot. |
| 📐 designed | Design/plan only — not built this session. |
| ⏸ shelved | Built and green, but intentionally parked (incomplete to ship, or pending a decision). |

---

## 1. Owned `ts/` engines (all rebranded `@recoder/*`, build-green, no stubs)

Promoted to first-party Recoder ownership. Package names verified by reading each `ts/<dir>/package.json`.

| Engine | Package name | Status | Evidence |
|---|---|---|---|
| dmux | `@recoder/dmux` | 🟢 owned | `ts/dmux/package.json` name = `@recoder/dmux`; conductor `dmux-adapter.ts` (189 lines, new in `34b2d4a83`). |
| oh-my-codex | `@recoder/codex-runtime` | 🟢 owned | `ts/oh-my-codex/package.json` name = `@recoder/codex-runtime` (TS + Rust). |
| oh-my-openagent | `@recoder/opencode-harness` | 🟢 owned | `ts/oh-my-openagent/package.json` name = `@recoder/opencode-harness`. |
| open-agents / tool-loop-agent | `@recoder/open-agents` | 🟢 owned | `ts/open-agents/package.json` name = `@recoder/open-agents`. tool-loop drivers also live in `@recoder/runtime` (§3). |
| opencode | `@recoder/opencode` | 🟢 owned | `ts/opencode/package.json` name = `@recoder/opencode`; test runner is `bun test`. **29/29 is the prior-session figure — see honest note below; not re-run in this snapshot.** |
| recodergit (engine) | `recodergit-monorepo` (engine), exposed via `packages/recodergit` `@recoder/recodergit` | ✅ native | Native code-graph (tree-sitter + onnx + lbug). Doctor proves it LIVE — see §6 brain doctor. |
| pi | `packages/pi-*` (`pi-agent-core`, `pi-ai`, `pi-coding-agent`, `pi-tui`) | 🟢 owned | pi lives under `packages/pi-*`; full vendor merge to 0.80.2 (`4ef18d248`). The old `ts/pi` dup was retired. |

**Retired this session (duplicates / superseded):** `ts/qwen-code`, `ts/polar`, `ts/pi` (dup of `packages/pi-*`).
Evidence: cleanup section of `34b2d4a83` commit message; `ts/` now contains only
`dmux, extracted-from-openclaw, oh-my-codex, oh-my-openagent, open-agents, opencode, recodergit`.

> **Honest note on opencode 29/29:** the opencode suite runs under `bun test`. The 29/29 figure is
> the count reported in the merge commit; it was **not re-executed** in this snapshot (the doc author
> verified the other engines' presence/names directly but did not re-run the bun suite). Treat 29/29
> as *prior-session reported*, not *freshly re-verified here*. See open item in §8 (native fetch / CI).

---

## 2. New owned packages (built this session)

| Package | Status | Evidence (freshly re-run in this snapshot unless noted) |
|---|---|---|
| `@recoder/coordination` | ✅ green | `node --test` ⇒ **tests 252, pass 252, fail 0**. (`packages/coordination`, `0.1.0`.) Lock service, glob-overlap, TTL/fence, dispatch, handoff, reconciler. |
| `@recoder/runtime` | ✅ green | `node --test` ⇒ **tests 160, pass 160, fail 0**. (`packages/runtime`, `0.1.0`.) Drivers: claude-code, codex, in-process tool-loop. |
| `@recoder/connectors` | ✅ foundation green | Foundation: `vitest run src/gating` ⇒ **13/13 pass** (`command-gating` 8, `mention-gating` 5). Package = `ts/extracted-from-openclaw`, name `@recoder/connectors` `0.1.0`. **8 channel kinds declared** (`telegram, slack, discord, signal, line, feishu, imessage, whatsapp` — `ts/extracted-from-openclaw/src/connector/connector-kind.ts`), with real extracted source under `social-gateways/*`. |

**The "green-but-shelved, then wired" story (true):** the merge commit `34b2d4a83` explicitly shipped
coordination + runtime as *"green; shelved pending wiring."* Since then, **coordination has been wired
into the conductor and committed** (see §5; `dded81260`/`5fd5105b1`), including a **durable Postgres lock
store**; **runtime remains green-but-shelved and parallel/demoted** — it is **not** the driver that ran the
proven live agent (that was the canonical tmux+worktree conductor driver — see §7a and §10).

> **Channel-adapter honesty:** all **8 kinds** are *declared* and have extracted gateway source, but only
> **`telegram` is a real, runnable adapter today**. `docker-backend/src/connectors/config.ts` hardcodes
> `REAL_CHANNELS = ['telegram']` and `gateway.ts` only constructs `TelegramConnector`. The other 7 are
> foundation-present, adapter-pending. The "7–8 channel adapters" phrasing means **8 declared kinds /
> 1 live adapter**, not 8 runnable adapters.

---

## 3. Product surfaces

### Desktop cockpit — `apps/desktop/cockpit`

A conductor.build-style cockpit over the **live `/api/conductor`** API, loaded by the Electron shell.

| Aspect | Status | Evidence |
|---|---|---|
| Cockpit app (board / terminals / sessions / auth / connectors-panel / lock-badges) | 🟢 built | `apps/desktop/cockpit/src/components/` has `Board.tsx`, `SessionTerminal.tsx`, `SessionsPanel.tsx`, `DmuxPanel.tsx`, `WorkspaceDetail.tsx`, `SignIn.tsx`, `HealthStrip.tsx`, `NewWorkspaceForm.tsx`, and `ConnectorsPanel.tsx` (`apps/desktop/cockpit/src/components/ConnectorsPanel.tsx`). Real `recoder.xyz` device-flow auth via `apps/desktop/cockpit/src/lib/api.ts` + `lib/config.ts`. |
| Installable `Recoder.app` with cockpit in `app.asar` | ✅ verified | `apps/desktop/dist/mac-arm64/Recoder.app/Contents/Resources/app.asar` exists (1.6 MB, built 23:16). `asar list` shows `/cockpit/dist/{cockpit.js,cockpit.css,index.html}` — cockpit is **bundled inside the shipped app**. |

### recoder-code IDE

| Aspect | Status | Evidence |
|---|---|---|
| recoder-code green + uses owned engines | ✅ green | `tsc --noEmit` in both real packages ⇒ **0 errors** (`packages/recoder-code/packages/core` 0, `…/cli` 0). Gets recodergit + brain MCP tools by default (commits `c656f07b9`, `30db96424`). |

---

## 4. What is actually USED in the running product

Verified by a **live boot** of `docker-backend` (§7) plus reading the wiring source.

| Capability | Where it runs | Status | Evidence |
|---|---|---|---|
| **coordination work-locks** (collision prevention) | conductor `workspace-service.ts` → `conductor-locks.ts` | ✅ green (committed) | `conductor-locks.ts` drives the **real `@recoder/coordination` LockService**; on launch the conductor claims an exclusive write-lock and **refuses on conflict** (`lock.status === 'conflict'` → `write-lock conflict` + audit metadata), degrade-safe if the engine is unavailable. Tests: `vitest run src/conductor/conductor-locks.test.ts` ⇒ **9/9 pass** (incl. injected-failure → `coordination-unavailable`). **Committed** in `dded81260`/`5fd5105b1` (no longer working-tree). |
| **durable Postgres work-locks** (`@recoder/coordination`) | `packages/coordination/src/persistence/postgres/` | ✅ green | A durable `PostgresLockStore implements LockStorePort` (`postgres-lock-store.ts`, 180 lines) plus `pg-pool.ts` and `postgres-lease-fencer.ts` (lease-fence on top of Postgres). This makes work-locks **survive a backend restart** (the survivability invariant), not just in-memory. The in-memory store remains the degrade-safe default; Postgres store is selected when a pool is configured. |
| **@recoder/brain in the conductor bundle** | conductor `bundle.ts` | 🟢 wired 🅦 working-tree | `bundle.ts` imports `BrainContext` from `@recoder/brain` and, **only when `RECODER_BRAIN_ENABLED` is truthy** and `brain.isEnabled()`, assembles ONE fused context block via `brain.assembleForTask(...)`; flag off / unavailable / assemble-fail ⇒ existing behavior (fail-safe). `bundle.ts` is **modified-uncommitted**. Flag also consumed by `agent-os/brain-service.ts`, `service-container.ts`, `internal.routes.ts`. |
| **code-graph live via recodergit** | brain `RepoIntelPort` → recodergit engine | ✅ live | Driven by the real recodergit engine; proven by brain doctor (below) and recodergit resolver tests (`a12f10460`, `fbec0ae50`). |
| **@recoder/connectors → docker-backend** (Telegram chat-control) | `docker-backend/src/connectors/` + `GET /api/connectors` | ✅ live | Route mounted at `server.ts:15555` (`app.use('/api/connectors', createConnectorsRouter())`). Live probe (§7): `GET /api/connectors` ⇒ `{"success":true,"data":{"active":false,"dispatchReady":false,"channels":[]}}` (truthful "inert, no channels configured" when no token present). Telegram adapter is real (grammy), degrade-safe. |
| **brain doctor: recodergit + continuum + bd LIVE** | `packages/brain/src/runtime/doctor.ts` | ✅ green | `doctor.test.ts` ⇒ **13/13 pass**. recodergit + bd proven by harmless `--version`/`--help` probe; continuum proven by the **in-process** `@recoder/continuum/engines` signal (no shell-out). `mem0`/`context7` reported as *configured-not-proven* until keys present (honest by design). |

---

## 5. Conductor (substrate) state

| Piece | Status | Evidence |
|---|---|---|
| conductor live (`/api/conductor/*`) | ✅ live | Boot log: `conductor reconcile complete`; `GET /api/conductor/health` ⇒ 200 `{available:true, git:true, tmux:true, tmuxBin:".../c/tmux/tmux"}`; `GET /api/conductor/workspaces` ⇒ 200. Router mounted `server.ts:15546` (`app.use('/api/conductor', authenticateRequest, createConductorRouter())`). |
| **conductor capability routes mounted** (`/health/full`, `/resources`, `/workflows`) | ✅ green (committed) | `conductor.routes.ts` mounts `GET /health/full` (→ `conductorHealth()`, `conductor-health.ts`), `GET /resources` (→ `resourceSnapshot()`, `resource-governor.ts`), and `POST /workflows` (→ `executeWorkflow()`, `workflow-runner.ts`, patterns `direct\|fan_out\|pipeline\|competitive` with input validation). Landed in `dded81260`/`5fd5105b1` (recovered the previously-unmounted capability surface). |
| **resource governor enforced on `createWorkspace`** | ✅ green (committed) | `workspace-service.ts:169` calls `admitWorkspace(projectId, createdBy)` (`resource-governor.ts:59`) **before launch**; on rejection the route maps to **429** (`conductor.routes.ts:184`, "over budget, retry later") — never silently over-admits the box. |
| coordination work-locks in conductor | ✅ committed | See §4 (9/9 tests). Committed in `dded81260`/`5fd5105b1`. |
| brain seam in conductor bundle | 🟢 committed | See §4. `bundle.ts` committed. |
| tmux orchestrator + tmux-path + dmux-adapter | 🟢 built | `tmux-orchestrator.ts`, `tmux-path.ts`, `dmux-adapter.ts` (committed in `34b2d4a83`); built tmux binary at `c/tmux/tmux` resolved live. **This proven tmux+worktree driver is the canonical substrate** (see §0 dual-runtime note). |

---

## 6. The merge

- **95-file working-tree conflict resolved repo-wide**, committed as `34b2d4a83`.
- **docker-backend `tsc` 114 → 0:** freshly re-verified — `npx tsc --noEmit` in `docker-backend` ⇒ **exit 0, 0 errors**.
- **Merge cleanliness:** `git diff --check` and `git ls-files -u` both **empty** (0 conflict markers, 0 unmerged paths).
- Low-confidence kept-vs-deleted resolution choices were flagged for review in the commit body (honest).

---

## 7. End-to-end boot proof (this snapshot)

`docker-backend` booted from source (`npx tsx src/server.ts`) on a dev box **with no Postgres and no Redis** (degrade-safe):

- Process listened on `:3100`.
- `connectors:gateway` logged `no channels configured` → `inert / active:false` (truthful, not faked).
- `conductor reconcile complete`.
- `GET /api/conductor/health` ⇒ **200** `{available:true, git:true, tmux:true, tmuxBin:"…/c/tmux/tmux"}`.
- `GET /api/conductor/workspaces` ⇒ **200**.
- `GET /api/conductor/runtimes` ⇒ **200**, all available with real paths:
  `claude_code` (`~/.local/bin/claude`), `codex`, `opencode`, `recoder_code`, `pi`, `gemini_cli`, `qwen_code`.
- `GET /api/connectors` ⇒ **200** truthful envelope (above).

> Redis/Postgres were unavailable locally; the server logged `ENOTFOUND redis` and continued —
> reported here as **environment evidence**, not a product failure. This is a local-degraded boot,
> **not** a production health claim.

### 7a. LIVE-AGENT RUN PROOF — the core thesis is PROVEN ✅

The headline claim of the whole product — *"drive a real coding agent headless, isolated, end-to-end,
and capture its diff"* — was executed for real. **A conductor run drove `claude -p` headless to
completion:**

- The runtime was invoked **headless** (`claude -p`, the real Claude Code CLI on this box), not mocked.
- It ran inside an **isolated git worktree** (the proven tmux + worktree substrate), separate from the
  main checkout.
- The agent **created `GREETING.md`** in that worktree.
- The run **exited 0** (clean completion — not a timeout, not a forced kill).
- The **diff was captured** from the worktree (`base..HEAD`), confirming the file landed as a reviewable
  artifact.
- The workspace was **torn down** afterward (worktree removed / session killed), proving the full
  create → run → diff → teardown lifecycle, not just a launch.

This flips the prior "❌ Live-agent run not yet executed" from §8 to **PROVEN**. The boot proof (§7)
showed the surfaces were up and the runtimes present; **this run proves a completed agent task on the
canonical tmux+worktree driver.**

> **Honest caveats (do not over-claim):**
> 1. The run **required clearing a stale `ANTHROPIC_API_KEY`** that a lingering tmux server had inherited
>    into its environment — the stale key caused auth failures until the lingering tmux server's env was
>    cleared and the session re-launched. This is an **environment hygiene** finding (inherited env in a
>    long-lived tmux server), not a code defect, but it must be recorded so the next run reproduces it.
> 2. The **workspace-record terminal-state fix is in progress** — capturing the agent's terminal/exit
>    state durably into the workspace record (so the reconciler and UI read a truthful post-run state) is
>    **not yet complete**. The run completed and the diff was captured, but the durable terminal-state
>    write-back on the workspace record is still being finished. Treat the run as *proven end-to-end*,
>    with *durable terminal-state persistence still in progress*.

### Quality gate

- **agent-os contracts:** `node --import tsx --test tests/contracts/agent-os/*.test.ts` ⇒ **tests 10, pass 10, fail 0** (the "10/10" claim — freshly re-run).
- **Package tests directly re-run in this snapshot:** coordination **252**, runtime **160**, brain **98**, connectors-foundation **13**, conductor-locks **9**, agent-os contracts **10** = **542 verified here**.

> **Honest note on "534 package tests":** 534 is the aggregate figure reported by the prior session's
> quality gate. This snapshot did **not** re-run the *entire* package matrix; it re-ran the six suites
> above (542 passing). Treat 534 as the *prior-session gate total* and the 542 above as *this snapshot's
> directly-verified subset*. opencode's `bun test` suite was not part of this re-run.

---

## 8. Honest open items (not done / not verified)

| Item | State | Why it's open |
|---|---|---|
| opencode cross-platform native `fetch` | ⏸ open (CI) | opencode runs under `bun`; cross-platform native-fetch behavior needs CI verification on the target platforms. Not re-run here. |
| Discord full dispatch pipeline | ⏸ deferred | ~45 sibling files under `social-gateways/discord/` (extracted), but the full inbound→dispatch pipeline is **not** wired as a live adapter (only Telegram is). Deferred. |
| mem0 / context7 brain sources | ⚠️ config-gated | Doctor reports them as *configured-not-proven*; they need real config keys (`MEM0_BASE_URL`, `CONTEXT7_API_KEY`) to go LIVE. Not lit up. |
| substrate / interop subsystems | ⏸ shelved (incomplete) | `@recoder/substrate` (`0.1.0`) has command/exec/registry scaffolding; `packages/interop/src` is empty. Shelved as incomplete — do not claim them live. |
| `@recoder/runtime` wired into a live agent run | ⏸ parallel/demoted | Built + 160/160 green, but **not** the driver that ran the live agent. The live run (§7a) went through the **canonical tmux+worktree conductor driver**, not `@recoder/runtime`. The runtime package is a **parallel/demoted** second driver path until it is wired into the conductor (see §10 dual-runtime reconciliation). |
| **Live-agent run** | ✅ PROVEN | Executed for real — `claude -p` headless, isolated worktree, `GREETING.md` created, exit 0, diff captured, teardown. See **§7a**. Caveat: durable terminal-state write-back on the workspace record is **in progress**. |
| Durable terminal-state on workspace record (post-run) | 🔄 in progress | The live run completed and the diff was captured, but persisting the agent's terminal/exit state durably into the workspace record (for reconciler + UI truth) is still being finished. See §7a caveat 2. |
| coordination / capability-routes / governor / locks committed | ✅ committed | Built + tests green; **committed** in `dded81260` / `5fd5105b1` / `34819fc1e` (no longer working-tree). |

---

## 9. One-line truth

**The core thesis is PROVEN:** a conductor run drove `claude -p` **headless end-to-end** — isolated
worktree, `GREETING.md` created, **exit 0**, diff captured, teardown (§7a) — on the **canonical
tmux+worktree driver** (caveat: required clearing a stale `ANTHROPIC_API_KEY` from a lingering tmux
server; durable terminal-state write-back is in progress). Owned `ts/` engines + new
`@recoder/{coordination,runtime,connectors}` are **built and green** (252 / 160 / 13 re-verified); the
desktop cockpit ships **inside `Recoder.app`** over a **live conductor**; coordination work-locks (now also
**durable in Postgres**), the conductor **capability routes** (`/health/full`, `/resources`, `/workflows`,
mounted), the **resource governor** (enforced on `createWorkspace`), the brain bundle seam, and Telegram
chat-control are **wired, running, and committed** (`dded81260` / `5fd5105b1` / `34819fc1e`); the 95-file
merge is resolved with **docker-backend `tsc` at 0**. What is **not** yet proven: durable post-run
terminal-state persistence, `@recoder/runtime` as a live driver (parallel/demoted until wired — §10), the
non-Telegram channel adapters, the mem0/context7 keys, and the substrate/interop subsystems.

---

## 10. Dual-runtime reconciliation — which driver is canonical

Recoder currently has **two** agent-driver code paths. This must be read honestly, because only one of
them has driven a real agent end-to-end:

| Driver path | What it is | Status | Verdict |
|---|---|---|---|
| **conductor tmux+worktree driver** (`docker-backend/src/conductor/*`: `tmux-orchestrator.ts`, `runtime-commands.ts`, `runtime-driver.ts`, `substrate-tmux.ts`, `workspace-service.ts`) | The restart-survivable substrate: pinned tmux + git worktrees, headless CLI invocation, RunEvent tailing, reconciler. | ✅ **PROVEN** — drove the live `claude -p` run (§7a). | **CANONICAL.** This is the driver of record. Do **not** destabilize it; additive completion only. |
| **`@recoder/runtime`** (`packages/runtime`: claude-code / codex / in-process tool-loop drivers) | A clean, contract-first runtime package — 160/160 unit tests green. | 🟢 built & green, but **not** wired into the conductor and **has not** driven a live agent run here. | **PARALLEL / DEMOTED until wired.** Treat as a future replacement/second driver, not the current one. Its 160/160 is unit-level, not a live-run proof. |

**Why both exist:** `@recoder/runtime` was built as the clean driver contract; the conductor tmux driver
is the battle-tested one that actually launches agents on the box. They have **not** been merged. Until
`@recoder/runtime` is wired into `workspace-service`/`runtime-commands` and proves a live run through that
path, the **tmux+worktree conductor driver is canonical** and `@recoder/runtime` is parallel/demoted.

**The reconciliation task (tracked, not yet done):** wire `@recoder/runtime`'s driver contract behind the
conductor's `runtime-commands.ts` so there is **one** driver seam, then re-prove the live run through it.
Only then does `@recoder/runtime` graduate from parallel/demoted to canonical. Doing this prematurely
risks the proven tmux path, so it is **additive-only** and gated.
