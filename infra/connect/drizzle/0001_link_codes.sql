-- Recoder Connect — device link codes. Hand-authored (see 0000_init.sql's
-- note: regenerate with `pnpm db:generate` against a real Postgres and diff
-- before the first real deploy — it should come back empty).
CREATE TABLE IF NOT EXISTS "connect_link_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"platform" text NOT NULL,
	"dpop_public_key_thumbprint" text,
	"claimed_by_account_id" text,
	"claimed_device_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "connect_link_codes_expires_at_idx" ON "connect_link_codes" ("expires_at");
