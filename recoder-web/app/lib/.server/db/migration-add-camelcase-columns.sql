-- Migration: Add camelCase column aliases for TypeScript compatibility
-- Run this on your database to fix the column naming mismatch

-- Add camelCase columns to chat_sessions if they don't exist
DO $$ 
BEGIN
  -- userId column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'userId') THEN
    ALTER TABLE chat_sessions ADD COLUMN "userId" UUID;
    UPDATE chat_sessions SET "userId" = user_id WHERE "userId" IS NULL;
    -- Create trigger to keep them in sync
    CREATE OR REPLACE FUNCTION sync_chat_sessions_user_id()
    RETURNS TRIGGER AS $func$
    BEGIN
      IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW."userId" IS NOT NULL AND NEW.user_id IS NULL THEN
          NEW.user_id = NEW."userId";
        ELSIF NEW.user_id IS NOT NULL AND NEW."userId" IS NULL THEN
          NEW."userId" = NEW.user_id;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;

  -- urlId column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'urlId') THEN
    ALTER TABLE chat_sessions ADD COLUMN "urlId" VARCHAR(255);
    UPDATE chat_sessions SET "urlId" = url_id WHERE "urlId" IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_urlId ON chat_sessions("urlId");
  END IF;

  -- anonymousId column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'anonymousId') THEN
    ALTER TABLE chat_sessions ADD COLUMN "anonymousId" VARCHAR(255);
    UPDATE chat_sessions SET "anonymousId" = anonymous_id WHERE "anonymousId" IS NULL;
  END IF;

  -- totalMessages column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'totalMessages') THEN
    ALTER TABLE chat_sessions ADD COLUMN "totalMessages" INTEGER DEFAULT 0;
    UPDATE chat_sessions SET "totalMessages" = total_messages WHERE "totalMessages" IS NULL OR "totalMessages" = 0;
  END IF;

  -- lastMessageAt column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'lastMessageAt') THEN
    ALTER TABLE chat_sessions ADD COLUMN "lastMessageAt" TIMESTAMP;
    UPDATE chat_sessions SET "lastMessageAt" = last_message_at WHERE "lastMessageAt" IS NULL;
  END IF;

  -- projectId column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'projectId') THEN
    ALTER TABLE chat_sessions ADD COLUMN "projectId" UUID;
    UPDATE chat_sessions SET "projectId" = project_id WHERE "projectId" IS NULL;
  END IF;

  -- artifactId column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'artifactId') THEN
    ALTER TABLE chat_sessions ADD COLUMN "artifactId" VARCHAR(255);
    UPDATE chat_sessions SET "artifactId" = artifact_id WHERE "artifactId" IS NULL;
  END IF;

  -- createdAt column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'createdAt') THEN
    ALTER TABLE chat_sessions ADD COLUMN "createdAt" TIMESTAMP DEFAULT NOW();
    UPDATE chat_sessions SET "createdAt" = created_at WHERE "createdAt" IS NULL;
  END IF;

  -- updatedAt column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'updatedAt') THEN
    ALTER TABLE chat_sessions ADD COLUMN "updatedAt" TIMESTAMP DEFAULT NOW();
    UPDATE chat_sessions SET "updatedAt" = updated_at WHERE "updatedAt" IS NULL;
  END IF;
END $$;

-- Add camelCase columns to chat_messages if they don't exist
DO $$ 
BEGIN
  -- sessionId column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'sessionId') THEN
    ALTER TABLE chat_messages ADD COLUMN "sessionId" UUID;
    UPDATE chat_messages SET "sessionId" = session_id WHERE "sessionId" IS NULL;
  END IF;

  -- createdAt column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'createdAt') THEN
    ALTER TABLE chat_messages ADD COLUMN "createdAt" TIMESTAMP DEFAULT NOW();
    UPDATE chat_messages SET "createdAt" = created_at WHERE "createdAt" IS NULL;
  END IF;
  
  -- modelUsed column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'modelUsed') THEN
    ALTER TABLE chat_messages ADD COLUMN "modelUsed" VARCHAR(100);
    UPDATE chat_messages SET "modelUsed" = model_used WHERE "modelUsed" IS NULL;
  END IF;
  
  -- tokensUsed column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'tokensUsed') THEN
    ALTER TABLE chat_messages ADD COLUMN "tokensUsed" INTEGER DEFAULT 0;
    UPDATE chat_messages SET "tokensUsed" = tokens_used WHERE "tokensUsed" IS NULL;
  END IF;
  
  -- streamComplete column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'streamComplete') THEN
    ALTER TABLE chat_messages ADD COLUMN "streamComplete" BOOLEAN DEFAULT TRUE;
    UPDATE chat_messages SET "streamComplete" = stream_complete WHERE "streamComplete" IS NULL;
  END IF;
  
  -- toolCalls column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'toolCalls') THEN
    ALTER TABLE chat_messages ADD COLUMN "toolCalls" JSONB;
    UPDATE chat_messages SET "toolCalls" = tool_calls WHERE "toolCalls" IS NULL;
  END IF;
END $$;

-- Create or replace trigger to sync snake_case and camelCase columns
CREATE OR REPLACE FUNCTION sync_chat_sessions_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync userId/user_id
  IF NEW."userId" IS DISTINCT FROM NEW.user_id THEN
    IF NEW."userId" IS NOT NULL THEN
      NEW.user_id = NEW."userId";
    ELSIF NEW.user_id IS NOT NULL THEN
      NEW."userId" = NEW.user_id;
    END IF;
  END IF;
  
  -- Sync urlId/url_id
  IF NEW."urlId" IS DISTINCT FROM NEW.url_id THEN
    IF NEW."urlId" IS NOT NULL THEN
      NEW.url_id = NEW."urlId";
    ELSIF NEW.url_id IS NOT NULL THEN
      NEW."urlId" = NEW.url_id;
    END IF;
  END IF;
  
  -- Sync anonymousId/anonymous_id
  IF NEW."anonymousId" IS DISTINCT FROM NEW.anonymous_id THEN
    IF NEW."anonymousId" IS NOT NULL THEN
      NEW.anonymous_id = NEW."anonymousId";
    ELSIF NEW.anonymous_id IS NOT NULL THEN
      NEW."anonymousId" = NEW.anonymous_id;
    END IF;
  END IF;
  
  -- Sync totalMessages/total_messages
  IF NEW."totalMessages" IS DISTINCT FROM NEW.total_messages THEN
    IF NEW."totalMessages" IS NOT NULL THEN
      NEW.total_messages = NEW."totalMessages";
    ELSIF NEW.total_messages IS NOT NULL THEN
      NEW."totalMessages" = NEW.total_messages;
    END IF;
  END IF;
  
  -- Sync lastMessageAt/last_message_at
  IF NEW."lastMessageAt" IS DISTINCT FROM NEW.last_message_at THEN
    IF NEW."lastMessageAt" IS NOT NULL THEN
      NEW.last_message_at = NEW."lastMessageAt";
    ELSIF NEW.last_message_at IS NOT NULL THEN
      NEW."lastMessageAt" = NEW.last_message_at;
    END IF;
  END IF;
  
  -- Sync projectId/project_id
  IF NEW."projectId" IS DISTINCT FROM NEW.project_id THEN
    IF NEW."projectId" IS NOT NULL THEN
      NEW.project_id = NEW."projectId";
    ELSIF NEW.project_id IS NOT NULL THEN
      NEW."projectId" = NEW.project_id;
    END IF;
  END IF;
  
  -- Sync artifactId/artifact_id
  IF NEW."artifactId" IS DISTINCT FROM NEW.artifact_id THEN
    IF NEW."artifactId" IS NOT NULL THEN
      NEW.artifact_id = NEW."artifactId";
    ELSIF NEW.artifact_id IS NOT NULL THEN
      NEW."artifactId" = NEW.artifact_id;
    END IF;
  END IF;
  
  -- Sync createdAt/created_at
  IF NEW."createdAt" IS DISTINCT FROM NEW.created_at THEN
    IF NEW."createdAt" IS NOT NULL THEN
      NEW.created_at = NEW."createdAt";
    ELSIF NEW.created_at IS NOT NULL THEN
      NEW."createdAt" = NEW.created_at;
    END IF;
  END IF;
  
  -- Sync updatedAt/updated_at (always update to NOW on changes)
  NEW.updated_at = NOW();
  NEW."updatedAt" = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_chat_sessions_trigger ON chat_sessions;
CREATE TRIGGER sync_chat_sessions_trigger
  BEFORE INSERT OR UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION sync_chat_sessions_columns();

-- Create indexes on camelCase columns
CREATE INDEX IF NOT EXISTS idx_chat_sessions_userId ON chat_sessions("userId");
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updatedAt ON chat_sessions("updatedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_anonymousId ON chat_sessions("anonymousId");

-- Similar trigger for chat_messages
CREATE OR REPLACE FUNCTION sync_chat_messages_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."sessionId" IS DISTINCT FROM NEW.session_id THEN
    IF NEW."sessionId" IS NOT NULL THEN
      NEW.session_id = NEW."sessionId";
    ELSIF NEW.session_id IS NOT NULL THEN
      NEW."sessionId" = NEW.session_id;
    END IF;
  END IF;
  
  IF NEW."createdAt" IS DISTINCT FROM NEW.created_at THEN
    IF NEW."createdAt" IS NOT NULL THEN
      NEW.created_at = NEW."createdAt";
    ELSIF NEW.created_at IS NOT NULL THEN
      NEW."createdAt" = NEW.created_at;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_chat_messages_trigger ON chat_messages;
CREATE TRIGGER sync_chat_messages_trigger
  BEFORE INSERT OR UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION sync_chat_messages_columns();

-- Success message
DO $$ BEGIN RAISE NOTICE 'Migration complete: camelCase columns added'; END $$;
