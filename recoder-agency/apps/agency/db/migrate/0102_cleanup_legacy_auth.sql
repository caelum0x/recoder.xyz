-- Cleanup migration: drop legacy Supabase auth tables
-- ONLY run this after verifying the Better Auth migration is working correctly.
-- This is IRREVERSIBLE — ensure all users can log in via Better Auth first.

-- Drop the legacy bridge table
DROP TABLE IF EXISTS "supabase_user_mappings";

-- Drop the legacy OAuth credentials table (data has been migrated to auth_accounts)
DROP TABLE IF EXISTS "oauth_credentials";

-- Drop the supabaseUserId column from clients (if no longer used)
-- ALTER TABLE "clients" DROP COLUMN IF EXISTS "supabase_user_id";
