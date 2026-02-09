-- Cleanup script for E2E delivery transition seed data.
-- Removes records created by seed_test_delivery_transitions.sql.

BEGIN;

DO $$
DECLARE
	v_invoices_deleted integer := 0;
	v_deliverables_deleted integer := 0;
	v_transitions_deleted integer := 0;
	v_projects_deleted integer := 0;
	v_clients_deleted integer := 0;
	v_memberships_deleted integer := 0;
	v_mappings_deleted integer := 0;
	v_users_deleted integer := 0;
	v_teams_deleted integer := 0;
BEGIN
	DELETE FROM public.invoices
	WHERE project_db_id IN (
		SELECT db_id FROM public.projects WHERE id LIKE 'e2e_project_%'
	);
	GET DIAGNOSTICS v_invoices_deleted = ROW_COUNT;

	DELETE FROM public.deliverables
	WHERE project_db_id IN (
		SELECT db_id FROM public.projects WHERE id LIKE 'e2e_project_%'
	);
	GET DIAGNOSTICS v_deliverables_deleted = ROW_COUNT;

	DELETE FROM public.project_status_transitions
	WHERE project_db_id IN (
		SELECT db_id FROM public.projects WHERE id LIKE 'e2e_project_%'
	);
	GET DIAGNOSTICS v_transitions_deleted = ROW_COUNT;

	DELETE FROM public.projects
	WHERE id LIKE 'e2e_project_%';
	GET DIAGNOSTICS v_projects_deleted = ROW_COUNT;

	DELETE FROM public.clients
	WHERE id LIKE 'e2e_client_%';
	GET DIAGNOSTICS v_clients_deleted = ROW_COUNT;

	DELETE FROM public.team_memberships
	WHERE user_db_id IN (
		SELECT db_id FROM public.users WHERE id LIKE 'usr_e2e_%'
	);
	GET DIAGNOSTICS v_memberships_deleted = ROW_COUNT;

	DELETE FROM public.supabase_user_mappings
	WHERE user_db_id IN (
		SELECT db_id FROM public.users WHERE id LIKE 'usr_e2e_%'
	);
	GET DIAGNOSTICS v_mappings_deleted = ROW_COUNT;

	DELETE FROM public.users
	WHERE id LIKE 'usr_e2e_%';
	GET DIAGNOSTICS v_users_deleted = ROW_COUNT;

	DELETE FROM public.teams
	WHERE id LIKE 'team_e2e_%';
	GET DIAGNOSTICS v_teams_deleted = ROW_COUNT;

	RAISE NOTICE 'Cleanup complete. invoices=%, deliverables=%, transitions=%, projects=%, clients=%, memberships=%, mappings=%, users=%, teams=%',
		v_invoices_deleted,
		v_deliverables_deleted,
		v_transitions_deleted,
		v_projects_deleted,
		v_clients_deleted,
		v_memberships_deleted,
		v_mappings_deleted,
		v_users_deleted,
		v_teams_deleted;
END
$$;

COMMIT;
