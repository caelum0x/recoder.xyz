-- Fix feedback table: ensure message_id column exists and remove broken FK references
-- The original migration referenced basejump.accounts which doesn't exist on self-hosted PostgreSQL

BEGIN;

-- Create the feedback table if it doesn't exist (without broken FK references)
CREATE TABLE IF NOT EXISTS feedback (
    feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID,
    message_id UUID,
    account_id UUID NOT NULL,
    rating DECIMAL(2,1) NOT NULL CHECK (rating >= 0.5 AND rating <= 5.0),
    feedback_text TEXT,
    help_improve BOOLEAN DEFAULT TRUE,
    context JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Add message_id column if it doesn't exist (in case table was created without it)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'feedback' AND column_name = 'message_id'
    ) THEN
        ALTER TABLE feedback ADD COLUMN message_id UUID;
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_feedback_thread_id ON feedback(thread_id);
CREATE INDEX IF NOT EXISTS idx_feedback_message_id ON feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_feedback_account_id ON feedback(account_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- Create unique constraint for message-specific feedback
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_unique
    ON feedback(thread_id, message_id, account_id)
    WHERE thread_id IS NOT NULL AND message_id IS NOT NULL;

COMMIT;
