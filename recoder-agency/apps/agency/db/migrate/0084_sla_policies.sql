-- SLA policies and project escalation metadata.

CREATE TABLE IF NOT EXISTS "sla_policies" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"name" text NOT NULL,
	"target_days" integer NOT NULL,
	"warn_before_days" integer NOT NULL DEFAULT 1,
	"is_default" boolean NOT NULL DEFAULT false,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "sla_policies_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "sla_policies"
	ADD CONSTRAINT "sla_policies_team_db_id_teams_db_id_fk"
	FOREIGN KEY ("team_db_id")
	REFERENCES "public"."teams"("db_id")
	ON DELETE cascade
	ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sla_policies_team_db_id_idx"
ON "sla_policies" USING btree ("team_db_id");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'sla_policies_target_days_positive_check'
	) THEN
		ALTER TABLE "sla_policies"
		ADD CONSTRAINT "sla_policies_target_days_positive_check"
		CHECK ("target_days" > 0);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'sla_policies_warn_before_days_nonnegative_check'
	) THEN
		ALTER TABLE "sla_policies"
		ADD CONSTRAINT "sla_policies_warn_before_days_nonnegative_check"
		CHECK ("warn_before_days" >= 0);
	END IF;
END
$$;

ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "sla_policy_db_id" integer;
--> statement-breakpoint
ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "delivery_due_at" timestamp;
--> statement-breakpoint
ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "escalation_owner_user_db_id" integer;
--> statement-breakpoint
ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "escalation_reason" text;
--> statement-breakpoint
ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "sla_breached_at" timestamp;
--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'projects_sla_policy_db_id_sla_policies_db_id_fk'
	) THEN
		ALTER TABLE "projects"
		ADD CONSTRAINT "projects_sla_policy_db_id_sla_policies_db_id_fk"
		FOREIGN KEY ("sla_policy_db_id")
		REFERENCES "public"."sla_policies"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'projects_escalation_owner_user_db_id_users_db_id_fk'
	) THEN
		ALTER TABLE "projects"
		ADD CONSTRAINT "projects_escalation_owner_user_db_id_users_db_id_fk"
		FOREIGN KEY ("escalation_owner_user_db_id")
		REFERENCES "public"."users"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "projects_sla_policy_db_id_idx"
ON "projects" USING btree ("sla_policy_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_delivery_due_at_idx"
ON "projects" USING btree ("delivery_due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_escalation_owner_user_db_id_idx"
ON "projects" USING btree ("escalation_owner_user_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_sla_breached_at_idx"
ON "projects" USING btree ("sla_breached_at");
