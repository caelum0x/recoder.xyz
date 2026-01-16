-- Fix chat_sessions foreign key to reference user table (better-auth) instead of users table (CLI auth)
-- This resolves: "insert or update on table chat_sessions violates foreign key constraint chat_sessions_userId_fkey"

-- Drop the old FK constraint (may have different names depending on how it was created)
ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_user_id_fkey;
ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS "chat_sessions_userId_fkey";

-- Rename column if needed (SQL file used user_id, code uses userId)
-- Check if user_id exists and rename to userId for consistency with the code
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'user_id') THEN
    ALTER TABLE chat_sessions RENAME COLUMN user_id TO "userId";
  END IF;
END $$;

-- Add new FK constraint referencing user table (better-auth) with ON DELETE SET NULL
-- This allows chats to persist even if user is deleted
ALTER TABLE chat_sessions 
ADD CONSTRAINT "chat_sessions_userId_fkey" 
FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE SET NULL;

-- Verify the change
SELECT 
  tc.constraint_name, 
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'chat_sessions' 
  AND tc.constraint_type = 'FOREIGN KEY';
