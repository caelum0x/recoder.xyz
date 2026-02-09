-- Link invoices to specific deliverables (milestone billing) and quotes.

ALTER TABLE "invoices"
	ADD COLUMN IF NOT EXISTS "deliverable_db_id" integer;
--> statement-breakpoint
ALTER TABLE "invoices"
	ADD COLUMN IF NOT EXISTS "quote_db_id" integer;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'invoices_deliverable_db_id_fk'
	) THEN
		ALTER TABLE "invoices"
		ADD CONSTRAINT "invoices_deliverable_db_id_fk"
		FOREIGN KEY ("deliverable_db_id")
		REFERENCES "public"."deliverables"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'invoices_quote_db_id_fk'
	) THEN
		ALTER TABLE "invoices"
		ADD CONSTRAINT "invoices_quote_db_id_fk"
		FOREIGN KEY ("quote_db_id")
		REFERENCES "public"."quotes"("db_id")
		ON DELETE set null
		ON UPDATE no action;
	END IF;
END
$$;
