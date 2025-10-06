-- Migrate all tables to lowercase for NextAuth compatibility
-- This script safely migrates existing data to lowercase table names

-- Step 1: Drop existing lowercase tables if they exist (from previous incomplete migrations)
DROP TABLE IF EXISTS "session" CASCADE;
DROP TABLE IF EXISTS "account" CASCADE;
DROP TABLE IF EXISTS "verification_token" CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;
DROP TABLE IF EXISTS "chat" CASCADE;

-- Step 2: Rename all uppercase tables to lowercase
-- User table
ALTER TABLE IF EXISTS "User" RENAME TO "user";

-- Chat table
ALTER TABLE IF EXISTS "Chat" RENAME TO "chat";

-- Session table (if uppercase exists)
ALTER TABLE IF EXISTS "Session" RENAME TO "session";

-- Account table (if uppercase exists)
ALTER TABLE IF EXISTS "Account" RENAME TO "account";

-- VerificationToken table (if uppercase exists)
ALTER TABLE IF EXISTS "VerificationToken" RENAME TO "verification_token";

-- Step 3: Create session table if it doesn't exist
CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" UUID NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expires" TIMESTAMP NOT NULL
);

-- Step 4: Create account table if it doesn't exist
CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY,
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

-- Step 5: Create verification_token table if it doesn't exist
CREATE TABLE IF NOT EXISTS "verification_token" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires" TIMESTAMP NOT NULL,
  UNIQUE("identifier", "token")
);

-- Step 6: Create indexes
CREATE INDEX IF NOT EXISTS "idx_session_userId" ON "session"("userId");
CREATE INDEX IF NOT EXISTS "idx_account_userId" ON "account"("userId");
CREATE INDEX IF NOT EXISTS "idx_user_email_unique" ON "user"("email");
CREATE INDEX IF NOT EXISTS "idx_chat_userId" ON "chat"("userId");

-- Verify tables exist
SELECT 'user' as table_name, count(*) as row_count FROM "user"
UNION ALL
SELECT 'chat', count(*) FROM "chat"
UNION ALL
SELECT 'session', count(*) FROM "session"
UNION ALL
SELECT 'account', count(*) FROM "account";
