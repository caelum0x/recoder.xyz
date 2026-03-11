# Sprint 63: Agent Knowledge Graph, Thread Auto-Tagging, Change Impact Analysis, Agent Marketplace Reviews & Session Replay

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add knowledge graph visualization linking agents-threads-tools-data, automatic thread tagging based on content analysis, change impact analysis before agent modifications, agent marketplace review and rating system, and session replay for debugging agent runs — completing the knowledge discovery, auto-organization, safe changes, community trust, and debugging features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Knowledge Graph (Tasks 1-4)

### Task 1: Knowledge Graph Schema

Create `backend/supabase/migrations/20260312200000_knowledge_graph.sql`:

```sql
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
```

### Task 2: Knowledge Graph API

Create `backend/core/knowledge/knowledge_graph_api.py` + `__init__.py`:

Router with tag `"knowledge-graph"`:
- `POST /knowledge-graph/nodes` — add node. Body: `{ node_type, node_id, label, metadata? }`. Upserts. Auth required.
- `POST /knowledge-graph/edges` — add edge. Body: `{ source_node_id, target_node_id, edge_type, weight? }`. Auth required.
- `GET /knowledge-graph` — get full graph. Query: `node_type` (filter). Returns `{ nodes[], edges[] }`. Auth required.
- `GET /knowledge-graph/node/{node_id}/connections` — get node and its direct connections. Auth required.
- `DELETE /knowledge-graph/nodes/{node_id}` — remove node (cascades edges). Auth required.
- `DELETE /knowledge-graph/edges/{edge_id}` — remove edge. Auth required.
- `POST /knowledge-graph/auto-discover` — scan agents, threads, tools and auto-populate graph nodes and edges. Auth required.
- `GET /knowledge-graph/stats` — node/edge counts by type. Auth required.

Register in `backend/api.py`.

### Task 3: Knowledge Graph Frontend

Create `recoder-agents/src/lib/api/knowledge-graph.ts` and `recoder-agents/src/hooks/knowledge/use-knowledge-graph.ts`.

Hooks: `useKnowledgeGraph(nodeType?)`, `useAddNode()`, `useAddEdge()`, `useNodeConnections(nodeId)`, `useRemoveNode()`, `useRemoveEdge()`, `useAutoDiscover()`, `useGraphStats()`.

### Task 4: Knowledge Graph UI

Create `recoder-agents/src/app/(dashboard)/knowledge/graph/page.tsx`:

Knowledge graph page:
- Graph visualization: nodes as colored circles by type (agent=blue, thread=green, tool=purple, kb=amber, prompt=pink, workflow=cyan, tag=gray, data_source=orange), edges as lines with type labels
- CSS/SVG force-directed-like layout: nodes positioned in clusters by type
- Click node to see connections panel
- Node type filter toggles
- "Auto-Discover" button to populate graph
- Stats sidebar: node/edge counts by type
- Search by node label
- Legend with node type colors and edge type descriptions

---

## Phase 2: Thread Auto-Tagging (Tasks 5-8)

### Task 5: Auto-Tagging Schema

Create `backend/supabase/migrations/20260312200001_thread_auto_tags.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_auto_tag_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tag_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('keyword', 'agent', 'tool_used', 'message_count', 'sentiment', 'regex')),
  rule_config JSONB NOT NULL DEFAULT '{}',
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  match_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS thread_auto_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  rule_id UUID REFERENCES thread_auto_tag_rules(id) ON DELETE SET NULL,
  confidence NUMERIC(3,2) DEFAULT 1.0,
  applied_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, tag_name)
);

CREATE INDEX idx_auto_tag_rules_user ON thread_auto_tag_rules(user_id);
CREATE INDEX idx_auto_tags_thread ON thread_auto_tags(thread_id);
CREATE INDEX idx_auto_tags_user ON thread_auto_tags(user_id, applied_at DESC);
CREATE INDEX idx_auto_tags_tag ON thread_auto_tags(tag_name);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Auto-Tagging API

Create `backend/core/threads/thread_auto_tagging_api.py`:

Router with tag `"thread-auto-tagging"`:
- `POST /auto-tags/rules` — create rule. Body: `{ tag_name, rule_type, rule_config, color? }`. Rule configs: keyword → `{ keywords: [] }`, agent → `{ agent_id }`, tool_used → `{ tool_name }`, message_count → `{ min?, max? }`, sentiment → `{ sentiment }`, regex → `{ pattern }`. Auth required.
- `GET /auto-tags/rules` — list rules with match count. Auth required.
- `PATCH /auto-tags/rules/{rule_id}` — update. Auth required.
- `DELETE /auto-tags/rules/{rule_id}` — delete. Auth required.
- `POST /auto-tags/apply/{thread_id}` — apply rules to thread. Evaluates all active rules against thread data. Auth required.
- `POST /auto-tags/apply-all` — apply rules to all recent threads. Auth required.
- `GET /auto-tags/threads/{thread_id}` — get auto-tags for thread. Auth required.
- `GET /auto-tags/stats` — tag distribution, most common tags, rule effectiveness. Auth required.

Register in `backend/api.py`.

### Task 7: Auto-Tagging Frontend

Create `recoder-agents/src/lib/api/thread-auto-tagging.ts` and `recoder-agents/src/hooks/threads/use-thread-auto-tagging.ts`.

Hooks: `useAutoTagRules()`, `useCreateAutoTagRule()`, `useUpdateAutoTagRule()`, `useDeleteAutoTagRule()`, `useApplyAutoTags()`, `useApplyAllAutoTags()`, `useThreadAutoTags(threadId)`, `useAutoTagStats()`.

### Task 8: Auto-Tagging UI

Create `recoder-agents/src/app/(dashboard)/settings/auto-tagging/page.tsx`:

Auto-tagging settings page:
- Rule list: tag name (colored), rule type badge, config summary, match count, active toggle, edit/delete
- "New Rule" dialog: tag name, color picker, rule type selector, dynamic config form per type
- "Apply to All Threads" button with confirmation
- Tag distribution chart: bar chart of most common auto-tags
- Rule effectiveness: match counts per rule
- Preview: test a rule against sample threads

---

## Phase 3: Change Impact Analysis (Tasks 9-12)

### Task 9: Impact Analysis Schema

Create `backend/supabase/migrations/20260312200002_change_impact_analysis.sql`:

```sql
CREATE TABLE IF NOT EXISTS change_impact_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('config_update', 'tool_change', 'prompt_change', 'model_change', 'workflow_change', 'dependency_change')),
  change_description TEXT NOT NULL,
  proposed_changes JSONB DEFAULT '{}',
  impact_assessment JSONB DEFAULT '{}',
  risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  affected_items JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_impact_user ON change_impact_analyses(user_id, created_at DESC);
CREATE INDEX idx_impact_agent ON change_impact_analyses(agent_id);
CREATE INDEX idx_impact_status ON change_impact_analyses(status);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Impact Analysis API

Create `backend/core/agents/change_impact_api.py`:

Router with tag `"change-impact"`:
- `POST /agents/{agent_id}/impact-analysis` — run analysis. Body: `{ change_type, change_description, proposed_changes }`. Analyzes: dependent agents, active threads, deployment slots, routing rules, workflows referencing this agent. Returns risk assessment and affected items. Auth required.
- `GET /agents/{agent_id}/impact-analyses` — list analyses for agent. Auth required.
- `GET /impact-analyses/{analysis_id}` — get detail. Auth required.
- `PATCH /impact-analyses/{analysis_id}` — approve/reject. Body: `{ status }`. Auth required.
- `GET /impact-analyses/stats` — stats: total, by risk level, by change type, approval rate. Auth required.

Register in `backend/api.py`.

### Task 11: Impact Analysis Frontend

Create `recoder-agents/src/lib/api/change-impact.ts` and `recoder-agents/src/hooks/agents/use-change-impact.ts`.

Hooks: `useRunImpactAnalysis()`, `useAgentImpactAnalyses(agentId)`, `useImpactAnalysisDetail(id)`, `useUpdateImpactStatus()`, `useImpactStats()`.

### Task 12: Impact Analysis UI

Create `recoder-agents/src/components/agents/impact-analysis-dialog.tsx`:

Impact analysis dialog (triggered before major agent changes):
- Change description form: change type selector, description, proposed changes summary
- "Analyze Impact" button
- Results display: risk level badge (colored), affected items list (agents, threads, workflows, deployments), impact assessment text
- Approve/Reject buttons
- Analysis history panel

Wire into agent config page as a pre-change gate.

---

## Phase 4: Agent Marketplace Reviews (Tasks 13-16)

### Task 13: Reviews Schema

Create `backend/supabase/migrations/20260312200003_marketplace_reviews.sql`:

```sql
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  content TEXT,
  pros TEXT[] DEFAULT '{}',
  cons TEXT[] DEFAULT '{}',
  is_verified BOOLEAN DEFAULT false,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE TABLE IF NOT EXISTS review_helpful_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  review_id UUID NOT NULL REFERENCES marketplace_reviews(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, review_id)
);

CREATE INDEX idx_reviews_agent ON marketplace_reviews(agent_id, created_at DESC);
CREATE INDEX idx_reviews_user ON marketplace_reviews(user_id);
CREATE INDEX idx_reviews_rating ON marketplace_reviews(rating);
CREATE INDEX idx_helpful_votes_review ON review_helpful_votes(review_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Reviews API

Create `backend/core/marketplace/marketplace_reviews_api.py` + `__init__.py`:

Router with tag `"marketplace-reviews"`:
- `POST /marketplace/reviews` — create review. Body: `{ agent_id, rating, title?, content?, pros?, cons? }`. Auth required.
- `GET /marketplace/reviews` — list reviews. Query: `agent_id`, `rating`, `sort_by` (recent, highest, most_helpful), `limit`, `offset`. Auth required.
- `PATCH /marketplace/reviews/{review_id}` — update own review. Auth required.
- `DELETE /marketplace/reviews/{review_id}` — delete own review. Auth required.
- `POST /marketplace/reviews/{review_id}/helpful` — vote helpful. Toggle. Auth required.
- `GET /marketplace/agents/{agent_id}/rating-summary` — avg rating, count by star, total reviews. Auth required.

Register in `backend/api.py`.

### Task 15: Reviews Frontend

Create `recoder-agents/src/lib/api/marketplace-reviews.ts` and `recoder-agents/src/hooks/marketplace/use-marketplace-reviews.ts`.

Hooks: `useMarketplaceReviews(filters)`, `useCreateReview()`, `useUpdateReview()`, `useDeleteReview()`, `useVoteHelpful()`, `useRatingSummary(agentId)`.

### Task 16: Reviews UI

Create `recoder-agents/src/components/marketplace/review-section.tsx`:

Review section component:
- Rating summary: average star display, star distribution bars (5→1), total reviews
- Review list: star rating, title, content, pros/cons lists, helpful count, vote button, date
- "Write Review" dialog: star rating selector (1-5 clickable stars), title, content textarea, pros (add/remove list), cons (add/remove list)
- Sort by: Recent, Highest Rating, Most Helpful
- Edit/delete own reviews
- Verified badge on reviews from users who've used the agent

Wire into marketplace agent detail pages.

---

## Phase 5: Session Replay (Tasks 17-20)

### Task 17: Session Replay Schema

Create `backend/supabase/migrations/20260312200004_session_replay.sql`:

```sql
CREATE TABLE IF NOT EXISTS session_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  agent_id TEXT,
  run_id TEXT,
  events JSONB NOT NULL DEFAULT '[]',
  event_count INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'recording' CHECK (status IN ('recording', 'completed', 'archived')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS session_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES session_recordings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_recordings_user ON session_recordings(user_id, started_at DESC);
CREATE INDEX idx_recordings_thread ON session_recordings(thread_id);
CREATE INDEX idx_recordings_agent ON session_recordings(agent_id);
CREATE INDEX idx_bookmarks_recording ON session_bookmarks(recording_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Session Replay API

Create `backend/core/debugging/session_replay_api.py` + `__init__.py`:

Router with tag `"session-replay"`:
- `POST /sessions/recordings` — start recording. Body: `{ thread_id, agent_id?, run_id? }`. Auth required.
- `POST /sessions/recordings/{recording_id}/events` — append events. Body: `{ events: [{ type, data, timestamp }] }`. Auth required.
- `POST /sessions/recordings/{recording_id}/complete` — mark recording complete. Auth required.
- `GET /sessions/recordings` — list recordings. Query: `thread_id`, `agent_id`, `status`, `limit`. Auth required.
- `GET /sessions/recordings/{recording_id}` — get recording with events. Auth required.
- `POST /sessions/recordings/{recording_id}/bookmarks` — add bookmark. Body: `{ event_index, label, note? }`. Auth required.
- `GET /sessions/recordings/{recording_id}/bookmarks` — list bookmarks. Auth required.

Register in `backend/api.py`.

### Task 19: Session Replay Frontend

Create `recoder-agents/src/lib/api/session-replay.ts` and `recoder-agents/src/hooks/debugging/use-session-replay.ts`.

Hooks: `useStartRecording()`, `useAppendEvents()`, `useCompleteRecording()`, `useRecordings(filters)`, `useRecordingDetail(recordingId)`, `useAddBookmark()`, `useRecordingBookmarks(recordingId)`.

### Task 20: Session Replay UI

Create `recoder-agents/src/app/(dashboard)/debugging/session-replay/page.tsx`:

Session replay page:
- Recording list: thread name, agent, event count, duration, status badge, date
- Replay viewer: timeline scrubber, play/pause controls, speed selector (0.5x, 1x, 2x, 4x)
- Event timeline: vertical list of events with timestamps, type icons, data previews
- Bookmarks: markers on timeline, bookmark list sidebar, add bookmark button
- Event detail: click event to see full data JSON
- Filter by agent and thread

Wire into debugging section.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 63 completion status.

---
