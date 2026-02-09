-- Service catalog (customer-facing offerings) + quotes/SOW + line items + change orders.

CREATE TABLE IF NOT EXISTS "service_catalog" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL DEFAULT 'usd',
	"estimated_days" integer,
	"deliverable_type" text,
	"status" text NOT NULL DEFAULT 'active',
	"sort_order" integer NOT NULL DEFAULT 0,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "service_catalog_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_catalog_team_db_id_idx"
ON "service_catalog" USING btree ("team_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_catalog_status_idx"
ON "service_catalog" USING btree ("status");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_team_db_id_fk'
	) THEN
		ALTER TABLE "service_catalog"
		ADD CONSTRAINT "service_catalog_team_db_id_fk"
		FOREIGN KEY ("team_db_id")
		REFERENCES "public"."teams"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_price_nonnegative_check'
	) THEN
		ALTER TABLE "service_catalog"
		ADD CONSTRAINT "service_catalog_price_nonnegative_check"
		CHECK ("price_cents" >= 0);
	END IF;
END
$$;

-- Quotes table

CREATE TABLE IF NOT EXISTS "quotes" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"client_db_id" integer NOT NULL,
	"project_db_id" integer,
	"title" text NOT NULL,
	"description" text,
	"status" text NOT NULL DEFAULT 'draft',
	"total_cents" integer NOT NULL DEFAULT 0,
	"currency" text NOT NULL DEFAULT 'usd',
	"valid_until" timestamp,
	"sent_at" timestamp,
	"accepted_at" timestamp,
	"rejected_at" timestamp,
	"accepted_by_user_id" text,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "quotes_id_unique" UNIQUE("id")
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
		SELECT 1 FROM pg_constraint WHERE conname = 'quotes_project_db_id_fk'
	) THEN
		ALTER TABLE "quotes"
		ADD CONSTRAINT "quotes_project_db_id_fk"
		FOREIGN KEY ("project_db_id")
		REFERENCES "public"."projects"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;
END
$$;

-- Quote line items

CREATE TABLE IF NOT EXISTS "quote_line_items" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"quote_db_id" integer NOT NULL,
	"service_catalog_db_id" integer,
	"name" text NOT NULL,
	"description" text,
	"quantity" integer NOT NULL DEFAULT 1,
	"unit_price_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"sort_order" integer NOT NULL DEFAULT 0,
	"created_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "quote_line_items_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_line_items_quote_db_id_idx"
ON "quote_line_items" USING btree ("quote_db_id");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quote_line_items_quote_db_id_fk'
	) THEN
		ALTER TABLE "quote_line_items"
		ADD CONSTRAINT "quote_line_items_quote_db_id_fk"
		FOREIGN KEY ("quote_db_id")
		REFERENCES "public"."quotes"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quote_line_items_service_catalog_db_id_fk'
	) THEN
		ALTER TABLE "quote_line_items"
		ADD CONSTRAINT "quote_line_items_service_catalog_db_id_fk"
		FOREIGN KEY ("service_catalog_db_id")
		REFERENCES "public"."service_catalog"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'quote_line_items_quantity_positive_check'
	) THEN
		ALTER TABLE "quote_line_items"
		ADD CONSTRAINT "quote_line_items_quantity_positive_check"
		CHECK ("quantity" >= 1);
	END IF;
END
$$;

-- Change orders

CREATE TABLE IF NOT EXISTS "change_orders" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"quote_db_id" integer NOT NULL,
	"team_db_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"amount_delta_cents" integer NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"approved_by_user_id" text,
	"created_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "change_orders_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_orders_quote_db_id_idx"
ON "change_orders" USING btree ("quote_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_orders_team_db_id_idx"
ON "change_orders" USING btree ("team_db_id");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_quote_db_id_fk'
	) THEN
		ALTER TABLE "change_orders"
		ADD CONSTRAINT "change_orders_quote_db_id_fk"
		FOREIGN KEY ("quote_db_id")
		REFERENCES "public"."quotes"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_team_db_id_fk'
	) THEN
		ALTER TABLE "change_orders"
		ADD CONSTRAINT "change_orders_team_db_id_fk"
		FOREIGN KEY ("team_db_id")
		REFERENCES "public"."teams"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;
END
$$;
