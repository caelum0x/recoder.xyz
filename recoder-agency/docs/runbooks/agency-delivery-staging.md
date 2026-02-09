# Recoder Agency Delivery Staging Runbook

## Required secret/env

- `AGENCY_STAGING_DATABASE_URL`: PostgreSQL connection string for staging checks.

## 1. Verify schema baseline

```bash
psql "$AGENCY_STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "\dt public.projects" \
  -c "\dt public.deliverables" \
  -c "\dt public.project_status_transitions"
```

## 2. Apply delivery migrations

```bash
psql "$AGENCY_STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f apps/agency/db/migrate/0097_restore_drills_nullable_team.sql \
  -f apps/agency/db/migrate/0096_restore_drills.sql \
  -f apps/agency/db/migrate/0095_project_status_audit_guard.sql \
  -f apps/agency/db/migrate/0094_agency_roles.sql \
  -f apps/agency/db/migrate/0093_project_unit_economics_view.sql \
  -f apps/agency/db/migrate/0092_project_cost_guardrails.sql \
  -f apps/agency/db/migrate/0091_milestone_billing_and_invoice_retry.sql \
  -f apps/agency/db/migrate/0087_quotes_and_sows.sql \
  -f apps/agency/db/migrate/0090_change_order_workflow.sql \
  -f apps/agency/db/migrate/0086_service_catalog.sql \
  -f apps/agency/db/migrate/0084_sla_policies.sql \
  -f apps/agency/db/migrate/0085_definition_of_done_and_qa_gates.sql \
  -f apps/agency/db/migrate/0081_workflow_stability_constraints_and_indexes.sql \
  -f apps/agency/db/migrate/0082_weekly_delivery_metrics.sql \
  -f apps/agency/db/migrate/0083_transition_guardrail_dedupe_index.sql
```

## 3. Run seed/cleanup transition check

- Local:

```bash
AGENCY_STAGING_DATABASE_URL="..." \
pnpm -C apps/agency ops:staging:delivery-check
```

- CI:
  - `recoder-agency/.github/workflows/staging-db-delivery-transition-check.yml`

## 4. Validate materialized metrics view

```bash
psql "$AGENCY_STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "SELECT COUNT(*) AS weekly_rows FROM public.weekly_delivery_metrics;" \
  -c "SELECT team_db_id, week_start, first_pass_approval_rate, forced_transition_rate FROM public.weekly_delivery_metrics ORDER BY week_start DESC LIMIT 5;"
```

## 5. Refresh weekly metrics snapshot

- Local/manual refresh:

```bash
AGENCY_STAGING_DATABASE_URL="..." \
pnpm -C apps/agency ops:staging:refresh-weekly-metrics
```

- Freshness check:

```bash
AGENCY_STAGING_DATABASE_URL="..." \
WEEKLY_METRICS_STALE_AFTER_DAYS=10 \
pnpm -C apps/agency ops:staging:check-weekly-metrics-freshness
```

- Scheduled refresh workflow:
  - `recoder-agency/.github/workflows/staging-db-weekly-metrics-refresh.yml`

## 6. Seed weekly metrics fixture (optional for demos/tests)

```bash
AGENCY_STAGING_DATABASE_URL="..." \
pnpm -C apps/agency ops:staging:seed-weekly-metrics-fixture
```

This seeds deterministic transitions under fixture ids and refreshes `weekly_delivery_metrics` so KPI cards are non-empty.

## 7. Assert fixture KPI integrity

```bash
AGENCY_STAGING_DATABASE_URL="..." \
pnpm -C apps/agency ops:staging:assert-weekly-metrics-fixture
```

## 8. Cleanup fixture records

```bash
AGENCY_STAGING_DATABASE_URL="..." \
pnpm -C apps/agency ops:staging:cleanup-weekly-metrics-fixture
```

Fixture check workflow:
- `recoder-agency/.github/workflows/staging-db-weekly-metrics-fixture-check.yml`

## 9. Validate agency smoke coverage

- Nightly matrix workflow:
  - `recoder-agency/.github/workflows/agency-smoke-nightly.yml`
- Includes:
  - transition history roundtrip smoke
  - retry panel suggestions smoke
  - seeded client review transition smoke

## 10. Verify transition DB guardrails

```bash
AGENCY_STAGING_DATABASE_URL="..." \
pnpm -C apps/agency ops:staging:test-transition-guardrails
```

Guardrail check workflow:
- `recoder-agency/.github/workflows/staging-db-transition-guardrails-check.yml`

## 11. Verify delivery release readiness gate

```bash
AGENCY_STAGING_DATABASE_URL="..." \
WEEKLY_METRICS_STALE_AFTER_DAYS=10 \
pnpm -C apps/agency ops:staging:assert-release-readiness
```

Delivery release gate workflow:
- `recoder-agency/.github/workflows/staging-db-delivery-release-gate.yml`

## 12. Verify unit economics view and dashboard data

```bash
AGENCY_STAGING_DATABASE_URL="..." \
pnpm -C apps/agency ops:staging:check-unit-economics
```

Validation target:
- `project_unit_economics` returns rows for active teams with invoice/cost activity.
- Dashboard "Project Unit Economics" panel renders either populated rows or explicit empty state.

## 13. Verify RBAC role constraints

```bash
psql "$AGENCY_STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "SELECT conname FROM pg_constraint WHERE conname IN ('team_memberships_role_allowed_check','invitations_role_allowed_check');"
```

## 14. Log restore drill evidence for release gate

```bash
AGENCY_STAGING_DATABASE_URL="..." \
RESTORE_OPERATOR="oncall-user" \
RESTORE_BACKUP_REFERENCE="snapshot-2026-02-07T20:00Z" \
RESTORE_VALIDATION_SUMMARY="projects/transitions count query verified" \
pnpm -C apps/agency ops:staging:log-restore-drill
```
