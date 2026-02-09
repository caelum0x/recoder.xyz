-- Cost ledger for tracking actual spend against project budgets.

CREATE TABLE IF NOT EXISTS "cost_ledger_entries" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"project_db_id" integer NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"category" text NOT NULL DEFAULT 'other',
	"occurred_at" timestamp NOT NULL DEFAULT now(),
	"created_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "cost_ledger_entries_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_ledger_entries_team_db_id_idx"
ON "cost_ledger_entries" USING btree ("team_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_ledger_entries_project_db_id_idx"
ON "cost_ledger_entries" USING btree ("project_db_id");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'cost_ledger_entries_team_db_id_fk'
	) THEN
		ALTER TABLE "cost_ledger_entries"
		ADD CONSTRAINT "cost_ledger_entries_team_db_id_fk"
		FOREIGN KEY ("team_db_id")
		REFERENCES "public"."teams"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'cost_ledger_entries_project_db_id_fk'
	) THEN
		ALTER TABLE "cost_ledger_entries"
		ADD CONSTRAINT "cost_ledger_entries_project_db_id_fk"
		FOREIGN KEY ("project_db_id")
		REFERENCES "public"."projects"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'cost_ledger_entries_amount_positive_check'
	) THEN
		ALTER TABLE "cost_ledger_entries"
		ADD CONSTRAINT "cost_ledger_entries_amount_positive_check"
		CHECK ("amount_cents" > 0);
	END IF;
END
$$;

-- Add budget_cents and quote_db_id columns to projects

ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "budget_cents" integer;
--> statement-breakpoint
ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "quote_db_id" integer;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'projects_quote_db_id_fk'
	) THEN
		ALTER TABLE "projects"
		ADD CONSTRAINT "projects_quote_db_id_fk"
		FOREIGN KEY ("quote_db_id")
		REFERENCES "public"."quotes"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;
END
$$;
