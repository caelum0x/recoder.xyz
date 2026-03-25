-- Fix user_mcp_credential_profiles: disable RLS that uses auth.uid()
-- which doesn't work on self-hosted PostgreSQL.
-- The CREATE TABLE IF NOT EXISTS in the earlier migration is a no-op
-- when the table already exists from 20250618000000_credential_profiles.sql,
-- so the broken RLS policy from that original migration persists.
-- Access control is enforced at application layer
-- (WHERE account_id = :account_id in all queries).
DROP POLICY IF EXISTS "credential_profiles_user_access" ON user_mcp_credential_profiles;
ALTER TABLE user_mcp_credential_profiles DISABLE ROW LEVEL SECURITY;
