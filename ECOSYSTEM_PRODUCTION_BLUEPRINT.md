# Recoder Ecosystem Blueprint (Remaining Work Only)

Last updated: 2026-02-27

## Current baseline (already true)
- Core deploy stack is healthy.
- Full deploy completes end-to-end.
- A2A workers are running.
- A2A production smoke passes.
- Strict leak scan exists and is wired into CI/deploy workflows.
- Worker watchdog script implemented (`scripts/a2a-worker-watchdog.sh`).
- Hardcoded secrets removed from tracked files.
- Pre-commit hook upgraded to use strict leak scanner.
- Prometheus targets fixed (removed stale `:8000` backend job, commented PM2-only services).
- Node exporter + Redis exporter added to `docker-compose.deploy.yml`.
- Redis password fallback removed from deploy script (now auto-generated).
- Deploy script env validation added (Phase 1b).

## P0 — Must finish before launch sign-off
1. Credential rotation (manual)
- Rotate all previously exposed credentials/tokens in provider dashboards.
- Key categories: DB/Redis, OAuth (Google/GitHub), AI provider keys, payment/webhook secrets, auth/jwt/encryption secrets.
- Update server-side `.env` values after rotation.

2. Production env audit
- Validate env completeness for all live services.
- `.env.production` currently has ~12 domain vars set; ~125+ secret placeholders remain.
- Cross-check: DATABASE_URL, REDIS_PASSWORD, auth secrets consistent across services.
- Clarify: is `recoder-frontend` (port 3001) still needed? `apps/frontend/` is deleted in git.

## P1 — Operational hardening
1. Monitoring and alerting activation
- Node exporter and Redis exporter now in docker-compose (ready to deploy).
- Prometheus scrape jobs for redis and node are enabled.
- Alertmanager needs env vars: `ALERT_WEBHOOK_URL`, `ALERT_EMAIL`, `SMTP_SMARTHOST`, `SMTP_FROM`, `SMTP_AUTH_USERNAME`, `SMTP_AUTH_PASSWORD`.
- Test-fire at least one alert and capture evidence.

2. Worker watchdog activation
- Install cron: `*/5 * * * * /opt/recoder/scripts/a2a-worker-watchdog.sh`
- Validate: kill a worker, confirm auto-restart within 5 minutes.

## P2 — Release closeout
1. Desktop release pipeline — ship or defer with owner/date.
2. Mobile release pipeline — ship or defer with owner/date.

## Done criteria
1. Credential rotation complete and documented.
2. Env audit complete for all live services.
3. Monitoring/alerting active and test-fired.
4. Worker watchdog cron installed and validated.
5. Desktop/mobile shipped or explicitly deferred with owner/date.
