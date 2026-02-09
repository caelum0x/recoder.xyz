-- Configurable project cost guardrails: warning + hard-stop thresholds.

ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "cost_warning_threshold_pct" integer;
--> statement-breakpoint
ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "cost_hard_stop_threshold_pct" integer;
--> statement-breakpoint
ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "cost_hard_stop_enabled" boolean;

UPDATE "projects"
SET "cost_warning_threshold_pct" = 80
WHERE "cost_warning_threshold_pct" IS NULL;

UPDATE "projects"
SET "cost_hard_stop_threshold_pct" = 100
WHERE "cost_hard_stop_threshold_pct" IS NULL;

UPDATE "projects"
SET "cost_hard_stop_enabled" = false
WHERE "cost_hard_stop_enabled" IS NULL;

ALTER TABLE "projects"
	ALTER COLUMN "cost_warning_threshold_pct" SET DEFAULT 80;
--> statement-breakpoint
ALTER TABLE "projects"
	ALTER COLUMN "cost_hard_stop_threshold_pct" SET DEFAULT 100;
--> statement-breakpoint
ALTER TABLE "projects"
	ALTER COLUMN "cost_hard_stop_enabled" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "projects"
	ALTER COLUMN "cost_warning_threshold_pct" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects"
	ALTER COLUMN "cost_hard_stop_threshold_pct" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects"
	ALTER COLUMN "cost_hard_stop_enabled" SET NOT NULL;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'projects_cost_warning_threshold_pct_range_check'
	) THEN
		ALTER TABLE "projects"
		ADD CONSTRAINT "projects_cost_warning_threshold_pct_range_check"
		CHECK ("cost_warning_threshold_pct" >= 1 AND "cost_warning_threshold_pct" <= 500);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'projects_cost_hard_stop_threshold_pct_range_check'
	) THEN
		ALTER TABLE "projects"
		ADD CONSTRAINT "projects_cost_hard_stop_threshold_pct_range_check"
		CHECK ("cost_hard_stop_threshold_pct" >= 1 AND "cost_hard_stop_threshold_pct" <= 500);
	END IF;
END
$$;

