# Recoder Plan (Remaining Tasks Only)

Last updated: 2026-02-27

## Already completed
- Hardcoded secrets removed/sanitized from tracked `.env` and non-`.env` files.
- Strict leak scan added and passing locally:
  - `scripts/leak-scan-strict.sh`
  - `scripts/leak-scan-allowlist.regex`
- Leak scan enforced in CI/deploy workflows.
- Pre-commit hook upgraded to use strict scanner (no more false positives).
- Worker watchdog scripts implemented and wired into deploy:
  - `scripts/a2a-worker-watchdog.sh`
  - `scripts/install-a2a-watchdog-cron.sh`
  - `scripts/deploy-all-services.sh` installs watchdog cron
- Worker watchdog installed and validated on production.
- Full production deploy completed successfully (`scripts/deploy-all-services.sh`).
- Runtime health verified: app/frontend/web/backend/openclaw/redis healthy.
- A2A workers running and A2A production smoke passed.
- Prometheus targets fixed: removed stale `:8000` backend job, commented PM2-only services.
- Node exporter + Redis exporter added to `docker-compose.deploy.yml`.
- Alert rules now have backing metrics (infrastructure + redis exporters).
- Redis password hardcoded fallback removed from deploy script (now auto-generated).
- Deploy script env validation added (Phase 1b — fails fast if secrets empty).

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
- `.env.production` has ~125+ placeholder values that need real secrets.
- Confirm cross-service consistency for auth/database/webhook settings.
- Decide: keep or remove `recoder-frontend` (port 3001) — `apps/frontend/` is deleted.

3. Monitoring + alerting activation
- Set alertmanager env vars: `ALERT_WEBHOOK_URL`, `ALERT_EMAIL`, SMTP config.
- Deploy updated docker-compose (now includes node-exporter + redis-exporter).
- Verify Prometheus scraping all targets, Grafana accessible.
- Test-fire at least one alert and capture evidence.

4. Desktop/mobile closeout decision
- Either ship release pipelines end-to-end, or defer with explicit owner/date.

## Exit condition
- All remaining items completed, or deferred with explicit owner + date.
