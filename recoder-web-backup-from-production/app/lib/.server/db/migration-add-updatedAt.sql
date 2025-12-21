-- Migration: Add updatedAt column to chat_messages
-- Run this against your Neon database

-- Add updatedAt column to chat_messages (the error says it's missing)
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();

-- Also ensure chat_sessions has the camelCase version the code expects
-- (schema has updated_at but code uses updatedAt)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'updated_at') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'updatedAt') 
  THEN
    ALTER TABLE chat_sessions RENAME COLUMN updated_at TO "updatedAt";
  END IF;
END $$;

-- Add updatedAt to chat_sessions if it doesn't exist at all
ALTER TABLE chat_sessions 
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW();
