-- Initialize recoder-chat database schema
-- This creates all necessary tables for authentication and chat functionality

-- Users table
CREATE TABLE IF NOT EXISTS "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(64) NOT NULL,
  "password" VARCHAR(64),
  "name" VARCHAR(255),
  "image" TEXT,
  "emailVerified" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Chat table
CREATE TABLE IF NOT EXISTS "Chat" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMP NOT NULL,
  "title" TEXT NOT NULL,
  "userId" UUID NOT NULL REFERENCES "User"("id"),
  "visibility" VARCHAR(10) NOT NULL DEFAULT 'private' CHECK ("visibility" IN ('public', 'private'))
);

-- Message table (v2)
CREATE TABLE IF NOT EXISTS "Message_v2" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "chatId" UUID NOT NULL REFERENCES "Chat"("id"),
  "role" VARCHAR NOT NULL,
  "parts" JSON NOT NULL,
  "attachments" JSON NOT NULL,
  "createdAt" TIMESTAMP NOT NULL
);

-- Vote table (v2)
CREATE TABLE IF NOT EXISTS "Vote_v2" (
  "chatId" UUID NOT NULL REFERENCES "Chat"("id"),
  "messageId" UUID NOT NULL REFERENCES "Message_v2"("id"),
  "isUpvoted" BOOLEAN NOT NULL,
  PRIMARY KEY ("chatId", "messageId")
);

-- Document table
CREATE TABLE IF NOT EXISTS "Document" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" TIMESTAMP NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT,
  "kind" VARCHAR(50) NOT NULL DEFAULT 'text',
  "userId" UUID NOT NULL REFERENCES "User"("id")
);

-- Suggestion table
CREATE TABLE IF NOT EXISTS "Suggestion" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "documentId" UUID NOT NULL REFERENCES "Document"("id"),
  "documentCreatedAt" TIMESTAMP NOT NULL,
  "originalText" TEXT NOT NULL,
  "suggestedText" TEXT NOT NULL,
  "description" TEXT,
  "isResolved" BOOLEAN NOT NULL DEFAULT false,
  "userId" UUID NOT NULL REFERENCES "User"("id"),
  "createdAt" TIMESTAMP NOT NULL
);

-- Stream table
CREATE TABLE IF NOT EXISTS "Stream" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "chatId" UUID NOT NULL REFERENCES "Chat"("id"),
  "messageId" UUID NOT NULL REFERENCES "Message_v2"("id"),
  "data" JSON NOT NULL,
  "createdAt" TIMESTAMP NOT NULL,
  "finishedAt" TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_chat_userId" ON "Chat"("userId");
CREATE INDEX IF NOT EXISTS "idx_message_chatId" ON "Message_v2"("chatId");
CREATE INDEX IF NOT EXISTS "idx_vote_chatId" ON "Vote_v2"("chatId");
CREATE INDEX IF NOT EXISTS "idx_document_userId" ON "Document"("userId");
CREATE INDEX IF NOT EXISTS "idx_suggestion_documentId" ON "Suggestion"("documentId");
CREATE INDEX IF NOT EXISTS "idx_stream_chatId" ON "Stream"("chatId");

-- Add unique constraint on user email
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_email_unique" ON "User"("email");

-- NextAuth/Auth.js required tables for session management

-- Session table for NextAuth
CREATE TABLE IF NOT EXISTS "session" (
  "sessionToken" VARCHAR(255) PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "expires" TIMESTAMP NOT NULL
);

-- Account table for OAuth providers (Google, GitHub, etc.)
CREATE TABLE IF NOT EXISTS "account" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" VARCHAR(255) NOT NULL,
  "provider" VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" VARCHAR(255),
  "scope" VARCHAR(255),
  "id_token" TEXT,
  "session_state" VARCHAR(255),
  UNIQUE("provider", "providerAccountId")
);

-- Verification token table for magic links and email verification
CREATE TABLE IF NOT EXISTS "verification_token" (
  "identifier" VARCHAR(255) NOT NULL,
  "token" VARCHAR(255) NOT NULL,
  "expires" TIMESTAMP NOT NULL,
  PRIMARY KEY ("identifier", "token")
);

-- Rename User table columns to match NextAuth schema (lowercase)
ALTER TABLE "User" RENAME TO "user_temp";

CREATE TABLE IF NOT EXISTS "user" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(255),
  "emailVerified" TIMESTAMP,
  "password" VARCHAR(255),
  "name" VARCHAR(255),
  "image" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Copy data from old table if it exists
INSERT INTO "user" (id, email, "emailVerified", password, name, image, "createdAt", "updatedAt")
SELECT id, email, "emailVerified", password, name, image, "createdAt", "updatedAt"
FROM "user_temp"
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS "user_temp";

-- Create indexes for session and account tables
CREATE INDEX IF NOT EXISTS "idx_session_userId" ON "session"("userId");
CREATE INDEX IF NOT EXISTS "idx_account_userId" ON "account"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_email_unique_lowercase" ON "user"("email");
