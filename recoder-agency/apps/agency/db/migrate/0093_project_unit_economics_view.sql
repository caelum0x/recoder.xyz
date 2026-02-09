-- Per-project P&L view: revenue (paid invoices), cost (ledger by category), margin.
-- Resilient to partial staging schemas where cost ledger or quotes may not exist yet.

BEGIN;

DROP VIEW IF EXISTS "public"."project_unit_economics";

DO $$
DECLARE
	has_cost_ledger boolean;
	has_quotes boolean;
	has_project_budget boolean;
	view_sql text;
BEGIN
	IF to_regclass('public.projects') IS NULL THEN
		RAISE EXCEPTION 'projects table is required for project_unit_economics view';
	END IF;
	IF to_regclass('public.clients') IS NULL THEN
		RAISE EXCEPTION 'clients table is required for project_unit_economics view';
	END IF;
	IF to_regclass('public.invoices') IS NULL THEN
		RAISE EXCEPTION 'invoices table is required for project_unit_economics view';
	END IF;

	has_cost_ledger := to_regclass('public.cost_ledger_entries') IS NOT NULL;
	has_quotes := to_regclass('public.quotes') IS NOT NULL;
	has_project_budget := EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'projects'
			AND column_name = 'budget_cents'
	);

	view_sql := '
		CREATE VIEW "public"."project_unit_economics" AS
		SELECT
			p."db_id" AS project_db_id,
			p."id" AS project_id,
			p."name" AS project_name,
			p."status" AS project_status,
			p."team_db_id" AS team_db_id,';

	IF has_project_budget THEN
		view_sql := view_sql || '
			p."budget_cents" AS budget_cents,';
	ELSE
		view_sql := view_sql || '
			null::integer AS budget_cents,';
	END IF;

	view_sql := view_sql || '
			c."name" AS client_name,

			coalesce(inv.paid_revenue_cents, 0)::bigint AS paid_revenue_cents,
			coalesce(inv.total_invoiced_cents, 0)::bigint AS total_invoiced_cents,';

	IF has_cost_ledger THEN
		view_sql := view_sql || '
			coalesce(costs.total_cost_cents, 0)::bigint AS total_cost_cents,
			coalesce(costs.labor_cents, 0)::bigint AS labor_cents,
			coalesce(costs.ai_usage_cents, 0)::bigint AS ai_usage_cents,
			coalesce(costs.infrastructure_cents, 0)::bigint AS infrastructure_cents,
			coalesce(costs.tooling_cents, 0)::bigint AS tooling_cents,
			coalesce(costs.subcontractor_cents, 0)::bigint AS subcontractor_cents,
			coalesce(costs.other_cents, 0)::bigint AS other_cents,

			(coalesce(inv.paid_revenue_cents, 0) - coalesce(costs.total_cost_cents, 0))::bigint AS gross_margin_cents,';
	ELSE
		view_sql := view_sql || '
			0::bigint AS total_cost_cents,
			0::bigint AS labor_cents,
			0::bigint AS ai_usage_cents,
			0::bigint AS infrastructure_cents,
			0::bigint AS tooling_cents,
			0::bigint AS subcontractor_cents,
			0::bigint AS other_cents,

			coalesce(inv.paid_revenue_cents, 0)::bigint AS gross_margin_cents,';
	END IF;

	IF has_cost_ledger THEN
		view_sql := view_sql || '
			CASE
				WHEN coalesce(inv.paid_revenue_cents, 0) > 0
					THEN round(
						((inv.paid_revenue_cents - coalesce(costs.total_cost_cents, 0))::numeric
						 / inv.paid_revenue_cents::numeric) * 100.0, 2)
				ELSE NULL
			END AS gross_margin_pct,';
	ELSE
		view_sql := view_sql || '
			CASE
				WHEN coalesce(inv.paid_revenue_cents, 0) > 0 THEN 100.0
				ELSE NULL
			END AS gross_margin_pct,';
	END IF;

	IF has_quotes THEN
		view_sql := view_sql || '
			q."price_cents" AS quote_price_cents';
	ELSE
		view_sql := view_sql || '
			null::integer AS quote_price_cents';
	END IF;

	view_sql := view_sql || '
		FROM "public"."projects" p
		INNER JOIN "public"."clients" c
			ON c."db_id" = p."client_db_id"
		LEFT JOIN LATERAL (
			SELECT
				sum(i."amount") FILTER (WHERE i."status" = ''paid'') AS paid_revenue_cents,
				sum(i."amount") FILTER (WHERE i."status" != ''cancelled'') AS total_invoiced_cents
			FROM "public"."invoices" i
			WHERE i."project_db_id" = p."db_id"
		) inv ON true';

	IF has_cost_ledger THEN
		view_sql := view_sql || '
		LEFT JOIN LATERAL (
			SELECT
				sum(cle."amount_cents") AS total_cost_cents,
				coalesce(sum(cle."amount_cents") FILTER (WHERE cle."category" = ''labor''), 0) AS labor_cents,
				coalesce(sum(cle."amount_cents") FILTER (WHERE cle."category" = ''ai_usage''), 0) AS ai_usage_cents,
				coalesce(sum(cle."amount_cents") FILTER (WHERE cle."category" = ''infrastructure''), 0) AS infrastructure_cents,
				coalesce(sum(cle."amount_cents") FILTER (WHERE cle."category" = ''tooling''), 0) AS tooling_cents,
				coalesce(sum(cle."amount_cents") FILTER (WHERE cle."category" = ''subcontractor''), 0) AS subcontractor_cents,
				coalesce(sum(cle."amount_cents") FILTER (WHERE cle."category" = ''other''), 0) AS other_cents
			FROM "public"."cost_ledger_entries" cle
			WHERE cle."project_db_id" = p."db_id"
		) costs ON true';
	END IF;

	IF has_quotes THEN
		view_sql := view_sql || '
		LEFT JOIN "public"."quotes" q
			ON q."project_db_id" = p."db_id"';
	END IF;

	EXECUTE view_sql;
END $$;

COMMIT;
