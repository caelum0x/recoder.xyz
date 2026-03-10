-- Sprint 44: Add signing_secret column to webhook_endpoints
-- The existing `secret` column already serves this purpose, but we add
-- a dedicated `signing_secret` column for explicit HMAC signing management.
-- This allows separate control of the signing secret vs the endpoint secret.
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS signing_secret TEXT;

-- Backfill existing rows: copy the current secret as signing_secret
UPDATE webhook_endpoints SET signing_secret = secret WHERE signing_secret IS NULL;
