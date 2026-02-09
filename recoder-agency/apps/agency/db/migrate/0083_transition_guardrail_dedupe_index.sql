-- DB guardrail for duplicate transition inserts.
-- Strategy: unique fingerprint within a minute bucket.
-- This suppresses accidental duplicate inserts from retries/races while still
-- allowing legitimate repeated transitions in later windows.

WITH ranked AS (
	SELECT
		db_id,
		row_number() OVER (
			PARTITION BY
				project_db_id,
				from_status,
				to_status,
				coalesce(actor_user_db_id, -1),
				coalesce(nullif(btrim(reason), ''), ''),
				md5(coalesce(metadata::text, '{}')),
				date_trunc('minute', created_at)
			ORDER BY db_id
		) AS rn
	FROM public.project_status_transitions
)
DELETE FROM public.project_status_transitions pst
USING ranked r
WHERE pst.db_id = r.db_id
	AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "project_status_transitions_dedupe_minute_uidx"
ON "project_status_transitions" (
	"project_db_id",
	"from_status",
	"to_status",
	coalesce("actor_user_db_id", -1),
	coalesce(nullif(btrim("reason"), ''), ''),
	md5(coalesce("metadata"::text, '{}')),
	date_trunc('minute', "created_at")
);
