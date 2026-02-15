-- Seeds deterministic client + active playbook for playbook bootstrap smoke.
-- Required psql variable: playwright_login_email

BEGIN;

DO $$
DECLARE
	v_login_email text := nullif(:'playwright_login_email', '');
	v_user_db_id integer;
	v_team_db_id integer;
	v_client_id text;
	v_playbook_id text;
BEGIN
	IF v_login_email IS NULL THEN
		RAISE EXCEPTION 'playwright_login_email is required';
	END IF;

	SELECT u.db_id
	INTO v_user_db_id
	FROM public.users u
	WHERE lower(u.email) = lower(v_login_email)
	LIMIT 1;

	IF v_user_db_id IS NULL THEN
		RAISE EXCEPTION 'No user found for email=%', v_login_email;
	END IF;

	SELECT tm.team_db_id
	INTO v_team_db_id
	FROM public.team_memberships tm
	WHERE tm.user_db_id = v_user_db_id
	ORDER BY tm.id ASC
	LIMIT 1;

	IF v_team_db_id IS NULL THEN
		RAISE EXCEPTION 'No team membership found for email=%', v_login_email;
	END IF;

	v_client_id := format('e2e_playbook_client_%s', v_team_db_id);
	v_playbook_id := format('e2e_playbook_%s', v_team_db_id);

	INSERT INTO public.clients (
		id,
		team_db_id,
		name,
		email,
		company,
		status
	)
	VALUES (
		v_client_id,
		v_team_db_id,
		'Playbook Smoke Client',
		format('playbook-smoke+%s@recoder.xyz', v_team_db_id),
		'Playbook Smoke Co',
		'active'
	)
	ON CONFLICT (id)
	DO UPDATE SET
		team_db_id = EXCLUDED.team_db_id,
		name = EXCLUDED.name,
		email = EXCLUDED.email,
		company = EXCLUDED.company,
		status = EXCLUDED.status,
		updated_at = now();

	INSERT INTO public.delivery_playbooks (
		id,
		team_db_id,
		name,
		description,
		default_sla_days,
		phases,
		checklist,
		is_active,
		sort_order
	)
	VALUES (
		v_playbook_id,
		v_team_db_id,
		'E2E Playbook Smoke',
		'Deterministic playbook for Playwright smoke bootstrap flow.',
		7,
		'[{"order":1,"name":"Discovery Brief","deliverableType":"document","isBillableMilestone":false}]'::jsonb,
		'["confirm scope","seed deliverables"]'::jsonb,
		true,
		-100
	)
	ON CONFLICT (team_db_id, name)
	DO UPDATE SET
		description = EXCLUDED.description,
		default_sla_days = EXCLUDED.default_sla_days,
		phases = EXCLUDED.phases,
		checklist = EXCLUDED.checklist,
		is_active = true,
		sort_order = EXCLUDED.sort_order,
		updated_at = now();

	RAISE NOTICE 'Seeded playbook smoke fixtures for team_db_id=% (email=%)', v_team_db_id, v_login_email;
END
$$;

COMMIT;
