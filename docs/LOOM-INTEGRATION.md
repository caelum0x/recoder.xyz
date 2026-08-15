# loom → Recoder Engine Integration Plan

> Status: 2026-08-12. Source: 5-analyst integration graph over the vendored engine
> (`apps/desktop/engines/loom`, Apache-2.0). Companion to `docs/COMPETITIVE-HERDR.md`
> (the absorption analysis). Goal: **use loom fully** — drive it as a third
> `ConductorSubstrate` beside `tmux_worktree` and `acp`, not park the source.

## What loom is, mechanically

A standalone Rust binary (`loom` v0.8.0, Rust 1.96.1) with a **headless server**
(`loom server`) exposing a **newline-delimited JSON (NDJSON) Unix-socket control
API** (~94 methods, `PROTOCOL_VERSION=20`). Maps to the tmux/dmux "bundled binary +
`execFile` spawn + resolver" precedent (NOT openfang's in-process NAPI).

## Socket protocol (the client contract)

- **Transport:** one `interprocess` local socket. Unix domain socket on mac/Linux,
  named pipe on Windows. **Connect to `loom.sock`** — `loom-client.sock` is a
  *separate* private TUI render wire; connecting there yields garbage.
- **Socket path:** `LOOM_SOCKET_PATH` if set, else
  `${XDG_CONFIG_HOME:-~/.config}/loom/loom.sock`. Recoder must **own** this path
  per-install (like openfang owns `OPENFANG_HOME`). Perms 0600.
- **Framing:** connect → write `JSON.stringify({id,method,params})+"\n"` → flush →
  **line-buffer** the reply (payloads exceed one socket read — a naive one-read
  client truncates). Split on `\n`; each complete line is one JSON message.
- **Envelope:** success `{id,result:{type,…}}`, error `{id,error:{code,message}}`
  (discriminate on `result` vs `error`). `id` is any caller-chosen string, echoed.
- **Three read modes on the same socket:** (1) single-shot (one line, close);
  (2) blocking-wait — `agent.prompt{wait}` / `agent.wait` / `events.wait` hold the
  socket, emit one line when settled/timed-out (use a long read timeout);
  (3) stream — `events.subscribe` emits `{result:{type:"subscription_started"}}`
  then **bare** `{event,data}` lines (no id/result) until the client closes.
- **Caveat:** only 3 event kinds actually emit via `subscribe`
  (`pane.output_matched/agent_status_changed/scroll_changed`); for lifecycle events
  use single-shot `events.wait`.

## `loom-substrate.adapter.ts` — port → socket mapping

Implements Recoder's `ConductorSubstrate` (the conductor drives the narrow
`EngineSubstrate` slice: id + launch + optional exitCode + optional continueRun).

| Port method | loom call | Notes |
|---|---|---|
| `available()` | `ping` → `pong{protocol}` | reject if `protocol!==20`; missing bin/`ECONNREFUSED` → `{available:false,reason}` (never fake) |
| `capabilities()` | — | `capturesByPolling:false` (loom has native events), supportsPty/Diff/IsolationRemoval:true |
| `launch(input)` | `worktree.create{cwd,branch,base}` → `{workspace,tab,root_pane,worktree}`; then `agent.start{name,kind,pane_id:root_pane.pane_id,timeout_ms}` | `timeout_ms` must be `>3000 && ≤300000`; handle `{ref:workspaceId, worktreePath:worktree.path, sessionName:root_pane.pane_id}` because agent verbs accept pane ids/names, not terminal ids |
| `capture(handle,lines)` | `agent.read{target,source:"recent",lines,strip_ansi:true}` | null on dead handle |
| `alive(handle)` | `agent.get{target}` → `AgentInfo` present | |
| `exitCode?` | `agent.get` → `AgentStatus` | Done⇒0; live⇒**undefined** (never fabricate 0); gone/error⇒null. No OS exit code — same as acp |
| `diff(handle,base)` | **host git** over `worktreePath` | reuse `buildSubstrateDiff` verbatim from tmux adapter; loom has no diff verb |
| `teardown(handle,{removeIsolation})` | stop agent, then `worktree.remove{force}` | best-effort |
| `continueRun?(handle,input)` | `agent.prompt{target,text,wait?}` | same pane/worktree, agent stays live (unlike tmux respawn); if exited, `agent.start` a native resume argv (`claude --resume`, `codex resume`) |

## The free wins (what loom hands Recoder)

- **Native agent-status detection** (`AgentStatus` machine) → a `loom-state.ts`
  mapper (Working→working, Blocked→awaiting_approval, Idle→agent_idle_prompt,
  Done→review_ready, Unknown→unknown) feeding `nativeAttention` into
  `classifyAttention` **before** the tail tier — bypassing the manifest heuristics
  entirely for loom-run agents (augments, never deletes, the tail path).
- **Native git worktree** (`worktree.create`) — replaces `git worktree add`.
- **Native persistence/reattach** — the loom daemon owns PTYs + worktrees and
  survives a backend restart.
- **Synchronous prompt+wait + blocked-detection** (`agent.prompt{wait}` /
  `agent.wait --until blocked`) — the absorb-#3 gap, **for free**.
- **Native resume argv** per agent kind — the absorb-#4 breadth, for free.
- **The 592-plugin ecosystem** (strategic — see decisions).

## Sidecar build + packaging

- **Build:** `cargo build --release --locked` → `target/release/loom`. Needs
  **Rust 1.96.1 + zig ≥ 0.15.2** (build.rs compiles vendored libghostty-vt via zig).
- **Package:** electron-builder `extraResources` `{ from: engines/loom/target/release/loom, to: backend/engines/loom/loom }` + add to `ARCH_SENSITIVE_EXTRA_RESOURCES` (Mach-O arm64 gate) + `packaging-config.test.ts` assertions (mirror tmux/dmux).
- **Resolve+spawn:** new `loom-path.ts` (clone `tmux-path.ts`): `CONDUCTOR_LOOM_BIN` → `<resources>/backend/engines/loom/loom` → repo dev path → `'loom'`. Spawn once as a supervised daemon with a **Recoder-owned `LOOM_SOCKET_PATH`** + **denylist-stripped env** (agents must not inherit backend secrets). Poll for socket + `ping` before issuing calls.

## Phased build order (headless-first)

- **Phase 0 (do first, highest-leverage):** the NDJSON socket client + protocol
  types — pure, tested against captured fixture byte streams. Carries all the
  framing landmines (line-buffering, 3 read modes, bare event lines, two-socket
  confusion). Zero Rust build, zero daemon, zero packaging. →
  `packages/agent-runtimes/src/adapters/loom/{protocol,socket-client}.ts` + tests.
- **Phase 1:** the substrate adapter against an **in-memory fake loom server**
  (net.Server replaying canned JSON) — every port-method→verb mapping + the
  `nativeAttention` bypass. Still headless.
- **Phase 2:** real spawn + `loom-path.ts` resolver + daemon supervision;
  integration-test against the locally-built binary.
- **Phase 3:** packaging (extraResources + arch gate + tests).
- **Phase 4:** register `'loom'` in the `WorkspaceSubstrate` union + registry.
- **Phase 5:** rebrand — LAST, and only if NOT inheriting the plugin ecosystem.

## Strategic decisions to surface (do not silently pick)

1. **Rebrand vs plugin ecosystem — mutually exclusive.** 592 `loom-plugin.toml`
   manifests hardcode a binary named `loom`, the `LOOM_*` env keys, and the
   manifest schema. Rebranding the vendored source **breaks all 592 plugins**.
   Keep a `loom`-compat shim (inherit the ecosystem + distribution) OR rebrand
   (lose it). This is the single biggest product call.
2. **Dual state-of-record.** loom's server itself owns PTYs *and* worktrees;
   Recoder's conductor is the SoR + reconciler. Run loom as a **pure execution
   substrate with Recoder retaining SoR** (AGENTS.md forbids adapters owning
   canonical state); the adapter's handle map must be restart-re-derivable.
3. **Plugin governance.** Plugin `command=[...]` actions run arbitrary argv under
   `LOOM_ENV` outside Recoder's policy gate — 592 unvetted plugins = RCE surface.
   If inherited, `plugin.action.invoke` must route through the governance gate.
4. **Runtime coverage gap.** loom knows a fixed agent set (claude/codex/cursor/
   opencode/pi/gemini); `recoder_code/qwen_code/crush` have no loom `kind` → fall
   back to raw `pane.send_input` (forfeits native status/resume) or extend loom.

## Do NOT

Connect to `loom-client.sock`; assume "one line then close"; assume every line has
`id`/`result` (event lines are bare); rely on `subscribe` for lifecycle events;
fabricate `exitCode` 0 for live agents; move canonical worktree/task state into the
adapter; rebrand the binary/env before deciding on the plugin ecosystem.
