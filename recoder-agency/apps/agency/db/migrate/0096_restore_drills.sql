BEGIN;

CREATE TABLE IF NOT EXISTS "public"."ops_restore_drills" (
	"id" serial PRIMARY KEY,
	"team_db_id" integer REFERENCES "public"."teams"("db_id") ON DELETE SET NULL,
	"executed_at" timestamp NOT NULL DEFAULT now(),
	"operator_name" text NOT NULL,
	"backup_reference" text NOT NULL,
	"validation_summary" text NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ops_restore_drills_team_executed_idx"
	ON "public"."ops_restore_drills" ("team_db_id", "executed_at" DESC);

COMMIT;
