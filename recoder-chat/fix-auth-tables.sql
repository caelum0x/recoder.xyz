-- Fix authentication tables to work with existing User table

-- First, drop the user_temp if it exists
DROP TABLE IF EXISTS "user_temp" CASCADE;

-- Create the lowercase user table that references the existing User table
CREATE TABLE IF NOT EXISTS "user" (
  "id" UUID PRIMARY KEY,
  "email" VARCHAR(255),
  "emailVerified" TIMESTAMP,
  "password" VARCHAR(255),
  "name" VARCHAR(255),
  "image" TEXT
);

-- Copy all data from User to user
INSERT INTO "user" (id, email, "emailVerified", password, name, image)
SELECT id, email, "emailVerified", password, name, image
FROM "User"
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  "emailVerified" = EXCLUDED."emailVerified",
  password = EXCLUDED.password,
  name = EXCLUDED.name,
  image = EXCLUDED.image;

-- Update session table to reference lowercase user
ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_userId_fkey";
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

-- Update account table to reference lowercase user
ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_userId_fkey";
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

-- Create indexes
CREATE INDEX IF NOT EXISTS "idx_session_userId" ON "session"("userId");
CREATE INDEX IF NOT EXISTS "idx_account_userId" ON "account"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_email_unique_lowercase" ON "user"("email");

-- Ensure email is unique and not null for user table
ALTER TABLE "user" ALTER COLUMN "email" SET NOT NULL;

SELECT 'Authentication tables fixed successfully!' AS status;
