-- Definition-of-Done templates + QA gate run logs.

CREATE TABLE IF NOT EXISTS "deliverable_definition_of_done_templates" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"deliverable_type" text NOT NULL,
	"min_content_length" integer NOT NULL DEFAULT 20,
	"requires_file" boolean NOT NULL DEFAULT false,
	"checklist_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "deliverable_definition_of_done_templates_id_unique" UNIQUE("id"),
	CONSTRAINT "deliverable_definition_of_done_templates_team_type_unique" UNIQUE("team_db_id", "deliverable_type")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverable_definition_of_done_templates_team_db_id_idx"
ON "deliverable_definition_of_done_templates" USING btree ("team_db_id");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname IN (
			'dod_templates_team_db_id_fk',
			'deliverable_definition_of_done_templates_team_db_id_teams_db_id'
		)
	) THEN
		ALTER TABLE "deliverable_definition_of_done_templates"
		ADD CONSTRAINT "dod_templates_team_db_id_fk"
		FOREIGN KEY ("team_db_id")
		REFERENCES "public"."teams"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;
END
$$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'dod_templates_min_content_len_check'
	) THEN
		ALTER TABLE "deliverable_definition_of_done_templates"
		ADD CONSTRAINT "dod_templates_min_content_len_check"
		CHECK ("min_content_length" >= 0);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'dod_templates_checklist_items_array_check'
	) THEN
		ALTER TABLE "deliverable_definition_of_done_templates"
		ADD CONSTRAINT "dod_templates_checklist_items_array_check"
		CHECK (jsonb_typeof("checklist_items") = 'array');
	END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "deliverable_qa_gate_runs" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"project_db_id" integer NOT NULL,
	"deliverable_db_id" integer NOT NULL,
	"actor_user_db_id" integer,
	"passed" boolean NOT NULL,
	"forced_override" boolean NOT NULL DEFAULT false,
	"failure_reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"template_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "deliverable_qa_gate_runs_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverable_qa_gate_runs_project_db_id_idx"
ON "deliverable_qa_gate_runs" USING btree ("project_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverable_qa_gate_runs_deliverable_db_id_idx"
ON "deliverable_qa_gate_runs" USING btree ("deliverable_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverable_qa_gate_runs_created_at_idx"
ON "deliverable_qa_gate_runs" USING btree ("created_at");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname IN ('qa_gate_runs_team_db_id_fk')
	) THEN
		ALTER TABLE "deliverable_qa_gate_runs"
		ADD CONSTRAINT "qa_gate_runs_team_db_id_fk"
		FOREIGN KEY ("team_db_id")
		REFERENCES "public"."teams"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname IN ('qa_gate_runs_project_db_id_fk')
	) THEN
		ALTER TABLE "deliverable_qa_gate_runs"
		ADD CONSTRAINT "qa_gate_runs_project_db_id_fk"
		FOREIGN KEY ("project_db_id")
		REFERENCES "public"."projects"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname IN (
			'qa_gate_runs_deliverable_db_id_fk',
			'deliverable_qa_gate_runs_deliverable_db_id_deliverables_db_id_f'
		)
	) THEN
		ALTER TABLE "deliverable_qa_gate_runs"
		ADD CONSTRAINT "qa_gate_runs_deliverable_db_id_fk"
		FOREIGN KEY ("deliverable_db_id")
		REFERENCES "public"."deliverables"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname IN ('qa_gate_runs_actor_user_db_id_fk')
	) THEN
		ALTER TABLE "deliverable_qa_gate_runs"
		ADD CONSTRAINT "qa_gate_runs_actor_user_db_id_fk"
		FOREIGN KEY ("actor_user_db_id")
		REFERENCES "public"."users"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;
END
$$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'qa_gate_runs_failure_reasons_array_check'
	) THEN
		ALTER TABLE "deliverable_qa_gate_runs"
		ADD CONSTRAINT "qa_gate_runs_failure_reasons_array_check"
		CHECK (jsonb_typeof("failure_reasons") = 'array');
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'qa_gate_runs_template_snapshot_object_check'
	) THEN
		ALTER TABLE "deliverable_qa_gate_runs"
		ADD CONSTRAINT "qa_gate_runs_template_snapshot_object_check"
		CHECK (jsonb_typeof("template_snapshot") = 'object');
	END IF;
END
$$;

INSERT INTO public.deliverable_definition_of_done_templates (
	id,
	team_db_id,
	deliverable_type,
	min_content_length,
	requires_file,
	checklist_items
)
SELECT
	'dod_' || t.db_id || '_' || dt.deliverable_type,
	t.db_id,
	dt.deliverable_type,
	dt.min_content_length,
	dt.requires_file,
	dt.checklist_items
FROM public.teams t
CROSS JOIN (
	VALUES
		('document', 80, false, '["summary","scope","next steps"]'::jsonb),
		('code', 40, false, '["setup","run","tests"]'::jsonb),
		('design', 40, false, '["assets","handoff","responsive"]'::jsonb),
		('other', 20, false, '[]'::jsonb)
) AS dt(deliverable_type, min_content_length, requires_file, checklist_items)
LEFT JOIN public.deliverable_definition_of_done_templates existing
	ON existing.team_db_id = t.db_id
	AND existing.deliverable_type = dt.deliverable_type
WHERE existing.db_id IS NULL;
