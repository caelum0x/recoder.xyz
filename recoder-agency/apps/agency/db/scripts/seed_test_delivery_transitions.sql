-- End-to-end seed/test for client deliverable review transition paths.
-- Creates throwaway records and verifies reject -> in_progress and approve -> done transitions.

BEGIN;

DO $$
DECLARE
	v_team_db_id integer;
	v_actor_user_db_id integer;
	v_client_id text;
	v_project_id text;
	v_deliverable_reject_id text;
	v_deliverable_approve_id text;
	v_client_db_id integer;
	v_project_db_id integer;
	v_pending_count integer;
	v_rejected_count integer;
	v_project_status text;
	v_client_transition_count integer;
BEGIN
	SELECT db_id
	INTO v_team_db_id
	FROM public.teams
	ORDER BY db_id
	LIMIT 1;

	IF v_team_db_id IS NULL THEN
		INSERT INTO public.teams (id, name, plan)
		VALUES (
			'team_e2e_' || substr(md5(random()::text), 1, 12),
			'E2E Team',
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
			'usr_e2e_' || substr(md5(random()::text), 1, 12),
			'e2e-user-' || substr(md5(random()::text), 1, 8) || '@example.com',
			'E2E Actor'
		)
		RETURNING db_id INTO v_actor_user_db_id;
	END IF;

	v_client_id := 'e2e_client_' || substr(md5(random()::text), 1, 12);
	v_project_id := 'e2e_project_' || substr(md5(random()::text), 1, 12);
	v_deliverable_reject_id := 'e2e_deliv_reject_' || substr(md5(random()::text), 1, 10);
	v_deliverable_approve_id := 'e2e_deliv_approve_' || substr(md5(random()::text), 1, 10);

	INSERT INTO public.clients (
		id,
		team_db_id,
		name,
		email,
		status
	) VALUES (
		v_client_id,
		v_team_db_id,
		'E2E Client ' || substr(v_client_id, 12),
		v_client_id || '@example.com',
		'active'
	)
	RETURNING db_id INTO v_client_db_id;

	INSERT INTO public.projects (
		id,
		team_db_id,
		client_db_id,
		name,
		brief,
		status
	) VALUES (
		v_project_id,
		v_team_db_id,
		v_client_db_id,
		'E2E Delivery State Machine Test',
		'Seeded by seed_test_delivery_transitions.sql',
		'client_review'
	)
	RETURNING db_id INTO v_project_db_id;

	INSERT INTO public.deliverables (
		id,
		project_db_id,
		name,
		type,
		content,
		status
	) VALUES
	(
		v_deliverable_reject_id,
		v_project_db_id,
		'Homepage Revision Pack',
		'document',
		'First review cycle',
		'pending_review'
	),
	(
		v_deliverable_approve_id,
		v_project_db_id,
		'Landing Page Handoff',
		'design',
		'Initial design handoff',
		'pending_review'
	);

	-- Path A: Client rejects one deliverable -> project should move to in_progress.
	UPDATE public.deliverables
	SET status = 'rejected', client_feedback = 'Need clearer spacing and mobile layout fixes'
	WHERE id = v_deliverable_reject_id;

	UPDATE public.projects
	SET status = 'in_progress'
	WHERE db_id = v_project_db_id;

	INSERT INTO public.project_status_transitions (
		project_db_id,
		from_status,
		to_status,
		actor_user_db_id,
		reason,
		metadata
	) VALUES (
		v_project_db_id,
		'client_review',
		'in_progress',
		v_actor_user_db_id,
		'Client requested revisions: Need clearer spacing and mobile layout fixes',
		jsonb_build_object('source', 'client.portal.deliverables.review', 'deliverableId', v_deliverable_reject_id)
	);

	SELECT status
	INTO v_project_status
	FROM public.projects
	WHERE db_id = v_project_db_id;

	IF v_project_status <> 'in_progress' THEN
		RAISE EXCEPTION 'Expected project status in_progress after reject, got %', v_project_status;
	END IF;

	-- Simulate team rework + resubmission back into client_review.
	UPDATE public.deliverables
	SET status = 'pending_review', client_feedback = NULL
	WHERE id = v_deliverable_reject_id;

	UPDATE public.projects
	SET status = 'client_review'
	WHERE db_id = v_project_db_id;

	INSERT INTO public.project_status_transitions (
		project_db_id,
		from_status,
		to_status,
		actor_user_db_id,
		reason,
		metadata
	) VALUES (
		v_project_db_id,
		'in_progress',
		'client_review',
		v_actor_user_db_id,
		'Resubmitted deliverable for client review',
		jsonb_build_object('source', 'admin.projects.deliverables.sendForReview', 'deliverableId', v_deliverable_reject_id)
	);

	-- Path B: Client approvals to final done.
	UPDATE public.deliverables
	SET status = 'approved', client_feedback = NULL
	WHERE id = v_deliverable_reject_id;

	SELECT count(*)
	INTO v_pending_count
	FROM public.deliverables
	WHERE project_db_id = v_project_db_id AND status = 'pending_review';

	IF v_pending_count <> 1 THEN
		RAISE EXCEPTION 'Expected 1 pending deliverable after first approval, got %', v_pending_count;
	END IF;

	UPDATE public.deliverables
	SET status = 'approved', client_feedback = NULL
	WHERE id = v_deliverable_approve_id;

	SELECT count(*)
	INTO v_pending_count
	FROM public.deliverables
	WHERE project_db_id = v_project_db_id AND status = 'pending_review';

	SELECT count(*)
	INTO v_rejected_count
	FROM public.deliverables
	WHERE project_db_id = v_project_db_id AND status = 'rejected';

	IF v_pending_count = 0 AND v_rejected_count = 0 THEN
		UPDATE public.projects
		SET status = 'done'
		WHERE db_id = v_project_db_id;

		INSERT INTO public.project_status_transitions (
			project_db_id,
			from_status,
			to_status,
			actor_user_db_id,
			reason,
			metadata
		) VALUES (
			v_project_db_id,
			'client_review',
			'done',
			v_actor_user_db_id,
			'Client approved deliverable',
			jsonb_build_object('source', 'client.portal.deliverables.review', 'deliverableId', v_deliverable_approve_id)
		);
	END IF;

	SELECT status
	INTO v_project_status
	FROM public.projects
	WHERE db_id = v_project_db_id;

	IF v_project_status <> 'done' THEN
		RAISE EXCEPTION 'Expected project status done after approvals, got %', v_project_status;
	END IF;

	SELECT count(*)
	INTO v_client_transition_count
	FROM public.project_status_transitions
	WHERE project_db_id = v_project_db_id
		AND (metadata ->> 'source') = 'client.portal.deliverables.review';

	IF v_client_transition_count < 2 THEN
		RAISE EXCEPTION 'Expected at least 2 client.portal.deliverables.review transitions, got %', v_client_transition_count;
	END IF;

	RAISE NOTICE 'E2E delivery transition seed/test succeeded. project_id=%, client_id=%', v_project_id, v_client_id;
END
$$;

COMMIT;
