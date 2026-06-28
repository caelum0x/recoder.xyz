# Recoder Desktop

Minimal Electron wrapper for the Recoder web application with deep linking support.

## Features

- Native macOS/Windows/Linux desktop app
- Deep linking for magic link authentication (`recoder://` protocol)
- Integrated navigation controls (back, forward, reload, copy URL)
- Keyboard shortcuts (Cmd+Left/Right, Cmd+R, Cmd+Shift+C)

## Development

```bash
npm install
npm start
```

## Building

Build for your platform:

```bash
npm run build:mac          # macOS (with signing if .env exists)
npm run build:mac:unsigned # macOS (quick, no signing)
npm run build:win          # Windows
npm run build:linux        # Linux
```

Or build for all platforms:

```bash
npm run build
```

**Note:** For signed macOS builds, create a `.env` file with Apple credentials (see `LOCAL-BUILD.md`).

## Configuration

Set `APP_URL` environment variable to load a different URL:

```bash
APP_URL=http://localhost:3000 npm start
```

By default, it loads `https://recoder.xyz/`.

Workflow backend/auth parity settings:

```bash
DOCKER_BACKEND_URL=http://localhost:3100
RECODER_SESSION_TOKEN=...   # preferred (internal /api/agent/workflow)
RECODER_API_KEY=...         # fallback (public /api/v1/agent/workflow)
RECODER_WORKFLOW_FETCH_RETRIES=2
RECODER_WORKFLOW_STRICT_CONTRACT=true
RECODER_A2A_ADMIN_TOKEN=...      # required for /api/a2a/bridge/* admin routes
RECODER_A2A_BRIDGE_ID=desktop-default
RECODER_DESKTOP_AGENT_ID=recoder-desktop
```

`agent:getWorkflowPlan` now returns backend diagnostics (`backend`, `fallbackReason`) in addition to `source` and `workflow`, matching OpenClaw contract visibility for automation and troubleshooting.
When strict contract mode is enabled (`RECODER_WORKFLOW_STRICT_CONTRACT=true` or request payload `strict: true`), contract mismatch/missing markers force local fallback with explicit diagnostics.

Delegated-task IPC surface:
- `window.recoderDesktop.delegateTask(payload)` -> enqueue delegated bridge job
- `window.recoderDesktop.getDelegatedTaskStatus({ jobId })` -> single status lookup
- `window.recoderDesktop.pollDelegatedTaskStatus({ jobId, intervalMs, timeoutMs })` -> polling helper

## Installation

For end users, see [INSTALLATION.md](./INSTALLATION.md) for detailed installation instructions including how to bypass macOS Gatekeeper on first launch.

## Cockpit (conductor board)

The desktop app ships a bundled **Cockpit** — the conductor.build-style board
where you run and review coding agents. It is a self-contained Preact bundle in
[`cockpit/`](./cockpit/) that the Electron shell loads via `loadFile` (no dev
server). The shell injects `window.__RECODER_COCKPIT__ = { backendUrl, token }`
so the renderer authenticates its `/api/conductor/*` calls with your real
recoder.xyz session — it never fabricates data.

Open it from the **View** menu:

| Menu item | Shortcut | Opens |
| --- | --- | --- |
| View → Open Cockpit | `Cmd/Ctrl+Shift+K` | The conductor board |
| View → Open dmux Console | `Cmd/Ctrl+Shift+D` | The cockpit on the **dmux** view |

Inside the cockpit, top-level view tabs make each surface discoverable:
**Board** (lifecycle columns: Queued → Running → Review → Done), **Sessions**
(live tmux+worktree agent sessions and their terminals), **dmux** (the dmux
operator console — availability, the tmux sessions dmux can observe, and a
launcher), and **Connectors** (chat-channel health).

### Product flow (create → run → review → terminate)

1. **Create** — Board → *New workspace*. Pick a repo path, write the task
   prompt, and choose an installed runtime (only available agent CLIs are
   selectable). Submitting `POST /api/conductor/workspaces` launches a
   tmux+worktree workspace; the new card appears in **Queued**.
2. **Run** — As the conductor advances the workspace (`setting_up → ready →
   running`), the card moves to **Running**. Select it to watch the live
   `RunEvent` log (`GET …/events`) and, once work exists, the reviewable diff
   (`GET …/diff`).
3. **Review** — When the workspace reaches `awaiting_review` the card moves to
   **Review**, where *Open PR* / *Merge* become enabled exactly when the backend
   state machine allows them.
4. **Terminate** — *Archive* (`POST …/archive`) ends the workspace; the card
   lands in **Done**.

### dmux

[dmux](https://github.com/justmiles/dmux) is the operator console for the shared
tmux server the conductor runs agents on. The **dmux** view (and the *Open dmux
Console* menu item) render `GET /api/conductor/dmux` — real availability, the
pinned/system tmux binary, and the conductor tmux sessions dmux can observe — and
let you launch the dmux TUI for a repo. When dmux is not installed the panel says
so truthfully with the backend's own reason string; nothing is faked.

### Cockpit tests

The cockpit has an integration smoke harness that boots the **real** cockpit UI
(the production `<App/>` Preact tree, its real API client and state machine) in
jsdom against a real in-process **stub conductor** HTTP server it owns
(`cockpit/src/test/stub-conductor.ts`), and drives the full
create → events → diff → terminate flow plus dmux discoverability:

```bash
cd cockpit
pnpm run check-types   # tsc --noEmit
pnpm test              # vitest run (unit + integration)
pnpm run build         # esbuild bundle -> dist/
```

## Deep Linking

The app registers the `recoder://` protocol for magic link authentication:

1. User enters email in desktop app
2. Magic link email contains `recoder://auth/callback?code=xxx`
3. User clicks link in email
4. Operating system opens Recoder Desktop app
5. App handles auth callback and logs user in

The protocol is automatically registered when the app is installed.

## Code Signing & Notarization (macOS)

macOS distribution is handled by two electron-builder hooks wired in
`package.json`:

- **Code signing** uses the hardened runtime
  (`build.mac.hardenedRuntime: true`) with the entitlements in
  [`entitlements.mac.plist`](./entitlements.mac.plist). Those entitlements
  enable V8 JIT (required for Electron), let `node-pty` fork child processes
  (`com.apple.security.inherit`), and allow outbound network traffic.
- **Notarization** runs in the `afterSign` hook
  ([`notarize.js`](./notarize.js)), which submits the signed `.app` to Apple's
  notary service with `notarytool` (via `@electron/notarize`) and staples the
  ticket so Gatekeeper accepts the app offline.

### Notarization is degrade-safe

`notarize.js` is **gated on Apple credentials** and never breaks a build that
lacks them:

- **No credentials** → notarization is skipped with a clear log line
  (`⏭️  Skipping notarization …`) and the build still succeeds (unsigned /
  un-notarized — fine for local dev).
- **Credentials present but notarization fails** → the build fails loudly, so CI
  cannot publish an un-notarized artifact that looks successful.

Two credential strategies are supported (set one fully):

| Strategy | Required environment variables |
| --- | --- |
| Apple ID + app-specific password | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| App Store Connect API key | `APPLE_API_KEY` (path to `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |

A **partial** set (e.g. `APPLE_ID` without `APPLE_TEAM_ID`) is treated as "not
configured" and skipped rather than attempted-and-failed. See
[`.env.example`](./.env.example) and [INSTALLATION.md](./INSTALLATION.md#release-environment-macos-signing--notarization)
for the full env reference.

### Ad-hoc fallback

If you build without Apple credentials, the artifact is ad-hoc signed:
- ✅ App is signed and not reported as "damaged"
- ⚠️ Not notarized (requires a paid Apple Developer account)
- 📝 Users must right-click → Open on first launch (see INSTALLATION.md)

For production notarization in CI, provide the GitHub secrets listed under
[Release Ops](#release-ops).

## Release Ops

Desktop production release flow is automated with root-level commands:

```bash
pnpm run check:desktop-release-readiness
pnpm run set:desktop-release-secrets -- --from-env-file .env.desktop-release --write
pnpm run closeout:desktop-release -- v1.0.0 --write
pnpm run verify:desktop-release -- v1.0.0
```

Required GitHub secrets for mac signed/notarized release:
- `DESKTOP_CSC_LINK`
- `DESKTOP_CSC_KEY_PASSWORD`
- `DESKTOP_APPLE_ID`
- `DESKTOP_APPLE_APP_SPECIFIC_PASSWORD`
- `DESKTOP_APPLE_TEAM_ID`
