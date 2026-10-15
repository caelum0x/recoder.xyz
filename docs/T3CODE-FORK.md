# t3code fork: planned subtree, patch queue, sync policy

Status: **design only — nothing imported yet.** This document is the
referenced patch-queue target from `docs/RECODER-T3CODE-COMPOSITION.md`
section 7 ("Repo mechanics and upstream sync"). Read that file first for the
*why* (the composition design: t3 owns sessions/transport/clients, Recoder
owns governance/merge/evidence, Wave owns windows/tabs/tiling) and the
piece-by-piece mapping of every t3code package to its Recoder role. This file
is the narrower *how*: what gets imported, pinned to what, how patches are
tracked, and how upstream drift gets pulled in without breaking Recoder's own
governance seams.

No `third_party/t3code` directory exists in this repo yet. No subtree `pull`
or `add` has been run. This is the plan the next-task #2 work (the
`third_party/t3code` subtree import + pnpm workspace wiring) will execute
against.

## 1. What gets imported

Upstream: `pingdotgg/t3code`, MIT (c) 2026 T3 Tools Inc, ~26k stars, pinned at
`d7202109` (2026-10-07, v0.0.45) for the first import. The import target is
`third_party/t3code` as a **git subtree** (not a submodule — a submodule
would leave a second, separately-cloned tree that CI and contributors have to
remember to init; a subtree lands the code directly in this repo's history,
same convention as the existing Wave fork and the vendored `herdr`/Loom
engine).

Imported whole (kept close to upstream so merges stay cheap):

- `apps/server` (the `t3` CLI / Effect-TS environment server — becomes the
  Recoder environment server, renamed `recoder`)
- `packages/contracts` + `packages/client-runtime` (the versioned RPC schema
  + reconnect/capability-negotiation client)
- `packages/effect-acp` (Agent Client Protocol client)
- `packages/effect-codex-app-server` (typed Codex app-server events)
- `packages/ssh`, `packages/tailscale` (remote environment provisioning)
- `apps/web` (thread sidebar, composer, diff/review, terminal — becomes the
  `recoder-session` Wave block and the served-by-CLI / hosted-at-Connect web
  surface)
- `apps/mobile` (becomes Recoder Remote, bundle `xyz.recoder.remote`)
- `infra/relay` (becomes Recoder Connect, moved onto the owner's own
  Cloudflare account)
- `native/libghostty-vt` (shared with Loom's existing pin — one pin, not two)
- Release tooling: `scripts/build-desktop-artifact`, `release.yml`, the CLI
  single-executable archive step, the license-notice generator,
  `release-smoke`

Not imported / not shipped:

- `apps/desktop` (t3's own Electron shell) — Recoder ships one desktop shell
  only (the Wave fork). Useful modules (updater channels, Linux secret
  storage, SSH UI, permissions, preview/pip, smoke tests) are mined and
  ported into Wave's `emain`, not imported wholesale.
- `apps/marketing` (Astro) — recoder.xyz (this Next site) stays; only the
  `curl install.sh` / docs *pattern* is copied, not the app.

## 2. Internal naming stays upstream-shaped

Internal package names stay `@t3tools/*`, Effect service names and wire
field names stay as upstream wrote them. This is deliberate, not an
oversight: it is the same policy already applied to the Wave fork (`wsh`,
`WAVETERM_*` stay as upstream named them). Renaming internals to
`@recoder/*` would turn every future `git subtree pull` into a manual
re-rename pass across the whole imported tree — expensive, error-prone, and
repeated every sync. Only the **user-facing** surface is rebranded (section
5 below); internals are rebranded exactly once, at the public API boundary,
in the adapter package described in section 3.

## 3. The patch queue

A thin adapter package, `packages/t3-bridge`, is the **only** backend place
upstream schema churn is allowed to land. It maps t3 contracts
(`@t3tools/contracts` wire types, Effect service shapes) to Recoder backend
calls (the governance gate, `ApprovalService`, the audit chain, conductor
workspace state). Nothing outside `t3-bridge` imports `@t3tools/*` directly
on the backend except the two composition seams in section 4.

On the Wave desktop side, `packages/t3-session-bridge` (2026-10-15) is the
analogous third seam: the `recoder-session` Wave block
(apps/desktop/app/frontend/app/view/recoder-session) depends on it, and it is
the only place that imports `@t3tools/contracts` into the Electron renderer.
It is deliberately **not** built on `@t3tools/client-runtime`'s
`EnvironmentSupervisor`/`ConnectionDriver` stack — most of that stack's
connect path (`RpcSessionFactory`) isn't part of the package's own `exports`
map, and the rest (registry, platform-source, relay discovery, auth) is
multi-route application plumbing a single local `recoder` CLI process
doesn't need. `t3-session-bridge` instead builds the one-route WS RPC client
directly on `effect/rpc` + `effect/socket` (part of `effect` itself) against
the real, public `WsRpcGroup` schema. See its `src/effect-client.ts` header
comment for the full reasoning.

Patch queue (tracked here; each entry gets a `bd` issue when work starts —
see `AGENTS.md` issue-tracking convention):

| # | Patch | Why it's a patch, not upstream | Status |
|---|---|---|---|
| 1 | Terminal seam: a `TerminalManager` backend on Loom's protocol-20 socket (bidirectional PTY; worktree launch, pane handle, status) | Upstream's own `node-pty` terminal manager stays as the Windows fallback; macOS/Linux route through Loom instead so Recoder keeps one raw-PTY substrate, not two | **Done** (2026-10-15, both sides — Loom side section 11; Node/apps/server side section 12: `apps/server/src/terminal/LoomTerminalManagerAdapter.ts` selected in `server.ts` on darwin/linux) |
| 2 | Governance seam: `orchestration-v2` `CommandPolicy` + `EffectWorker` call the Recoder backend over loopback before every write/merge/other side effect | t3 upstream has no concept of an external governance backend; this is Recoder's core value and must never be upstream-mergeable away | **Done for one concrete write path** (2026-10-15, section 12): `POST /internal/agent-os/t3-write-gate/decide` (backend) + `apps/server/src/orchestration-v2/RecoderWriteGate.ts` (client), wired into `git/linkCreatedPullRequest.ts`'s PR-link dispatch. Worktree create/remove, `pr.create`/`pr.merge`, and `checkpoint.revert` call sites are NOT yet wired to this gate — same seam, same client, just not called from those sites yet. ACP tool-call path (the nearest existing analogue) still separately gated per `backend/src/domains/conductor/adapters/acp-permission-gate.adapter.ts`, wired 2026-10-14 lane 2. |
| 3 | Rebrand pass (section 5) applied as a patch on top of each sync, never hand-edited into the vendored tree permanently | Keeps the diff against upstream small and mechanical (scriptable find/replace), so a sync is "reapply the patch," not "re-review every renamed identifier" | Not started |
| 4 | Strip t3 telemetry/analytics endpoints, `t3.codes` URLs, Clerk publishable keys, winget/AUR/Homebrew identifiers | Recoder telemetry is off by default and ships its own identity provider (Better Auth, not Clerk); these must never silently reappear on a sync | Not started |
| 5 | License-notice generator: extend to also cover Wave (Apache-2.0, Command Line Inc) and herdr/Loom (Apache-2.0) in one `third-party-licenses.json`, not three | Upstream's generator only knows about its own deps | Not started |

## 4. The two composition seams (unchanged from the design doc) + the session seam

1. **Terminal seam** — Loom (mac/linux) or `node-pty` (Windows) under a
   `TerminalManager` the t3 server drives.
2. **Governance seam** — t3's `CommandPolicy`/`EffectWorker` ask the Recoder
   backend for a verdict before any write, merge, or side effect; the backend
   never drives t3 session state back. Calls go one way only, so the two
   state machines cannot fight each other.

Both seams live in `packages/t3-bridge`, never inline in the vendored
`third_party/t3code` tree — so a sync never has to re-find and re-patch a
seam that moved.

A third, Wave-side seam (2026-10-15, section 3): the `recoder-session` block
talks to the `recoder` server's `orchestration.*` RPC over
`packages/t3-session-bridge`, per the design doc's section 4 ("apps/web"
row): "packages/contracts + client-runtime ... The single session protocol
for Wave blocks. Replaces Recoder's bespoke remote-attach mint/monitor/steer
API." That replacement has **not** happened yet: the bespoke API
(`backend/src/domains/conductor/remote-attach/*`, routes at
`POST/DELETE /api/conductor/remote/sessions*`) still has live callers — the
desktop's own `recoder-remote-access.tsx` block and the hosted
`app/app/[locale]/remote/[sessionId]` web page/API routes (stage (c), the
hosted web at app.recoder.xyz, explicitly out of scope for this pass). It is
not dead code; migrating those callers onto the new RPC seam is deferred to
whenever stage (c) is picked up.

## 5. Rebranding (applied as a scripted patch, not hand-edited upstream)

- User-facing: "T3 Code" → "Recoder", `t3` → `recoder` (the CLI binary),
  "T3 Connect" → "Recoder Connect", the mobile app → "Recoder Remote".
- Bundle IDs: `xyz.recoder.desktop`, `xyz.recoder.remote`.
- Env vars: `T3CODE_*` gain `RECODER_*` aliases (both read; `RECODER_*`
  preferred in new code, matching the existing `WAVETERM_*` precedent).
- Icons: glass/mono, icon-only, no emoji (standing design rule).
- Removed on import, every sync: `t3.codes` URLs, T3 telemetry/analytics
  endpoints, Clerk publishable keys, winget/AUR/Homebrew identifiers
  (Recoder re-registers its own package-manager listings later, separately).

## 6. Sync policy

- **Cadence:** monthly, not continuous. A `git subtree pull --prefix
  third_party/t3code <upstream-remote> main --squash` on a dedicated branch
  (`chore/t3code-sync-YYYY-MM`), never directly on `main` or the active
  feature branch.
- **Gate before merge:** contract tests against `packages/contracts` (the
  wire schema `t3-bridge` depends on) plus one smoke test — start the
  server, open a thread, run one Claude turn and one Codex turn in a sandbox
  repo. A sync that breaks either gate does not land; the patch queue
  (section 3) gets updated with whatever upstream change caused the break.
- **Patch reapplication order:** rebrand pass (patch #3) → telemetry/key
  strip (patch #4) → seam patches (#1, #2) re-verified against the new
  upstream shape → license generator (#5) re-run.
- **Version pin:** recorded in this file's "pinned at" line (section 1) and
  nowhere else — a sync updates that one line plus the patch-queue table,
  never silently.
- **No squashing away upstream history inside `third_party/t3code`** — the
  subtree import preserves upstream commit attribution per the MIT license;
  only the sync branch's own merge commit is squashed into one entry on
  `main`.

## 7. License and attribution (unchanged on sync)

- `third_party/t3code/LICENSE` (MIT, T3 Tools Inc) stays unmodified. MIT is
  compatible with Apache-2.0 (Wave, herdr/Loom).
- Repo-root `NOTICE` gains "Portions (c) T3 Tools Inc, MIT" alongside the
  existing Wave and herdr/Loom Apache-2.0 notices; Apache `NOTICE` text stays
  verbatim.
- Every bundle ships a generated `third-party-licenses.json` (the ported t3
  generator, extended per patch #5) and a Settings → Licenses screen on
  desktop, web, and mobile — this fails the build on a missing license,
  matching upstream's own behavior.

## 8. What this file is not

This is not a license to start the import. `third_party/t3code` does not
exist in this tree yet; next-task #2 (git subtree at `third_party/t3code`
pinned `d7202109`, wired into the pnpm workspace, tests green on arm64) is
the work that executes section 1-2 of this plan. This file exists so that
work has a patch queue and sync policy to build against instead of
improvising one mid-import.

## 9. Import status (2026-10-15 — next-task #2 executed)

`third_party/t3code` now exists. Imported on branch
`feat/recoder-forks-2026-10-15` (cut from `feat/recoder-2026-10-14b`, in
worktree `~/products/recoder-wt-forks-2026-10-15`):

```
git remote add t3code-upstream <local-or-upstream-clone-of-pingdotgg/t3code>
git fetch t3code-upstream
git subtree add --prefix=third_party/t3code <pinned-sha> --squash \
  -m "chore(t3code): subtree import pingdotgg/t3code @ d7202109 (MIT)"
```

Pinned at `d720210996a514368ba99f4860063110033d93fa` (2026-10-07, v0.0.45) —
matches section 1's "pinned at `d7202109`" exactly (full sha above; short
form unchanged). Three commits, in order:

1. `b90bccf87` — the subtree's own synthetic squash commit (git subtree
   internals; do not hand-edit).
2. `a6168f585` — `git subtree add`'s merge commit.
3. `531a7a349` — removed `apps/desktop` + `apps/marketing` per section 1
   ("Not imported / not shipped"). Kept: `apps/server`, `apps/web`,
   `apps/mobile`, `packages/*`, `native/`, `infra/relay`, `scripts/`,
   `patches/`, `.github/workflows/*` (minus the three removed below).
4. `2096253eb` — the rebrand pass (section 5) applied via
   `scripts/rebrand-t3code.sh`: 433 files, "T3 Code"→"Recoder", "T3
   Connect"→"Recoder Connect", `t3.codes`→`recoder.xyz`, mobile bundle IDs
   `com.t3tools.t3code*`→`xyz.recoder.remote*`, the live T3 Clerk
   publishable key stripped from `.env.example`, and
   `publish-aur.yml`/`release.yml`/`release-desktop.yml` removed (patch
   #3 + #4 combined into one scripted, re-appliable commit — re-run the
   script after every sync instead of hand-editing the vendored tree).

**Status: source imported, NOT yet a live build target.** Per section 2's
own policy and the same precedent `third_party/crystal` already set
(`RECODER-VENDOR.md`: "a full-source donor... do not start or package
[it] as a second [app] inside Recoder"), this import stops at "the code is
in the tree, licensed, attributed, rebranded" — it does NOT yet:
- wire `third_party/t3code` into the root `pnpm-workspace.yaml` packages
  list (no `packages/t3-bridge` adapter exists yet — patch queue items #1
  and #2, section 3, are both still "Not started");
- attempt a `pnpm install` / build inside `third_party/t3code` itself (its
  own `apps/server` + `apps/web` + `apps/mobile` dependency tree is large;
  installing and building it was out of scope for this pass and is
  next-task #2's remaining half, tracked separately from the import itself).

**herdr: already done, separately, before this session.** herdr was
vendored wholesale as the **Loom** engine
(`apps/desktop/engines/loom`, Apache-2.0, 2026-08-12) well before this
t3code pass — see `apps/desktop/engines/loom/RECODER-VENDOR.md` for its own
import record, phase history (0-5, all `[x]`), and upstream-sync log. It is
already wired into the live app (`backend/src/domains/conductor/adapters/
loom-substrate.adapter.ts`, `loom-steer-transport.adapter.ts`, the Loom
daemon supervisor, DMG packaging). Nothing in this session re-imports it;
this note exists only because an earlier draft of this plan (and the task
that triggered this session) assumed herdr was still unimported — it
was not.

**Verified working (this session):** `pnpm install --filter` scoped
installs of the governance/backend/desktop-app dependency chains succeed
(pnpm's content-addressable store mostly hardlinks, no large re-download);
the Wave-fork desktop shell builds and launches in `electron-vite dev`
mode, the Go `wavesrv` server starts cleanly (web/websocket/unix-domain
listeners all up) with `apps/desktop/engines/loom`'s existing wiring
untouched, and the OS-level window title reads **"Recoder (Dev)"** —
confirms the rebrand is visible at the window-chrome level, not just in
source strings. The embedded TypeScript control-plane backend
(`backend/src/server.ts`) does NOT fully boot in a fresh worktree without
a full `pnpm -r build` across its ~30+ `@recoder/*` workspace-package
dependency graph (each missing package's `dist/` surfaces as a new
`MODULE_NOT_FOUND` on the next restart — `@recoder/vault`, then
`@recoder/agent-instructions`, and more beyond that); this is the SAME
pre-existing condition `plans/recoder.md`'s 2026-10-14 lane-2 session
already documented ("a full `pnpm -w build` across every workspace package
was out of scope... pre-existing condition, not caused by or related to
this change") — a fresh worktree never has these built, and building all
of them was out of scope for this session's disk/time budget. Dev-mode
also requires `WCLOUD_ENDPOINT=https://<any-https-url>` set in the
environment (an upstream t3code/Wave dev-mode-only config check,
`apps/desktop/server/pkg/wcloud/wcloud.go` `checkEndpointVar` — gated
behind `wavebase.IsDevMode()`, never enforced in a packaged build); this is
undocumented anywhere in this repo and should be added to a dev-setup doc
or given a Recoder-side default so the next person who runs `pnpm run
dev:desktop` from a fresh worktree does not hit the same unexplained
`wavesrv` exit this session hit first.

## 10. Upstream-sync procedure (verified runnable)

Monthly, per section 6, on a dedicated branch (never `main` or the active
feature branch):

```bash
# 1. Pull the latest upstream squash onto the dedicated sync branch.
git checkout -b chore/t3code-sync-YYYY-MM
git fetch t3code-upstream main   # or a new pinned sha, per section 1 policy
git subtree pull --prefix=third_party/t3code t3code-upstream main --squash

# 2. Re-apply the scripted rebrand/strip patch (never hand-edit the vendored
#    tree permanently — this script is the only sanctioned edit path):
bash scripts/rebrand-t3code.sh
git add third_party/t3code NOTICE
git commit -m "chore(t3code): rebrand pass re-applied after sync"

# 3. Re-drop apps/desktop + apps/marketing if upstream re-added them
#    (a sync pulls the FULL upstream tree back in; the exclusion in this
#    repo's history does not "stick" across a subtree pull):
git rm -r --quiet third_party/t3code/apps/desktop third_party/t3code/apps/marketing 2>/dev/null || true
git commit -m "chore(t3code): re-drop apps/desktop + apps/marketing (not imported, section 1)" --allow-empty

# 4. Update this file's "pinned at" line (section 1) + the patch-queue
#    table (section 3) with whatever the new upstream sha and date are.

# 5. Gate before merge (section 6): contract tests against
#    packages/contracts + one live-agent smoke test. A sync that breaks
#    either gate does not land — update the patch queue with what broke.
```

Steps 1-3 above were exercised end-to-end for the INITIAL import in this
session (steps 1 and 3 identically; step 2 is the same script already
committed). The only untested leg is an actual `git subtree pull` against
a SECOND upstream commit (this session only ever ran `subtree add` once,
against the single pinned sha) — the command is upstream `git subtree`'s
own well-established mechanism, not custom tooling, so it is expected to
work identically, but it has not been exercised against this repo's
history by this session.

## 11. Patch-queue item #1, Loom side: TerminalManager on protocol-20 (2026-10-15)

**Status: the Loom (Rust) side is done.** The Node/t3-bridge side that will
call it from the forked t3 server's terminal manager is a separate,
follow-up patch (`packages/t3-bridge` does not exist yet — see section 3,
patch #2 is also still "Not started").

What "protocol-20" means precisely: not Loom's binary `ClientMessage`/
`ServerMessage` wire protocol used by its own interactive TUI client
(`crate::protocol`, currently at `PROTOCOL_VERSION = 21` — a different,
unrelated version counter) — it is Loom's separate JSON-RPC-over-Unix-socket
**API** (`LOOM_SOCKET_PATH`, `crate::api::schema::{Method, Request}`),
documented at `apps/desktop/engines/loom/docs/next/api/loom-api.schema.json`,
whose own `"protocol"` field reads `20`. That socket already has `pane.*`/
`worktree.*` verbs, but every one of them is bound to a running interactive
app's workspace/tab/pane layout — there was no way to launch a bare,
worktree-scoped PTY without a workspace already open. This patch adds one.

Added five new JSON-RPC methods on that same socket, all implemented in
`apps/desktop/engines/loom/src/terminal_manager.rs` (the registry) plus
`src/api/server/terminal_manager_ops.rs` (open/write/status/close) and
`src/api/server/terminal_manager_stream.rs` (the output stream):

- `terminal_manager.open` — `{worktree_id, cwd, cols?, rows?, env?, shell?}`
  → `{pane_handle, pid, worktree_id}`. `worktree_id` is an opaque scoping key
  the caller already knows the path for (not resolved by Loom); it is
  recorded for isolation/observability only.
- `terminal_manager.write` — `{pane_handle, data_base64}` → `ok`.
  Base64, binary-safe (unlike `pane.send_text`'s plain-UTF-8 `text`).
- `terminal_manager.status` — `{pane_handle}` →
  `{alive, exit_code?, pid, worktree_id}`.
- `terminal_manager.close` — `{pane_handle}` → `ok`. Kills the process and
  removes the handle from the registry immediately.
- `terminal_manager.stream` — `{pane_handle}` upgrades the connection into a
  bidirectional push stream: `terminal_manager.output` /
  `terminal_manager.exited` / `terminal_manager.closed` lines pushed to the
  client, and inbound `{"data_base64": "..."}` lines written to the pane's
  stdin — mirroring `pane.terminal.stream`'s shape, but self-contained (no
  bridging to a second, private binary-protocol connection, since these
  panes have no TUI pane/app state to bridge to).

Deliberately independent of `crate::app`'s workspace/tab/pane actor: a pane
opened here is not a TUI pane, has no layout, and does not require a running
interactive app — this is what makes it usable from a headless caller (the
t3 server) instead of only from inside an already-open Loom window. One
`TerminalManager` registry is shared process-wide (`terminal_manager::global()`,
a `OnceLock`), the same sharing shape `EventHub` already uses, so a pane
opened on one API connection is reachable from `write`/`status`/`close`/
`stream` on later, independent connections — proven by the end-to-end test
below, which issues each verb as its own separate socket connection, same as
production.

PTY spawning reuses the crate's existing `portable_pty`-based Unix backend
(`crate::pty::backend::spawn_with_portable_pty`, already used by Loom's own
interactive panes) rather than reinventing fork/exec — only the raw
byte-passthrough read/write loop is new (no VT/ANSI emulation needed here,
unlike the interactive pane renderer: the caller, like `node-pty`, does its
own terminal rendering). Output delivery is a bounded ring buffer polled via
`output_events_after(handle, since_seq)`/`current_output_sequence(handle)`,
the same shape `EventHub::events_after`/`current_sequence` already use —
kept the reader thread fully synchronous (no async runtime needed inside a
plain `std::thread`), consistent with the rest of this file's socket-server
code. Unix-only (`#[cfg(unix)]`): Windows keeps `node-pty` as its substrate
per this file's own architecture (section 4), so there is intentionally no
Windows backend here to keep in sync.

Tests (all real — spawn actual `/bin/sh` subprocesses, not stubs):

- `src/terminal_manager.rs` unit tests: `open_write_read_close_round_trips`,
  `two_worktrees_do_not_cross_talk` (two panes under different
  `worktree_id`s never see each other's output — structural isolation, each
  pane is an independent process + ring), `status_reports_alive_then_exit_code`,
  `unknown_pane_handle_errors_everywhere`, `global_registry_is_a_shared_singleton`.
- `src/api/schema/tests.rs`: JSON round-trip tests for all five `Method`
  variants.
- `src/api/server.rs`:
  `terminal_manager_open_write_stream_status_close_round_trips` — the full
  protocol round trip over a real `LocalStream` socket: open → write →
  stream (reads the echoed output back over the push stream) → status →
  close → status-after-close (confirms the handle is gone, not just dead).

One real bug found and fixed by that last test while writing it: `pump_output`
originally called the existing `should_stop_connection`/`local_stream_peer_closed`
helper on its `output` handle to detect a disconnected client.
That helper (`probe_stream_closed` in `src/ipc.rs`) flips the stream
non-blocking, probes, then flips it back to **blocking** when done. `output`
is a `try_clone()` of the same connection `forward_write_commands` holds
permanently non-blocking on its own thread (for its inbound-write poll
loop) — `dup`'d descriptors share one open-file-description's status flags
on POSIX, so every `pump_output` poll tick was briefly, racily putting the
*other* thread's socket back into blocking mode, and that thread could then
block forever in `read()` waiting for client input that was never coming,
hanging the whole connection (and, in a test, the test process) on a timing
race — reproduced directly with `sample`(1) on a hung test process, stack
trace pointed straight at it. Fixed by not sharing that probe at all:
`pump_output` now only checks the `running` flag and treats a failed write
as disconnection, matching how `pane_terminal_stream.rs`'s own loop already
detects disconnection (never via a read-probe on its public stream either).

## 12. `apps/server` becomes a live build/dev/test target + both seams close, Node side (2026-10-15)

**Status: `third_party/t3code/apps/server` is now a real, buildable,
testable target** — through its OWN nested pnpm workspace (`pnpm install
--filter t3... --filter scripts...`, run from `third_party/t3code`; root
scripts: `install:recoder:cli`, `build:recoder:cli`, `dev:recoder:cli`,
`typecheck:recoder:cli`, `test:recoder:cli`), NOT as a flat root-workspace
member (section 1/9's reasoning against that still holds: it would also
force `@t3tools/web`'s Expo+Electron dev dependency to resolve as a root
member). The scoped install succeeds in about 2 minutes, no native-build
failures (node-pty's prebuilds were found). `tsc --noEmit` (the project's
own effect-tsgo-backed typecheck, which enforces house lint rules like
`deterministicKeys`/`globalRandom`/`globalTimers`/`preferSchemaOverJson` as
hard errors, not just the bare TypeScript compiler) is clean. `node
--experimental-strip-types src/bin.ts --help` boots the real CLI and prints
real subcommand help.

**CLI rename (patch-queue nothing-numbered, but requested directly):** the
rebrand pass (`scripts/rebrand-t3code.sh`) never covered the CLI's own
identity — confirmed, then scoped deliberately narrow. Renamed: `apps/server/
package.json`'s `"bin"` key (`t3` → `recoder`) and `src/binCli.ts`'s
`Command.make("t3", ...)` + both `commandPath` arrays (the CLI's own
self-reported usage/help text: `recoder <subcommand> [flags] [<cwd>]`, `recoder
help`). Deliberately NOT renamed: `package.json`'s `"name"` field (still
`t3`) — renaming it cascades into the effect-tsgo `deterministicKeys` lint
rule, which derives EVERY `Context.Service`/`Context.Tag` string key in the
whole `apps/server` tree from the package name (confirmed: renaming `name`
alone produced 150+ new `error TS377049` diagnostics across completely
unrelated files, e.g. `t3/terminal/PtyAdapter` → `recoder/terminal/
PtyAdapter`); also NOT renamed: `src/cli/invocation.ts`'s npm/npx/pnpm-dlx/
bunx package-runner-detection logic, `serviceLauncher.ts`/`cloud/
pinnedRuntime.ts`'s pinned-executable-name constants, and the matching test
fixtures — those are about the **npm package name** (still `t3`, so `npx t3
serve` / `lib/node_modules/t3/` are the CORRECT, still-true paths) and the
**release pipeline's built-artifact name** (untouched, out of scope per this
task's "no deploy/release/CLI-publish action" instruction), not the CLI's
own command identity. A full `t3`-package → `recoder`-package rename is a
separate, larger future patch (it would need the `deterministicKeys` rule
re-run/accepted across the whole tree, which is exactly the "re-rename pass
on every sync" cost section 2 already warns `@t3tools/*` internals renames
would cost — now proven true for this field too, not just `@t3tools/*`).
Verified: `recoder --help`'s own output now says `USAGE: recoder <subcommand>`;
393/395 tests pass across `src/terminal`, `src/git`, `src/cli` (the 2
failures are pre-existing on pristine, UN-rebranded code too — see below).

**Terminal seam, Node side** (`apps/server/src/terminal/
LoomTerminalManagerAdapter.ts`, new file): implements `PtyAdapter.PtyAdapter`
(the same `Context.Service` interface `NodePtyAdapter.layer` already
satisfies) by talking to Loom's `terminal_manager.open/write/status/close/
stream` socket methods from section 11. `server.ts`'s single `const
layerPtyAdapter = NodePtyAdapter.layer;` composition line is now the ONLY
vendored-tree edit this seam needed: `process.platform === "win32" ?
NodePtyAdapter.layer : LoomTerminalManagerAdapter.layer`. The Node-side
NDJSON client is a deliberate, narrow DUPLICATE of this repo's root-workspace
canonical client (`packages/agent-runtimes/src/adapters/loom/
{protocol,socket-client}.ts`, ALSO extended today with the same five
`terminal_manager.*` methods + their own real tests) — `apps/server` cannot
import a root-workspace `@recoder/*` package (see file header for the full
reasoning). Known gaps, reported not hidden: no resize verb exists yet on
`terminal_manager.*` (degrades to a no-op); `TerminalManagerOpenParams` has
no `args` field (Loom's `CommandBuilder::new(&shell)` treats `shell` as a
literal argv[0], so POSIX zsh's cosmetic `-o nopromptsp` flag is dropped with
a one-time logged warning — no functional loss, just the raw-zsh-prompt `%`
marker on an incomplete line). Real tests (`LoomTerminalManagerAdapter.test.ts`,
a FAKE Loom socket server, no stubs): spawn → open round trip, streamed
output/exit delivered to `onData`/`onExit`, `kill()` → `terminal_manager.close`,
`resize()` no-op proof. (Tooling note: `it.effect`'s default virtual
TestClock hangs `Effect.sleep` forever in this harness — these tests use
`it.live` instead; cost ~45 minutes of debugging before being isolated via a
scratch `zdiag.test.ts`, worth documenting here so the next person doesn't
repeat it.)

**Governance seam, Node side, ONE concrete write path**: `POST /internal/
agent-os/t3-write-gate/decide` (`backend/src/domains/governance/{adapters/
t3-write-gate.adapter.ts,routes/internal-t3-write-gate.routes.ts}`, wired
into `backend/src/bootstrap/index.ts` next to `conductorCommandGate`) — a
THIRD independent `CommandGate`+`FileAuditLog` instance (own audit log,
`~/.recoder/audit/t3-write-gate.jsonl`), `requireInternal`-gated, same
fail-closed contract as every other gate in this repo. Client side:
`apps/server/src/orchestration-v2/RecoderWriteGate.ts` (new file, plain
`fetch()` — the architecture doc's own wording, "over loopback", already
names HTTP as this seam's wire, so unlike the terminal seam there was
nothing to duplicate), wired into exactly ONE real call site:
`git/linkCreatedPullRequest.ts`'s PR-link dispatch (`pr.link` action). Real
tests: `backend/.../t3-write-gate.adapter.test.ts` (6 tests: allow path,
audit-log recording, deny path, approval-record opening, no-fabricated-allow
on retry, and the explicit "approval on target A does not clear target B"
proof the architecture doc requires) all pass; `apps/server`'s own
`linkCreatedPullRequest.test.ts` updated with an injectable
`RecoderWriteGateDeciderRef` (mirrors `LoomSocketPathRef`'s pattern) so its
existing tests never need a live backend. **Not yet wired**: worktree
create/remove, `pr.create`, `pr.merge`, `checkpoint.revert` — same gate,
same client, just not called from those sites in this pass. `backend`'s own
`tsc --noEmit` shows zero new errors from either new file (108 pre-existing
`MODULE_NOT_FOUND` errors remain, from unbuilt `@recoder/*` packages — the
same documented pre-existing condition section 9 already called out, not
something this session caused).

**Confirmed pre-existing, NOT caused by this session** (isolated by
re-running against pristine, un-rebranded `git show HEAD:...` copies of the
files): `src/cli/invocation.test.ts`'s two "manual server installation
ownership" tests fail identically on vanilla code, root-caused to this
machine's `/var` → `/private/var` symlink (`fs.realPath` resolves the
BSD/macOS symlink, a test fixture's expected string does not) — a macOS-only
environment issue, not a logic bug, and not touched.

**Not attempted this session** (explicitly out of scope per the task):
backend's own `pnpm install`/typecheck hit a REAL, pre-existing regression —
`packages/auth`'s `postinstall` (`prisma generate`) crashes
(`SchemaAST.js:1705 TypeError: members.map is not a function`) because
`effect@4.0.1` (the root catalog pin patch #2's t3-bridge session added for
`@t3tools/contracts`/`@t3tools/shared`) is ALSO now resolving into
`@prisma/config`'s dependency chain somewhere in the ~75-project root
workspace, and `@prisma/config` was built against an older Effect Schema
shape. Worked around for typecheck purposes via `--ignore-scripts`; the
underlying `effect@4.0.1` catalog-wide resolution conflict is a real,
separate bug for a future session (the t3-bridge README's "three SCOPED
overrides, not the global floor" claim does not fully hold once a wider
`pnpm install` actually reaches `packages/auth`).

**Desktop polling → structured RunEvents swap: NOT done, and not even
reachable yet.** `apps/server` is not currently spawned by, or connected to,
the desktop app at all — the desktop's embedded control plane is still
`backend/src/server.ts` (a separate TypeScript process), and the desktop's
Session/board view (`apps/desktop/app/frontend/app/view/recoder/
recoder-model.ts`) gets state from a 6-second `GET /workspaces?archived=false`
poll with a "live state frame" fast path layered on top (from the EXISTING
Loom/backend substrate, not from `apps/server`). Swapping that poll for a
subscription to `apps/server`'s structured RunEvent stream requires, first,
actually spawning `apps/server` as a process the desktop talks to (replacing
or sitting beside `backend/`) — a separate, larger integration this session
did not attempt. Reported honestly rather than claimed.

**Provider adapters**: NOT separately verified this session beyond what
already existed in the vendored tree (Claude Agent SDK, Codex app-server,
Cursor, OpenCode, Pi, Grok, ACP registry drivers under `src/provider/`) —
`pnpm --filter t3 exec vp test run` on the broader `src/provider` tree was
not run this session (time budget went to the two seams + CLI rename
instead); a future pass should add the boot + Claude-adapter smoke test the
original task asked for.

## 13. `recoder-session` Wave block: Session + Review, (a)+(b) only (2026-10-15)

Next-task #6 ("recoder-session web block in the Wave shell") from
`~/products/plans/recoder.md`, scoped per
`docs/RECODER-T3CODE-COMPOSITION.md` section 4's "apps/web" row to (a)+(b)
only — no stage (c) hosted `app.recoder.xyz` in this pass.

**Built**: `apps/desktop/app/frontend/app/view/recoder-session/` — a new Wave
block (`viewType: "recoder-session"`, registered in `blockregistry.ts`
alongside the other `recoder-*` blocks) with a thread sidebar, a composer, a
message stream, and a Review panel rendering the active thread's full-thread
diff via the real `@pierre/diffs` `CodeView` (Apache-2.0; `parsePatchFiles`
turns the server's unified-diff string into `CodeViewDiffItem[]`). Board,
approval, and converge blocks were not touched; the raw interactive terminal
stays the existing Loom block (`recoder-loom-terminal`), meant to sit side by
side per section 12's milestone row — this pass did not add a second,
redundant interactive terminal inside `recoder-session` (apps/web's own
ghostty-vt WASM terminal is used only for ITS interactive pane per
`apps/web/src/terminal/ghostty/surface.ts`, not for rendering transcript tool
output, so there was nothing there to port into the message stream either;
this is a deliberate scope cut, not an oversight).

**New package**: `packages/t3-session-bridge` — see section 3/4 above for why
it is NOT built on `@t3tools/client-runtime`. Exports a plain
`RecoderSessionRpcClient` interface (`connect`/`disconnect`/`listThreads`/
`subscribeThread`/`sendMessage`/`getFullThreadDiff`), a real
`EffectRecoderSessionRpcClient` (the only file touching `@t3tools/contracts`
directly), and a `FakeRecoderSessionRpcClient` (in-memory, deterministic) the
Wave block's own tests inject instead of needing a live `recoder` server.

**Known, reported gap — this does not boot end-to-end yet**: per section 12
above, `apps/server` is not currently spawned by, or connected to, the
desktop app at all. `recoder-session`'s default socket URL
(`defaultRecoderSessionSocketUrl()`, `ws://127.0.0.1:3773/ws`) assumes some
process is already serving the `recoder` CLI's RPC socket on its default
port — today that only happens if a developer runs
`pnpm dev:recoder:cli` by hand in a second terminal. Wiring the desktop app
to spawn (or attach to) that process is the same "separate, larger
integration" section 12 already named for the Session/board view's
poll-to-RunEvent swap, and was not attempted here either — reported honestly
rather than silently assumed.

**Bespoke remote-attach API — checked, found live, NOT migrated**: the
design doc says the new RPC layer "replaces Recoder's bespoke remote-attach
mint/monitor/steer API." That API
(`backend/src/domains/conductor/remote-attach/*`, routes
`POST/DELETE /api/conductor/remote/sessions*` in
`backend/src/domains/conductor/routes/conductor.routes.ts`) has real, live
callers today: the desktop's `recoder-model`-adjacent
`recoder-remote-access.tsx` block, and the hosted web app's
`app/app/[locale]/remote/[sessionId]/page.tsx` + its
`app/api/remote/sessions/**` routes — the stage-(c) hosted-web surface this
pass explicitly excludes. It is not dead code, so it was not removed or
migrated this pass; that migration is deferred until stage (c) (hosted
`app.recoder.xyz`) is picked up, per this task's own scope cut.

**Tests**: `packages/t3-session-bridge/src/fake-client.test.ts` (the fake
client's own contract) and `effect-client.test.ts` (the one pure, socket-free
helper); the Wave block's own
`apps/desktop/app/frontend/app/view/recoder-session/recoder-session-model.test.ts`
covers session-open (connect → list threads → open the first one),
message-stream (composer send round-trips exactly once; a server-pushed
assistant reply lands without a resend; switching threads unsubscribes the
old one so its late events never leak in), and diff-render (loads the active
thread's diff; a thread with no diff yet renders the real empty-diff shape,
never a `null`-as-loading state) — all against `FakeRecoderSessionRpcClient`,
no live `recoder` server needed in CI.

**Also deferred, reported honestly**:
- `@pierre/diffs`'s inline accept/reject and edit-in-place are not wired;
  the Review panel is read-only in this first version.
- `third_party/t3code`'s own vendored, patched `@pierre/diffs` build
  (`patches/@pierre%2Fdiffs@1.5.2.patch`, adding a find/search panel) was not
  re-applied to Recoder's own direct dependency — the unpatched, published
  1.5.2 is used as-is (see NOTICE).
- The message stream only renders `message.updated` domain events; the other
  ~20 `OrchestrationV2DomainEvent` kinds (run/turn-item/node/plan/checkpoint
  updates — the data a richer "what is the agent doing right now" view would
  need) are not yet mapped to anything the block renders.
- No reconnect/backoff: `EffectRecoderSessionRpcClient` opens one socket and
  reports it broken rather than retrying, unlike `client-runtime`'s own
  `EnvironmentSupervisor`. Acceptable for a first version talking to a
  same-machine dev server; revisit before stage (c)'s remote routes need it.
