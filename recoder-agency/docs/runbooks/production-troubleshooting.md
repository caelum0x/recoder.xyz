# Recoder Agency Production Troubleshooting

## Quick checks

1. App reachable:
   - `curl -i "$PLAYWRIGHT_BASE_URL/api/health"`
2. Env sanity:
   - `DATABASE_URL` is single-line and valid.
   - `BETTER_AUTH_SECRET` present.
3. Recent CI/deploy:
   - `Deploy Gate` green.

## Common issues

### Login/OAuth failures

- Symptoms: social login 404/redirect loops.
- Check:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `BETTER_AUTH_URL`
- Fix:
  - use canonical OAuth env names (not alias keys).
  - redeploy with corrected env.

### Delivery transition failures

- Symptoms: invalid path/retry-needed spikes.
- Check:
  - admin Delivery Ops Exception Queue
  - project transition history filters
- Fix:
  - use admin retry transition panel with suggested target.
  - force transition only with reason.

### KPI cards empty/stale

- Check:
  - `pnpm -C apps/agency ops:staging:check-weekly-metrics-freshness`
  - `pnpm -C apps/agency ops:staging:refresh-weekly-metrics`
- If still empty:
  - seed fixture for validation:
    - `pnpm -C apps/agency ops:staging:seed-weekly-metrics-fixture`
    - `pnpm -C apps/agency ops:staging:assert-weekly-metrics-fixture`

### Release readiness failing

- Run:
  - `pnpm -C apps/agency ops:staging:assert-release-readiness`
- Typical fixes:
  - apply missing migrations from runbook
  - log restore drill evidence
  - refresh weekly metrics

## Escalation

- `SEV-1`: escalate immediately to on-call + incident lead.
- `SEV-2`: escalate within 30 minutes.
- Include:
  - exact failing command
  - timestamp
  - related workflow URL
