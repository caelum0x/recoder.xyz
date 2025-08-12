-- Add subscription-related tables for DODO Payments integration

-- Subscriptions table
CREATE TABLE subscriptions (
    id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER NOT NULL,
    plan_id VARCHAR(100) NOT NULL,
    dodo_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    dodo_payment_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    amount INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    metadata JSONB,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Payments table
CREATE TABLE payments (
    id VARCHAR(255) PRIMARY KEY,
    subscription_id VARCHAR(255) NOT NULL,
    amount INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    failure_reason TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

-- Invoices table
CREATE TABLE invoices (
    id VARCHAR(255) PRIMARY KEY,
    subscription_id VARCHAR(255) NOT NULL,
    payment_id VARCHAR(255),
    amount INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    due_date TIMESTAMP NOT NULL,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);

-- Charges table (for on-demand charges)
CREATE TABLE charges (
    id VARCHAR(255) PRIMARY KEY,
    subscription_id VARCHAR(255) NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

-- Usage tracking table
CREATE TABLE usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    subscription_id VARCHAR(255),
    tokens_used INTEGER DEFAULT 0,
    requests_made INTEGER DEFAULT 0,
    ai_provider VARCHAR(50),
    feature_used VARCHAR(100),
    cost_cents INTEGER DEFAULT 0,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
);

-- Add subscription-related fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS dodo_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP;

-- Create indexes for better performance
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_dodo_id ON subscriptions(dodo_subscription_id);
CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_invoices_subscription_id ON invoices(subscription_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_usage_user_id ON usage(user_id);
CREATE INDEX idx_usage_period ON usage(period_start, period_end);
CREATE INDEX idx_users_dodo_customer_id ON users(dodo_customer_id);
CREATE INDEX idx_users_subscription_status ON users(subscription_status);

-- Create subscription status enum check
ALTER TABLE subscriptions ADD CONSTRAINT chk_subscription_status 
CHECK (status IN ('pending', 'active', 'cancelled', 'cancelled_at_period_end', 'failed', 'expired'));

-- Create payment status enum check  
ALTER TABLE payments ADD CONSTRAINT chk_payment_status
CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled'));

-- Create invoice status enum check
ALTER TABLE invoices ADD CONSTRAINT chk_invoice_status
CHECK (status IN ('pending', 'paid', 'failed', 'cancelled'));

-- Create user subscription status enum check
ALTER TABLE users ADD CONSTRAINT chk_user_subscription_status
CHECK (subscription_status IN ('free', 'active', 'cancelled', 'expired', 'failed'));

-- Create trigger to update subscription status on users table
CREATE OR REPLACE FUNCTION update_user_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users 
    SET 
        subscription_status = NEW.status,
        subscription_plan = NEW.plan_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_subscription_status
    AFTER INSERT OR UPDATE OF status ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_subscription_status();

-- Create updated_at trigger for subscriptions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();