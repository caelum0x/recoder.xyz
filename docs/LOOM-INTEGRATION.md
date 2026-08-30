# Loom to Recoder Integration Specification

Status: 2026-08-30. Source engine:
`apps/desktop/engines/loom` (Apache-2.0, attribution preserved in `NOTICE`).

Recoder follows the same foundation strategy as Cursor-on-VS Code: the desktop is a
Wave Terminal fork, and the default headless execution substrate is Loom, Recoder's
vendored and rebranded HERDR engine. Recoder owns the differentiated convergence,
governance, memory, and evidence layer above those foundations.

The integration goal is not “all Loom features in the desktop.” It is to rely on Loom
for agent-aware terminal execution and Wave for desktop terminal interaction, while
consuming the minimum governed capability set needed for isolated agent work, live
control, review, convergence, and recovery.

## 1. Engine contract

Loom is a standalone Rust binary with a headless server exposing a newline-delimited
JSON Unix-socket API of roughly 94 public methods at `PROTOCOL_VERSION=20`.

- Connect to the Recoder-owned `loom.sock`, never Loom's private TUI render socket.
- Frame requests as one JSON envelope plus `\n`; line-buffer replies.
- Treat success, protocol error, blocking wait, and bare subscription event frames as
  distinct wire modes.
- Reject protocol mismatch, timeout, missing binary, and closed socket truthfully.
- Never read the socket path from ambient engine config in the adapter; bootstrap
  injects it.

The shared client and narrow protocol types live under
`packages/agent-runtimes/src/adapters/loom/`. The substrate adapter lives at
`backend/src/domains/conductor/adapters/loom-substrate.adapter.ts`.

## 2. Production mapping

| Recoder port/action   | Loom method                            | Contract                                                                                   |
| --------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| availability          | `ping`                                 | Require protocol 20; any failure is unavailable.                                           |
| launch isolation      | `worktree.create`                      | Loom creates branch/worktree/root pane.                                                    |
| launch runtime        | `agent.start`                          | Start the chosen native agent kind in the root pane.                                       |
| persisted handle      | response `root_pane.pane_id`           | Agent verbs accept pane id/name, not internal terminal id.                                 |
| capture               | `agent.read`                           | Recent stripped output feeds the poll tailer; this is not a PTY byte stream.               |
| liveness/exit state   | `agent.get`                            | Done maps to success; live remains unknown, never fabricated success.                      |
| continue/submit steer | `agent.prompt`                         | Deliver into the existing agent session.                                                   |
| non-submit steer      | `pane.send_text`                       | Send text without Enter.                                                                   |
| attention/status      | `session.snapshot`, `events.subscribe` | Attribute panes through Recoder workspace records; unknown panes are dropped, not guessed. |
| teardown              | `worktree.remove { force:true }`       | Best effort; removes Loom worktree and live panes.                                         |
| diff/review/merge     | host `git`                             | Loom has no authority over Recoder's review/merge truth.                                   |

`agent.query`, `agent.wait`, and `worktree.status` are typed extension points but are
not required by the core composition. Every other Loom method is unadopted unless the
product roadmap explicitly says otherwise.

The `recoder-wtlm` core edge is shipped:

- Loom exposes the bounded public `pane.terminal.stream` renderer on its owner-only
  control socket; Recoder never connects React to Loom's private TUI socket.
- `LoomSocketClient.terminalStream` translates the acknowledged NDJSON stream into
  typed ANSI frames and explicit resize/scroll/control messages.
- `TerminalStreamService` resolves and authorizes the workspace, attaches the live
  pane, and exposes it on the session-authenticated `/terminal` websocket.
- The Wave block `recoder-loom-terminal` renders those frames with xterm and sends
  viewport changes back through the backend.
- Keyboard input does not use the renderer's direct input path. It travels through
  Conductor's governed steer router and then the workspace's canonical substrate.

## 3. Lifecycle and packaging

The Node backend resolves the binary from the explicit override, packaged resources,
repo development path, then `PATH`. It starts or adopts one daemon on a private
Recoder socket with a denylist-stripped environment and waits for a real protocol
ping. Loom is enabled and selected by default; `CONDUCTOR_LOOM_DISABLED` opts both
daemon and default substrate back to tmux.

The arm64 desktop packages the Loom Mach-O under backend engine resources and treats
it as architecture-sensitive. No launch silently falls back when Loom is selected.

## 4. State ownership

- **Loom:** live PTY, pane graph, native agent status, Loom worktree process state.
- **Conductor/Agent OS:** workspace identity, owner, task, run events, policy,
  approvals, evidence, review, convergence, and merge outcome.
- **Git:** source, diff, commit, branch, and merge truth.
- **Wave/Electron:** desktop windows, tabs, tiling, terminal rendering, and user input.

Restart reconciliation may reconstruct a Loom connection from the stored pane id and
worktree identity. It must never make Loom the canonical task database.

## 5. Capability exclusions

Recoder does not currently use Loom's:

- workspace/tab/pane focus and layout graph;
- pane graphics, Loom TUI render wire, popups, or window-title controls;
- native notifications;
- plugin link/enable/invoke/log/pane APIs or inherited marketplace;
- integration install/uninstall;
- SSH remote install/update/attach product flow;
- server config reload, live handoff, or manifest reload as public product actions.

Wave already owns layout and terminal UI. Recoder's governance must own extensions
and remote access. Duplicating those authorities would increase state drift and bypass
the audit boundary without improving the core product.

## 6. Runtime coverage

Loom carries native agent kinds and detection for the upstream HERDR set plus
Recoder-specific launch kinds. The Recoder sync now includes Qwen Code process
detection through npm/node wrappers, an evidence-backed screen manifest, and native
session resume planning. Recoder Code and Crush remain launchable native kinds but
do not claim screen-manifest status detection until real pane evidence supports it.

A runtime without a Loom agent kind must not be presented as having native Loom
status/resume. An eventual raw-pane adapter must report the reduced capability set
and remain governed by the same workspace lifecycle.

## 7. Expansion gates

- `agent.wait`: adopt when blocking waits replace measurable polling complexity.
- `agent.query`: adopt when the status read model needs server-side filtering at
  demonstrated scale.
- `worktree.status`: adopt only if it improves read performance without displacing
  host Git as review truth.
- governed skills: complete `recoder-ne6o` and `recoder-ubyg` before exposing an
  extension ecosystem.
- remote attach: complete transport and durable state under `recoder-n5pc` before
  describing it as remote/mobile.

## 8. Do not

- connect to the private TUI socket;
- assume every response fits one read or carries an `id`;
- persist Loom's internal terminal id as an agent target;
- route Loom steering through tmux;
- fabricate exit code zero for a live agent;
- expose arbitrary plugin argv outside governance;
- make Loom layout compete with Wave layout;
- claim full Loom support from vendored source presence alone.

## 9. OSS foundation gates

“Built on HERDR and Wave” is a testable ownership contract, not a branding claim:

1. **Wave is the shell.** New desktop layout, blocks, terminal rendering, input, and
   window behavior extend the Wave fork unless a documented incompatibility prevents
   it. Recoder does not build a second desktop shell beside Wave.
2. **Loom/HERDR is the runtime.** New PTY, pane, worktree-process, agent-detection,
   restore, and terminal-stream behavior extends Loom unless it belongs to policy or
   durable product truth. Recoder does not build a parallel agent multiplexer beside
   Loom.
3. **Recoder is the convergence layer.** Workspace identity, policy, approvals,
   memory, review, compatible-set comparison, synthesis, evidence, and merge remain
   Recoder-owned and must not be delegated to either foundation.
4. **Every cross-layer edge is executable.** Protocol types, authorization, failure
   behavior, and at least one contract test are required before a capability is called
   integrated.
5. **Upstream drift is explicit.** `RECODER-VENDOR.md` records the imported tag and
   local patch policy. Each upstream release is reviewed for substrate fixes; UI,
   marketplace, or governance features are absorbed only when they preserve the
   ownership split above.

The imported Loom vendor baseline remains HERDR v0.8.0. The 2026-08-30 review has
selectively absorbed v0.8.2's configurable 120×40 headless geometry, blocked-prompt
safety, Copilot focus-before-submit, and Qwen detection/restore changes. Recoder is
foundation-complete for the capabilities above but does not claim byte-for-byte
v0.8.2 parity; the remaining upstream delta is still classified feature by feature
under the ownership gates in this document.
