-- Knowledge Base Entry Relationships: graph edges between KB entries
-- Access control enforced at application layer (WHERE user_id = :user_id)

CREATE TABLE IF NOT EXISTS kb_entry_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_entry_id UUID NOT NULL,
  target_entry_id UUID NOT NULL,
  relationship_type TEXT DEFAULT 'related' CHECK (relationship_type IN ('related', 'depends_on', 'references', 'contradicts', 'extends')),
  strength NUMERIC(3,2) DEFAULT 0.5,
  auto_detected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source_entry_id, target_entry_id)
);

CREATE INDEX idx_kb_rels_source ON kb_entry_relationships(source_entry_id);
CREATE INDEX idx_kb_rels_target ON kb_entry_relationships(target_entry_id);
CREATE INDEX idx_kb_rels_user ON kb_entry_relationships(user_id);
