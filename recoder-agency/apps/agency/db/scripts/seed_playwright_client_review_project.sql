-- Seeds a deterministic client project for Playwright state-transition smoke tests.
-- Required psql variable: client_supabase_user_id
-- Optional psql variable: project_id (default: e2e_client_review_project)

BEGIN;

DO $$
DECLARE
	v_client_supabase_user_id text := nullif(:'client_supabase_user_id', '');
	v_project_id text := coalesce(nullif(:'project_id', ''), 'e2e_client_review_project');
	v_client_db_id integer;
	v_team_db_id integer;
	v_project_db_id integer;
	v_deliverable_a_id text;
	v_deliverable_b_id text;
BEGIN
	IF v_client_supabase_user_id IS NULL THEN
		RAISE EXCEPTION 'client_supabase_user_id is required';
	END IF;

	SELECT db_id, team_db_id
	INTO v_client_db_id, v_team_db_id
	FROM public.clients
	WHERE supabase_user_id = v_client_supabase_user_id
	LIMIT 1;

	IF v_client_db_id IS NULL THEN
		RAISE EXCEPTION 'No client found for supabase_user_id=%', v_client_supabase_user_id;
	END IF;

	INSERT INTO public.projects (
		id,
		team_db_id,
		client_db_id,
		name,
		brief,
		status
	)
	VALUES (
		v_project_id,
		v_team_db_id,
		v_client_db_id,
		'Playwright Seeded Client Review Project',
		'Seeded project for e2e client review transition smoke test',
		'client_review'
	)
	ON CONFLICT (id)
	DO UPDATE SET
		team_db_id = EXCLUDED.team_db_id,
		client_db_id = EXCLUDED.client_db_id,
		name = EXCLUDED.name,
		brief = EXCLUDED.brief,
		status = EXCLUDED.status,
		updated_at = now()
	RETURNING db_id INTO v_project_db_id;

	DELETE FROM public.deliverables
	WHERE project_db_id = v_project_db_id;

	v_deliverable_a_id := 'e2e_seed_deliv_a_' || substr(md5(random()::text), 1, 8);
	v_deliverable_b_id := 'e2e_seed_deliv_b_' || substr(md5(random()::text), 1, 8);

	INSERT INTO public.deliverables (
		id,
		project_db_id,
		name,
		type,
		content,
		status,
		client_feedback
	)
	VALUES
	(
		v_deliverable_a_id,
		v_project_db_id,
		'Seeded Review Deliverable A',
		'document',
		'Seeded pending review deliverable A',
		'pending_review',
		null
	),
	(
		v_deliverable_b_id,
		v_project_db_id,
		'Seeded Review Deliverable B',
		'design',
		'Seeded pending review deliverable B',
		'pending_review',
		null
	);

	RAISE NOTICE 'Seeded project % with two pending deliverables for client %', v_project_id, v_client_supabase_user_id;
END
$$;

COMMIT;
