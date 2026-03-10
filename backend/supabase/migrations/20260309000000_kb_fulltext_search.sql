BEGIN;

-- Add full-text search vector column to knowledge_base_entries
ALTER TABLE knowledge_base_entries
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing rows
UPDATE knowledge_base_entries
SET search_vector = to_tsvector('english',
  COALESCE(filename, '') || ' ' || COALESCE(summary, '')
);

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_kb_entries_search_vector
  ON knowledge_base_entries USING GIN (search_vector);

-- Trigger to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION kb_entries_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.filename, '') || ' ' || COALESCE(NEW.summary, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'kb_entries_search_vector_trigger') THEN
    CREATE TRIGGER kb_entries_search_vector_trigger
      BEFORE INSERT OR UPDATE OF filename, summary
      ON knowledge_base_entries
      FOR EACH ROW
      EXECUTE FUNCTION kb_entries_search_vector_update();
  END IF;
END $$;

-- Search function: returns matching entries with relevance ranking
CREATE OR REPLACE FUNCTION search_knowledge_base(
  p_account_id UUID,
  p_query TEXT,
  p_agent_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  entry_id UUID,
  folder_id UUID,
  folder_name VARCHAR(255),
  filename VARCHAR(255),
  summary TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ,
  rank REAL
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  tsquery_val tsquery;
BEGIN
  -- Build tsquery: split words and join with & for AND matching,
  -- also add prefix matching with :* for partial word support
  tsquery_val := plainto_tsquery('english', p_query);

  RETURN QUERY
  SELECT
    kbe.entry_id,
    kbe.folder_id,
    kbf.name AS folder_name,
    kbe.filename,
    kbe.summary,
    kbe.file_size,
    kbe.created_at,
    ts_rank(kbe.search_vector, tsquery_val) AS rank
  FROM knowledge_base_entries kbe
  JOIN knowledge_base_folders kbf ON kbe.folder_id = kbf.folder_id
  LEFT JOIN agent_knowledge_entry_assignments akea
    ON kbe.entry_id = akea.entry_id AND akea.agent_id = p_agent_id
  WHERE kbe.account_id = p_account_id
    AND kbe.is_active = TRUE
    AND (
      kbe.search_vector @@ tsquery_val
      OR kbe.filename ILIKE '%' || p_query || '%'
      OR kbe.summary ILIKE '%' || p_query || '%'
    )
    AND (p_agent_id IS NULL OR akea.agent_id IS NOT NULL)
  ORDER BY rank DESC, kbe.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_knowledge_base(UUID, TEXT, UUID, INTEGER) TO authenticated, service_role;

COMMIT;
