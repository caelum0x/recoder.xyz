-- Ensure conversation analytics queue exists in drifted environments.
-- This is intentionally idempotent and safe to run even when the original
-- conversation analytics migration has already been applied.

CREATE TABLE IF NOT EXISTS public.conversation_analytics_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES public.threads(thread_id) ON DELETE CASCADE,
    agent_run_id UUID,
    account_id UUID NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Ensure expected columns exist if a partial/manual table was created.
ALTER TABLE public.conversation_analytics_queue
    ADD COLUMN IF NOT EXISTS thread_id UUID,
    ADD COLUMN IF NOT EXISTS agent_run_id UUID,
    ADD COLUMN IF NOT EXISTS account_id UUID,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS attempts INTEGER,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Backfill sane defaults for drifted partial schemas.
ALTER TABLE public.conversation_analytics_queue
    ALTER COLUMN status SET DEFAULT 'pending',
    ALTER COLUMN attempts SET DEFAULT 0,
    ALTER COLUMN created_at SET DEFAULT NOW();

UPDATE public.conversation_analytics_queue
SET status = 'pending'
WHERE status IS NULL;

UPDATE public.conversation_analytics_queue
SET attempts = 0
WHERE attempts IS NULL;

UPDATE public.conversation_analytics_queue
SET created_at = NOW()
WHERE created_at IS NULL;

-- Add FK to threads if missing.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'conversation_analytics_queue_thread_id_fkey'
          AND conrelid = 'public.conversation_analytics_queue'::regclass
    ) THEN
        ALTER TABLE public.conversation_analytics_queue
            ADD CONSTRAINT conversation_analytics_queue_thread_id_fkey
            FOREIGN KEY (thread_id)
            REFERENCES public.threads(thread_id)
            ON DELETE CASCADE;
    END IF;
END $$;

-- Ensure queue indexes used by status endpoint and workers.
CREATE INDEX IF NOT EXISTS idx_analytics_queue_status
    ON public.conversation_analytics_queue(status, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_queue_thread
    ON public.conversation_analytics_queue(thread_id);

CREATE INDEX IF NOT EXISTS idx_analytics_queue_pending
    ON public.conversation_analytics_queue(status, attempts, created_at)
    WHERE status = 'pending';

-- Ensure retry helper function exists.
CREATE OR REPLACE FUNCTION public.increment_analytics_attempts(queue_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.conversation_analytics_queue
    SET attempts = attempts + 1
    WHERE id = queue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure RLS + read policy for super admins.
ALTER TABLE public.conversation_analytics_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'conversation_analytics_queue'
          AND policyname = 'super_admin_select_queue'
    ) THEN
        CREATE POLICY "super_admin_select_queue"
            ON public.conversation_analytics_queue
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1 FROM public.user_roles
                    WHERE user_roles.user_id = auth.uid()
                    AND user_roles.role = 'super_admin'
                )
            );
    END IF;
END $$;
