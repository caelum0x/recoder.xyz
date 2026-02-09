-- Refreshes weekly delivery KPI materialized view and prints a quick snapshot.
-- Requires migration 0082_weekly_delivery_metrics.sql.

BEGIN;

REFRESH MATERIALIZED VIEW public.weekly_delivery_metrics;

COMMIT;

SELECT COUNT(*) AS weekly_rows
FROM public.weekly_delivery_metrics;

SELECT
	team_db_id,
	week_start,
	completed_projects_count,
	first_pass_approval_rate,
	forced_transition_rate
FROM public.weekly_delivery_metrics
ORDER BY week_start DESC
LIMIT 10;
