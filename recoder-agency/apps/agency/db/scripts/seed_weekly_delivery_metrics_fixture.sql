-- Seeds deterministic historical transitions so weekly_delivery_metrics is non-empty.
-- Safe to run multiple times (upsert + cleanup within fixture id scope).

BEGIN;

DO $$
DECLARE
	v_team_db_id integer;
	v_user_db_id integer;
	v_client_db_id integer;
	v_project_a_db_id integer;
	v_project_b_db_id integer;
	v_project_c_db_id integer;
	v_now timestamptz := now();
	v_week_1 timestamptz := date_trunc('week', v_now) - interval '7 day';
	v_week_2 timestamptz := date_trunc('week', v_now);
BEGIN
	INSERT INTO public.teams (id, name, plan)
	VALUES ('team_metrics_fixture', 'Metrics Fixture Team', 'free')
	ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
	RETURNING db_id INTO v_team_db_id;

	INSERT INTO public.users (id, email, display_name)
	VALUES (
		'usr_metrics_fixture',
		'metrics-fixture@example.com',
		'Metrics Fixture Actor'
	)
	ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name
	RETURNING db_id INTO v_user_db_id;

	INSERT INTO public.clients (id, team_db_id, name, email, status)
	VALUES (
		'client_metrics_fixture',
		v_team_db_id,
		'Metrics Fixture Client',
		'client-metrics-fixture@example.com',
		'active'
	)
	ON CONFLICT (id) DO UPDATE SET
		team_db_id = EXCLUDED.team_db_id,
		name = EXCLUDED.name,
		email = EXCLUDED.email
	RETURNING db_id INTO v_client_db_id;

	INSERT INTO public.projects (
		id,
		team_db_id,
		client_db_id,
		scope_override_reason,
		name,
		brief,
		status
	)
	VALUES
		('metrics_fixture_project_a', v_team_db_id, v_client_db_id, 'Fixture scope override', 'Metrics Fixture A', 'First-pass done fixture', 'done'),
		('metrics_fixture_project_b', v_team_db_id, v_client_db_id, 'Fixture scope override', 'Metrics Fixture B', 'Rework fixture', 'done'),
		('metrics_fixture_project_c', v_team_db_id, v_client_db_id, 'Fixture scope override', 'Metrics Fixture C', 'Forced transition fixture', 'qa')
	ON CONFLICT (id) DO UPDATE SET
		team_db_id = EXCLUDED.team_db_id,
		client_db_id = EXCLUDED.client_db_id,
		scope_override_reason = EXCLUDED.scope_override_reason,
		name = EXCLUDED.name,
		brief = EXCLUDED.brief,
		status = EXCLUDED.status;

	SELECT db_id INTO v_project_a_db_id FROM public.projects WHERE id = 'metrics_fixture_project_a';
	SELECT db_id INTO v_project_b_db_id FROM public.projects WHERE id = 'metrics_fixture_project_b';
	SELECT db_id INTO v_project_c_db_id FROM public.projects WHERE id = 'metrics_fixture_project_c';

	DELETE FROM public.project_status_transitions
	WHERE project_db_id IN (v_project_a_db_id, v_project_b_db_id, v_project_c_db_id);

	-- Project A: queued -> in_progress -> qa -> client_review -> done (first pass)
	INSERT INTO public.project_status_transitions (
		project_db_id, from_status, to_status, actor_user_db_id, reason, metadata, created_at
	) VALUES
		(v_project_a_db_id, 'queued', 'in_progress', v_user_db_id, 'Fixture flow start', '{"source":"fixture.seed"}'::jsonb, v_week_1 + interval '1 hour'),
		(v_project_a_db_id, 'in_progress', 'qa', v_user_db_id, 'Fixture QA', '{"source":"fixture.seed"}'::jsonb, v_week_1 + interval '1 day'),
		(v_project_a_db_id, 'qa', 'client_review', v_user_db_id, 'Fixture send for review', '{"source":"fixture.seed"}'::jsonb, v_week_1 + interval '2 day'),
		(v_project_a_db_id, 'client_review', 'done', v_user_db_id, 'Fixture approved first pass', '{"source":"client.portal.deliverables.review"}'::jsonb, v_week_1 + interval '3 day');

	-- Project B: queued -> in_progress -> qa -> client_review -> in_progress -> qa -> client_review -> done
	INSERT INTO public.project_status_transitions (
		project_db_id, from_status, to_status, actor_user_db_id, reason, metadata, created_at
	) VALUES
		(v_project_b_db_id, 'queued', 'in_progress', v_user_db_id, 'Fixture flow start', '{"source":"fixture.seed"}'::jsonb, v_week_2 + interval '1 hour'),
		(v_project_b_db_id, 'in_progress', 'qa', v_user_db_id, 'Fixture QA', '{"source":"fixture.seed"}'::jsonb, v_week_2 + interval '1 day'),
		(v_project_b_db_id, 'qa', 'client_review', v_user_db_id, 'Fixture send for review', '{"source":"fixture.seed"}'::jsonb, v_week_2 + interval '2 day'),
		(v_project_b_db_id, 'client_review', 'in_progress', v_user_db_id, 'Fixture client requested changes', '{"source":"client.portal.deliverables.review"}'::jsonb, v_week_2 + interval '3 day'),
		(v_project_b_db_id, 'in_progress', 'qa', v_user_db_id, 'Fixture rework QA', '{"source":"fixture.seed"}'::jsonb, v_week_2 + interval '4 day'),
		(v_project_b_db_id, 'qa', 'client_review', v_user_db_id, 'Fixture resubmission', '{"source":"fixture.seed"}'::jsonb, v_week_2 + interval '5 day'),
		(v_project_b_db_id, 'client_review', 'done', v_user_db_id, 'Fixture approved second pass', '{"source":"client.portal.deliverables.review"}'::jsonb, v_week_2 + interval '6 day');

	-- Project C: includes forced transition for forced rate KPI.
	INSERT INTO public.project_status_transitions (
		project_db_id, from_status, to_status, actor_user_db_id, reason, metadata, created_at
	) VALUES
		(v_project_c_db_id, 'queued', 'in_progress', v_user_db_id, 'Fixture start', '{"source":"fixture.seed"}'::jsonb, v_week_2 + interval '8 hour'),
		(v_project_c_db_id, 'in_progress', 'qa', v_user_db_id, 'Fixture forced promote', '{"source":"admin.projects.force","forced":true}'::jsonb, v_week_2 + interval '2 day');

	RAISE NOTICE 'Seeded weekly metrics fixture transitions for team_db_id=%', v_team_db_id;
END
$$;

COMMIT;

REFRESH MATERIALIZED VIEW public.weekly_delivery_metrics;

SELECT
	team_db_id,
	week_start,
	completed_projects_count,
	first_pass_approval_rate,
	forced_transition_rate
FROM public.weekly_delivery_metrics
WHERE team_db_id = (
	SELECT db_id FROM public.teams WHERE id = 'team_metrics_fixture'
)
ORDER BY week_start DESC;
