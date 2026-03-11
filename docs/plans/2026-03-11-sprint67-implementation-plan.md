# Sprint 67: Agent Output Caching, Thread Bookmarks, Anomaly Detection, API Rate Limit Tiers & Multi-Language Prompts

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add agent output caching to avoid redundant executions, thread bookmarks for quick message-level navigation, automated anomaly detection across agent metrics, configurable API rate limit tiers per agent, and multi-language prompt variants — completing the performance optimization, navigation, proactive alerting, access control, and internationalization features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Output Caching (Tasks 1-4)

### Task 1: Output Cache Schema

Create `backend/supabase/migrations/20260312600000_agent_output_cache.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_output_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output JSONB NOT NULL DEFAULT '{}',
  output_text TEXT,
  ttl_seconds INTEGER DEFAULT 3600,
  hit_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, cache_key)
);

CREATE TABLE IF NOT EXISTS cache_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  default_ttl_seconds INTEGER DEFAULT 3600,
  max_entries INTEGER DEFAULT 100,
  cache_similar_inputs BOOLEAN DEFAULT false,
  similarity_threshold NUMERIC(3,2) DEFAULT 0.9,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX idx_output_cache_agent ON agent_output_cache(agent_id, cache_key);
CREATE INDEX idx_output_cache_expires ON agent_output_cache(expires_at);
CREATE INDEX idx_output_cache_user ON agent_output_cache(user_id, created_at DESC);
CREATE INDEX idx_cache_policies_user ON cache_policies(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Output Cache API

Create `backend/core/agents/agent_output_cache_api.py`:

Router with tag `"agent-output-cache"`:
- `POST /agents/{agent_id}/cache` — store output. Body: `{ cache_key, input_hash, output, output_text?, ttl_seconds? }`. Upserts. Auth required.
- `GET /agents/{agent_id}/cache/{cache_key}` — lookup. Increments hit_count. Returns 404 if expired. Auth required.
- `DELETE /agents/{agent_id}/cache/{cache_key}` — invalidate entry. Auth required.
- `DELETE /agents/{agent_id}/cache` — clear all cache for agent. Auth required.
- `GET /agents/{agent_id}/cache/stats` — total entries, hit count sum, expired count, cache size. Auth required.
- `GET /agents/{agent_id}/cache/policy` — get cache policy for agent. Auth required.
- `PUT /agents/{agent_id}/cache/policy` — set policy. Body: `{ is_enabled, default_ttl_seconds?, max_entries?, cache_similar_inputs?, similarity_threshold? }`. Upserts. Auth required.
- `POST /cache/cleanup` — delete all expired entries across all agents for user. Returns deleted count. Auth required.

Register in `backend/api.py`.

### Task 3: Create frontend API + hooks files.
### Task 4: Create cache management screen in agent config with cache stats, entry list, policy config, manual invalidation.

---

## Phase 2: Thread Bookmarks (Tasks 5-8)

### Task 5: Thread Bookmarks Schema

Create `backend/supabase/migrations/20260312600001_thread_bookmarks.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_message_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  bookmark_label TEXT,
  bookmark_note TEXT,
  bookmark_color TEXT DEFAULT '#f59e0b',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, message_index)
);

CREATE TABLE IF NOT EXISTS bookmark_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  collection_name TEXT NOT NULL,
  description TEXT,
  bookmark_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bookmarks_user ON thread_message_bookmarks(user_id, created_at DESC);
CREATE INDEX idx_bookmarks_thread ON thread_message_bookmarks(thread_id);
CREATE INDEX idx_bookmark_collections_user ON bookmark_collections(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Bookmarks API

Create `backend/core/threads/thread_bookmarks_api.py`:

Router with tag `"thread-bookmarks"`:
- `POST /threads/{thread_id}/bookmarks` — create bookmark. Body: `{ message_index, bookmark_label?, bookmark_note?, bookmark_color? }`. Auth required.
- `GET /threads/{thread_id}/bookmarks` — list bookmarks for thread. Auth required.
- `PATCH /bookmarks/{bookmark_id}` — update label, note, color. Auth required.
- `DELETE /bookmarks/{bookmark_id}` — delete. Auth required.
- `GET /bookmarks` — list all bookmarks across threads. Query: `limit`, `offset`. Auth required.
- `POST /bookmark-collections` — create collection. Body: `{ collection_name, description?, bookmark_ids? }`. Auth required.
- `GET /bookmark-collections` — list collections. Auth required.
- `PATCH /bookmark-collections/{collection_id}` — update. Auth required.
- `DELETE /bookmark-collections/{collection_id}` — delete. Auth required.

Register in `backend/api.py`.

### Task 7: Create frontend API + hooks files.
### Task 8: Create bookmarks sidebar panel with bookmark list, message jump links, color coding, collection organizer.

---

## Phase 3: Anomaly Detection (Tasks 9-12)

### Task 9: Anomaly Detection Schema

Create `backend/supabase/migrations/20260312600002_anomaly_detection.sql`:

```sql
CREATE TABLE IF NOT EXISTS anomaly_detection_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_type TEXT NOT NULL,
  agent_id TEXT,
  detection_method TEXT DEFAULT 'zscore' CHECK (detection_method IN ('zscore', 'iqr', 'threshold', 'percentage_change')),
  sensitivity NUMERIC(3,2) DEFAULT 2.0,
  window_hours INTEGER DEFAULT 24,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, metric_type, agent_id)
);

CREATE TABLE IF NOT EXISTS detected_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  config_id UUID REFERENCES anomaly_detection_configs(id) ON DELETE SET NULL,
  agent_id TEXT,
  metric_type TEXT NOT NULL,
  observed_value NUMERIC(12,4) NOT NULL,
  expected_value NUMERIC(12,4),
  deviation_score NUMERIC(8,4),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
  description TEXT,
  detected_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_anomaly_configs_user ON anomaly_detection_configs(user_id);
CREATE INDEX idx_anomalies_user ON detected_anomalies(user_id, detected_at DESC);
CREATE INDEX idx_anomalies_status ON detected_anomalies(status, detected_at DESC);
CREATE INDEX idx_anomalies_agent ON detected_anomalies(agent_id, detected_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Anomaly Detection API

Create `backend/core/monitoring/anomaly_detection_api.py`:

Router with tag `"anomaly-detection"`:
- `POST /anomaly/configs` — create detection config. Auth required.
- `GET /anomaly/configs` — list configs. Auth required.
- `PATCH /anomaly/configs/{config_id}` — update. Auth required.
- `DELETE /anomaly/configs/{config_id}` — delete. Auth required.
- `POST /anomaly/scan` — run anomaly scan across all active configs. Computes z-score from recent metric values (simulated). Creates anomaly records. Returns new anomaly count. Auth required.
- `GET /anomaly/detected` — list anomalies. Query: `status`, `severity`, `agent_id`, `limit`. Auth required.
- `PATCH /anomaly/detected/{anomaly_id}` — update status (acknowledge, resolve, mark false_positive). Auth required.
- `GET /anomaly/stats` — open count, by severity, by metric, resolution rate. Auth required.

Register in `backend/api.py`.

### Task 11: Create frontend API + hooks files.
### Task 12: Create anomaly detection page with config list, scan button, anomaly feed with severity badges, status workflow.

---

## Phase 4: API Rate Limit Tiers (Tasks 13-16)

### Task 13: Rate Limit Tiers Schema

Create `backend/supabase/migrations/20260312600003_api_rate_limit_tiers.sql`:

```sql
CREATE TABLE IF NOT EXISTS rate_limit_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tier_name TEXT NOT NULL,
  requests_per_minute INTEGER DEFAULT 60,
  requests_per_hour INTEGER DEFAULT 1000,
  requests_per_day INTEGER DEFAULT 10000,
  burst_allowance INTEGER DEFAULT 10,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, tier_name)
);

CREATE TABLE IF NOT EXISTS agent_rate_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  tier_id UUID NOT NULL REFERENCES rate_limit_tiers(id) ON DELETE CASCADE,
  override_rpm INTEGER,
  override_rph INTEGER,
  is_active BOOLEAN DEFAULT true,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE TABLE IF NOT EXISTS rate_limit_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  tier_id UUID REFERENCES rate_limit_tiers(id),
  requests_in_window INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT now(),
  window_type TEXT DEFAULT 'minute' CHECK (window_type IN ('minute', 'hour', 'day')),
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tier_user ON rate_limit_tiers(user_id);
CREATE INDEX idx_assignment_agent ON agent_rate_assignments(agent_id);
CREATE INDEX idx_assignment_user ON agent_rate_assignments(user_id);
CREATE INDEX idx_rate_usage_user ON rate_limit_usage(user_id, window_start DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Rate Limit Tiers API

Create `backend/core/agents/rate_limit_tiers_api.py`:

Router with tag `"rate-limit-tiers"`:
- `POST /rate-tiers` — create tier. Body: `{ tier_name, requests_per_minute, requests_per_hour?, requests_per_day?, burst_allowance?, is_default? }`. Auth required.
- `GET /rate-tiers` — list tiers. Auth required.
- `PATCH /rate-tiers/{tier_id}` — update. Auth required.
- `DELETE /rate-tiers/{tier_id}` — delete. Auth required.
- `POST /agents/{agent_id}/rate-tier` — assign tier to agent. Body: `{ tier_id, override_rpm?, override_rph? }`. Auth required.
- `GET /agents/{agent_id}/rate-tier` — get agent's tier assignment. Auth required.
- `DELETE /agents/{agent_id}/rate-tier` — remove assignment (reverts to default). Auth required.
- `GET /rate-tiers/usage` — usage stats per tier: agent count, request volume. Auth required.

Register in `backend/api.py`.

### Task 15: Create frontend API + hooks files.
### Task 16: Create rate limit tiers page with tier list, request limit config, agent assignments, usage stats.

---

## Phase 5: Multi-Language Prompts (Tasks 17-20)

### Task 17: Multi-Language Prompts Schema

Create `backend/supabase/migrations/20260312600004_multilang_prompts.sql`:

```sql
CREATE TABLE IF NOT EXISTS multilang_prompt_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  prompt_name TEXT NOT NULL,
  base_language TEXT DEFAULT 'en',
  description TEXT,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, prompt_name)
);

CREATE TABLE IF NOT EXISTS multilang_prompt_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_set_id UUID NOT NULL REFERENCES multilang_prompt_sets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  language_code TEXT NOT NULL,
  content TEXT NOT NULL,
  is_machine_translated BOOLEAN DEFAULT false,
  quality_score NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (prompt_set_id, language_code)
);

CREATE INDEX idx_multilang_sets_user ON multilang_prompt_sets(user_id, created_at DESC);
CREATE INDEX idx_multilang_variants_set ON multilang_prompt_variants(prompt_set_id, language_code);
CREATE INDEX idx_multilang_variants_lang ON multilang_prompt_variants(language_code);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Multi-Language Prompts API

Create `backend/core/prompts/multilang_prompts_api.py`:

Router with tag `"multilang-prompts"`:
- `POST /prompts/multilang` — create prompt set. Body: `{ prompt_name, base_language?, description?, category? }`. Auth required.
- `GET /prompts/multilang` — list prompt sets. Query: `category`, `search`, `limit`. Auth required.
- `GET /prompts/multilang/{prompt_set_id}` — get set with all variants. Auth required.
- `DELETE /prompts/multilang/{prompt_set_id}` — delete set. Auth required.
- `POST /prompts/multilang/{prompt_set_id}/variants` — add/update variant. Body: `{ language_code, content, is_machine_translated? }`. Upserts. Auth required.
- `GET /prompts/multilang/{prompt_set_id}/variants` — list variants. Auth required.
- `DELETE /prompts/multilang/{prompt_set_id}/variants/{language_code}` — delete variant. Auth required.
- `GET /prompts/multilang/{prompt_set_id}/variant/{language_code}` — get single variant. Returns base language if not found. Auth required.
- `GET /prompts/multilang/stats` — language distribution, coverage rates, sets needing translation. Auth required.

Register in `backend/api.py`.

### Task 19: Create frontend API + hooks files.
### Task 20: Create multi-language prompts page with prompt set list, language coverage grid, variant editor, language selector.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 67 completion status.

---
