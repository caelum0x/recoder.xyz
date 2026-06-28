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

## Discoverable view tabs

The top nav exposes each surface as a first-class tab:

| Tab | Renders from |
| --- | --- |
| **Board** | `GET /workspaces` (lifecycle columns) |
| **Sessions** | `GET /sessions` (+ live terminals) |
| **dmux** | `GET /dmux` (dmux operator console + launcher) |
| **Connectors** | `GET /api/connectors` |

The desktop shell can deep-link a view: it sets
`window.__RECODER_COCKPIT_RUNTIME__.view` (read by `readInitialView()`), or, when
the cockpit is already open, dispatches the `recoder-cockpit:navigate`
`CustomEvent` (`{ detail: { view } }`). The desktop **View → Open dmux Console**
menu item (`Cmd/Ctrl+Shift+D`) uses this to open straight to the dmux view.

## Tests

```bash
pnpm run check-types   # tsc --noEmit (0 errors)
pnpm test              # vitest run
```

Two tiers, both real (no production code is stubbed):

- **Unit** (`src/lib/*.test.ts`, node env): the api client's error/envelope
  classification, the workspace-state gating helpers, config resolution.
- **Integration smoke harness** (`src/test/cockpit-flow.integration.test.tsx`,
  jsdom via a per-file `// @vitest-environment jsdom` pragma): boots the real
  `<App/>` against a real in-process **stub conductor** HTTP server it owns
  (`src/test/stub-conductor.ts`, an external seam — not a mock of the cockpit)
  and drives create → events → diff → terminate, asserting the board reflects
  each state, plus dmux discoverability (tab + deep-link).
