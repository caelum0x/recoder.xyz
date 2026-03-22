# Sprint 73: Agent Memory Profiles, Thread Replay, Capacity Planning, Marketplace Reviews & Integration Health

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add persistent agent memory profiles for cross-thread context retention, thread replay for re-running conversations from checkpoints, capacity planning with usage projection tools, user reviews and ratings for shared agents, and an integration health dashboard for monitoring external service connectivity — completing the memory, reproducibility, planning, social proof, and operational health features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Memory Profiles (Tasks 1-4)

### Task 1: Agent Memory Profiles Schema

Create `backend/supabase/migrations/20260312903000_agent_memory_profiles.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_memory_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id, profile_name)
);

CREATE TABLE IF NOT EXISTS memory_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES agent_memory_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  slot_key TEXT NOT NULL,
  slot_value TEXT NOT NULL,
  value_type TEXT DEFAULT 'text' CHECK (value_type IN ('text', 'number', 'json', 'list')),
  description TEXT,
  is_persistent BOOLEAN DEFAULT true,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  access_count INTEGER DEFAULT 0,
  UNIQUE (profile_id, slot_key)
);

CREATE TABLE IF NOT EXISTS memory_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES memory_slots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  access_type TEXT DEFAULT 'read' CHECK (access_type IN ('read', 'write', 'delete')),
  old_value TEXT,
  new_value TEXT,
  accessed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_memory_profiles_agent ON agent_memory_profiles(agent_id);
CREATE INDEX idx_memory_profiles_user ON agent_memory_profiles(user_id);
CREATE INDEX idx_memory_slots_profile ON memory_slots(profile_id, slot_key);
CREATE INDEX idx_memory_access_log_slot ON memory_access_log(slot_id, accessed_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Agent Memory Profiles API

Create `backend/core/agents/agent_memory_profiles_api.py`:

Router with tag `"agent-memory-profiles"`:
- `POST /agents/{agent_id}/memory-profiles` — create profile. Body: `{ profile_name, is_active? }`. Auth required.
- `GET /agents/{agent_id}/memory-profiles` — list profiles. Auth required.
- `GET /agents/{agent_id}/memory-profiles/{profile_id}` — get profile with all slots. Auth required.
- `PATCH /agents/{agent_id}/memory-profiles/{profile_id}` — update name, is_active. Auth required.
- `DELETE /agents/{agent_id}/memory-profiles/{profile_id}` — delete. Auth required.
- `POST /memory-profiles/{profile_id}/slots` — set slot. Body: `{ slot_key, slot_value, value_type?, description?, is_persistent? }`. Upserts. Logs access as 'write'. Updates access_count, last_updated_at. Auth required.
- `GET /memory-profiles/{profile_id}/slots` — list all slots. Auth required.
- `GET /memory-profiles/{profile_id}/slots/{slot_key}` — get slot. Increments access_count, logs 'read'. Auth required.
- `DELETE /memory-profiles/{profile_id}/slots/{slot_key}` — delete slot. Logs 'delete'. Auth required.
- `GET /memory-profiles/{profile_id}/access-log` — list access log. Query: `limit` (default 50). Auth required.

Register in `backend/api.py`.

### Task 3: Create frontend API + hooks files.
### Task 4: Create memory profiles screen in agent config with profile list, slot key-value editor, access log, value type badges.

---

## Phase 2: Thread Replay (Tasks 5-8)

### Task 5: Thread Replay Schema

Create `backend/supabase/migrations/20260312903001_thread_replay.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  checkpoint_name TEXT,
  message_index INTEGER NOT NULL,
  messages_snapshot JSONB NOT NULL DEFAULT '[]',
  agent_config_snapshot JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS thread_replays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_thread_id TEXT NOT NULL,
  checkpoint_id UUID REFERENCES thread_checkpoints(id) ON DELETE SET NULL,
  replay_thread_id TEXT,
  agent_id TEXT,
  agent_config_override JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  comparison_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_thread_checkpoints_thread ON thread_checkpoints(thread_id, created_at DESC);
CREATE INDEX idx_thread_checkpoints_user ON thread_checkpoints(user_id, created_at DESC);
CREATE INDEX idx_thread_replays_source ON thread_replays(source_thread_id);
CREATE INDEX idx_thread_replays_user ON thread_replays(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Replay API

Create `backend/core/threads/thread_replay_api.py`:

Router with tag `"thread-replay"`:
- `POST /threads/{thread_id}/checkpoints` — create checkpoint. Body: `{ checkpoint_name?, message_index, messages_snapshot, agent_config_snapshot? }`. Auth required.
- `GET /threads/{thread_id}/checkpoints` — list checkpoints. Auth required.
- `DELETE /threads/{thread_id}/checkpoints/{checkpoint_id}` — delete. Auth required.
- `POST /threads/{thread_id}/replay` — create replay. Body: `{ checkpoint_id, agent_id?, agent_config_override?, replay_thread_id? }`. Sets status='completed' immediately (simulated). Auth required.
- `GET /threads/{thread_id}/replays` — list replays for thread. Auth required.
- `GET /replays/{replay_id}` — get replay detail with checkpoint. Auth required.
- `PATCH /replays/{replay_id}` — update comparison_notes, status. Auth required.
- `DELETE /replays/{replay_id}` — delete. Auth required.

Register in `backend/api.py`.

### Task 7: Create frontend API + hooks files.
### Task 8: Create thread replay page with checkpoint list, create replay button, replay list with comparison notes, status badges.

---

## Phase 3: Capacity Planning (Tasks 9-12)

### Task 9: Capacity Planning Schema

Create `backend/supabase/migrations/20260312903002_capacity_planning.sql`:

```sql
CREATE TABLE IF NOT EXISTS capacity_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_name TEXT NOT NULL,
  current_value NUMERIC(12,4) NOT NULL,
  max_capacity NUMERIC(12,4),
  unit TEXT DEFAULT 'count',
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capacity_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_name TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  metric_projections JSONB DEFAULT '[]',
  growth_assumptions JSONB DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, plan_name)
);

CREATE TABLE IF NOT EXISTS capacity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_name TEXT NOT NULL,
  threshold_pct INTEGER DEFAULT 80,
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, metric_name)
);

CREATE INDEX idx_capacity_metrics_user ON capacity_metrics(user_id, recorded_at DESC);
CREATE INDEX idx_capacity_metrics_name ON capacity_metrics(metric_name, recorded_at DESC);
CREATE INDEX idx_capacity_plans_user ON capacity_plans(user_id, created_at DESC);
CREATE INDEX idx_capacity_alerts_user ON capacity_alerts(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Capacity Planning API

Create `backend/core/monitoring/capacity_planning_api.py`:

Router with tag `"capacity-planning"`:
- `POST /capacity/metrics` — record metric. Body: `{ metric_name, current_value, max_capacity?, unit? }`. Auth required.
- `GET /capacity/metrics` — list latest per metric name (DISTINCT ON metric_name ORDER BY recorded_at DESC). Auth required.
- `GET /capacity/metrics/{metric_name}/history` — history for metric. Query: `days` (default 30). Auth required.
- `POST /capacity/plans` — create plan. Body: `{ plan_name, description?, target_date?, metric_projections?, growth_assumptions?, recommendations? }`. Auth required.
- `GET /capacity/plans` — list plans. Auth required.
- `GET /capacity/plans/{plan_id}` — get detail. Auth required.
- `PATCH /capacity/plans/{plan_id}` — update. Auth required.
- `DELETE /capacity/plans/{plan_id}` — delete. Auth required.
- `POST /capacity/alerts` — create alert. Body: `{ metric_name, threshold_pct?, is_active? }`. Upserts. Auth required.
- `GET /capacity/alerts` — list alerts with current usage pct (current_value/max_capacity*100 from latest metric). Auth required.
- `POST /capacity/check` — check all metrics against alert thresholds. Returns triggered alerts. Auth required.

Register in `backend/api.py`.

### Task 11: Create frontend API + hooks files.
### Task 12: Create capacity planning page with metric gauges, history charts, plans list, alert config.

---

## Phase 4: Marketplace Reviews (Tasks 13-16)

### Task 13: Marketplace Reviews Schema

Create `backend/supabase/migrations/20260312903003_marketplace_reviews.sql`:

```sql
CREATE TABLE IF NOT EXISTS marketplace_agent_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  listing_title TEXT NOT NULL,
  listing_description TEXT,
  category TEXT DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  price_type TEXT DEFAULT 'free' CHECK (price_type IN ('free', 'paid', 'freemium')),
  is_published BOOLEAN DEFAULT false,
  install_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  rating_avg NUMERIC(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES marketplace_agent_listings(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  body TEXT,
  is_verified_purchase BOOLEAN DEFAULT false,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (listing_id, reviewer_user_id)
);

CREATE INDEX idx_marketplace_listings_user ON marketplace_agent_listings(user_id);
CREATE INDEX idx_marketplace_listings_published ON marketplace_agent_listings(is_published, rating_avg DESC);
CREATE INDEX idx_marketplace_listings_category ON marketplace_agent_listings(category);
CREATE INDEX idx_marketplace_reviews_listing ON marketplace_reviews(listing_id, created_at DESC);
CREATE INDEX idx_marketplace_reviews_rating ON marketplace_reviews(listing_id, rating);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Marketplace Reviews API

Create `backend/core/agents/marketplace_reviews_api.py`:

Router with tag `"marketplace-reviews"`:
- `POST /marketplace/listings` — create listing. Body: `{ agent_id, listing_title, listing_description?, category?, tags?, price_type?, is_published? }`. Auth required.
- `GET /marketplace/listings` — list published listings. Query: `category`, `price_type`, `search` (ILIKE title/description), `limit`. Returns published + own unpublished. Auth required.
- `GET /marketplace/listings/{listing_id}` — get detail. Increments view_count. Auth required.
- `PATCH /marketplace/listings/{listing_id}` — update (own only). Auth required.
- `DELETE /marketplace/listings/{listing_id}` — delete (own only). Auth required.
- `POST /marketplace/listings/{listing_id}/install` — increment install_count. Auth required.
- `POST /marketplace/listings/{listing_id}/reviews` — submit review. Body: `{ rating, title?, body? }`. Upserts. Recalculates listing rating_avg, rating_count. Auth required.
- `GET /marketplace/listings/{listing_id}/reviews` — list reviews sorted by created_at DESC. Auth required.
- `POST /marketplace/reviews/{review_id}/helpful` — increment helpful_count. Auth required.

Register in `backend/api.py`.

### Task 15: Create frontend API + hooks files.
### Task 16: Create marketplace page with listing grid, star ratings, review submission, category filter, install button.

---

## Phase 5: Integration Health (Tasks 17-20)

### Task 17: Integration Health Schema

Create `backend/supabase/migrations/20260312903004_integration_health.sql`:

```sql
CREATE TABLE IF NOT EXISTS integration_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint_name TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  integration_type TEXT DEFAULT 'webhook' CHECK (integration_type IN ('webhook', 'api', 'oauth', 'database', 'stream')),
  check_interval_minutes INTEGER DEFAULT 60,
  timeout_seconds INTEGER DEFAULT 10,
  expected_status_code INTEGER DEFAULT 200,
  auth_header TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, endpoint_name)
);

CREATE TABLE IF NOT EXISTS integration_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES integration_endpoints(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'down', 'timeout')),
  response_time_ms INTEGER,
  status_code INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_uptime (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint_id UUID NOT NULL REFERENCES integration_endpoints(id) ON DELETE CASCADE,
  uptime_pct NUMERIC(5,2) DEFAULT 100,
  total_checks INTEGER DEFAULT 0,
  failed_checks INTEGER DEFAULT 0,
  avg_response_ms INTEGER DEFAULT 0,
  last_status TEXT DEFAULT 'healthy',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, endpoint_id)
);

CREATE INDEX idx_integration_endpoints_user ON integration_endpoints(user_id);
CREATE INDEX idx_integration_health_endpoint ON integration_health_checks(endpoint_id, checked_at DESC);
CREATE INDEX idx_integration_uptime_user ON integration_uptime(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Integration Health API

Create `backend/core/monitoring/integration_health_api.py`:

Router with tag `"integration-health"`:
- `POST /integrations/endpoints` — register endpoint. Body: `{ endpoint_name, endpoint_url, integration_type?, check_interval_minutes?, timeout_seconds?, expected_status_code?, auth_header?, is_active? }`. Auth required.
- `GET /integrations/endpoints` — list endpoints with latest uptime. Auth required.
- `PATCH /integrations/endpoints/{endpoint_id}` — update. Auth required.
- `DELETE /integrations/endpoints/{endpoint_id}` — delete. Auth required.
- `POST /integrations/endpoints/{endpoint_id}/check` — run health check. Simulate: import random; response_time_ms = random.randint(20, 3000); if response_time_ms > timeout_seconds*1000: status='timeout'; elif response_time_ms > 2000: status='degraded'; else: status='healthy'. Insert health check. Upsert integration_uptime. Returns result. Auth required.
- `GET /integrations/endpoints/{endpoint_id}/history` — list check history. Query: `limit` (default 50). Auth required.
- `GET /integrations/overview` — all endpoints with uptime summary. Returns list with uptime_pct, last_status, avg_response_ms. Auth required.
- `GET /integrations/stats` — total endpoints, healthy count, degraded count, down count, overall avg uptime. Auth required.

Register in `backend/api.py`.

### Task 19: Create frontend API + hooks files.
### Task 20: Create integration health dashboard with endpoint status grid, uptime history sparklines, check-now buttons, register endpoint form.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 73 completion status.

---
