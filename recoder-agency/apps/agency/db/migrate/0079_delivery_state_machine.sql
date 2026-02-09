-- Canonicalize project statuses for delivery workflow
UPDATE "projects" SET "status" = 'queued' WHERE "status" = 'draft';
UPDATE "projects" SET "status" = 'client_review' WHERE "status" = 'review';
UPDATE "projects" SET "status" = 'done' WHERE "status" = 'completed';

-- Track project workflow transitions for auditability
CREATE TABLE IF NOT EXISTS "project_status_transitions" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"project_db_id" integer NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"actor_user_db_id" integer,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_status_transitions" ADD CONSTRAINT "project_status_transitions_project_db_id_projects_db_id_fk" FOREIGN KEY ("project_db_id") REFERENCES "public"."projects"("db_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_transitions" ADD CONSTRAINT "project_status_transitions_actor_user_db_id_users_db_id_fk" FOREIGN KEY ("actor_user_db_id") REFERENCES "public"."users"("db_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_status_transitions_project_db_id_idx" ON "project_status_transitions" USING btree ("project_db_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_status_transitions_actor_user_db_id_idx" ON "project_status_transitions" USING btree ("actor_user_db_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_status_transitions_created_at_idx" ON "project_status_transitions" USING btree ("created_at");
