CREATE TABLE IF NOT EXISTS "channel_identities" (
  "db_id" serial PRIMARY KEY,
  "id" text NOT NULL UNIQUE,
  "team_db_id" integer NOT NULL REFERENCES "teams" ("db_id") ON DELETE CASCADE,
  "client_db_id" integer NOT NULL REFERENCES "clients" ("db_id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "provider_user_id" text NOT NULL,
  "provider_channel_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "channel_identities_team_db_id_idx"
  ON "channel_identities" ("team_db_id");
CREATE INDEX IF NOT EXISTS "channel_identities_client_db_id_idx"
  ON "channel_identities" ("client_db_id");
CREATE INDEX IF NOT EXISTS "channel_identities_provider_user_idx"
  ON "channel_identities" ("provider", "provider_user_id");
