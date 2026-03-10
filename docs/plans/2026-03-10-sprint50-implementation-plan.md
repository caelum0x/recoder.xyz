# Sprint 50: Agent Dependency Graph, Conversation Insights, API Rate Limit Dashboard, Template Marketplace Reviews & Incident Tracker

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add agent dependency/relationship visualization, AI-powered conversation insights extraction, API rate limit monitoring dashboard, marketplace template reviews/ratings, and incident tracking for failed runs — completing the architecture visibility, intelligence, governance, community, and reliability features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Dependency Graph (Tasks 1-4)

### Task 1: Agent Dependency Schema

Create `backend/supabase/migrations/20260310900000_agent_dependencies.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_agent_id TEXT NOT NULL,
  target_agent_id TEXT NOT NULL,
  dependency_type TEXT DEFAULT 'calls' CHECK (dependency_type IN ('calls', 'chains_to', 'shares_kb', 'shares_tools', 'cloned_from')),
  description TEXT,
  is_auto_detected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source_agent_id, target_agent_id, dependency_type)
);

CREATE INDEX idx_agent_deps_source ON agent_dependencies(source_agent_id);
CREATE INDEX idx_agent_deps_target ON agent_dependencies(target_agent_id);
CREATE INDEX idx_agent_deps_user ON agent_dependencies(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Agent Dependency API

Create `backend/core/agents/agent_dependency_api.py`:

Router with tag `"agent-dependencies"`:
- `POST /agents/dependencies` — create dependency. Body: `{ source_agent_id, target_agent_id, dependency_type?, description? }`. Auth required.
- `GET /agents/dependencies` — list all dependencies. Query: `agent_id` (filter by source or target). Auth required.
- `DELETE /agents/dependencies/{dep_id}` — delete. Auth required.
- `GET /agents/dependency-graph` — full graph: nodes (agents with name, health score), edges (dependencies with type). Auth required.
- `POST /agents/dependencies/auto-detect` — auto-detect dependencies from clone history, shared KB, shared tools. Auth required.

Register in `backend/api.py`.

### Task 3: Agent Dependency Frontend

Create `recoder-agents/src/lib/api/agent-dependencies.ts` and `recoder-agents/src/hooks/agents/use-agent-dependencies.ts`.

Hooks: `useAgentDependencies(agentId?)`, `useCreateDependency()`, `useDeleteDependency()`, `useAgentDependencyGraph()`, `useAutoDetectDependencies()`.

### Task 4: Agent Dependency Graph UI

Create `recoder-agents/src/app/(dashboard)/agents/dependencies/page.tsx`:

Agent dependency graph page:
- SVG graph visualization (similar pattern to KB graph view)
- Nodes: agent cards with name + health badge color
- Edges: colored by dependency type (calls=blue, chains=purple, shares_kb=green, shares_tools=amber, cloned=gray)
- Click node: show agent details panel
- "Add Dependency" mode: click two agents to connect
- "Auto-Detect" button to discover dependencies
- Legend for edge types
- Zoom/pan controls

---

## Phase 2: Conversation Insights (Tasks 5-8)

### Task 5: Conversation Insights Schema

Create `backend/supabase/migrations/20260310900001_conversation_insights.sql`:

```sql
CREATE TABLE IF NOT EXISTS conversation_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  agent_id TEXT,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('summary', 'key_topics', 'sentiment', 'action_items', 'questions_asked', 'tools_effectiveness')),
  content JSONB NOT NULL,
  confidence NUMERIC(3,2) DEFAULT 0.8,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (thread_id, insight_type)
);

CREATE INDEX idx_insights_thread ON conversation_insights(thread_id);
CREATE INDEX idx_insights_user ON conversation_insights(user_id);
CREATE INDEX idx_insights_agent ON conversation_insights(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Conversation Insights API

Create `backend/core/threads/conversation_insights_api.py`:

Router with tag `"conversation-insights"`:
- `GET /threads/{thread_id}/insights` — get all insights for thread. Auth required.
- `POST /threads/{thread_id}/insights/generate` — generate insights from thread messages. Extracts: summary (first/last messages), key_topics (frequent terms), sentiment (positive/negative keyword matching), action_items (lines with "TODO", "should", "need to"), questions_asked (lines ending with ?), tools_effectiveness (tool call success/failure counts). Auth required.
- `GET /insights/trending-topics` — most common topics across all threads. Auth required.
- `GET /insights/agent-effectiveness` — per-agent insight summary: avg sentiment, most common topics. Auth required.

Register in `backend/api.py`.

### Task 7: Conversation Insights Frontend

Create `recoder-agents/src/lib/api/conversation-insights.ts` and `recoder-agents/src/hooks/threads/use-conversation-insights.ts`.

Hooks: `useThreadInsights(threadId)`, `useGenerateInsights()`, `useTrendingTopics()`, `useAgentEffectiveness()`.

### Task 8: Conversation Insights UI

Create `recoder-agents/src/components/thread/conversation-insights-panel.tsx`:

Insights panel (collapsible section in thread view):
- Summary card: brief thread summary
- Key Topics: tag cloud or badge list
- Sentiment indicator: positive/neutral/negative with emoji
- Action Items: checklist
- Questions Asked: list
- Tool Effectiveness: success/fail counts per tool
- "Generate Insights" button
- Confidence badge per insight

Wire into thread header or as a sidebar panel in thread view.

---

## Phase 3: API Rate Limit Dashboard (Tasks 9-12)

### Task 9: Rate Limit Tracking Schema

Create `backend/supabase/migrations/20260310900002_api_rate_limits.sql`:

```sql
CREATE TABLE IF NOT EXISTS api_rate_limit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key_id TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  was_rate_limited BOOLEAN DEFAULT false,
  request_timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rate_limit_user ON api_rate_limit_log(user_id, request_timestamp DESC);
CREATE INDEX idx_rate_limit_key ON api_rate_limit_log(key_id, request_timestamp DESC);
CREATE INDEX idx_rate_limit_limited ON api_rate_limit_log(was_rate_limited) WHERE was_rate_limited = true;

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Rate Limit Dashboard API

Create `backend/core/developers/rate_limit_dashboard_api.py`:

Router with tag `"rate-limit-dashboard"`:
- `GET /rate-limits/usage` — current usage vs limits per key. Shows requests in current minute and day vs configured limits from api_key_permissions. Auth required.
- `GET /rate-limits/history` — request volume over time. Query: `key_id`, `hours` (default 24). Returns hourly buckets. Auth required.
- `GET /rate-limits/violations` — rate limit violations. Query: `key_id`, `limit`. Auth required.
- `GET /rate-limits/top-endpoints` — most called endpoints. Query: `key_id`, `limit`. Auth required.

Register in `backend/api.py`.

### Task 11: Rate Limit Dashboard Frontend

Create `recoder-agents/src/lib/api/rate-limits.ts` and `recoder-agents/src/hooks/developers/use-rate-limits.ts`.

Hooks: `useRateLimitUsage()`, `useRateLimitHistory(keyId, hours)`, `useRateLimitViolations(keyId)`, `useTopEndpoints(keyId)`.

### Task 12: Rate Limit Dashboard UI

Create `recoder-agents/src/app/(dashboard)/developers/rate-limits/page.tsx`:

Rate limit monitoring dashboard:
- Per-key usage gauges: requests/min and requests/day vs limits
- Request volume chart: hourly bar chart (Recharts) for last 24h
- Rate limit violations list: timestamp, endpoint, key
- Top endpoints table: endpoint, method, request count, avg latency
- Key selector dropdown

Wire into developers section navigation.

---

## Phase 4: Template Marketplace Reviews (Tasks 13-16)

### Task 13: Marketplace Review Schema

Create `backend/supabase/migrations/20260310900003_marketplace_reviews.sql`:

```sql
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  listing_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  body TEXT,
  is_verified_user BOOLEAN DEFAULT false,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS review_helpfulness (
  user_id UUID NOT NULL,
  review_id UUID NOT NULL REFERENCES marketplace_reviews(id) ON DELETE CASCADE,
  is_helpful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, review_id)
);

CREATE INDEX idx_marketplace_reviews_listing ON marketplace_reviews(listing_id);
CREATE INDEX idx_marketplace_reviews_user ON marketplace_reviews(user_id);
CREATE INDEX idx_marketplace_reviews_rating ON marketplace_reviews(listing_id, rating);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Marketplace Review API

Create `backend/core/marketplace/marketplace_reviews_api.py` + `__init__.py`:

Router with tag `"marketplace-reviews"`:
- `POST /marketplace/{listing_id}/reviews` — create/update review. Body: `{ rating, title?, body? }`. Upsert. Auth required.
- `GET /marketplace/{listing_id}/reviews` — list reviews. Query: `sort` (recent, highest, lowest, helpful). Auth required.
- `GET /marketplace/{listing_id}/reviews/summary` — avg rating, count, distribution. Auth required.
- `DELETE /marketplace/reviews/{review_id}` — delete own review. Auth required.
- `POST /marketplace/reviews/{review_id}/helpful` — mark helpful/unhelpful. Body: `{ is_helpful }`. Toggle. Auth required.

Register in `backend/api.py`.

### Task 15: Marketplace Review Frontend

Create `recoder-agents/src/lib/api/marketplace-reviews.ts` and `recoder-agents/src/hooks/marketplace/use-marketplace-reviews.ts`.

Hooks: `useListingReviews(listingId, sort)`, `useReviewSummary(listingId)`, `useCreateReview()`, `useDeleteReview()`, `useMarkHelpful()`.

### Task 16: Marketplace Review UI

Create `recoder-agents/src/components/marketplace/review-section.tsx`:

Review section for marketplace listing detail:
- Rating summary: avg stars, distribution bars, total count
- Write review: star selector, title, body textarea, submit
- Review list: stars, title, body, author, date, helpful count, helpful/unhelpful buttons
- Sort: Most Recent, Highest Rated, Most Helpful

Wire into marketplace listing detail page.

---

## Phase 5: Incident Tracker (Tasks 17-20)

### Task 17: Incident Schema

Create `backend/supabase/migrations/20260310900004_incidents.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  run_id TEXT,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  root_cause TEXT,
  resolution TEXT,
  auto_created BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_incidents_user ON agent_incidents(user_id, created_at DESC);
CREATE INDEX idx_incidents_agent ON agent_incidents(agent_id, created_at DESC);
CREATE INDEX idx_incidents_status ON agent_incidents(status) WHERE status != 'resolved';

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Incident API

Create `backend/core/monitoring/incident_api.py`:

Router with tag `"incidents"`:
- `POST /incidents` — create incident. Body: `{ agent_id, run_id?, severity?, title, description? }`. Auth required.
- `GET /incidents` — list incidents. Query: `agent_id`, `status`, `severity`, `limit`, `offset`. Auth required.
- `GET /incidents/{incident_id}` — incident detail. Auth required.
- `PATCH /incidents/{incident_id}` — update (status, root_cause, resolution). Auth required.
- `GET /incidents/stats` — open count by severity, avg resolution time, most affected agents. Auth required.

Register in `backend/api.py`.

### Task 19: Incident Frontend

Create `recoder-agents/src/lib/api/incidents.ts` and `recoder-agents/src/hooks/monitoring/use-incidents.ts`.

Hooks: `useIncidents(filters)`, `useIncident(id)`, `useCreateIncident()`, `useUpdateIncident()`, `useIncidentStats()`.

### Task 20: Incident Tracker UI

Create `recoder-agents/src/app/(dashboard)/monitoring/incidents/page.tsx`:

Incident management page:
- Stats header: Open incidents by severity (badges), avg resolution time
- Incident list: severity badge (color), title, agent name, status, created date
- Click to expand: description, run link, root cause, resolution fields, status update buttons
- "New Incident" dialog: agent selector, severity, title, description
- Filter bar: status, severity, agent
- Status workflow: Open → Investigating → Resolved/Dismissed

Wire into monitoring section navigation.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 50 completion status.

---
