-- Data migration: populate Better Auth tables from existing Supabase auth data
-- Run this AFTER deploying the schema migration (0100_better_auth_tables.sql)
-- All existing sessions will be invalidated — users must re-login after deployment.

-- 1. Mark all existing users with supabase mappings as email-verified
UPDATE "users"
SET "email_verified" = true
WHERE "db_id" IN (
  SELECT "user_db_id" FROM "supabase_user_mappings"
);

-- 2. Copy oauth_credentials → auth_accounts
-- Preserving encrypted tokens as-is (same TOKEN_ENCRYPTION_KEY)
INSERT INTO "auth_accounts" ("id", "user_id", "account_id", "provider_id", "access_token", "refresh_token", "expires_at", "scope", "created_at", "updated_at")
SELECT
  'acct_' || gen_random_uuid()::text,
  u."id",                                -- users.id (usr_xxx string)
  oc."provider_account_id",              -- accountId
  oc."provider",                         -- providerId (github/google)
  oc."access_token",                     -- encrypted access token
  oc."refresh_token",                    -- encrypted refresh token
  oc."expires_at",
  oc."scope",
  oc."created_at",
  oc."updated_at"
FROM "oauth_credentials" oc
INNER JOIN "users" u ON u."db_id" = oc."user_id"
ON CONFLICT ("provider_id", "account_id") DO NOTHING;

-- NOTE: No session migration — all users must re-login.
-- The supabase_user_mappings and oauth_credentials tables are kept
-- for rollback safety. Drop them after verifying the migration works
-- (see 0102_cleanup_legacy_auth.sql).
