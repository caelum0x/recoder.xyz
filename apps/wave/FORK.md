# Recoder Terminal — a fork of Wave Terminal

`apps/wave` is **Recoder's terminal-native shell (L3)**, forked from
[**Wave Terminal**](https://github.com/wavetermdev/waveterm) (© Command Line Inc, **Apache-2.0**).
Per the architecture decision record ([`docs/architecture/RECODER-ENGINES.md` §27](../../docs/architecture/RECODER-ENGINES.md)),
Wave is the fork base because its **block model IS Recoder's cockpit**: a grid where each block is a
terminal (a parallel agent's real TUI) or a web widget (diff / review / board / approvals).

## Attribution (Apache-2.0)
This is a derivative work of Wave Terminal. The upstream `LICENSE`, `NOTICE`, and all source
copyright headers are preserved unchanged, as the license requires. Only the **product identity**
(`name`, `productName`, `appId`) is rebranded to Recoder.

## What this fork is (and isn't)
- **Is:** L3 only — the terminal-native surface. It renders blocks; a block can be a live agent
  session or a Recoder control-plane widget.
- **Isn't:** an engine. `docker-backend` remains THE control plane; the 16 engines + governance + the
  service fleet mount behind it **unchanged** (RECODER-ENGINES §10/§27). A fork is a surface swap,
  never an engine swap.

## Integration seam
Wave's frontend resolves its backend over env vars (`frontend/util/endpoints.ts`):
`WAVE_SERVER_WEB_ENDPOINT` / `WAVE_SERVER_WS_ENDPOINT` → its Go `wavesrv`. Recoder integration:
1. Keep `wavesrv` for block/terminal/layout management (its strength).
2. Add a **Recoder conductor bridge**: blocks that call `docker-backend` `/api/conductor` (create/
   observe/steer workspaces) and render the workspace's tmux session as a terminal block, plus
   widget blocks for diff/review/approvals over `/api/agent-os` + `/api/mcp`.
3. Point identity/auth at `recoder.xyz` (device-flow), reusing `packages/distribution`.

## Build / run (deferred)
Vendored **source only** (no `node_modules`, no Go build). To run: `npm install` + the Wave Go
build (`task build` / see `BUILD.md`) — a heavy build, done once the conductor bridge lands. Until
then the shipping shell stays `apps/desktop` (the terminal-first Preact cockpit).

## Roadmap (L3 migration, after the engine phases)
1. Bridge blocks → `docker-backend` conductor (terminal block per workspace).
2. Widget blocks: diff/review, board, approvals, MCP tools.
3. Auth via `recoder.xyz` device-flow.
4. Rebrand assets/branding fully; ship as the primary shell when the backend is massive enough to warrant it.
