-- Cleans deterministic client/playbook/project fixtures used by playbook bootstrap smoke.
-- Required psql variable: playwright_login_email

BEGIN;

DO $$
DECLARE
	v_login_email text := nullif(:'playwright_login_email', '');
	v_user_db_id integer;
	v_team_db_id integer;
	v_client_id text;
	v_client_db_id integer;
	v_playbook_name text := 'E2E Playbook Smoke';
	v_playbook_db_id integer;
	v_projects_deleted integer := 0;
	v_clients_deleted integer := 0;
	v_playbooks_deleted integer := 0;
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
		RAISE NOTICE 'No user found for email=%; nothing to clean.', v_login_email;
		RETURN;
	END IF;

	SELECT tm.team_db_id
	INTO v_team_db_id
	FROM public.team_memberships tm
	WHERE tm.user_db_id = v_user_db_id
	ORDER BY tm.id ASC
	LIMIT 1;

	IF v_team_db_id IS NULL THEN
		RAISE NOTICE 'No team membership found for email=%; nothing to clean.', v_login_email;
		RETURN;
	END IF;

	v_client_id := format('e2e_playbook_client_%s', v_team_db_id);

	SELECT c.db_id
	INTO v_client_db_id
	FROM public.clients c
	WHERE c.id = v_client_id
		AND c.team_db_id = v_team_db_id
	LIMIT 1;

	SELECT p.db_id
	INTO v_playbook_db_id
	FROM public.delivery_playbooks p
	WHERE p.team_db_id = v_team_db_id
		AND p.name = v_playbook_name
	LIMIT 1;

	IF to_regclass('public.invoices') IS NOT NULL THEN
		DELETE FROM public.invoices i
		USING public.projects p
		WHERE i.project_db_id = p.db_id
			AND p.team_db_id = v_team_db_id
			AND (
				(v_client_db_id IS NOT NULL AND p.client_db_id = v_client_db_id)
				OR (v_playbook_db_id IS NOT NULL AND p.playbook_db_id = v_playbook_db_id)
			);
	END IF;

	IF to_regclass('public.change_orders') IS NOT NULL THEN
		DELETE FROM public.change_orders co
		USING public.projects p
		WHERE co.project_db_id = p.db_id
			AND p.team_db_id = v_team_db_id
			AND (
				(v_client_db_id IS NOT NULL AND p.client_db_id = v_client_db_id)
				OR (v_playbook_db_id IS NOT NULL AND p.playbook_db_id = v_playbook_db_id)
			);
	END IF;

	IF to_regclass('public.cost_ledger_entries') IS NOT NULL THEN
		DELETE FROM public.cost_ledger_entries cle
		USING public.projects p
		WHERE cle.project_db_id = p.db_id
			AND p.team_db_id = v_team_db_id
			AND (
				(v_client_db_id IS NOT NULL AND p.client_db_id = v_client_db_id)
				OR (v_playbook_db_id IS NOT NULL AND p.playbook_db_id = v_playbook_db_id)
			);
	END IF;

	DELETE FROM public.projects p
	WHERE p.team_db_id = v_team_db_id
		AND (
			(v_client_db_id IS NOT NULL AND p.client_db_id = v_client_db_id)
			OR (v_playbook_db_id IS NOT NULL AND p.playbook_db_id = v_playbook_db_id)
		)
		AND p.name LIKE 'Playbook Smoke %';
	GET DIAGNOSTICS v_projects_deleted = ROW_COUNT;

	IF v_playbook_db_id IS NOT NULL THEN
		DELETE FROM public.delivery_playbooks
		WHERE db_id = v_playbook_db_id;
		GET DIAGNOSTICS v_playbooks_deleted = ROW_COUNT;
	END IF;

	IF v_client_db_id IS NOT NULL THEN
		DELETE FROM public.clients
		WHERE db_id = v_client_db_id;
		GET DIAGNOSTICS v_clients_deleted = ROW_COUNT;
	END IF;

	RAISE NOTICE 'Cleanup complete for team_db_id=%: projects=%, playbooks=%, clients=%',
		v_team_db_id, v_projects_deleted, v_playbooks_deleted, v_clients_deleted;
END
$$;

COMMIT;
