CREATE TABLE IF NOT EXISTS "channel_gateway_events" (
  "db_id" serial PRIMARY KEY,
  "id" text NOT NULL UNIQUE,
  "team_db_id" integer REFERENCES "teams" ("db_id") ON DELETE SET NULL,
  "client_db_id" integer REFERENCES "clients" ("db_id") ON DELETE SET NULL,
  "provider" text NOT NULL,
  "event_type" text NOT NULL,
  "action" text,
  "project_id" text,
  "payload" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "channel_gateway_events_provider_idx"
  ON "channel_gateway_events" ("provider");
CREATE INDEX IF NOT EXISTS "channel_gateway_events_client_idx"
  ON "channel_gateway_events" ("client_db_id");
CREATE INDEX IF NOT EXISTS "channel_gateway_events_team_idx"
  ON "channel_gateway_events" ("team_db_id");
