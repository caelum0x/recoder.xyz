-- Validates schema integrity after bootstrap or migration.
-- Run after bootstrap.sql or after applying all migrations.
-- Exits with error (RAISE EXCEPTION) on any failure.
-- Optional psql variable:
--   expected_migration_count (default 108)

\if :{?expected_migration_count}
\else
\set expected_migration_count 108
\endif

SELECT set_config(
	'app.bootstrap_validate.expected_migration_count',
	coalesce(nullif(:'expected_migration_count', ''), '108'),
	false
);

DO $$
DECLARE
	v_expected_migrations int := current_setting('app.bootstrap_validate.expected_migration_count')::int;
	v_actual_migrations int;
	v_missing_tables text[];
	v_missing_auth_tables text[];
	v_missing_indexes text[];
	v_tbl text;
BEGIN
	-- ── 1. Check migration count ──
	IF EXISTS (
		SELECT 1 FROM information_schema.tables
		WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
	) THEN
		SELECT count(*) INTO v_actual_migrations
		FROM drizzle.__drizzle_migrations;

		IF v_actual_migrations < v_expected_migrations THEN
			RAISE EXCEPTION 'Migration count mismatch: expected >= %, got %',
				v_expected_migrations, v_actual_migrations;
		END IF;
		RAISE NOTICE 'OK: % migrations applied (expected >= %)', v_actual_migrations, v_expected_migrations;
	ELSE
		RAISE WARNING 'drizzle.__drizzle_migrations table not found — skipping migration count check (bootstrap mode)';
	END IF;

	-- ── 2. Check core tables exist ──
	SELECT array_agg(expected_table) INTO v_missing_tables
	FROM (
		VALUES
			('users'), ('teams'), ('team_memberships'), ('invitations'),
			('workspaces'), ('apps'), ('tasks'), ('data_stores'),
			('clients'), ('projects'), ('deliverables'),
			('project_status_transitions'), ('weekly_delivery_metrics'),
			('service_skus'), ('delivery_playbooks'),
			('quotes'), ('quote_line_items'), ('sows'),
			('change_orders'), ('invoices'), ('cost_ledger_entries'),
			('sla_policies'), ('milestone_approvals'),
			('api_keys'), ('api_rate_limit_counters'),
			('oauth_credentials'), ('github_integration_settings'),
			('flow_triggers'), ('acts'),
			('alert_subscriptions'), ('model_routing_policies'),
			('generation_cost_logs'), ('ops_restore_drills')
	) AS t(expected_table)
	WHERE NOT EXISTS (
		SELECT 1 FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name = t.expected_table
	);

	IF v_missing_tables IS NOT NULL AND array_length(v_missing_tables, 1) > 0 THEN
		RAISE EXCEPTION 'Missing core tables: %', array_to_string(v_missing_tables, ', ');
	END IF;
	RAISE NOTICE 'OK: All core tables present';

	-- ── 3. Check Better Auth tables ──
	SELECT array_agg(expected_table) INTO v_missing_auth_tables
	FROM (
		VALUES
			('session'), ('account'), ('verification')
	) AS t(expected_table)
	WHERE NOT EXISTS (
		SELECT 1 FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name = t.expected_table
	);

	IF v_missing_auth_tables IS NOT NULL AND array_length(v_missing_auth_tables, 1) > 0 THEN
		RAISE EXCEPTION 'Missing Better Auth tables: %', array_to_string(v_missing_auth_tables, ', ');
	END IF;
	RAISE NOTICE 'OK: Better Auth tables present';

	-- ── 4. Check role constraints ──
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.check_constraints
		WHERE constraint_name = 'team_memberships_role_allowed_check'
	) THEN
		RAISE EXCEPTION 'Missing CHECK constraint: team_memberships_role_allowed_check';
	END IF;
	RAISE NOTICE 'OK: Role constraints present';

	-- ── 5. Check critical indexes ──
	SELECT array_agg(expected_index) INTO v_missing_indexes
	FROM (
		VALUES
			('team_memberships_team_role_idx'),
			('invitations_team_role_idx')
	) AS t(expected_index)
	WHERE NOT EXISTS (
		SELECT 1 FROM pg_indexes
		WHERE schemaname = 'public' AND indexname = t.expected_index
	);

	IF v_missing_indexes IS NOT NULL AND array_length(v_missing_indexes, 1) > 0 THEN
		RAISE EXCEPTION 'Missing critical indexes: %', array_to_string(v_missing_indexes, ', ');
	END IF;
	RAISE NOTICE 'OK: Critical indexes present';

	-- ── 6. Check pgvector extension ──
	IF NOT EXISTS (
		SELECT 1 FROM pg_extension WHERE extname = 'vector'
	) THEN
		RAISE WARNING 'pgvector extension not installed — vector store features will not work';
	ELSE
		RAISE NOTICE 'OK: pgvector extension installed';
	END IF;

	-- ── 7. Run ANALYZE for query planner ──
	RAISE NOTICE 'Running ANALYZE on all tables...';
END;
$$;

-- Run ANALYZE outside PL/pgSQL (cannot run ANALYZE inside DO blocks)
ANALYZE;

DO $$
BEGIN
	RAISE NOTICE '──────────────────────────────────';
	RAISE NOTICE 'Bootstrap validation PASSED';
	RAISE NOTICE '──────────────────────────────────';
END;
$$;
