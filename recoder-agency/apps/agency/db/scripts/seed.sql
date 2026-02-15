-- Seeds initial admin user and team for a fresh database.
-- Required psql variables:
--   admin_email       — email address for the initial admin user
--   admin_name        — display name for the admin user
--   team_name         — name for the initial team
-- Optional:
--   team_plan         — team plan (default 'pro')

\if :{?team_plan}
\else
\set team_plan pro
\endif

BEGIN;

DO $$
DECLARE
	v_admin_email text := nullif(:'admin_email', '');
	v_admin_name text := nullif(:'admin_name', '');
	v_team_name text := nullif(:'team_name', '');
	v_team_plan text := coalesce(nullif(:'team_plan', ''), 'pro');
	v_user_id text;
	v_user_db_id integer;
	v_team_id text;
	v_team_db_id integer;
BEGIN
	IF v_admin_email IS NULL THEN
		RAISE EXCEPTION 'admin_email is required';
	END IF;
	IF v_admin_name IS NULL THEN
		RAISE EXCEPTION 'admin_name is required';
	END IF;
	IF v_team_name IS NULL THEN
		RAISE EXCEPTION 'team_name is required';
	END IF;

	-- ── Create admin user ──
	v_user_id := 'usr_seed_admin';

	INSERT INTO public.users (id, email, display_name, email_verified)
	VALUES (v_user_id, v_admin_email, v_admin_name, true)
	ON CONFLICT (id) DO UPDATE
		SET email = EXCLUDED.email,
		    display_name = EXCLUDED.display_name,
		    email_verified = EXCLUDED.email_verified;

	SELECT db_id INTO v_user_db_id
	FROM public.users
	WHERE id = v_user_id;

	RAISE NOTICE 'User seeded: id=%, db_id=%', v_user_id, v_user_db_id;

	-- ── Create initial team ──
	v_team_id := 'team_seed_initial';

	INSERT INTO public.teams (id, name, plan)
	VALUES (v_team_id, v_team_name, v_team_plan)
	ON CONFLICT (id) DO UPDATE
		SET name = EXCLUDED.name,
		    plan = EXCLUDED.plan;

	SELECT db_id INTO v_team_db_id
	FROM public.teams
	WHERE id = v_team_id;

	RAISE NOTICE 'Team seeded: id=%, db_id=%, plan=%', v_team_id, v_team_db_id, v_team_plan;

	-- ── Create admin membership ──
	INSERT INTO public.team_memberships (user_db_id, team_db_id, role)
	VALUES (v_user_db_id, v_team_db_id, 'admin')
	ON CONFLICT (user_db_id, team_db_id) DO UPDATE
		SET role = 'admin';

	RAISE NOTICE 'Admin membership seeded for user % in team %', v_user_db_id, v_team_db_id;

	-- ── Seed default SLA policy ──
	INSERT INTO public.sla_policies (
		team_db_id,
		name,
		response_time_hours,
		resolution_time_hours,
		is_default
	)
	VALUES (v_team_db_id, 'Standard', 24, 72, true)
	ON CONFLICT DO NOTHING;

	RAISE NOTICE 'Default SLA policy seeded for team %', v_team_db_id;
END;
$$;

COMMIT;
