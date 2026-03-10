CREATE TABLE IF NOT EXISTS agent_collaboration_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  room_type TEXT DEFAULT 'discussion' CHECK (room_type IN ('discussion', 'review', 'debugging', 'planning')),
  agent_ids TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collaboration_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES agent_collaboration_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  sender_type TEXT DEFAULT 'user' CHECK (sender_type IN ('user', 'agent', 'system')),
  sender_name TEXT,
  agent_id TEXT,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'code', 'suggestion', 'decision', 'action_item')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_collab_rooms_user ON agent_collaboration_rooms(user_id, created_at DESC);
CREATE INDEX idx_collab_rooms_status ON agent_collaboration_rooms(status) WHERE status = 'active';
CREATE INDEX idx_collab_messages_room ON collaboration_messages(room_id, created_at);
CREATE INDEX idx_collab_messages_user ON collaboration_messages(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
