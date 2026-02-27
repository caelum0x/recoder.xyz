# Recoder Ecosystem Blueprint (Remaining Work Only)

Last updated: 2026-02-27

## P0 — Must finish before launch sign-off
1. Credential rotation (manual)
- Rotate all previously exposed credentials/tokens in provider dashboards.
- Categories: DB/Redis, OAuth (Google/GitHub), AI provider keys, payment/webhook secrets, auth/jwt/encryption secrets.
- Update server-side runtime secrets after rotation.
- Use: `docs/CREDENTIAL_ROTATION_RUNBOOK.md`
- Audit command (no values): `bash scripts/credential-rotation-audit.sh remote`

## P1 — Operational hardening
1. Monitoring and alerting activation ✅
- Done on 2026-02-27:
  - Alertmanager and Prometheus healthy (`/-/healthy` => 200).
  - Synthetic alert test-fire posted successfully via `scripts/monitoring-test-fire.sh`.
  - Synthetic alert visible in Alertmanager API (`/api/v2/alerts`).
  - Alertmanager env substitution fixed (envsubst entrypoint).
  - Node exporter + Redis exporter added to docker-compose.
  - Prometheus scrape targets aligned with actual services.

## P2 — Release closeout

### Native App Hardening (In Progress)

| App | Stack | Score | Target | Status |
|-----|-------|-------|--------|--------|
| OpenClaw macOS | Swift 6 / SwiftUI | 8/10 | 8.5/10 | ✅ Entitlements extracted, CI release automation added |
| Recoder Desktop | Electron 33 | 6/10 | 8/10 | 🔧 In progress (tests, IPC rate limiting, encrypted storage, crash retry) |
| OpenClaw Android | Kotlin / Compose | 7/10 | 8/10 | 🔧 In progress (R8/ProGuard, signing config) |
| Recoder Mobile | Expo 54 / RN 0.81 | 5.5/10 | 7.5/10 | 🔧 In progress (CI/CD, version sync, tests, type safety) |
| OpenClaw iOS | Swift 6 / SwiftUI | 4/10 | 6/10 | 🔧 In progress (deployment target, CI re-enable) |

### macOS Completed Work
- Entitlements extracted from inline heredocs to version-controlled `.entitlements` files in `openclaw/apps/macos/entitlements/`
- `codesign-mac-app.sh` updated to load entitlements from files (still supports runtime patching for DISABLE_LIBRARY_VALIDATION)
- `release-gate.yml` now includes full `macos-release` job: build → sign → notarize → GitHub Release draft with artifacts
- Build metadata (timestamp, git commit) and version auto-sync from package.json were already implemented

### What Still Needs Manual Setup (Post-Code)
- Apple Developer cert ($99/year) for Desktop + macOS notarization
- Play Store keystore for Android
- App Store Connect API key for iOS Fastlane
- Sentry/crash reporting account setup
- GitHub Secrets: `MACOS_SIGN_IDENTITY` for CI release builds

## Done criteria
1. Credential rotation complete and documented.
2. Monitoring/alerting active and test-fired. ✅
3. Desktop/mobile shipped or explicitly deferred with owner/date.
