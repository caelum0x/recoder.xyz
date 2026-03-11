CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('agent', 'thread', 'tool', 'knowledge_base', 'prompt', 'workflow', 'tag', 'data_source')),
  node_id TEXT NOT NULL,
  label TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, node_type, node_id)
);
CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_node_id UUID NOT NULL REFERENCES knowledge_graph_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES knowledge_graph_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('uses', 'produces', 'depends_on', 'related_to', 'contains', 'triggers', 'references')),
  weight NUMERIC(5,2) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source_node_id, target_node_id, edge_type)
);
CREATE INDEX idx_kg_nodes_user ON knowledge_graph_nodes(user_id, node_type);
CREATE INDEX idx_kg_nodes_type ON knowledge_graph_nodes(node_type, node_id);
CREATE INDEX idx_kg_edges_source ON knowledge_graph_edges(source_node_id);
CREATE INDEX idx_kg_edges_target ON knowledge_graph_edges(target_node_id);
CREATE INDEX idx_kg_edges_user ON knowledge_graph_edges(user_id);
-- Access control enforced at application layer (WHERE user_id = :user_id)
