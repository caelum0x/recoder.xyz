-- Add annotation_replies table and resolve support for thread_annotations
-- The thread_annotations table already exists from migration 20260311600001

-- Add resolved_at column if not already present
ALTER TABLE thread_annotations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Extend the annotation_type check constraint to support additional types
-- Drop and re-add the constraint to include 'action_item', 'warning', and 'highlight'
-- The existing constraint allows: 'note', 'highlight', 'question', 'action', 'bug', 'insight'
-- Sprint 65 adds: 'action_item', 'warning'
DO $$ BEGIN
  ALTER TABLE thread_annotations DROP CONSTRAINT IF EXISTS thread_annotations_annotation_type_check;
  ALTER TABLE thread_annotations ADD CONSTRAINT thread_annotations_annotation_type_check
    CHECK (annotation_type IN ('note', 'question', 'action_item', 'highlight', 'warning', 'action', 'bug', 'insight'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- Create annotation_replies table
CREATE TABLE IF NOT EXISTS annotation_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id UUID NOT NULL REFERENCES thread_annotations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_annotation_replies ON annotation_replies(annotation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_annotations_action_items ON thread_annotations(annotation_type) WHERE NOT is_resolved;
-- Access control enforced at application layer (WHERE user_id = :user_id)
