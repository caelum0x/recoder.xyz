BEGIN;

DROP MATERIALIZED VIEW IF EXISTS "public"."weekly_delivery_metrics";

CREATE MATERIALIZED VIEW "public"."weekly_delivery_metrics" AS
WITH project_start AS (
	SELECT
		p."db_id" AS project_db_id,
		p."team_db_id" AS team_db_id,
		coalesce(
			min(pst."created_at") FILTER (WHERE pst."to_status" = 'queued'),
			p."created_at"
		) AS started_at
	FROM "public"."projects" p
	LEFT JOIN "public"."project_status_transitions" pst
		ON pst."project_db_id" = p."db_id"
	GROUP BY p."db_id", p."team_db_id", p."created_at"
),
project_first_done AS (
	SELECT
		pst."project_db_id" AS project_db_id,
		p."team_db_id" AS team_db_id,
		min(pst."created_at") AS done_at
	FROM "public"."project_status_transitions" pst
	INNER JOIN "public"."projects" p
		ON p."db_id" = pst."project_db_id"
	WHERE pst."to_status" = 'done'
	GROUP BY pst."project_db_id", p."team_db_id"
),
cycle_time_weekly AS (
	SELECT
		pfd.team_db_id,
		date_trunc('week', pfd.done_at)::date AS week_start,
		count(*)::int AS completed_projects_count,
		avg(extract(epoch FROM (pfd.done_at - ps.started_at)) / 3600.0)::numeric(12, 2) AS avg_cycle_time_hours
	FROM project_first_done pfd
	INNER JOIN project_start ps
		ON ps.project_db_id = pfd.project_db_id
	WHERE pfd.done_at >= ps.started_at
	GROUP BY pfd.team_db_id, date_trunc('week', pfd.done_at)::date
),
first_client_exit AS (
	SELECT DISTINCT ON (pst."project_db_id")
		pst."project_db_id" AS project_db_id,
		p."team_db_id" AS team_db_id,
		pst."to_status" AS to_status,
		pst."created_at" AS created_at
	FROM "public"."project_status_transitions" pst
	INNER JOIN "public"."projects" p
		ON p."db_id" = pst."project_db_id"
	WHERE pst."from_status" = 'client_review'
	ORDER BY pst."project_db_id", pst."created_at" ASC
),
first_pass_weekly AS (
	SELECT
		fce.team_db_id,
		date_trunc('week', fce.created_at)::date AS week_start,
		count(*) FILTER (WHERE fce.to_status IN ('done', 'in_progress'))::int AS first_pass_total_projects,
		count(*) FILTER (WHERE fce.to_status = 'done')::int AS first_pass_approved_projects
	FROM first_client_exit fce
	GROUP BY fce.team_db_id, date_trunc('week', fce.created_at)::date
),
forced_weekly AS (
	SELECT
		p."team_db_id" AS team_db_id,
		date_trunc('week', pst."created_at")::date AS week_start,
		count(*)::int AS transition_count,
		count(*) FILTER (
			WHERE coalesce((pst."metadata"->>'forced')::boolean, false) = true
		)::int AS forced_transition_count
	FROM "public"."project_status_transitions" pst
	INNER JOIN "public"."projects" p
		ON p."db_id" = pst."project_db_id"
	GROUP BY p."team_db_id", date_trunc('week', pst."created_at")::date
),
metric_keys AS (
	SELECT team_db_id, week_start FROM cycle_time_weekly
	UNION
	SELECT team_db_id, week_start FROM first_pass_weekly
	UNION
	SELECT team_db_id, week_start FROM forced_weekly
)
SELECT
	mk.team_db_id,
	mk.week_start,
	coalesce(ct.completed_projects_count, 0) AS completed_projects_count,
	ct.avg_cycle_time_hours,
	coalesce(fp.first_pass_approved_projects, 0) AS first_pass_approved_projects,
	coalesce(fp.first_pass_total_projects, 0) AS first_pass_total_projects,
	CASE
		WHEN coalesce(fp.first_pass_total_projects, 0) > 0
			THEN round((fp.first_pass_approved_projects::numeric / fp.first_pass_total_projects::numeric) * 100.0, 2)
		ELSE NULL
	END AS first_pass_approval_rate,
	coalesce(fw.forced_transition_count, 0) AS forced_transition_count,
	coalesce(fw.transition_count, 0) AS transition_count,
	CASE
		WHEN coalesce(fw.transition_count, 0) > 0
			THEN round((fw.forced_transition_count::numeric / fw.transition_count::numeric) * 100.0, 2)
		ELSE NULL
	END AS forced_transition_rate
FROM metric_keys mk
LEFT JOIN cycle_time_weekly ct
	ON ct.team_db_id = mk.team_db_id
	AND ct.week_start = mk.week_start
LEFT JOIN first_pass_weekly fp
	ON fp.team_db_id = mk.team_db_id
	AND fp.week_start = mk.week_start
LEFT JOIN forced_weekly fw
	ON fw.team_db_id = mk.team_db_id
	AND fw.week_start = mk.week_start;

CREATE UNIQUE INDEX IF NOT EXISTS "weekly_delivery_metrics_team_week_uidx"
	ON "public"."weekly_delivery_metrics" ("team_db_id", "week_start");

CREATE INDEX IF NOT EXISTS "weekly_delivery_metrics_week_start_idx"
	ON "public"."weekly_delivery_metrics" ("week_start" DESC);

COMMIT;
