-- Asserts seeded fixture produced KPI rows in weekly_delivery_metrics.

DO $$
DECLARE
	v_team_db_id integer;
	v_row_count integer;
	v_has_non_null_first_pass integer;
	v_has_non_null_forced integer;
BEGIN
	SELECT db_id
	INTO v_team_db_id
	FROM public.teams
	WHERE id = 'team_metrics_fixture'
	LIMIT 1;

	IF v_team_db_id IS NULL THEN
		RAISE EXCEPTION 'Missing fixture team team_metrics_fixture';
	END IF;

	SELECT count(*)
	INTO v_row_count
	FROM public.weekly_delivery_metrics
	WHERE team_db_id = v_team_db_id;

	IF v_row_count < 1 THEN
		RAISE EXCEPTION 'Expected at least one metrics row for fixture team, got %', v_row_count;
	END IF;

	SELECT count(*)
	INTO v_has_non_null_first_pass
	FROM public.weekly_delivery_metrics
	WHERE team_db_id = v_team_db_id
		AND first_pass_approval_rate IS NOT NULL;

	IF v_has_non_null_first_pass < 1 THEN
		RAISE EXCEPTION 'Expected non-null first_pass_approval_rate for fixture team';
	END IF;

	SELECT count(*)
	INTO v_has_non_null_forced
	FROM public.weekly_delivery_metrics
	WHERE team_db_id = v_team_db_id
		AND forced_transition_rate IS NOT NULL;

	IF v_has_non_null_forced < 1 THEN
		RAISE EXCEPTION 'Expected non-null forced_transition_rate for fixture team';
	END IF;

	RAISE NOTICE 'Fixture assertions passed. row_count=%', v_row_count;
END
$$;
