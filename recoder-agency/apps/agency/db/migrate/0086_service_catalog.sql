-- Service catalog (fixed-scope SKUs) and project linkage.

CREATE TABLE IF NOT EXISTS "service_skus" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"scope" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text NOT NULL DEFAULT 'usd',
	"sla_days" integer NOT NULL DEFAULT 7,
	"revision_limit" integer NOT NULL DEFAULT 2,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "service_skus_id_unique" UNIQUE("id"),
	CONSTRAINT "service_skus_team_code_unique" UNIQUE("team_db_id", "code")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_skus_team_db_id_idx"
ON "service_skus" USING btree ("team_db_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_skus_is_active_idx"
ON "service_skus" USING btree ("is_active");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'service_skus_team_db_id_fk'
	) THEN
		ALTER TABLE "service_skus"
		ADD CONSTRAINT "service_skus_team_db_id_fk"
		FOREIGN KEY ("team_db_id")
		REFERENCES "public"."teams"("db_id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'service_skus_price_nonnegative_check'
	) THEN
		ALTER TABLE "service_skus"
		ADD CONSTRAINT "service_skus_price_nonnegative_check"
		CHECK ("price_cents" >= 0);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'service_skus_sla_days_positive_check'
	) THEN
		ALTER TABLE "service_skus"
		ADD CONSTRAINT "service_skus_sla_days_positive_check"
		CHECK ("sla_days" > 0);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'service_skus_revision_limit_nonnegative_check'
	) THEN
		ALTER TABLE "service_skus"
		ADD CONSTRAINT "service_skus_revision_limit_nonnegative_check"
		CHECK ("revision_limit" >= 0);
	END IF;
END
$$;

ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "service_sku_db_id" integer;
--> statement-breakpoint
ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "scope_override_reason" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_service_sku_db_id_idx"
ON "projects" USING btree ("service_sku_db_id");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'projects_service_sku_db_id_fk'
	) THEN
		ALTER TABLE "projects"
		ADD CONSTRAINT "projects_service_sku_db_id_fk"
		FOREIGN KEY ("service_sku_db_id")
		REFERENCES "public"."service_skus"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;
END
$$;

UPDATE "projects"
SET "scope_override_reason" = 'Legacy project created before service catalog rollout'
WHERE "service_sku_db_id" IS NULL
	AND ("scope_override_reason" IS NULL OR btrim("scope_override_reason") = '');

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'projects_service_sku_or_scope_override_check'
	) THEN
		ALTER TABLE "projects"
		ADD CONSTRAINT "projects_service_sku_or_scope_override_check"
		CHECK (
			"service_sku_db_id" IS NOT NULL
			OR (
				"scope_override_reason" IS NOT NULL
				AND btrim("scope_override_reason") <> ''
			)
		);
	END IF;
END
$$;
