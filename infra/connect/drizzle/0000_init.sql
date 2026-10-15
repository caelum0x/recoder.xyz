-- Recoder Connect — initial schema. Hand-authored to match src/db/schema.ts
-- exactly (drizzle-kit was not run against a live database in this change;
-- regenerate with `pnpm db:generate` against a real Postgres and diff against
-- this file before the first real deploy — it should come back empty).
CREATE TABLE IF NOT EXISTS "connect_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"dodo_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "connect_accounts_user_id_key" ON "connect_accounts" ("user_id");
CREATE INDEX IF NOT EXISTS "connect_accounts_email_idx" ON "connect_accounts" ("email");
CREATE INDEX IF NOT EXISTS "connect_accounts_dodo_customer_idx" ON "connect_accounts" ("dodo_customer_id");

CREATE TABLE IF NOT EXISTS "connect_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"label" text NOT NULL,
	"platform" text NOT NULL,
	"dpop_public_key_thumbprint" text,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "connect_devices_account_idx" ON "connect_devices" ("account_id");

CREATE TABLE IF NOT EXISTS "connect_entitlements" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"dodo_subscription_id" text,
	"dodo_product_id" text,
	"seats" integer DEFAULT 1 NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connect_entitlements_plan_check" CHECK ("plan" IN ('free','pro','team')),
	CONSTRAINT "connect_entitlements_status_check" CHECK ("status" IN ('incomplete','active','past_due','canceled','expired'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "connect_entitlements_account_id_key" ON "connect_entitlements" ("account_id");
CREATE INDEX IF NOT EXISTS "connect_entitlements_dodo_sub_idx" ON "connect_entitlements" ("dodo_subscription_id");

CREATE TABLE IF NOT EXISTS "dodo_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"account_id" text,
	"processed_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "dodo_webhook_events_received_at_idx" ON "dodo_webhook_events" ("received_at");
