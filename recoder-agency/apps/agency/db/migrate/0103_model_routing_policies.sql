-- Model routing policies + generation cost logs for AI cost tracking.

BEGIN;

CREATE TABLE IF NOT EXISTS "public"."model_routing_policies" (
	"db_id"                            serial PRIMARY KEY,
	"id"                               text NOT NULL UNIQUE,
	"team_db_id"                       integer NOT NULL REFERENCES "public"."teams"("db_id") ON DELETE CASCADE,
	"project_db_id"                    integer REFERENCES "public"."projects"("db_id") ON DELETE CASCADE,
	"name"                             text NOT NULL,
	"preferred_model_id"               text NOT NULL,
	"fallback_model_id"                text,
	"cost_ceiling_cents_per_generation" integer,
	"is_active"                        boolean NOT NULL DEFAULT true,
	"priority"                         integer NOT NULL DEFAULT 0,
	"created_at"                       timestamp DEFAULT now() NOT NULL,
	"updated_at"                       timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "model_routing_policies_team_db_id_idx"
	ON "public"."model_routing_policies" ("team_db_id");

CREATE INDEX IF NOT EXISTS "model_routing_policies_project_db_id_idx"
	ON "public"."model_routing_policies" ("project_db_id");

CREATE INDEX IF NOT EXISTS "model_routing_policies_is_active_idx"
	ON "public"."model_routing_policies" ("is_active");

CREATE TABLE IF NOT EXISTS "public"."generation_cost_logs" (
	"db_id"                     serial PRIMARY KEY,
	"team_db_id"                integer NOT NULL REFERENCES "public"."teams"("db_id") ON DELETE CASCADE,
	"project_db_id"             integer REFERENCES "public"."projects"("db_id") ON DELETE SET NULL,
	"workspace_id"              text,
	"generation_id"             text NOT NULL,
	"model_id"                  text NOT NULL,
	"provider"                  text NOT NULL,
	"input_tokens"              integer NOT NULL DEFAULT 0,
	"output_tokens"             integer NOT NULL DEFAULT 0,
	"total_cost_cents"          integer NOT NULL DEFAULT 0,
	"cost_ledger_entry_db_id"   integer REFERENCES "public"."cost_ledger_entries"("db_id") ON DELETE SET NULL,
	"routing_policy_db_id"      integer REFERENCES "public"."model_routing_policies"("db_id") ON DELETE SET NULL,
	"was_fallback"              boolean NOT NULL DEFAULT false,
	"created_at"                timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "generation_cost_logs_team_db_id_idx"
	ON "public"."generation_cost_logs" ("team_db_id");

CREATE INDEX IF NOT EXISTS "generation_cost_logs_project_db_id_idx"
	ON "public"."generation_cost_logs" ("project_db_id");

CREATE INDEX IF NOT EXISTS "generation_cost_logs_model_id_idx"
	ON "public"."generation_cost_logs" ("model_id");

CREATE INDEX IF NOT EXISTS "generation_cost_logs_created_at_idx"
	ON "public"."generation_cost_logs" ("created_at");

COMMIT;
