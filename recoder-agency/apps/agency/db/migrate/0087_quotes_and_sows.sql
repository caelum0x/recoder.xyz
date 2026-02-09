-- Quotes and SOWs for commercial flow (admin-side).

CREATE TABLE IF NOT EXISTS "quotes" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"client_db_id" integer NOT NULL,
	"service_sku_db_id" integer,
	"project_db_id" integer,
	"title" text NOT NULL,
	"scope_snapshot" text NOT NULL,
	"scope_override_reason" text,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL DEFAULT 'usd',
	"sla_days" integer NOT NULL DEFAULT 7,
	"revision_limit" integer NOT NULL DEFAULT 2,
	"notes" text,
	"status" text NOT NULL DEFAULT 'draft',
	"accepted_at" timestamp,
	"rejected_at" timestamp,
	"created_by_user_db_id" integer,
	"decided_by_user_db_id" integer,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "quotes_id_unique" UNIQUE("id"),
	CONSTRAINT "quotes_project_db_id_unique" UNIQUE("project_db_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotes_team_db_id_idx"
ON "quotes" USING btree ("team_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotes_client_db_id_idx"
ON "quotes" USING btree ("client_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotes_status_idx"
ON "quotes" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotes_created_at_idx"
ON "quotes" USING btree ("created_at");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quotes_team_db_id_fk'
	) THEN
		ALTER TABLE "quotes"
		ADD CONSTRAINT "quotes_team_db_id_fk"
		FOREIGN KEY ("team_db_id")
		REFERENCES "public"."teams"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quotes_client_db_id_fk'
	) THEN
		ALTER TABLE "quotes"
		ADD CONSTRAINT "quotes_client_db_id_fk"
		FOREIGN KEY ("client_db_id")
		REFERENCES "public"."clients"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quotes_service_sku_db_id_fk'
	) THEN
		ALTER TABLE "quotes"
		ADD CONSTRAINT "quotes_service_sku_db_id_fk"
		FOREIGN KEY ("service_sku_db_id")
		REFERENCES "public"."service_skus"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quotes_project_db_id_fk'
	) THEN
		ALTER TABLE "quotes"
		ADD CONSTRAINT "quotes_project_db_id_fk"
		FOREIGN KEY ("project_db_id")
		REFERENCES "public"."projects"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quotes_created_by_user_db_id_fk'
	) THEN
		ALTER TABLE "quotes"
		ADD CONSTRAINT "quotes_created_by_user_db_id_fk"
		FOREIGN KEY ("created_by_user_db_id")
		REFERENCES "public"."users"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quotes_decided_by_user_db_id_fk'
	) THEN
		ALTER TABLE "quotes"
		ADD CONSTRAINT "quotes_decided_by_user_db_id_fk"
		FOREIGN KEY ("decided_by_user_db_id")
		REFERENCES "public"."users"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quotes_price_nonnegative_check'
	) THEN
		ALTER TABLE "quotes"
		ADD CONSTRAINT "quotes_price_nonnegative_check"
		CHECK ("price_cents" >= 0);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quotes_sla_days_positive_check'
	) THEN
		ALTER TABLE "quotes"
		ADD CONSTRAINT "quotes_sla_days_positive_check"
		CHECK ("sla_days" > 0);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quotes_revision_limit_nonnegative_check'
	) THEN
		ALTER TABLE "quotes"
		ADD CONSTRAINT "quotes_revision_limit_nonnegative_check"
		CHECK ("revision_limit" >= 0);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quotes_status_check'
	) THEN
		ALTER TABLE "quotes"
		ADD CONSTRAINT "quotes_status_check"
		CHECK ("status" IN ('draft', 'sent', 'accepted', 'rejected'));
	END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "sows" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"client_db_id" integer NOT NULL,
	"quote_db_id" integer NOT NULL,
	"title" text NOT NULL,
	"scope" text NOT NULL,
	"terms" text,
	"status" text NOT NULL DEFAULT 'draft',
	"version" integer NOT NULL DEFAULT 1,
	"created_by_user_db_id" integer,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "sows_id_unique" UNIQUE("id"),
	CONSTRAINT "sows_quote_db_id_unique" UNIQUE("quote_db_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sows_team_db_id_idx"
ON "sows" USING btree ("team_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sows_client_db_id_idx"
ON "sows" USING btree ("client_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sows_status_idx"
ON "sows" USING btree ("status");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'sows_team_db_id_fk'
	) THEN
		ALTER TABLE "sows"
		ADD CONSTRAINT "sows_team_db_id_fk"
		FOREIGN KEY ("team_db_id")
		REFERENCES "public"."teams"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'sows_client_db_id_fk'
	) THEN
		ALTER TABLE "sows"
		ADD CONSTRAINT "sows_client_db_id_fk"
		FOREIGN KEY ("client_db_id")
		REFERENCES "public"."clients"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'sows_quote_db_id_fk'
	) THEN
		ALTER TABLE "sows"
		ADD CONSTRAINT "sows_quote_db_id_fk"
		FOREIGN KEY ("quote_db_id")
		REFERENCES "public"."quotes"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'sows_created_by_user_db_id_fk'
	) THEN
		ALTER TABLE "sows"
		ADD CONSTRAINT "sows_created_by_user_db_id_fk"
		FOREIGN KEY ("created_by_user_db_id")
		REFERENCES "public"."users"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'sows_status_check'
	) THEN
		ALTER TABLE "sows"
		ADD CONSTRAINT "sows_status_check"
		CHECK ("status" IN ('draft', 'finalized'));
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'sows_version_positive_check'
	) THEN
		ALTER TABLE "sows"
		ADD CONSTRAINT "sows_version_positive_check"
		CHECK ("version" > 0);
	END IF;
END
$$;

