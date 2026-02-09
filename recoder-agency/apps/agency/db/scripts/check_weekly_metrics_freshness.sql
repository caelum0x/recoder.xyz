-- Checks weekly_delivery_metrics freshness and reports stale/fresh state.
-- Optional psql var:
--   stale_days (default 10)

WITH cfg AS (
	SELECT coalesce(nullif(:'stale_days', ''), '10')::int AS stale_days
),
latest AS (
	SELECT max(week_start) AS max_week_start, count(*)::int AS row_count
	FROM public.weekly_delivery_metrics
)
SELECT
	latest.max_week_start,
	latest.row_count,
	cfg.stale_days,
	CASE
		WHEN latest.max_week_start IS NULL THEN NULL
		ELSE (current_date - latest.max_week_start::date)
	END AS age_days,
	CASE
		WHEN latest.max_week_start IS NULL THEN 'no_data'
		WHEN (current_date - latest.max_week_start::date) > cfg.stale_days THEN 'stale'
		ELSE 'fresh'
	END AS freshness_state
FROM latest, cfg;
