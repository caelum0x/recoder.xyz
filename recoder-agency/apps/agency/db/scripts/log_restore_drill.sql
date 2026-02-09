-- Usage:
-- psql "$AGENCY_STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
--   -v team_db_id=1 \
--   -v operator_name='oncall-user' \
--   -v backup_reference='neon-snapshot-2026-02-07T20:00Z' \
--   -v validation_summary='projects=120, transitions=980 verified' \
--   -f ./db/scripts/log_restore_drill.sql

BEGIN;

INSERT INTO "public"."ops_restore_drills" (
	team_db_id,
	executed_at,
	operator_name,
	backup_reference,
	validation_summary
) VALUES (
	nullif(:'team_db_id', '')::int,
	now(),
	coalesce(nullif(:'operator_name', ''), 'unknown-operator'),
	coalesce(nullif(:'backup_reference', ''), 'unspecified-backup-reference'),
	coalesce(nullif(:'validation_summary', ''), 'unspecified-validation')
);

COMMIT;
