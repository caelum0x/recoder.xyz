-- Platform activity feed: aggregates cross-app events
CREATE TABLE IF NOT EXISTS platform_activity (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    app text NOT NULL CHECK (app IN ('agents', 'agency', 'pm', 'web')),
    type text NOT NULL,
    title text NOT NULL,
    description text,
    timestamp timestamptz NOT NULL DEFAULT now(),
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_activity_user_ts ON platform_activity (user_id, timestamp DESC);
CREATE INDEX idx_platform_activity_app ON platform_activity (app, timestamp DESC);

ALTER TABLE platform_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_activity_user_policy ON platform_activity
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
