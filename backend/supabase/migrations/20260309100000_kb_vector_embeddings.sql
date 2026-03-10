BEGIN;

-- Add embedding column to knowledge_base_entries
-- Uses same 1536-dim vectors as thread search (OpenAI text-embedding-3-small)
ALTER TABLE knowledge_base_entries
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_kb_entries_embedding
  ON knowledge_base_entries USING hnsw (embedding vector_cosine_ops);

-- Semantic search function: combines vector similarity with full-text search
CREATE OR REPLACE FUNCTION search_knowledge_base_semantic(
  p_account_id UUID,
  p_query_embedding vector(1536),
  p_query_text TEXT DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_similarity_threshold REAL DEFAULT 0.3
)
RETURNS TABLE (
  entry_id UUID,
  folder_id UUID,
  folder_name VARCHAR(255),
  filename VARCHAR(255),
  summary TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ,
  similarity REAL,
  match_type TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_matches AS (
    -- Semantic similarity results
    SELECT
      kbe.entry_id,
      kbe.folder_id,
      kbf.name AS folder_name,
      kbe.filename,
      kbe.summary,
      kbe.file_size,
      kbe.created_at,
      (1 - (kbe.embedding <=> p_query_embedding))::REAL AS similarity,
      'semantic'::TEXT AS match_type
    FROM knowledge_base_entries kbe
    JOIN knowledge_base_folders kbf ON kbe.folder_id = kbf.folder_id
    LEFT JOIN agent_knowledge_entry_assignments akea
      ON kbe.entry_id = akea.entry_id AND akea.agent_id = p_agent_id
    WHERE kbe.account_id = p_account_id
      AND kbe.is_active = TRUE
      AND kbe.embedding IS NOT NULL
      AND (p_agent_id IS NULL OR akea.agent_id IS NOT NULL)
      AND (1 - (kbe.embedding <=> p_query_embedding)) >= p_similarity_threshold
    ORDER BY kbe.embedding <=> p_query_embedding
    LIMIT p_limit
  ),
  fulltext_matches AS (
    -- Full-text search results (only if query text is provided)
    SELECT
      kbe.entry_id,
      kbe.folder_id,
      kbf.name AS folder_name,
      kbe.filename,
      kbe.summary,
      kbe.file_size,
      kbe.created_at,
      ts_rank(kbe.search_vector, plainto_tsquery('english', p_query_text))::REAL AS similarity,
      'fulltext'::TEXT AS match_type
    FROM knowledge_base_entries kbe
    JOIN knowledge_base_folders kbf ON kbe.folder_id = kbf.folder_id
    LEFT JOIN agent_knowledge_entry_assignments akea
      ON kbe.entry_id = akea.entry_id AND akea.agent_id = p_agent_id
    WHERE p_query_text IS NOT NULL
      AND kbe.account_id = p_account_id
      AND kbe.is_active = TRUE
      AND (p_agent_id IS NULL OR akea.agent_id IS NOT NULL)
      AND (
        kbe.search_vector @@ plainto_tsquery('english', p_query_text)
        OR kbe.filename ILIKE '%' || p_query_text || '%'
      )
    LIMIT p_limit
  ),
  combined AS (
    SELECT * FROM vector_matches
    UNION ALL
    SELECT * FROM fulltext_matches
  )
  -- Deduplicate by entry_id, keeping highest similarity
  SELECT DISTINCT ON (c.entry_id)
    c.entry_id,
    c.folder_id,
    c.folder_name,
    c.filename,
    c.summary,
    c.file_size,
    c.created_at,
    c.similarity,
    c.match_type
  FROM combined c
  ORDER BY c.entry_id, c.similarity DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION search_knowledge_base_semantic(UUID, vector(1536), TEXT, UUID, INTEGER, REAL)
  TO authenticated, service_role;

COMMIT;
