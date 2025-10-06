-- Create all tables with lowercase names for NextAuth compatibility

-- User table (lowercase)
CREATE TABLE IF NOT EXISTS "user" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL,
  "password" VARCHAR(255),
  "name" VARCHAR(255),
  "image" TEXT,
  "emailVerified" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Chat table (lowercase)
CREATE TABLE IF NOT EXISTS "chat" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "title" TEXT NOT NULL,
  "userId" UUID NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "visibility" VARCHAR(10) NOT NULL DEFAULT 'private' CHECK ("visibility" IN ('public', 'private'))
);

-- Message table (v2)
CREATE TABLE IF NOT EXISTS "Message_v2" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "chatId" UUID NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
  "role" VARCHAR NOT NULL,
  "parts" JSON NOT NULL,
  "attachments" JSON NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Vote table (v2)
CREATE TABLE IF NOT EXISTS "Vote_v2" (
  "chatId" UUID NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
  "messageId" UUID NOT NULL REFERENCES "Message_v2"("id") ON DELETE CASCADE,
  "isUpvoted" BOOLEAN NOT NULL,
  PRIMARY KEY ("chatId", "messageId")
);

-- Document table
CREATE TABLE IF NOT EXISTS "Document" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "title" TEXT NOT NULL,
  "content" TEXT,
  "kind" VARCHAR(50) NOT NULL DEFAULT 'text',
  "userId" UUID NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  PRIMARY KEY ("id", "createdAt")
);

-- Suggestion table
CREATE TABLE IF NOT EXISTS "Suggestion" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "documentId" UUID NOT NULL,
  "documentCreatedAt" TIMESTAMP NOT NULL,
  "originalText" TEXT NOT NULL,
  "suggestedText" TEXT NOT NULL,
  "description" TEXT,
  "isResolved" BOOLEAN NOT NULL DEFAULT false,
  "userId" UUID NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Stream table
CREATE TABLE IF NOT EXISTS "Stream" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "chatId" UUID NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- NextAuth session table
CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" UUID NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expires" TIMESTAMP NOT NULL
);

-- NextAuth account table
CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" UUID NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  UNIQUE("provider", "providerAccountId")
);

-- NextAuth verification token table
CREATE TABLE IF NOT EXISTS "verification_token" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires" TIMESTAMP NOT NULL,
  UNIQUE("identifier", "token")
);

-- Create indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_email_unique" ON "user"("email");
CREATE INDEX IF NOT EXISTS "idx_chat_userId" ON "chat"("userId");
CREATE INDEX IF NOT EXISTS "idx_message_chatId" ON "Message_v2"("chatId");
CREATE INDEX IF NOT EXISTS "idx_vote_chatId" ON "Vote_v2"("chatId");
CREATE INDEX IF NOT EXISTS "idx_document_userId" ON "Document"("userId");
CREATE INDEX IF NOT EXISTS "idx_suggestion_documentId" ON "Suggestion"("documentId");
CREATE INDEX IF NOT EXISTS "idx_stream_chatId" ON "Stream"("chatId");
CREATE INDEX IF NOT EXISTS "idx_session_userId" ON "session"("userId");
CREATE INDEX IF NOT EXISTS "idx_account_userId" ON "account"("userId");

-- Verify tables
SELECT 'user' as table_name, count(*) as row_count FROM "user"
UNION ALL
SELECT 'chat', count(*) FROM "chat"
UNION ALL
SELECT 'session', count(*) FROM "session"
UNION ALL
SELECT 'account', count(*) FROM "account"
UNION ALL
SELECT 'Message_v2', count(*) FROM "Message_v2";
