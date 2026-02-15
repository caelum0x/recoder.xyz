-- Migration: Stripe → Polar.sh billing migration
-- Renames columns and replaces old Stripe subscription history tables
-- with the simpler polar_subscription_histories table.

-- 1. Rename stripe_customer_id → polar_customer_id on clients
ALTER TABLE "clients" RENAME COLUMN "stripe_customer_id" TO "polar_customer_id";

-- 2. Rename stripe_invoice_id → polar_order_id on invoices
ALTER TABLE "invoices" RENAME COLUMN "stripe_invoice_id" TO "polar_order_id";

-- 3. Drop legacy Stripe subscription tables (order matters: child first)
DROP TABLE IF EXISTS "stripe_pricing_plan_subscription_histories";
DROP TABLE IF EXISTS "stripe_billing_cadence_histories";

-- 4. Create polar_subscription_histories
CREATE TABLE "polar_subscription_histories" (
  "db_id" serial PRIMARY KEY,
  "team_db_id" integer NOT NULL REFERENCES "teams"("db_id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "subscription_id" text NOT NULL,
  "customer_id" text NOT NULL,
  "product_id" text NOT NULL,
  "status" text NOT NULL,
  "current_period_end" timestamp,
  "metadata" jsonb
);

CREATE INDEX "polar_sub_hist_subscription_id_idx"
  ON "polar_subscription_histories" ("subscription_id");
CREATE INDEX "polar_sub_hist_team_db_id_idx"
  ON "polar_subscription_histories" ("team_db_id");
CREATE INDEX "polar_sub_hist_customer_id_idx"
  ON "polar_subscription_histories" ("customer_id");
