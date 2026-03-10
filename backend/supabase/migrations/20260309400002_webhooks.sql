-- Webhook endpoints and delivery tracking
CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    url text NOT NULL,
    secret text NOT NULL,
    events text[] NOT NULL DEFAULT '{}',
    active boolean NOT NULL DEFAULT true,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_endpoints_account ON webhook_endpoints (account_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event text NOT NULL,
    payload jsonb NOT NULL,
    response_status int,
    response_body text,
    attempts int NOT NULL DEFAULT 0,
    max_attempts int NOT NULL DEFAULT 3,
    next_retry_at timestamptz,
    delivered_at timestamptz,
    failed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries (next_retry_at) WHERE delivered_at IS NULL AND failed_at IS NULL;

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_endpoints_policy ON webhook_endpoints
    FOR ALL USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_policy ON webhook_deliveries
    FOR ALL USING (EXISTS (
        SELECT 1 FROM webhook_endpoints we
        WHERE we.id = webhook_deliveries.webhook_id AND we.account_id = auth.uid()
    ));
