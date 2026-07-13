# Recoder Terminal — a fork of Wave Terminal

`apps/wave` is **Recoder's terminal-native shell (L3)**, forked from
[**Wave Terminal**](https://github.com/wavetermdev/waveterm) (© Command Line Inc, **Apache-2.0**).
Per the architecture decision record ([`docs/architecture/RECODER-ENGINES.md` §27](../../docs/architecture/RECODER-ENGINES.md)),
Wave is the fork base because its **block model IS Recoder's cockpit**: a grid where each block is a
terminal (a parallel agent's real TUI) or a web widget (diff / review / board / approvals).

This is not "Wave with a Recoder widget" — it is the **Recoder product**, the way Cursor is VSCode.
It boots into Recoder, is fully rebranded, has its cloud dependencies decoupled, and **builds**.

## Attribution (Apache-2.0)
A derivative work of Wave Terminal. The upstream `LICENSE`, `NOTICE`, and all source copyright headers
are preserved unchanged, as the license requires. We rebrand **product identity**, never authorship —
exactly as Cursor keeps VSCode's MIT notices. Load-bearing upstream internals are intentionally kept
(the `wsh`/"WSH" RPC protocol, `wshrpc`, `WAVETERM_*` env var names, `Wave*` code symbols); only
user-facing identity + the Go module path + the server binary name were changed.

## What this fork is (and isn't)
- **Is:** L3 — the terminal-native surface. It renders blocks; a block can be a live agent session or a
  Recoder control-plane widget.
- **Isn't:** an engine. `docker-backend` remains THE control plane; the engines + governance + service
  fleet mount behind it unchanged (RECODER-ENGINES §10/§27). A fork is a surface swap, not an engine swap.

## What has landed (Recoder-ification)
- **Boots into Recoder** — the first-launch layout (`pkg/wcore/layout.go`) opens the `recoder` conductor
  view (workspaces / launch agents), focused, with a terminal alongside; new-tab stays a terminal.
- **Conductor bridge** — `frontend/app/view/recoder/`: the `recoder` block (workspace list + a
  readiness-aware "Welcome to Recoder" getting-started panel from `/api/conductor/health/full`) and the
  `recoder-terminal` block (streams a workspace's live agent TUI over the conductor
  `/workspaces/:id/stream` websocket). Registered in `blockregistry.ts`; `defwidget@recoder` +
  `defwidget@recoder-terminal` ship as launchable widgets. Backend URL from `getRecoderBackendUrl()`
  (`window.__RECODER_BACKEND_URL__`, default `http://127.0.0.1:3100`).
- **Full rebrand** — product strings → Recoder across emain (About/menus/quit/updater/app.setName) and
  frontend; in-app links → recoder.xyz; logos → the Recoder cube (`public/logos/*`).
- **Cloud decoupled** — `telemetry:enabled=false` + the `wcloud` sender inert unless
  `RECODER_TELEMETRY_URL` is set (never POSTs to Wave); auto-updater no-ops unless `RECODER_UPDATE_FEED`
  is set (never contacts Wave's release server); default AI preset + `DefaultAIEndpoint` +
  `ai:baseurl` point at Recoder's governed gateway (`/api/gateway/v1`); Wave-cloud AI modes hidden.
- **Internal → Recoder** — Go module path `github.com/wavetermdev/waveterm` →
  `github.com/recoder/recoder-terminal` (239 files); backend server binary `wavesrv` → `recoder-server`.
- **Vendor gap fixed** — `tsunami/build` (the tsunami app-builder Go pkg) was gitignored-away by the
  broad `build/` rule and never committed; re-vendored from upstream v0.14.5 + a `.gitignore` negation.
  Same for `apps/wave/public/` (assets), hidden by the bare `public` rule.

## Build / run — VERIFIED
Both halves build on this workstation (Go 1.25.6 + electron-vite). `node_modules` is installed;
`task` (Taskfile runner) and Go must be on `PATH` (`/opt/homebrew/bin`, `/usr/local/go/bin`).

```bash
cd apps/wave

# Backend (Go) — emits dist/bin/recoder-server.<arch>.  VERIFIED: exit 0.
task build:backend:quickdev        # arm64 macOS quick path; or `task build:backend` for all arches + wsh

# Frontend (React + emain + preload).  VERIFIED: exit 0 (~35s).
npm run build:dev                  # electron-vite build --mode development

# Run the dev shell (spawns the recoder-server built above):
RECODER_BACKEND_URL=http://127.0.0.1:3100 npm run dev
```

Start `docker-backend` on `:3100` first so the Recoder blocks have data (they degrade safely if it's
down). **Disk note:** the APFS volume runs ~98% full; reclaim with `pnpm store prune` + `go clean -cache`
before a full `task build` (Go all-arches + electron-vite) to avoid ENOSPC.

## Not yet done (needs the app actually running to verify)
1. **GUI launch** — a running-app pass to confirm the rebrand, logo appearance (the dark-bg logo may want
   a light variant), and the conductor blocks render live.
2. **`wsh` CLI rename** → `recoder` — deferred because `wsh` is PATH-installed and invoked by shell
   integration on every terminal start; safe to do *in* the build+launch loop, dangerous blind.
3. **App icon** (`build/*.icns`) — the dock/taskbar icon, separate from the in-app `public/logos/*`.
4. **Full package** — `electron-builder` → signed `.dmg`, and identity/auth via `recoder.xyz` device-flow.

Until this shell is the primary surface, the shipping app stays `apps/desktop` (the terminal-first
Preact cockpit).
