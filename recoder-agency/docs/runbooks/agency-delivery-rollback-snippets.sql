-- Recoder Agency Delivery rollback snippets.
-- Run with:
-- psql "$AGENCY_STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/runbooks/agency-delivery-rollback-snippets.sql

BEGIN;

-- 0) P1 Phase 2 rollback (migrations 0104-0107).
DROP TABLE IF EXISTS public.alert_subscriptions;
DROP TABLE IF EXISTS public.team_capacity_settings;
DROP TABLE IF EXISTS public.client_digest_schedules;
DROP TABLE IF EXISTS public.milestone_approvals;
ALTER TABLE public.projects DROP COLUMN IF EXISTS assigned_user_db_id;
ALTER TABLE public.deliverables DROP COLUMN IF EXISTS milestone_approval_status;
ALTER TABLE public.deliverables DROP COLUMN IF EXISTS phase_order;

-- 1) Disable weekly metrics view if a deployment needs fast rollback.
DROP MATERIALIZED VIEW IF EXISTS public.weekly_delivery_metrics;
DROP VIEW IF EXISTS public.project_unit_economics;
DROP TRIGGER IF EXISTS projects_status_audit_guard_trg ON public.projects;
DROP FUNCTION IF EXISTS public.guard_project_status_update_with_audit();
DROP TABLE IF EXISTS public.ops_restore_drills;

-- 2) Remove workflow stability indexes if needed.
DROP INDEX IF EXISTS public.project_status_transitions_source_idx;
DROP INDEX IF EXISTS public.project_status_transitions_forced_bool_idx;
DROP INDEX IF EXISTS public.project_status_transitions_source_forced_created_at_idx;

-- 3) Optional service catalog rollback (only if commercial rollout must be reverted).
ALTER TABLE IF EXISTS public.invoices
	DROP CONSTRAINT IF EXISTS invoices_retry_count_nonnegative_check;
DROP INDEX IF EXISTS public.invoices_next_retry_at_idx;
DROP INDEX IF EXISTS public.invoices_retry_count_idx;
ALTER TABLE IF EXISTS public.invoices
	DROP COLUMN IF EXISTS retry_count;
ALTER TABLE IF EXISTS public.invoices
	DROP COLUMN IF EXISTS last_retry_at;
ALTER TABLE IF EXISTS public.invoices
	DROP COLUMN IF EXISTS last_error;
ALTER TABLE IF EXISTS public.invoices
	DROP COLUMN IF EXISTS next_retry_at;
ALTER TABLE IF EXISTS public.invoices
	DROP COLUMN IF EXISTS auto_retry_disabled;

DROP INDEX IF EXISTS public.deliverables_billable_milestone_idx;
ALTER TABLE IF EXISTS public.deliverables
	DROP COLUMN IF EXISTS is_billable_milestone;
ALTER TABLE IF EXISTS public.deliverables
	DROP COLUMN IF EXISTS milestone_label;

DROP TABLE IF EXISTS public.change_orders;
DROP TABLE IF EXISTS public.sows;
DROP TABLE IF EXISTS public.quotes;

ALTER TABLE IF EXISTS public.projects
	DROP CONSTRAINT IF EXISTS projects_service_sku_or_scope_override_check;
ALTER TABLE IF EXISTS public.projects
	DROP CONSTRAINT IF EXISTS projects_service_sku_db_id_fk;
ALTER TABLE IF EXISTS public.projects
	DROP CONSTRAINT IF EXISTS projects_cost_warning_threshold_pct_range_check;
ALTER TABLE IF EXISTS public.projects
	DROP CONSTRAINT IF EXISTS projects_cost_hard_stop_threshold_pct_range_check;
DROP INDEX IF EXISTS public.projects_service_sku_db_id_idx;
ALTER TABLE IF EXISTS public.projects
	DROP COLUMN IF EXISTS service_sku_db_id;
ALTER TABLE IF EXISTS public.projects
	DROP COLUMN IF EXISTS scope_override_reason;
ALTER TABLE IF EXISTS public.projects
	DROP COLUMN IF EXISTS cost_warning_threshold_pct;
ALTER TABLE IF EXISTS public.projects
	DROP COLUMN IF EXISTS cost_hard_stop_threshold_pct;
ALTER TABLE IF EXISTS public.projects
	DROP COLUMN IF EXISTS cost_hard_stop_enabled;
DROP TABLE IF EXISTS public.service_skus;

-- 4) Optional cleanup of seeded e2e and fixture records (no-op when absent).
DELETE FROM public.project_status_transitions
WHERE reason ILIKE 'Seeded by seed_test_delivery_transitions.sql%';

DELETE FROM public.deliverables
WHERE id LIKE 'e2e_seed_deliv_%';

DELETE FROM public.projects
WHERE id IN ('e2e_delivery_transition_project', 'e2e_client_review_project');

DELETE FROM public.project_status_transitions
WHERE project_db_id IN (
	SELECT db_id FROM public.projects WHERE id LIKE 'metrics_fixture_project_%'
);

DELETE FROM public.projects
WHERE id LIKE 'metrics_fixture_project_%';

DELETE FROM public.clients
WHERE id = 'client_metrics_fixture';

DELETE FROM public.users
WHERE id = 'usr_metrics_fixture';

DELETE FROM public.teams
WHERE id = 'team_metrics_fixture';

COMMIT;
