-- Least-privilege grants for the recoder_connect_runtime role the Worker
-- connects as through Hyperdrive. Mirrors bidstage-tenders/db/runtime-role-grants.sql.
-- Run after CREATE ROLE recoder_connect_runtime LOGIN PASSWORD '<...>' and after
-- 0000_init.sql has created the tables.
DO $$
BEGIN
  IF current_database() <> 'recoder_connect' THEN
    RAISE EXCEPTION 'runtime-role-grants.sql must run against the recoder_connect database, not %', current_database();
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO recoder_connect_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  connect_accounts,
  connect_devices,
  connect_entitlements,
  dodo_webhook_events
TO recoder_connect_runtime;
-- Better Auth's own tables (created by its migrator, not drizzle) — granted by
-- name so the role works once Better Auth's migration has run, without
-- granting ALL TABLES (future tables must be granted explicitly, not by default).
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", "session", "account", "verification" TO recoder_connect_runtime;
