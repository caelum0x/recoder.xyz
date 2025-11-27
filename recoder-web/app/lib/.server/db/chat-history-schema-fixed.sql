-- Chat History Tables for Persistent Storage
-- Fixed version for PostgreSQL

-- Chat sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,

  -- Session info
  title VARCHAR(500),
  description TEXT,
  url_id VARCHAR(255) UNIQUE NOT NULL,

  -- Session metadata
  total_messages INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,

  -- Project association
  project_id UUID,
  artifact_id VARCHAR(255),

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- For anonymous users (before authentication)
  anonymous_id VARCHAR(255)
);

-- Indexes for chat_sessions
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_url_id ON chat_sessions(url_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_anonymous_id ON chat_sessions(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at DESC);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,

  -- Message content
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Message metadata
  model_used VARCHAR(100),
  tokens_used INTEGER DEFAULT 0,

  -- Streaming info
  stream_complete BOOLEAN DEFAULT TRUE,

  -- Tool/action calls
  tool_calls JSONB,
  artifacts JSONB,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- Anonymous session tracking
CREATE TABLE IF NOT EXISTS anonymous_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id VARCHAR(255) UNIQUE NOT NULL,

  -- Session info
  session_count INTEGER DEFAULT 0,
  last_active_at TIMESTAMP DEFAULT NOW(),

  -- Link to user if they sign up
  user_id UUID,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for anonymous_sessions
CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_anonymous_id ON anonymous_sessions(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_sessions_user_id ON anonymous_sessions(user_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_chat_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for chat_sessions
DROP TRIGGER IF EXISTS update_chat_sessions_timestamp ON chat_sessions;
CREATE TRIGGER update_chat_sessions_timestamp
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_chat_sessions_updated_at();

-- Function to update message count and last message time
CREATE OR REPLACE FUNCTION update_session_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_sessions
  SET
    total_messages = total_messages + 1,
    last_message_at = NOW(),
    updated_at = NOW()
  WHERE id = NEW.session_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session when message is added
DROP TRIGGER IF EXISTS update_session_stats ON chat_messages;
CREATE TRIGGER update_session_stats
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_session_on_message();

-- Function to claim anonymous sessions when user signs up
CREATE OR REPLACE FUNCTION claim_anonymous_sessions(
  p_anonymous_id VARCHAR(255),
  p_user_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  claimed_count INTEGER;
BEGIN
  -- Update chat sessions
  UPDATE chat_sessions
  SET user_id = p_user_id, anonymous_id = NULL
  WHERE anonymous_id = p_anonymous_id;

  GET DIAGNOSTICS claimed_count = ROW_COUNT;

  -- Update anonymous_sessions record
  UPDATE anonymous_sessions
  SET user_id = p_user_id
  WHERE anonymous_id = p_anonymous_id;

  RETURN claimed_count;
END;
$$ LANGUAGE plpgsql;
