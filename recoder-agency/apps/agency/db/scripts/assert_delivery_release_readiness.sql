-- Validates delivery release readiness prerequisites on staging/prod-like DBs.
-- Optional psql vars:
--   stale_days (default 10)
--   restore_max_age_days (default 14)
--   check_p1_phase2 (default false) — set to 'true' to also assert P1 Phase 2 objects

\if :{?stale_days}
\else
\set stale_days 10
\endif

\if :{?restore_max_age_days}
\else
\set restore_max_age_days 14
\endif

\if :{?check_p1_phase2}
\else
\set check_p1_phase2 false
\endif

SELECT set_config(
	'app.release_readiness.stale_days',
	coalesce(nullif(:'stale_days', ''), '10'),
	false
);

SELECT set_config(
	'app.release_readiness.restore_max_age_days',
	coalesce(nullif(:'restore_max_age_days', ''), '14'),
	false
);

SELECT set_config(
	'app.release_readiness.check_p1_phase2',
	coalesce(nullif(:'check_p1_phase2', ''), 'false'),
	false
);

DO $$
DECLARE
	v_stale_days int := current_setting('app.release_readiness.stale_days')::int;
	v_restore_max_age_days int := current_setting('app.release_readiness.restore_max_age_days')::int;
	v_check_p1_phase2 boolean := current_setting('app.release_readiness.check_p1_phase2')::boolean;
	v_has_missing_objects boolean;
	v_has_missing_columns boolean;
	v_max_week_start date;
	v_age_days int;
	v_last_restore_date date;
	v_restore_age_days int;
BEGIN
	-- ── P0 core objects (always checked) ──
	SELECT EXISTS (
		SELECT 1
		FROM (
			VALUES
				('public.projects'),
				('public.deliverables'),
				('public.project_status_transitions'),
				('public.weekly_delivery_metrics'),
				('public.service_skus'),
				('public.ops_restore_drills')
		) AS required_objects(qualified_name)
		WHERE to_regclass(required_objects.qualified_name) IS NULL
	) INTO v_has_missing_objects;

	IF v_has_missing_objects THEN
		RAISE EXCEPTION 'Missing P0 delivery objects. Ensure migrations 0081, 0082, 0086, 0096 are applied.';
	END IF;

	-- ── P0 core columns (always checked) ──
	SELECT EXISTS (
		SELECT 1
		FROM (
			VALUES
				('projects', 'service_sku_db_id'),
				('projects', 'scope_override_reason')
		) AS required_columns(table_name, column_name)
		LEFT JOIN information_schema.columns c
			ON c.table_schema = 'public'
			AND c.table_name = required_columns.table_name
			AND c.column_name = required_columns.column_name
		WHERE c.column_name IS NULL
	) INTO v_has_missing_columns;

	IF v_has_missing_columns THEN
		RAISE EXCEPTION 'Missing P0 columns on projects. Ensure service catalog migration 0086 is applied.';
	END IF;

	-- ── P1 Phase 2 objects (only when check_p1_phase2 = true) ──
	IF v_check_p1_phase2 THEN
		SELECT EXISTS (
			SELECT 1
			FROM (
				VALUES
					('public.milestone_approvals'),
					('public.client_digest_schedules'),
					('public.team_capacity_settings'),
					('public.alert_subscriptions')
			) AS required_objects(qualified_name)
			WHERE to_regclass(required_objects.qualified_name) IS NULL
		) INTO v_has_missing_objects;

		IF v_has_missing_objects THEN
			RAISE EXCEPTION 'Missing P1 Phase 2 objects. Ensure migrations 0104, 0105, 0106, 0107 are applied.';
		END IF;

		SELECT EXISTS (
			SELECT 1
			FROM (
				VALUES
					('deliverables', 'phase_order'),
					('deliverables', 'milestone_approval_status'),
					('projects', 'assigned_user_db_id')
			) AS required_columns(table_name, column_name)
			LEFT JOIN information_schema.columns c
				ON c.table_schema = 'public'
				AND c.table_name = required_columns.table_name
				AND c.column_name = required_columns.column_name
			WHERE c.column_name IS NULL
		) INTO v_has_missing_columns;

		IF v_has_missing_columns THEN
			RAISE EXCEPTION 'Missing P1 Phase 2 columns. Ensure migration 0104_milestone_approvals is applied.';
		END IF;

		RAISE NOTICE 'P1 Phase 2 object checks passed.';
	ELSE
		RAISE NOTICE 'P1 Phase 2 checks skipped (set -v check_p1_phase2=true to enable).';
	END IF;

	-- ── Data freshness: weekly_delivery_metrics ──
	SELECT max(week_start)::date
	INTO v_max_week_start
	FROM public.weekly_delivery_metrics;

	IF v_max_week_start IS NULL THEN
		RAISE EXCEPTION
			'weekly_delivery_metrics has no rows. '
			'Fix: pnpm -C apps/agency ops:staging:seed-weekly-metrics-fixture '
			'or run ops:staging:refresh-weekly-metrics.';
	END IF;

	v_age_days := current_date - v_max_week_start;
	IF v_age_days > v_stale_days THEN
		RAISE EXCEPTION
			'weekly_delivery_metrics is stale by % days (threshold=%). '
			'Fix: pnpm -C apps/agency ops:staging:refresh-weekly-metrics',
			v_age_days, v_stale_days;
	END IF;

	-- ── Data freshness: ops_restore_drills ──
	SELECT max(executed_at)::date
	INTO v_last_restore_date
	FROM public.ops_restore_drills;

	IF v_last_restore_date IS NULL THEN
		RAISE EXCEPTION
			'No restore drill evidence in ops_restore_drills. '
			'Fix: pnpm -C apps/agency ops:staging:log-restore-drill '
			'or ops:staging:backup-restore-drill.';
	END IF;

	v_restore_age_days := current_date - v_last_restore_date;
	IF v_restore_age_days > v_restore_max_age_days THEN
		RAISE EXCEPTION
			'Last restore drill is stale by % days (threshold=%). '
			'Fix: pnpm -C apps/agency ops:staging:backup-restore-drill',
			v_restore_age_days, v_restore_max_age_days;
	END IF;

	RAISE NOTICE 'Delivery release readiness checks passed. max_week_start=%, metrics_age_days=%, last_restore_date=%, restore_age_days=%',
		v_max_week_start, v_age_days, v_last_restore_date, v_restore_age_days;
END;
$$;
