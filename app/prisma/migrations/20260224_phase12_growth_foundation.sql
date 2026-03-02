-- Phase 12 growth foundation
-- A2: security_settings schema alignment
-- E3: dedicated newsletter_subscribers
-- G4/G5: referral + UTM attribution columns

-- users attribution fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "referredByCode" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "utmSource" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "utmMedium" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "utmTerm" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "utmContent" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "firstTouchReferrer" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "firstTouchLanding" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "acquisitionSource" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_referral_code_unique') THEN
    CREATE UNIQUE INDEX users_referral_code_unique ON users ("referralCode");
  END IF;
END $$;

-- security settings table used by auth/2FA routes
CREATE TABLE IF NOT EXISTS security_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  two_factor_secret TEXT NULL,
  backup_codes JSONB NULL,
  session_timeout INTEGER NOT NULL DEFAULT 30,
  require_password_change BOOLEAN NOT NULL DEFAULT FALSE,
  password_change_days INTEGER NOT NULL DEFAULT 90,
  allowed_ip_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  block_unknown_devices BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- dedicated newsletter subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'subscribed',
  source TEXT NOT NULL DEFAULT 'website',
  unsubscribe_token TEXT NOT NULL UNIQUE,
  user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  subscribed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMP NULL,
  last_email_sent_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_status_subscribed_at_idx
  ON newsletter_subscribers (status, subscribed_at);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_user_id_idx
  ON newsletter_subscribers (user_id);

-- web push subscriptions (browser notifications)
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS web_push_subscriptions_user_id_idx
  ON web_push_subscriptions (user_id);
