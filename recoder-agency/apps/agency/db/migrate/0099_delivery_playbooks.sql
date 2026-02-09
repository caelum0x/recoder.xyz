-- Delivery Playbooks: reusable project bootstrap templates with phases, SKU, budget, SLA.

BEGIN;

CREATE TABLE IF NOT EXISTS "public"."delivery_playbooks" (
	"db_id"                serial PRIMARY KEY,
	"id"                   text NOT NULL UNIQUE,
	"team_db_id"           integer NOT NULL REFERENCES "public"."teams"("db_id") ON DELETE CASCADE,
	"name"                 text NOT NULL,
	"description"          text,
	"service_sku_db_id"    integer REFERENCES "public"."service_skus"("db_id") ON DELETE SET NULL,
	"default_budget_cents" integer,
	"default_sla_days"     integer NOT NULL DEFAULT 7,
	"name_prefix"          text,
	"phases"               jsonb NOT NULL DEFAULT '[]'::jsonb,
	"checklist"            jsonb NOT NULL DEFAULT '[]'::jsonb,
	"is_active"            boolean NOT NULL DEFAULT true,
	"sort_order"           integer NOT NULL DEFAULT 0,
	"created_at"           timestamp DEFAULT now() NOT NULL,
	"updated_at"           timestamp DEFAULT now() NOT NULL,

	CONSTRAINT "delivery_playbooks_budget_gte_0"
		CHECK ("default_budget_cents" IS NULL OR "default_budget_cents" >= 0),
	CONSTRAINT "delivery_playbooks_sla_gt_0"
		CHECK ("default_sla_days" > 0),
	CONSTRAINT "delivery_playbooks_phases_is_array"
		CHECK (jsonb_typeof("phases") = 'array'),
	CONSTRAINT "delivery_playbooks_checklist_is_array"
		CHECK (jsonb_typeof("checklist") = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_playbooks_team_name_uidx"
	ON "public"."delivery_playbooks" ("team_db_id", "name");

CREATE INDEX IF NOT EXISTS "delivery_playbooks_team_db_id_idx"
	ON "public"."delivery_playbooks" ("team_db_id");

CREATE INDEX IF NOT EXISTS "delivery_playbooks_is_active_idx"
	ON "public"."delivery_playbooks" ("is_active");

ALTER TABLE "public"."projects"
	ADD COLUMN IF NOT EXISTS "playbook_db_id" integer
		REFERENCES "public"."delivery_playbooks"("db_id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "projects_playbook_db_id_idx"
	ON "public"."projects" ("playbook_db_id");

COMMIT;
