-- Sprint 51 Phase 5: Global Search Index
-- Materialised search index for fast cross-resource search.
-- gin_trgm_ops requires the pg_trgm extension.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm extension already exists or cannot be created: %', SQLERRM;
END
$$;

CREATE TABLE IF NOT EXISTS search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN (
    'agent', 'thread', 'prompt', 'knowledge_entry',
    'template', 'webhook', 'schedule', 'test_case'
  )),
  resource_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_preview TEXT,
  tags TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (resource_type, resource_id)
);

CREATE INDEX idx_search_index_user ON search_index(user_id);
CREATE INDEX idx_search_index_type ON search_index(resource_type);
CREATE INDEX idx_search_index_title_trgm ON search_index USING gin (title gin_trgm_ops);

-- Access control enforced at application layer (WHERE user_id = :user_id)
