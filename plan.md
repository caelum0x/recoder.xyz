# Recoder Plan (Remaining Tasks Only)

Last updated: 2026-02-27

## Already completed
- Hardcoded secrets removed/sanitized from tracked `.env` and non-`.env` files.
- Strict leak scan added and passing locally:
  - `scripts/leak-scan-strict.sh`
  - `scripts/leak-scan-allowlist.regex`
- Leak scan enforced in CI/deploy workflows.
- Full production deploy completed successfully (`scripts/deploy-all-services.sh`).
- Runtime health verified: app/frontend/web/backend/openclaw/redis healthy.
- A2A workers running and A2A production smoke passed.

## Remaining work (in order)
1. Credential rotation (manual)
- Rotate all previously exposed credentials in provider dashboards:
  - DB/Redis
  - OAuth (Google/GitHub)
  - AI provider keys
  - payment/webhook secrets
  - auth/jwt/encryption secrets
- Update server-side secret values after rotation.

2. Production env completeness audit
- Verify final runtime env completeness for all live services on server.
- Confirm cross-service consistency for auth/database/webhook settings.

3. Monitoring + alerting activation
- Ensure dashboards/alerts are live and connected to real notification channels.
- Test-fire at least one alert and capture evidence.

4. Worker watchdog automation
- Add periodic watchdog job for worker liveness + duplicate-process cleanup.
- Validate auto-recovery by killing a worker and confirming restart.

5. Desktop/mobile closeout decision
- Either ship release pipelines end-to-end, or defer with explicit owner/date.

## Exit condition
- All remaining items completed, or deferred with explicit owner + date.
