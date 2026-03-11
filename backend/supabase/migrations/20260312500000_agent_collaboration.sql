-- Sprint 66 Phase 1: Agent Collaboration Rooms
-- New schema tables for multi-agent collaboration with tasks

CREATE TABLE IF NOT EXISTS collaboration_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  room_name TEXT NOT NULL,
  description TEXT,
  agent_ids TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  objective TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collaboration_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES collaboration_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT,
  sender_type TEXT DEFAULT 'user' CHECK (sender_type IN ('user', 'agent', 'system')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'task_assignment', 'status_update', 'result', 'handoff')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collaboration_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES collaboration_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_agent_id TEXT,
  task_title TEXT NOT NULL,
  task_description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  result JSONB DEFAULT '{}',
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collab_rooms_user ON collaboration_rooms(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collab_messages_room ON collaboration_messages(room_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_collab_tasks_room ON collaboration_tasks(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collab_tasks_agent ON collaboration_tasks(assigned_agent_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
