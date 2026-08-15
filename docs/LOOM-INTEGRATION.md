# Loom to Recoder Integration Specification

Status: 2026-08-15. Source engine:
`apps/desktop/engines/loom` (Apache-2.0, attribution preserved in `NOTICE`).

The integration goal is not “all Loom features in the desktop.” Loom is the default
headless execution substrate. Recoder consumes the minimum governed capability set
needed for isolated agent work, live control, review, convergence, and recovery.

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

| Recoder port/action | Loom method | Contract |
|---|---|---|
| availability | `ping` | Require protocol 20; any failure is unavailable. |
| launch isolation | `worktree.create` | Loom creates branch/worktree/root pane. |
| launch runtime | `agent.start` | Start the chosen native agent kind in the root pane. |
| persisted handle | response `root_pane.pane_id` | Agent verbs accept pane id/name, not internal terminal id. |
| capture | `agent.read` | Recent stripped output feeds the poll tailer; this is not a PTY byte stream. |
| liveness/exit state | `agent.get` | Done maps to success; live remains unknown, never fabricated success. |
| continue/submit steer | `agent.prompt` | Deliver into the existing agent session. |
| non-submit steer | `pane.send_text` | Send text without Enter. |
| attention/status | `session.snapshot`, `events.subscribe` | Attribute panes through Recoder workspace records; unknown panes are dropped, not guessed. |
| teardown | `worktree.remove { force:true }` | Best effort; removes Loom worktree and live panes. |
| diff/review/merge | host `git` | Loom has no authority over Recoder's review/merge truth. |

`agent.query`, `agent.wait`, and `worktree.status` are typed extension points but are
not required by the core composition. Every other Loom method is unadopted unless the
product roadmap explicitly says otherwise.

The missing core edge is `recoder-wtlm`: Loom needs a backend-owned bidirectional
terminal adapter compatible with Wave rendering, backpressure, replay, and governed
input. React must not connect to Loom's private TUI socket.

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

Loom natively recognizes Claude, Codex, Cursor, opencode, pi, and Gemini. A runtime
without a Loom agent kind must not be presented as having native Loom status/resume.
Recoder may add an explicit raw-pane adapter later, but it must report the reduced
capability set and remain governed by the same workspace lifecycle.

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
