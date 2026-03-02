-- Database Schema for Recoder Web Subscription System
-- Use with Neon, Supabase, or any PostgreSQL database

-- Users table (extend your existing users table or create new)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Payment provider info
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('paddle', 'dodopay')),
  subscription_id VARCHAR(255) UNIQUE NOT NULL, -- Provider's subscription ID
  customer_id VARCHAR(255) NOT NULL, -- Provider's customer ID

  -- Plan details
  plan_id VARCHAR(50) NOT NULL CHECK (plan_id IN ('free', 'pro', 'enterprise')),
  status VARCHAR(50) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'incomplete', 'incomplete_expired')),

  -- Pricing (from provider)
  amount DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'USD',

  -- Billing
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMP,
  trial_end TIMESTAMP,

  -- Usage limits (based on plan)
  monthly_request_limit INTEGER NOT NULL DEFAULT 100,
  monthly_requests_used INTEGER NOT NULL DEFAULT 0,
  last_reset_at TIMESTAMP DEFAULT NOW(),

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Indexes
  CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

-- Usage tracking table (detailed history)
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Usage details
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('generation', 'template', 'export', 'deployment')),
  tokens_used INTEGER DEFAULT 0,
  cost_estimated DECIMAL(10, 4) DEFAULT 0,

  -- AI model used
  model_used VARCHAR(100),
  optimization_strategy VARCHAR(50),

  -- Request details
  request_data JSONB,
  response_data JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Transaction info
  provider VARCHAR(20) NOT NULL,
  transaction_id VARCHAR(255) UNIQUE NOT NULL,

  -- Payment details
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),

  -- Metadata
  payment_method VARCHAR(50),
  receipt_url TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Webhook events table (for debugging and replay)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(20) NOT NULL,
  event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,

  -- Event data
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider, subscription_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed, created_at);

-- Function to reset monthly usage
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS void AS $$
BEGIN
  UPDATE subscriptions
  SET
    generations_used = 0,
    last_reset_at = NOW()
  WHERE
    status = 'active'
    AND DATE_PART('day', NOW() - last_reset_at) >= 30;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating timestamps
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
