-- Migration: Rename stripe_meter_event_id → meter_event_id
-- Completes the Stripe → Polar billing migration (see 0112).

-- Drop old indexes first
DROP INDEX IF EXISTS "agent_time_usage_reports_stripe_meter_event_id_index";
DROP INDEX IF EXISTS "user_seat_usage_reports_stripe_meter_event_id_index";

-- Rename columns
ALTER TABLE "agent_time_usage_reports" RENAME COLUMN "stripe_meter_event_id" TO "meter_event_id";
ALTER TABLE "user_seat_usage_reports" RENAME COLUMN "stripe_meter_event_id" TO "meter_event_id";

-- Recreate indexes with new column name
CREATE INDEX "agent_time_usage_reports_meter_event_id_index" ON "agent_time_usage_reports" ("meter_event_id");
CREATE INDEX "user_seat_usage_reports_meter_event_id_index" ON "user_seat_usage_reports" ("meter_event_id");
