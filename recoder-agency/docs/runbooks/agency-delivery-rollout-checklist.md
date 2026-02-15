# Recoder Agency Delivery Rollout Checklist

## Feature flags

- `FEATURE_RETRY_PANEL=true`
- `NEXT_PUBLIC_FEATURE_RETRY_PANEL=true`
- `NEXT_PUBLIC_FEATURE_FUNNEL_ANALYTICS=true` only when PostHog is configured.
- `NEXT_PUBLIC_ENABLE_POSTHOG=true` + `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` before enabling funnel analytics.

## Pre-rollout

- Confirm staging migration state includes `0081`, `0082`, `0086`, `0087`, `0090`, `0091`, `0092`, `0093`, `0094`, `0095`, `0096`, `0097`, `0100`, `0101`, `0102` (auth), and optionally `0103`-`0107` (P1 Phase 2).
- Run `pnpm -C apps/agency ops:staging:delivery-check`.
- Run `pnpm -C apps/agency ops:staging:verify-weekly-metrics-pipeline`.
- Run `pnpm -C apps/agency ops:staging:assert-release-readiness`.
- Run `pnpm -C apps/agency ops:staging:log-restore-drill` when new restore proof is recorded.
- Trigger `Agency Smokes Nightly` manually once on staging URL.
- Confirm `Deploy Gate` workflow is green with required agency smoke jobs:
  - `agency-smoke-required`
  - `agency-seeded-smoke-required`
- Confirm `Security Container Scan` workflow is green and SBOM artifact is uploaded.
- For production promotion, use `Promote Staging To Production` workflow and approve via `production-promotion` environment gate.
- Confirm admin page shows transition history filters and retry panel.
- Confirm client portal approve/reject and bulk reject reason validation.
- Confirm project deliverables can be marked as billable milestones.
- Confirm dashboard invoice retry queue is visible and retry action succeeds.
- Confirm project budget warning/hard-stop thresholds are configurable and enforced.
- Confirm dashboard "Project Unit Economics" panel renders rows or explicit empty state.
- Confirm milestone approval flow works end-to-end (approve/reject from client portal).
- Confirm client digest schedule CRUD operations succeed.
- Confirm team capacity settings are configurable per team.
- Confirm alert subscriptions can be created, listed, and deleted.
- Confirm role policy documented in `docs/runbooks/agency-role-matrix.md`.
- Confirm non-admin user cannot execute admin server actions (403/unauthorized error path).

## Metrics readiness gate

- `Staging DB Weekly Metrics Refresh` workflow is green.
- `Staging DB Weekly Metrics Fixture Check` workflow is green.
- `Staging DB Delivery Release Gate` workflow is green.
- Dashboard "Weekly Delivery Metrics" section shows snapshot data (not only fallback text).
- Run `pnpm -C apps/agency ops:staging:check-unit-economics` and confirm view query succeeds.

## Backup and restore gate

- Keep last successful restore drill evidence linked in release notes:
  - date/time
  - operator
  - source backup id/snapshot
  - validation query output (`select count(*)` for projects/transitions).
- Retention procedure is documented and executed:
  - daily backups retained 14 days
  - weekly backups retained 8 weeks
  - monthly backups retained 12 months
- Checklist sign-off is blocked if restore proof is older than 14 days.

## Rollout

- Deploy with retry panel flag enabled and funnel analytics disabled first.
- Validate admin retry flow in production.
- Enable `NEXT_PUBLIC_FEATURE_FUNNEL_ANALYTICS=true`.
- Validate PostHog events:
  - `agency_client_review_approve_single`
  - `agency_client_review_reject_single`
  - `agency_client_review_approve_bulk`
  - `agency_client_review_reject_bulk`

## Post-rollout

- Review Delivery Ops for forced transitions and rework spikes.
- Review dashboard weekly metrics card population.
- Keep nightly agency smoke workflow enabled.
- Keep deploy-time required agency smokes enabled (`Deploy Gate`).

## Rollback companion

- If metrics regressions occur:
  - run `pnpm -C apps/agency ops:staging:cleanup-weekly-metrics-fixture`
  - run rollback SQL: `docs/runbooks/agency-delivery-rollback-snippets.sql`
  - disable/skip weekly metrics workflows until fixed:
    - `staging-db-weekly-metrics-refresh.yml`
    - `staging-db-weekly-metrics-fixture-check.yml`
    - `staging-db-delivery-release-gate.yml`
