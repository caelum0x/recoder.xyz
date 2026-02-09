BEGIN;

ALTER TABLE IF EXISTS "public"."ops_restore_drills"
	DROP CONSTRAINT IF EXISTS "ops_restore_drills_team_db_id_fkey";

ALTER TABLE IF EXISTS "public"."ops_restore_drills"
	ALTER COLUMN "team_db_id" DROP NOT NULL;

ALTER TABLE IF EXISTS "public"."ops_restore_drills"
	ADD CONSTRAINT "ops_restore_drills_team_db_id_fkey"
	FOREIGN KEY ("team_db_id")
	REFERENCES "public"."teams"("db_id")
	ON DELETE SET NULL;

COMMIT;
