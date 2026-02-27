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

3. Dockerfile hardening ✅
- Completed on 2026-02-27.
- ✅ docker-backend: non-root user (backend:1001), NODE_OPTIONS=3072, HEALTHCHECK /health
- ✅ recoder-web: curl installed, non-root user (webuser:1001), NODE_OPTIONS=1536, HEALTHCHECK /api/health
- ✅ recoder-frontend: NODE_OPTIONS=1536, HEALTHCHECK via node fetch
- ✅ docker-backend/.dockerignore created

4. A2A connector correctness ✅
- Completed on 2026-02-27.
- ✅ Claude connector parity: GET /task/:taskId, POST /task/:taskId/cancel, POST /approval/:approvalId
- ✅ Artifact support: Claude accepts/returns TaskArtifact[], extractArtifacts() for MCP results
- ✅ Connector retry wrapper: withConnectorRetry() with exponential backoff, jitter, retryable error detection
- ✅ Cursor/Windsurf state bug fixed: 'succeeded' → 'completed', switched to completeTask()/failTask() helpers
- ✅ Tier-2 connector parity: Cursor, Windsurf, Replit all have task/cancel/approval endpoints
- ✅ Retry wrapper wired into all 5 connectors (Claude, Codex, Cursor, Windsurf, Replit)
- ✅ Replit artifact support added (types + route)
- ✅ Connector contract snapshot: MESSAGE_NOT_FOUND drift fixed
- ✅ Structured AuditEvent emission in Claude + Codex runtimes (ConnectorAttached/Detached/Error)

5. Docker Compose production hardening ✅
- Completed on 2026-02-27.
- ✅ docker-backend: resource reservations (2 CPU, 2GB), stop_grace_period 45s, healthcheck start_period
- ✅ recoder-web: VITE_DOCKER_BACKEND_URL + DOCKER_BACKEND_URL added, resource reservations, stop_grace_period, healthcheck targets /api/health
- ✅ recoder-app: resource reservations (1 CPU, 1GB), stop_grace_period 30s, healthcheck start_period
- ✅ recoder-frontend: resource reservations (0.5 CPU, 512MB), stop_grace_period 30s, healthcheck start_period

6. CI workflow fixes ✅
- Completed on 2026-02-27.
- ✅ automated-testing.yml: removed silent test failure swallowing (|| echo "...")
- ✅ deploy.yml: A2A smoke test warns instead of silently skipping
- ✅ Mobile typecheck: moved from || echo to continue-on-error for proper status visibility

## P2 — Release closeout (Planned)
1. Desktop pipeline (planned)
- Owner: Arhan Subasi
- Target date: 2026-03-31
- Remaining work:
  - ✅ Add baseline CI quality gate (lint + unit smoke) — completed 2026-02-27 (`desktop-release.yml` now runs blocking `npm run lint` + `npm test` in `apps/desktop`)
  - Finalize production signing/notarization secrets and release workflow
  - Run one full release dry-run and publish release evidence
- Verification command: `bash scripts/verify-desktop-release.sh [tag]`

2. Mobile pipeline (planned)
- Owner: Arhan Subasi
- Target date: 2026-03-31
- Remaining work:
  - ✅ Add CI lane for build/test/version consistency checks — completed 2026-02-27 (`mobile-ci.yml` includes blocking `Version Consistency` job + existing typecheck/lint/tests; EAS build now depends on all)
  - Stabilize release signing/config for Android + iOS paths
  - Run one end-to-end release dry-run and publish release evidence
- Verification command: `bash scripts/verify-mobile-release.sh [ref]`
- Combined closeout command: `bash scripts/verify-native-release-closeout.sh [desktop_tag] [mobile_ref]`

## Deferred (Budget-Constrained)
1. GitHub Actions billing-dependent release execution
- Status: Deferred by owner due budget constraint (2026-02-27).
- Impact: Desktop/Mobile GitHub-hosted workflow runs cannot start until billing/spending limits are restored.
- iOS CI note: `.github/workflows/ios-ci.yml` is manual-only (`workflow_dispatch`) and job-disabled (`if: false`); use local gate `bash scripts/verify-openclaw-ios-local.sh`.
- Owner: Arhan Subasi
- Revisit target: 2026-03-31
- Last verified blocker evidence:
  - Mobile CI run `22490203332`: jobs not started due billing/spending limit.
  - Desktop Release run `22490262473`: jobs not started due billing/spending limit.

## Manual/External dependencies
- Apple Developer cert for Desktop + macOS notarization
- Play Store keystore + `keystore.properties` for Android release signing
- App Store Connect API key for iOS Fastlane
- `EXPO_TOKEN` secret for mobile CI EAS builds
- OpenClawKit `Package.swift` iOS platform update (`.v18` -> `.v16`) to match lowered deployment target
- iOS local verification command: `bash scripts/verify-openclaw-ios-local.sh`
- GitHub Actions billing/spend-limit fix for iOS CI runners (current failure: job not started due to account payments/spending limit)

## Done criteria
1. Credential rotation complete and documented.
2. Monitoring/alerting active and test-fired. ✅
3. Desktop and mobile release closeout completed with evidence (or explicitly re-deferred with owner/date).
