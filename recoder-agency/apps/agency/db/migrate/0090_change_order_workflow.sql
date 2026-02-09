-- Change order workflow aligned to project/client review with versioned deltas.

CREATE TABLE IF NOT EXISTS "change_orders" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"project_db_id" integer NOT NULL,
	"client_db_id" integer NOT NULL,
	"quote_db_id" integer,
	"title" text NOT NULL,
	"scope_delta" text NOT NULL,
	"billing_delta_cents" integer NOT NULL DEFAULT 0,
	"scope_version" integer NOT NULL DEFAULT 1,
	"status" text NOT NULL DEFAULT 'pending',
	"decision_reason" text,
	"requested_by_user_db_id" integer,
	"decided_by_user_db_id" integer,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "change_orders_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_orders_team_db_id_idx"
ON "change_orders" USING btree ("team_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_orders_project_db_id_idx"
ON "change_orders" USING btree ("project_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_orders_client_db_id_idx"
ON "change_orders" USING btree ("client_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_orders_quote_db_id_idx"
ON "change_orders" USING btree ("quote_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_orders_status_idx"
ON "change_orders" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_orders_project_scope_version_idx"
ON "change_orders" USING btree ("project_db_id", "scope_version");

ALTER TABLE "change_orders"
	ADD COLUMN IF NOT EXISTS "project_db_id" integer;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ADD COLUMN IF NOT EXISTS "client_db_id" integer;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ADD COLUMN IF NOT EXISTS "scope_delta" text;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ADD COLUMN IF NOT EXISTS "billing_delta_cents" integer;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ADD COLUMN IF NOT EXISTS "scope_version" integer;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ADD COLUMN IF NOT EXISTS "decision_reason" text;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ADD COLUMN IF NOT EXISTS "requested_by_user_db_id" integer;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ADD COLUMN IF NOT EXISTS "decided_by_user_db_id" integer;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'change_orders'
			AND column_name = 'amount_delta_cents'
	) THEN
		EXECUTE '
			UPDATE "change_orders"
			SET "billing_delta_cents" = coalesce("amount_delta_cents", 0)
			WHERE "billing_delta_cents" IS NULL
		';
	ELSE
		UPDATE "change_orders"
		SET "billing_delta_cents" = 0
		WHERE "billing_delta_cents" IS NULL;
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'change_orders'
			AND column_name = 'description'
	) THEN
		EXECUTE '
			UPDATE "change_orders"
			SET "scope_delta" = coalesce(nullif(btrim(coalesce("description", '''')), ''''), ''(no scope delta provided)'')
			WHERE "scope_delta" IS NULL
		';
	ELSE
		UPDATE "change_orders"
		SET "scope_delta" = '(no scope delta provided)'
		WHERE "scope_delta" IS NULL;
	END IF;
END
$$;

UPDATE "change_orders"
SET "scope_version" = 1
WHERE "scope_version" IS NULL;

UPDATE "change_orders" co
SET "project_db_id" = q."project_db_id"
FROM "quotes" q
WHERE co."project_db_id" IS NULL
	AND co."quote_db_id" = q."db_id";

UPDATE "change_orders" co
SET "client_db_id" = p."client_db_id"
FROM "projects" p
WHERE co."client_db_id" IS NULL
	AND co."project_db_id" = p."db_id";

DO $$
BEGIN
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

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_project_db_id_fk'
	) THEN
		ALTER TABLE "change_orders"
		ADD CONSTRAINT "change_orders_project_db_id_fk"
		FOREIGN KEY ("project_db_id")
		REFERENCES "public"."projects"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_client_db_id_fk'
	) THEN
		ALTER TABLE "change_orders"
		ADD CONSTRAINT "change_orders_client_db_id_fk"
		FOREIGN KEY ("client_db_id")
		REFERENCES "public"."clients"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_quote_db_id_fk'
	) THEN
		ALTER TABLE "change_orders"
		ADD CONSTRAINT "change_orders_quote_db_id_fk"
		FOREIGN KEY ("quote_db_id")
		REFERENCES "public"."quotes"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_requested_by_user_db_id_fk'
	) THEN
		ALTER TABLE "change_orders"
		ADD CONSTRAINT "change_orders_requested_by_user_db_id_fk"
		FOREIGN KEY ("requested_by_user_db_id")
		REFERENCES "public"."users"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_decided_by_user_db_id_fk'
	) THEN
		ALTER TABLE "change_orders"
		ADD CONSTRAINT "change_orders_decided_by_user_db_id_fk"
		FOREIGN KEY ("decided_by_user_db_id")
		REFERENCES "public"."users"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_status_check'
	) THEN
		ALTER TABLE "change_orders"
		ADD CONSTRAINT "change_orders_status_check"
		CHECK ("status" IN ('pending', 'approved', 'rejected'));
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'change_orders_scope_version_positive_check'
	) THEN
		ALTER TABLE "change_orders"
		ADD CONSTRAINT "change_orders_scope_version_positive_check"
		CHECK ("scope_version" > 0);
	END IF;
END
$$;

ALTER TABLE "change_orders"
	ALTER COLUMN "project_db_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ALTER COLUMN "client_db_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ALTER COLUMN "scope_delta" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ALTER COLUMN "billing_delta_cents" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "change_orders"
	ALTER COLUMN "scope_version" SET NOT NULL;
