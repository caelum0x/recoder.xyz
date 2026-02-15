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
```

`agent:getWorkflowPlan` now returns backend diagnostics (`backend`, `fallbackReason`) in addition to `source` and `workflow`, matching OpenClaw contract visibility for automation and troubleshooting.
When strict contract mode is enabled (`RECODER_WORKFLOW_STRICT_CONTRACT=true` or request payload `strict: true`), contract mismatch/missing markers force local fallback with explicit diagnostics.

## Installation

For end users, see [INSTALLATION.md](./INSTALLATION.md) for detailed installation instructions including how to bypass macOS Gatekeeper on first launch.

## Deep Linking

The app registers the `recoder://` protocol for magic link authentication:

1. User enters email in desktop app
2. Magic link email contains `recoder://auth/callback?code=xxx`
3. User clicks link in email
4. Operating system opens Recoder Desktop app
5. App handles auth callback and logs user in

The protocol is automatically registered when the app is installed.

## Code Signing Status

The CI/CD builds use **ad-hoc code signing** which means:
- ✅ App is properly signed and not "damaged"
- ⚠️ Not notarized with Apple (requires paid developer account)
- 📝 Users must right-click → Open on first launch (macOS only)

For production notarization, add Apple Developer credentials to GitHub Secrets.

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
