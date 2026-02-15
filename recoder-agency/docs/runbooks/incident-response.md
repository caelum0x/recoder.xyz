# Recoder Agency Incident Response Runbook

## Severity levels

- `SEV-1`: full outage, data integrity risk, auth failure for most users.
- `SEV-2`: major feature degraded (delivery transitions, dashboard, client review).
- `SEV-3`: partial degradation, workaround exists.

## Immediate response (first 15 minutes)

1. Assign incident lead and scribe.
2. Create incident channel and set status page/internal notice.
3. Freeze non-essential deploys.
4. Capture blast radius:
   - affected routes/pages
   - affected teams/tenants
   - first-seen timestamp

## Triage checklist

1. Check app health endpoint:
   - `GET /api/health`
2. Check latest deploy/workflow runs:
   - `.github/workflows/deploy-gate.yml`
   - `.github/workflows/ci.yml`
3. Check delivery gates:
   - `staging-db-delivery-release-gate.yml`
   - `staging-db-weekly-metrics-refresh.yml`
4. Check auth failures (login/oauth/callback).
5. Check DB connectivity and recent migration drift.

## Containment actions

- Disable feature flags if involved:
  - `FEATURE_RETRY_PANEL`
  - `NEXT_PUBLIC_FEATURE_FUNNEL_ANALYTICS`
  - `FEATURE_AUTO_REFRESH_WEEKLY_METRICS`
- Revert latest deploy if regression is confirmed.
- If data workflow is broken, pause cron endpoints until fixed.

## Recovery verification

1. `pnpm -C apps/agency check-types`
2. Required deploy gate jobs green.
3. `/api/health` returns `200` with `{ "status": "ok" }`.
4. Client review approve/reject flow passes smoke.
5. Delivery Ops and Dashboard load without server errors.

## Post-incident

1. Publish timeline and root cause.
2. Document corrective actions with owner and due date.
3. Add regression test(s) for incident path.
