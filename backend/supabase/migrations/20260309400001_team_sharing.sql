-- Thread collaborators: granular thread sharing
CREATE TABLE IF NOT EXISTS thread_collaborators (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL,
    user_id uuid NOT NULL,
    email text,
    role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
    invited_by uuid NOT NULL,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (thread_id, user_id)
);

CREATE INDEX idx_thread_collab_thread ON thread_collaborators (thread_id);
CREATE INDEX idx_thread_collab_user ON thread_collaborators (user_id);

-- Agent team access: share agents with team members
CREATE TABLE IF NOT EXISTS agent_team_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id uuid NOT NULL,
    user_id uuid NOT NULL,
    email text,
    role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'editor', 'admin')),
    granted_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (agent_id, user_id)
);

CREATE INDEX idx_agent_access_agent ON agent_team_access (agent_id);
CREATE INDEX idx_agent_access_user ON agent_team_access (user_id);

ALTER TABLE thread_collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY thread_collab_policy ON thread_collaborators
    FOR ALL USING (
        user_id = auth.uid() OR invited_by = auth.uid()
    )
    WITH CHECK (invited_by = auth.uid());

ALTER TABLE agent_team_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_access_policy ON agent_team_access
    FOR ALL USING (
        user_id = auth.uid() OR granted_by = auth.uid()
    )
    WITH CHECK (granted_by = auth.uid());
