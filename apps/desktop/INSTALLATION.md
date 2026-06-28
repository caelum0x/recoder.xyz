# Installing Recoder Desktop

This guide covers installing the desktop app as an end user, plus the release
environment maintainers need to produce signed and notarized macOS builds.

## macOS

### Notarized builds (recommended)

When the build is signed **and** notarized by Apple (see
[Release environment](#release-environment-macos-signing--notarization) below),
installation is friction-free:

1. Open the `.dmg`.
2. Drag **Recoder** to **Applications**.
3. Launch it. macOS verifies the stapled notarization ticket — no Gatekeeper
   prompt, and it works offline.

### Un-notarized / ad-hoc builds (first-launch bypass)

If you downloaded an ad-hoc build (no paid Apple Developer notarization),
Gatekeeper blocks the first launch. Bypass it once:

1. Open the `.dmg` and drag **Recoder** to **Applications**.
2. In **Applications**, **right-click** (or Control-click) **Recoder** →
   **Open**.
3. In the dialog, click **Open** again.

After this one-time step the app launches normally.

If macOS reports the app is "damaged and can't be opened", the quarantine
attribute is set. Clear it once:

```bash
xattr -dr com.apple.quarantine /Applications/Recoder.app
```

## Windows

1. Run the `.exe` installer.
2. If SmartScreen warns about an unrecognized publisher, click **More info** →
   **Run anyway**.

## Linux

1. Make the `.AppImage` executable: `chmod +x Recoder-*.AppImage`
2. Run it: `./Recoder-*.AppImage`

---

## Release environment (macOS signing & notarization)

Producing a distributable, notarized macOS build requires Apple credentials.
The build hooks are wired in `package.json`:

- `build.beforeBuild` → `before-build.js` (builds the cockpit + asserts native
  module inputs)
- `build.afterSign` → `notarize.js` (notarizes the signed `.app`)
- `build.mac.entitlements` / `entitlementsInherit` → `entitlements.mac.plist`
- `build.mac.hardenedRuntime: true`

### Code-signing credentials

| Variable | Purpose |
| --- | --- |
| `CSC_LINK` | Path (or base64) of the `.p12` Developer ID certificate |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |

### Notarization credentials (one strategy, all keys required)

`notarize.js` is **degrade-safe**: with no credentials it skips notarization and
the build still succeeds; with a complete credential set it notarizes and fails
the build if notarization fails.

**Strategy A — Apple ID + app-specific password**

| Variable | Example | Notes |
| --- | --- | --- |
| `APPLE_ID` | `you@example.com` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | `abcd-efgh-ijkl-mnop` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | `AB12CD34EF` | 10-character Team ID |

**Strategy B — App Store Connect API key**

| Variable | Example | Notes |
| --- | --- | --- |
| `APPLE_API_KEY` | `./certs/AuthKey_T9GPZ92M7K.p8` | Path to the `.p8` private key |
| `APPLE_API_KEY_ID` | `T9GPZ92M7K` | Key ID |
| `APPLE_API_ISSUER` | `c055ca8c-…` | Issuer UUID |

> A **partial** credential set (e.g. `APPLE_ID` without `APPLE_TEAM_ID`) is
> treated as "not configured" and notarization is skipped with a clear log line
> rather than failing.

### Building locally

Copy `.env.example` to `.env`, fill in the variables above, then:

```bash
npm run build:mac          # signed + notarized when .env has full credentials
npm run build:mac:unsigned # quick local build, notarization skipped
```

### Building in CI

The root-level release flow maps GitHub secrets onto the variables above:

| GitHub secret | Maps to |
| --- | --- |
| `DESKTOP_CSC_LINK` | `CSC_LINK` |
| `DESKTOP_CSC_KEY_PASSWORD` | `CSC_KEY_PASSWORD` |
| `DESKTOP_APPLE_ID` | `APPLE_ID` |
| `DESKTOP_APPLE_APP_SPECIFIC_PASSWORD` | `APPLE_APP_SPECIFIC_PASSWORD` |
| `DESKTOP_APPLE_TEAM_ID` | `APPLE_TEAM_ID` |

See the [Release Ops](./README.md#release-ops) section of the README for the
automated commands.
