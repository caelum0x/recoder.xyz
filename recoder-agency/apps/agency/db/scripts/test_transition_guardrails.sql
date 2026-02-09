-- Integration script: validates DB guardrails for project status transitions.
-- Runs in a transaction and always rolls back.

BEGIN;

DO $$
DECLARE
	v_team_db_id integer;
	v_actor_user_db_id integer;
	v_client_id text;
	v_client_db_id integer;
	v_project_id text;
	v_project_db_id integer;
	v_transition_ts timestamp;
	v_duplicate_blocked boolean := false;
	v_noop_blocked boolean := false;
	v_direct_status_update_blocked boolean := false;
BEGIN
	SELECT db_id
	INTO v_team_db_id
	FROM public.teams
	ORDER BY db_id
	LIMIT 1;

	IF v_team_db_id IS NULL THEN
		INSERT INTO public.teams (id, name, plan)
		VALUES (
			'team_guardrail_' || substr(md5(random()::text), 1, 12),
			'Guardrail Team',
			'free'
		)
		RETURNING db_id INTO v_team_db_id;
	END IF;

	SELECT db_id
	INTO v_actor_user_db_id
	FROM public.users
	ORDER BY db_id
	LIMIT 1;

	IF v_actor_user_db_id IS NULL THEN
		INSERT INTO public.users (id, email, display_name)
		VALUES (
			'usr_guardrail_' || substr(md5(random()::text), 1, 12),
			'guardrail-' || substr(md5(random()::text), 1, 8) || '@example.com',
			'Guardrail Actor'
		)
		RETURNING db_id INTO v_actor_user_db_id;
	END IF;

	v_client_id := 'guardrail_client_' || substr(md5(random()::text), 1, 12);
	v_project_id := 'guardrail_project_' || substr(md5(random()::text), 1, 12);
	v_transition_ts := date_trunc('minute', now());

	INSERT INTO public.clients (
		id,
		team_db_id,
		name,
		email,
		status
	) VALUES (
		v_client_id,
		v_team_db_id,
		'Guardrail Client',
		v_client_id || '@example.com',
		'active'
	)
	RETURNING db_id INTO v_client_db_id;

	INSERT INTO public.projects (
		id,
		team_db_id,
		client_db_id,
		scope_override_reason,
		name,
		brief,
		status
	) VALUES (
		v_project_id,
		v_team_db_id,
		v_client_db_id,
		'Guardrail script scope override',
		'Transition Guardrail Project',
		'Created by test_transition_guardrails.sql',
		'client_review'
	)
	RETURNING db_id INTO v_project_db_id;

	INSERT INTO public.project_status_transitions (
		project_db_id,
		from_status,
		to_status,
		actor_user_db_id,
		reason,
		metadata,
		created_at
	) VALUES (
		v_project_db_id,
		'client_review',
		'in_progress',
		v_actor_user_db_id,
		'Guardrail duplicate test',
		jsonb_build_object('source', 'db.scripts.test_transition_guardrails'),
		v_transition_ts
	);

	BEGIN
		INSERT INTO public.project_status_transitions (
			project_db_id,
			from_status,
			to_status,
			actor_user_db_id,
			reason,
			metadata,
			created_at
		) VALUES (
			v_project_db_id,
			'client_review',
			'in_progress',
			v_actor_user_db_id,
			'Guardrail duplicate test',
			jsonb_build_object('source', 'db.scripts.test_transition_guardrails'),
			v_transition_ts
		);
	EXCEPTION
		WHEN unique_violation THEN
			v_duplicate_blocked := true;
	END;

	IF NOT v_duplicate_blocked THEN
		RAISE EXCEPTION 'Expected duplicate transition insert to be blocked by dedupe index.';
	END IF;

	BEGIN
		INSERT INTO public.project_status_transitions (
			project_db_id,
			from_status,
			to_status,
			actor_user_db_id,
			reason,
			metadata
		) VALUES (
			v_project_db_id,
			'qa',
			'qa',
			v_actor_user_db_id,
			'No-op transition should fail',
			jsonb_build_object('source', 'db.scripts.test_transition_guardrails')
		);
	EXCEPTION
		WHEN check_violation THEN
			v_noop_blocked := true;
	END;

	IF NOT v_noop_blocked THEN
		RAISE EXCEPTION 'Expected no-op transition insert to fail status-change check.';
	END IF;

	BEGIN
		UPDATE public.projects
		SET status = 'done'
		WHERE db_id = v_project_db_id;
	EXCEPTION
		WHEN insufficient_privilege THEN
			v_direct_status_update_blocked := true;
	END;

	IF NOT v_direct_status_update_blocked THEN
		RAISE EXCEPTION 'Expected direct projects.status update to be blocked by audit guard trigger.';
	END IF;

	INSERT INTO public.project_status_transitions (
		project_db_id,
		from_status,
		to_status,
		actor_user_db_id,
		reason,
		metadata,
		created_at
	) VALUES (
		v_project_db_id,
		'client_review',
		'in_progress',
		v_actor_user_db_id,
		'Guardrail duplicate test (reason variant)',
		jsonb_build_object('source', 'db.scripts.test_transition_guardrails'),
		v_transition_ts
	);

	RAISE NOTICE 'Transition guardrails verified successfully. project_id=%', v_project_id;
END
$$;

ROLLBACK;
