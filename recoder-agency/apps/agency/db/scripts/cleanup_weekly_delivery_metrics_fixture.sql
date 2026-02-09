-- Cleans fixture data created by seed_weekly_delivery_metrics_fixture.sql

BEGIN;

DO $$
DECLARE
	v_deliverables_deleted integer := 0;
	v_transitions_deleted integer := 0;
	v_projects_deleted integer := 0;
	v_clients_deleted integer := 0;
	v_users_deleted integer := 0;
	v_teams_deleted integer := 0;
BEGIN
	DELETE FROM public.deliverables
	WHERE project_db_id IN (
		SELECT db_id FROM public.projects WHERE id LIKE 'metrics_fixture_project_%'
	);
	GET DIAGNOSTICS v_deliverables_deleted = ROW_COUNT;

	DELETE FROM public.project_status_transitions
	WHERE project_db_id IN (
		SELECT db_id FROM public.projects WHERE id LIKE 'metrics_fixture_project_%'
	);
	GET DIAGNOSTICS v_transitions_deleted = ROW_COUNT;

	DELETE FROM public.projects
	WHERE id LIKE 'metrics_fixture_project_%';
	GET DIAGNOSTICS v_projects_deleted = ROW_COUNT;

	DELETE FROM public.clients
	WHERE id = 'client_metrics_fixture';
	GET DIAGNOSTICS v_clients_deleted = ROW_COUNT;

	DELETE FROM public.users
	WHERE id = 'usr_metrics_fixture';
	GET DIAGNOSTICS v_users_deleted = ROW_COUNT;

	DELETE FROM public.teams
	WHERE id = 'team_metrics_fixture';
	GET DIAGNOSTICS v_teams_deleted = ROW_COUNT;

	RAISE NOTICE 'Metrics fixture cleanup complete. deliverables=%, transitions=%, projects=%, clients=%, users=%, teams=%',
		v_deliverables_deleted,
		v_transitions_deleted,
		v_projects_deleted,
		v_clients_deleted,
		v_users_deleted,
		v_teams_deleted;
END
$$;

COMMIT;

REFRESH MATERIALIZED VIEW public.weekly_delivery_metrics;
