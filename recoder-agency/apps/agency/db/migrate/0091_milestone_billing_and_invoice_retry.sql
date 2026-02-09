-- Milestone billing flags and invoice retry metadata.

ALTER TABLE "deliverables"
	ADD COLUMN IF NOT EXISTS "is_billable_milestone" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "deliverables"
	ADD COLUMN IF NOT EXISTS "milestone_label" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverables_billable_milestone_idx"
ON "deliverables" USING btree ("is_billable_milestone");

ALTER TABLE "invoices"
	ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "invoices"
	ADD COLUMN IF NOT EXISTS "last_retry_at" timestamp;
--> statement-breakpoint
ALTER TABLE "invoices"
	ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint
ALTER TABLE "invoices"
	ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp;
--> statement-breakpoint
ALTER TABLE "invoices"
	ADD COLUMN IF NOT EXISTS "auto_retry_disabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_retry_count_idx"
ON "invoices" USING btree ("retry_count");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_next_retry_at_idx"
ON "invoices" USING btree ("next_retry_at");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'invoices_retry_count_nonnegative_check'
	) THEN
		ALTER TABLE "invoices"
		ADD CONSTRAINT "invoices_retry_count_nonnegative_check"
		CHECK ("retry_count" >= 0);
	END IF;
END
$$;

