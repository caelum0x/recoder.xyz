-- Sprint 64 Phase 2: Thread Merge
-- Tracks merge operations between conversation threads

CREATE TABLE IF NOT EXISTS thread_merges (
    merge_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               TEXT NOT NULL,
    source_thread_id      TEXT NOT NULL,
    target_thread_id      TEXT NOT NULL,
    merge_strategy        TEXT NOT NULL DEFAULT 'append' CHECK (merge_strategy IN ('append', 'interleave', 'summarize')),
    merged_message_count  INTEGER NOT NULL DEFAULT 0,
    conflict_count        INTEGER NOT NULL DEFAULT 0,
    status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'reverted')),
    merge_metadata        JSONB NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_thread_merges_user_id ON thread_merges (user_id);
CREATE INDEX IF NOT EXISTS idx_thread_merges_source ON thread_merges (source_thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_merges_target ON thread_merges (target_thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_merges_status ON thread_merges (status);
CREATE INDEX IF NOT EXISTS idx_thread_merges_created_at ON thread_merges (created_at DESC);
