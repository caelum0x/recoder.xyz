# Recoder Desktop Cockpit

The conductor.build-style board renderer — the desktop product surface where you
run and review your coding agents. Static, self-contained Preact bundle the
Electron shell loads via `loadFile` (no runtime dev server).

## Stack

- **Preact** (10.x) + **esbuild** — light, fast, no framework dev server.
- **TypeScript** strict mode, typechecked via `tsc --noEmit`.
- Output: `dist/index.html` + `dist/cockpit.js` + `dist/cockpit.css`.

## Build

```bash
# from apps/desktop/cockpit
pnpm install --ignore-workspace
pnpm run build         # -> dist/
pnpm run check-types   # tsc --noEmit

# or from apps/desktop
pnpm run build:cockpit
```

## Shell → renderer config contract

The Electron shell must inject this global **before** loading `dist/index.html`
(e.g. via `webPreferences.additionalArguments` + a preload, or
`executeJavaScript` prior to `loadFile`):

```js
window.__RECODER_COCKPIT__ = {
  backendUrl: 'http://localhost:3100',   // DOCKER_BACKEND_URL
  token: '<RECODER_SESSION_TOKEN or RECODER_API_KEY>', // optional Bearer
  defaults: { spaceId, projectId, createdBy, repoPath }, // optional form prefills
};
```

If nothing is injected, the renderer falls back to `http://localhost:3100` with
no token and surfaces whatever the backend returns (including auth failures). It
**never fabricates data**.

## Endpoints wired (all real, `${backendUrl}/api/conductor/...`)

| UI surface | Method + path |
| --- | --- |
| Board cards (poll ~2s) | `GET /workspaces` |
| New workspace | `POST /workspaces` |
| Detail / refresh | `GET /workspaces/:id` (via list), `GET /workspaces/:id/events` (poll ~2s) |
| Diff tab | `GET /workspaces/:id/diff` |
| Open PR | `POST /workspaces/:id/pr` |
| Merge | `POST /workspaces/:id/merge` |
| Archive | `POST /workspaces/:id/archive` |
| Reconcile | `POST /reconcile` |
| Runtimes strip | `GET /runtimes` |
| Substrates strip | `GET /substrates` |

Action buttons are gated by the backend workspace state machine
(`packages/agent-os/src/domain/workspace.ts`) so the UI never offers an
illegal transition. When the backend is unreachable, a truthful
"backend unreachable" banner is shown and no workspaces are invented.
