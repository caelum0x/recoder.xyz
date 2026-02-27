# Recoder Plan (Remaining Tasks Only)

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
- ✅ Healthchecks on all monitoring containers (prometheus, alertmanager, node-exporter, redis-exporter)
- ✅ Service dependency ordering: recoder-app/recoder-web wait for redis+backend healthy; prometheus waits for exporters healthy
- ✅ Redis eviction policy fixed: `allkeys-lru` → `volatile-lru` (preserves session keys)
- ✅ Phantom alert rules commented out (pg_stat_*, auth_*, webhook_*, pm2_*, container_restart_count, a2a_connector_*) with TODO notes
- ✅ SLO slow burn threshold corrected: 1.0x → 3.0x multiplier
- ✅ Nginx security headers added: X-DNS-Prefetch-Control, X-Download-Options
- ✅ App Dockerfile: healthcheck targets /api/health, NODE_OPTIONS memory limit, 30s start-period
- ✅ Deploy pre-flight checks: SSH connectivity, disk space >90%, Docker daemon, memory warning
- ✅ Env file validation in deploy script (app/.env.production, recoder-web/.env, etc.)
- ✅ backup-volumes.sh: nightly Docker volume backups with 7-day retention
- ✅ A2A smoke test expanded: 9 → 16 endpoints (tasks, approvals, connectors, context bridge)

## P2 — Release closeout (Planned)
1. Desktop pipeline (planned)
- Owner: Arhan Subasi
- Target date: 2026-03-31
- Remaining work:
  - Add baseline CI quality gate (lint + unit smoke)
  - Finalize production signing/notarization secrets and release workflow
  - Run one full release dry-run and publish release evidence
- Verification command: `bash scripts/verify-desktop-release.sh [tag]`

2. Mobile pipeline (planned)
- Owner: Arhan Subasi
- Target date: 2026-03-31
- Remaining work:
  - Add CI lane for build/test/version consistency checks
  - Stabilize release signing/config for Android + iOS paths
  - Run one end-to-end release dry-run and publish release evidence
- Verification command: `bash scripts/verify-mobile-release.sh [ref]`
- Combined closeout command: `bash scripts/verify-native-release-closeout.sh [desktop_tag] [mobile_ref]`

## Manual/External dependencies
- Apple Developer cert for Desktop + macOS notarization
- Play Store keystore + `keystore.properties` for Android release signing
- App Store Connect API key for iOS Fastlane
- `EXPO_TOKEN` secret for mobile CI EAS builds
- OpenClawKit `Package.swift` iOS platform update (`.v18` -> `.v16`) to match lowered deployment target
- iOS local verification command: `bash scripts/verify-openclaw-ios-local.sh`

## Done criteria
1. Credential rotation complete and documented.
2. Monitoring/alerting active and test-fired. ✅
3. Desktop and mobile release closeout completed with evidence (or explicitly re-deferred with owner/date).
