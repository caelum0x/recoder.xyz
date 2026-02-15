# Recoder Agency Release Readiness Scorecard

Last updated: 2026-02-10
Owner: Release Manager / On-call

Purpose: binary Go/No-Go gate for production promotion.

Decision rule:
- `GO` only if every P0 gate below is `PASS`.
- Any `FAIL` or `UNKNOWN` => `NO-GO`.

## P0 Gate Scorecard

| Gate ID | Gate | Status (`PASS`/`FAIL`/`UNKNOWN`) | Evidence | Owner |
|---|---|---|---|---|
| OPS-P0-001 | Promotion Gate Activation | UNKNOWN | GitHub env `production-promotion` exists with required reviewers; promotion workflow run URL | |
| OPS-P0-002 | Secrets Hygiene + Canonical Env | UNKNOWN | Secret manager rotation record, env diff showing canonical keys only | |
| OPS-P0-003 | Staging Readiness Evidence Sequence | UNKNOWN | Command output + workflow URLs for cleanup/seed/log-drill/assert sequence | |
| OPS-P0-004 | Alert Routing Activation | UNKNOWN | Alert policy config + test alert screenshots/logs | |

## Required Gate Evidence (Copy/Paste)

### OPS-P0-001 Promotion Gate Activation

- `production-promotion` environment configured: `YES/NO`
- Required reviewers configured: `YES/NO`
- `PRODUCTION_DEPLOY_WEBHOOK_URL` set: `YES/NO`
- Dry run success URL:
- Live promotion success URL:

### OPS-P0-002 Secrets Hygiene + Canonical Env

- Placeholder/test credentials removed: `YES/NO`
- Canonical OAuth env vars only (`GOOGLE_OAUTH_CLIENT_ID/SECRET`): `YES/NO`
- Secret rotation completed date:
- Rotation owner:
- Evidence link:

### OPS-P0-003 Staging Readiness Evidence Sequence

Run in order and paste results:

```bash
pnpm -C apps/agency ops:staging:cleanup-weekly-metrics-fixture
pnpm -C apps/agency ops:staging:seed-weekly-metrics-fixture
pnpm -C apps/agency ops:staging:log-restore-drill
pnpm -C apps/agency ops:staging:assert-release-readiness
```

- Cleanup: `PASS/FAIL`
- Seed fixture: `PASS/FAIL`
- Log restore drill: `PASS/FAIL`
- Assert release readiness: `PASS/FAIL`
- Evidence link:

### OPS-P0-004 Alert Routing Activation

- Deploy gate failure alert route tested: `PASS/FAIL`
- Cron failure alert route tested: `PASS/FAIL`
- Smoke failure alert route tested: `PASS/FAIL`
- `ALERT_WEBHOOK_URL` configured: `YES/NO`
- Optional auth secret (`ALERT_WEBHOOK_BEARER`) configured if destination requires auth: `YES/NO/NA`
- `Ops Alert Routing` workflow test run URL:
- Escalation thresholds match runbook: `YES/NO`
- Evidence link:

## Final Decision

- Final status: `GO / NO-GO`
- Decision timestamp:
- Decision owner:
- Notes / risk acceptance:

## References

- `docs/plan/production-grade-backlog.md`
- `docs/plan/ai-native-agency-roadmap.md`
- `docs/runbooks/release-promotion.md`
- `docs/runbooks/monitoring-and-alerts.md`
- `docs/runbooks/agency-delivery-rollout-checklist.md`
