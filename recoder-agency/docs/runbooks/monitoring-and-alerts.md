# Recoder Agency Monitoring and Alerts

## Core signals

- App uptime:
  - `/api/health` availability and latency.
- Delivery quality:
  - first-pass approval rate
  - forced-transition rate
  - rework rate (`client_review -> in_progress`)
- Reliability:
  - failed cron runs
  - failed deploy gate jobs
  - seeded smoke failures

## Alert thresholds (initial)

- Health endpoint non-200 for 5 minutes: `SEV-1`
- Forced-transition rate > 5% (7d): `SEV-2`
- Rework rate > 15% (7d): `SEV-2`
- Weekly metrics stale beyond `WEEKLY_METRICS_STALE_AFTER_DAYS`: `SEV-2`
- No restore drill within `RESTORE_DRILL_STALE_AFTER_DAYS`: `SEV-2`

## Where to monitor

- GitHub Actions:
  - `deploy-gate.yml`
  - `agency-smoke-nightly.yml`
  - `staging-db-delivery-release-gate.yml`
  - `staging-db-weekly-metrics-refresh.yml`
  - `ops-alert-routing.yml`
- Admin dashboard:
  - Weekly Delivery Metrics cards
  - Release Readiness panel
  - Audit Events panel

## Alert routing setup

Configure repository secrets:
- `ALERT_WEBHOOK_URL` (required): destination webhook URL for alerts.
- `ALERT_WEBHOOK_BEARER` (optional): bearer token added as Authorization header.

Triggering rules:
- Automatic on failed workflow runs for:
  - `Deploy Gate`
  - `Agency Smokes Nightly`
  - `Staging DB Delivery Release Gate`
  - `Staging DB Weekly Metrics Refresh`
- Manual test via workflow dispatch:
  - workflow: `Ops Alert Routing`
  - input `test_status=failure`

Playbook smoke fixture hygiene:
- `Deploy Gate` and `Agency Smokes Nightly` now seed and cleanup deterministic playbook fixtures around smoke runs:
  - `apps/agency/db/scripts/seed_playwright_playbook_smoke.sql`
  - `apps/agency/db/scripts/cleanup_playwright_playbook_smoke.sql`

## On alert

1. Acknowledge alert and assign owner.
2. Run quick checks from `production-troubleshooting.md`.
3. If customer-impacting, start incident process.
