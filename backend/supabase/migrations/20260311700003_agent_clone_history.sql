-- Sprint 58 Phase 4: Agent Clone Wizard Extensions
-- Extends agent_clone_history with wizard-specific columns for section-level cloning

-- Add new columns for wizard-style cloning
ALTER TABLE agent_clone_history
  ADD COLUMN IF NOT EXISTS target_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS clone_options JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cloned_sections TEXT[] DEFAULT '{}';

-- Backfill target_agent_id from existing cloned_agent_id
UPDATE agent_clone_history
SET target_agent_id = cloned_agent_id
WHERE target_agent_id IS NULL AND cloned_agent_id IS NOT NULL;

-- Add index for clone history by user + created_at (may already exist; IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_clone_history_user_created
  ON agent_clone_history(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
