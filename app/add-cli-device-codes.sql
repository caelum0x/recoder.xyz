-- Add CLI Device Codes table for OAuth 2.0 Device Flow authentication
-- This allows CLI tools to authenticate users via browser

CREATE TABLE IF NOT EXISTS cli_device_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceCode" VARCHAR(255) UNIQUE NOT NULL,
  "userCode" VARCHAR(255) UNIQUE NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  "userId" UUID,
  "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,

  -- Foreign key to users table
  CONSTRAINT fk_cli_device_codes_user
    FOREIGN KEY ("userId")
    REFERENCES users(id)
    ON DELETE CASCADE
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_cli_device_codes_deviceCode ON cli_device_codes("deviceCode");
CREATE INDEX IF NOT EXISTS idx_cli_device_codes_userCode ON cli_device_codes("userCode");

-- Add comments for documentation
COMMENT ON TABLE cli_device_codes IS 'OAuth 2.0 Device Flow codes for CLI authentication';
COMMENT ON COLUMN cli_device_codes."deviceCode" IS 'Long random code for polling (64 hex chars)';
COMMENT ON COLUMN cli_device_codes."userCode" IS 'Short user-friendly code (e.g., ABC-123)';
COMMENT ON COLUMN cli_device_codes.status IS 'Authorization status: pending, authorized, or denied';
COMMENT ON COLUMN cli_device_codes."expiresAt" IS 'Expiration time (typically 15 minutes from creation)';
