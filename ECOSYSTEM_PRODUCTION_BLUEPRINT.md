# Recoder Ecosystem Blueprint (Remaining Work Only)

Last updated: 2026-02-27

## P0 — Must finish before launch sign-off
1. Credential rotation (manual)
- Rotate all previously exposed credentials/tokens in provider dashboards.
- Categories: DB/Redis, OAuth (Google/GitHub), AI provider keys, payment/webhook secrets, auth/jwt/encryption secrets.
- Update server-side runtime secrets after rotation.
- Use: `docs/CREDENTIAL_ROTATION_RUNBOOK.md`
- Verify: `bash scripts/post-rotation-verify.sh`
- Optional monitoring proof: `RUN_ALERT_TEST_FIRE=true bash scripts/post-rotation-verify.sh`

## P1 — Operational hardening
1. Monitoring and alerting activation ✅
- Completed on 2026-02-27 (Prometheus + Alertmanager healthy, synthetic alert test-fire successful).

2. Infrastructure production hardening ✅
- Completed on 2026-02-27.
- ✅ Healthchecks: Added to all 4 monitoring containers (prometheus `/-/healthy`, alertmanager `/-/healthy`, node-exporter `/metrics`, redis-exporter `/metrics`)
- ✅ Service dependencies: `recoder-app` depends on redis+docker-backend (healthy); `recoder-web` depends on redis (healthy); prometheus depends on alertmanager+exporters (healthy)
- ✅ Redis: eviction policy `allkeys-lru` → `volatile-lru` (preserves session/TTL keys)
- ✅ Alert rules: Commented out 5 groups referencing non-existent metrics (PostgreSQL, auth, billing, PM2/cAdvisor, A2A connectors) with TODO notes for re-enabling
- ✅ SLO burn rate: Slow burn threshold corrected from 1.0x → 3.0x multiplier
- ✅ Nginx: Added `X-DNS-Prefetch-Control: off` and `X-Download-Options: noopen` headers
- ✅ App Dockerfile: Healthcheck targets `/api/health` (not root), `NODE_OPTIONS=--max-old-space-size=2048`, start-period 30s
- ✅ Deploy script: Phase 0 pre-flight (SSH, disk >90%, Docker daemon, memory <1GB warning); env file validation before build
- ✅ Backup: `scripts/backup-volumes.sh` — nightly cron, 4 volumes (backend-data, redis-data, prometheus-data, alertmanager-data), 7-day retention
- ✅ A2A smoke test: Expanded from 9 → 16 endpoints (task GET, approve, reject, context bridge, connector execute, connector status, A2A health)

3. CI/CD pipeline hardening ✅
- Completed on 2026-02-27.
- ✅ `automated-testing.yml`: Rewritten — removed non-existent platforms, now tests docker-backend, recoder-web, app, desktop (unit), mobile typecheck, integration tests with Redis, k6 load test smoke.
- ✅ `deploy.yml`: Hardened — pre-deploy gates (leak scan, cooldown, production health check), build failure auto-rollback, rolling restart with health verification, auto-rollback on >2 failures, post-deploy comprehensive 7-endpoint health check, deploy summary.
- ✅ PM service: Already fully integrated (Batch 2 build, PM2 on port 3004, nginx proxy at pm.recoder.xyz, rolling health checks).

3. Backend test coverage expansion ✅
- Completed on 2026-02-27.
- ✅ Domain Manager tests: 43 tests (CRUD, DNS verification via CNAME/TXT, SSL provisioning, stats, security injection prevention, edge cases). File: `docker-backend/src/__tests__/domain-manager.test.ts`
- ✅ Git Operations enhanced tests: 45 tests (merge, rebase, rebaseAbort, rebaseContinue, getGitState, getConflicts, renameBranch, pushForceWithLease, cloneRepo, push, pull, isGitRepo). File: `docker-backend/src/__tests__/git-operations-enhanced.test.ts`
- ✅ CI check expanded from 10 → 13 critical test files.

## P2 — Release closeout

### Completed (2026-02-27) — Native/Desktop/Mobile Hardening

**Desktop (Electron)** — 6/10 → 8/10
- ✅ Test infrastructure: vitest + 31 tests (IPC rate limiting, path traversal, terminal validation, agent input, webhook retry, encrypted storage, handler registration, window mgmt, auto-update, deep link)
- ✅ IPC rate limiting: token-bucket per channel (30/sec file ops, 5/sec terminal/agent)
- ✅ Encrypted API key storage: `safeStorage` (OS keychain) with plaintext fallback
- ✅ Crash webhook retry: 3x exponential backoff (1s/3s/9s)

**Mobile (Expo/RN)** — 5.5/10 → 7.5/10
- ✅ Version mismatch fix: Info.plist 1.1.1 → 1.1.2 (matches app.json)
- ✅ CI/CD workflow: `.github/workflows/mobile-ci.yml` (typecheck, lint, test, EAS build on tag)
- ✅ Type safety: eliminated all `any` from useAuth.ts (11→0) and fixed 18 `any` types in useChat.ts (exported Thread[] interface, query callbacks, error catches)
- ✅ Test infrastructure: jest-expo + `__tests__/utils.test.ts`

**Android (OpenClaw)** — 7/10 → 8/10
- ✅ R8/ProGuard: `isMinifyEnabled=true`, `isShrinkResources=true`, comprehensive proguard-rules.pro
- ✅ Signing config: reads from `keystore.properties` or env vars
- ✅ `isDebuggable=false` in release

**iOS (OpenClaw)** — 4/10 → 6/10
- ✅ CI workflow: `.github/workflows/ios-ci.yml` (XcodeGen → build → test on simulator)
- ✅ Deployment target: lowered from 18.0 → 16.0 in project.yml

**macOS (OpenClaw)** — 8/10 (no changes needed, already production-ready)

### Remaining (Manual/External) — Owner: Arhan Subasi

Quick checklist (explicit):
- Apple Developer cert for Desktop + macOS notarization
- Play Store keystore + `keystore.properties` for Android release signing
- App Store Connect API key for iOS Fastlane
- `EXPO_TOKEN` secret for mobile CI EAS builds
- OpenClawKit `Package.swift` iOS platform update (`.v18` -> `.v16`) to match lowered deployment target
- iOS local verification command: `bash scripts/verify-openclaw-ios-local.sh`

1. **Apple Developer certificate** ($99/year)
   - Required for: Desktop app notarization, macOS code signing
   - Action: Enroll at developer.apple.com, export P12 cert, set `CSC_LINK` + `CSC_KEY_PASSWORD` + `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` in CI secrets
   - Verification: `bash scripts/verify-desktop-release.sh [tag]`

2. **Play Store keystore** for Android release signing
   - Action: Generate keystore with `keytool -genkey -v -keystore release.keystore -alias openclaw -keyalg RSA -keysize 2048 -validity 10000`
   - Create `openclaw/apps/android/keystore.properties` with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`
   - Or set env vars: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
   - Verification: `cd openclaw/apps/android && ./gradlew assembleRelease`

3. **App Store Connect API key** for iOS Fastlane
   - Action: Create API key at appstoreconnect.apple.com/access/integrations/api
   - Set `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH` (see `openclaw/apps/ios/fastlane/.env.example`)
   - Verification: `cd openclaw/apps/ios && fastlane beta`

4. **EXPO_TOKEN** secret for mobile CI EAS builds
   - Action: Generate at expo.dev/accounts/recoder/settings/access-tokens
   - Add as GitHub Actions secret `EXPO_TOKEN`
   - Verification: Push a `mobile-v*` tag and confirm EAS build triggers

5. **OpenClawKit Package.swift iOS platform update**
   - File: `openclaw/apps/shared/OpenClawKit/Package.swift`
   - Change: `.iOS(.v18)` → `.iOS(.v16)` to match lowered deployment target
   - Also update Swabble if needed: `.iOS(.v17)` → `.iOS(.v16)`
   - Verification: `bash scripts/verify-openclaw-ios-local.sh`

### Legacy pipeline items
- Run one full Desktop release dry-run and publish release evidence
- Run one full Mobile end-to-end release dry-run and publish release evidence
- Verification: `bash scripts/verify-native-release-closeout.sh [desktop_tag] [mobile_ref]`

## Done criteria
1. Credential rotation complete and documented.
2. Monitoring/alerting active and test-fired. ✅
3. Native/Desktop/Mobile hardening completed. ✅
4. Manual signing/cert setup completed (items 1-5 above).
5. Desktop and mobile release dry-runs completed with evidence.
