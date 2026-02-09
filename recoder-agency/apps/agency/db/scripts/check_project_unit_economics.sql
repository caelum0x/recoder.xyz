BEGIN;

SELECT COUNT(*)::int AS unit_economics_rows
FROM "public"."project_unit_economics";

SELECT
	team_db_id,
	project_id,
	project_name,
	project_status,
	paid_revenue_cents,
	total_invoiced_cents,
	total_cost_cents,
	gross_margin_cents,
	gross_margin_pct
FROM "public"."project_unit_economics"
ORDER BY gross_margin_cents ASC
LIMIT 10;

COMMIT;
