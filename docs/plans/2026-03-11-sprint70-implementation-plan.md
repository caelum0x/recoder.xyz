# Sprint 70: Agent Personas, Thread Summarization, Quota Alerts, Agent Benchmarks & Plugin Registry

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add configurable agent personas for personality customization, automatic thread summarization for long conversations, quota alert rules for usage thresholds, agent benchmark runner for performance evaluation, and a plugin registry for managing reusable agent plugins — completing the personalization, context management, proactive monitoring, evaluation, and extensibility features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Personas (Tasks 1-4)

### Task 1: Agent Personas Schema

Create `backend/supabase/migrations/20260312900000_agent_personas.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  persona_name TEXT NOT NULL,
  description TEXT,
  tone TEXT DEFAULT 'professional' CHECK (tone IN ('professional', 'casual', 'friendly', 'formal', 'technical', 'creative')),
  personality_traits TEXT[] DEFAULT '{}',
  communication_style TEXT,
  language_preferences JSONB DEFAULT '{}',
  custom_instructions TEXT,
  avatar_emoji TEXT DEFAULT '🤖',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, persona_name)
);

CREATE TABLE IF NOT EXISTS agent_persona_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  persona_id UUID NOT NULL REFERENCES agent_personas(id) ON DELETE CASCADE,
  override_instructions TEXT,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX idx_agent_personas_user ON agent_personas(user_id, created_at DESC);
CREATE INDEX idx_persona_assignments_agent ON agent_persona_assignments(agent_id);
CREATE INDEX idx_persona_assignments_user ON agent_persona_assignments(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Agent Personas API

Create `backend/core/agents/agent_personas_api.py`:

Router with tag `"agent-personas"`:
- `POST /personas` — create persona. Body: `{ persona_name, description?, tone?, personality_traits?, communication_style?, language_preferences?, custom_instructions?, avatar_emoji? }`. Auth required.
- `GET /personas` — list personas. Auth required.
- `GET /personas/{persona_id}` — get detail. Auth required.
- `PATCH /personas/{persona_id}` — update. Auth required.
- `DELETE /personas/{persona_id}` — delete. Auth required.
- `POST /agents/{agent_id}/persona` — assign persona to agent. Body: `{ persona_id, override_instructions? }`. Upserts. Auth required.
- `GET /agents/{agent_id}/persona` — get agent's assigned persona. Returns persona + assignment. Auth required.
- `DELETE /agents/{agent_id}/persona` — remove persona assignment. Auth required.

Register in `backend/api.py`.

### Task 3: Create frontend API + hooks files.
### Task 4: Create personas management page with persona list, tone selector, trait tags, and agent assignment section.

---

## Phase 2: Thread Summarization (Tasks 5-8)

### Task 5: Thread Summarization Schema

Create `backend/supabase/migrations/20260312900001_thread_summarization.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  key_points TEXT[] DEFAULT '{}',
  action_items TEXT[] DEFAULT '{}',
  message_count INTEGER DEFAULT 0,
  tokens_summarized INTEGER DEFAULT 0,
  summary_type TEXT DEFAULT 'auto' CHECK (summary_type IN ('auto', 'manual', 'checkpoint')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (thread_id, summary_type)
);

CREATE TABLE IF NOT EXISTS summarization_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  auto_summarize_threshold INTEGER DEFAULT 50,
  include_key_points BOOLEAN DEFAULT true,
  include_action_items BOOLEAN DEFAULT true,
  summary_length TEXT DEFAULT 'medium' CHECK (summary_length IN ('brief', 'medium', 'detailed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_thread_summaries_thread ON thread_summaries(thread_id);
CREATE INDEX idx_thread_summaries_user ON thread_summaries(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Summarization API

Create `backend/core/threads/thread_summarization_api.py`:

Router with tag `"thread-summarization"`:
- `POST /threads/{thread_id}/summarize` — create summary. Body: `{ messages: [{role, content}], summary_type?, summary_length? }`. Generates summary by extracting first/last few messages, creates bullet points from content patterns. Returns summary with key_points and action_items (simulated extraction: action_items = lines containing "should", "need to", "must", "will", "TODO"). Auth required.
- `GET /threads/{thread_id}/summary` — get latest summary. Auth required.
- `GET /threads/{thread_id}/summaries` — list all summaries for thread. Auth required.
- `DELETE /threads/{thread_id}/summaries/{summary_id}` — delete summary. Auth required.
- `GET /summarization/config` — get user's summarization config. Returns defaults if not set. Auth required.
- `PUT /summarization/config` — update config. Body: `{ auto_summarize_threshold?, include_key_points?, include_action_items?, summary_length? }`. Upserts. Auth required.
- `GET /summarization/stats` — total summaries, threads summarized, avg message count per summary. Auth required.

Register in `backend/api.py`.

### Task 7: Create frontend API + hooks files.
### Task 8: Create thread summarization UI: SummarizeButton component for thread view + summarization settings page with config form.

---

## Phase 3: Quota Alerts (Tasks 9-12)

### Task 9: Quota Alerts Schema

Create `backend/supabase/migrations/20260312900002_quota_alerts.sql`:

```sql
CREATE TABLE IF NOT EXISTS quota_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  rule_name TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('api_calls', 'tokens', 'cost_usd', 'storage_mb', 'agents_count', 'threads_count')),
  agent_id TEXT,
  threshold_value NUMERIC(12,4) NOT NULL,
  threshold_type TEXT DEFAULT 'absolute' CHECK (threshold_type IN ('absolute', 'percentage')),
  comparison TEXT DEFAULT 'gte' CHECK (comparison IN ('gte', 'lte', 'gt', 'lt')),
  alert_channel TEXT DEFAULT 'in_app' CHECK (alert_channel IN ('in_app', 'email', 'webhook')),
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT true,
  cooldown_minutes INTEGER DEFAULT 60,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, rule_name)
);

CREATE TABLE IF NOT EXISTS quota_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES quota_alert_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  metric_value NUMERIC(12,4) NOT NULL,
  threshold_value NUMERIC(12,4) NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  triggered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_quota_rules_user ON quota_alert_rules(user_id);
CREATE INDEX idx_quota_events_rule ON quota_alert_events(rule_id, triggered_at DESC);
CREATE INDEX idx_quota_events_user ON quota_alert_events(user_id, triggered_at DESC);
CREATE INDEX idx_quota_events_unread ON quota_alert_events(user_id, is_read) WHERE is_read = false;

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Quota Alerts API

Create `backend/core/monitoring/quota_alerts_api.py`:

Router with tag `"quota-alerts"`:
- `POST /quota/rules` — create alert rule. Body: `{ rule_name, metric_type, agent_id?, threshold_value, threshold_type?, comparison?, alert_channel?, webhook_url?, cooldown_minutes? }`. Auth required.
- `GET /quota/rules` — list rules with trigger_count. Auth required.
- `PATCH /quota/rules/{rule_id}` — update. Auth required.
- `DELETE /quota/rules/{rule_id}` — delete. Auth required.
- `POST /quota/check` — evaluate rules. Body: `{ metric_type, metric_value, agent_id? }`. Checks active rules matching metric_type (and agent_id if set). For each matching rule: compares metric_value to threshold using comparison operator. If triggered and cooldown passed: creates event record, updates last_triggered_at, increments trigger_count. Returns `{ triggered: bool, events: [...] }`. Auth required.
- `GET /quota/events` — list alert events. Query: `unread_only`, `rule_id`, `limit`. Auth required.
- `POST /quota/events/{event_id}/read` — mark event as read. Auth required.
- `POST /quota/events/read-all` — mark all events as read. Auth required.
- `GET /quota/stats` — active rules count, unread events count, most triggered rule, by metric_type breakdown. Auth required.

Register in `backend/api.py`.

### Task 11: Create frontend API + hooks files.
### Task 12: Create quota alerts page with rule list, trigger history feed, unread badge, check simulation panel.

---

## Phase 4: Agent Benchmarks (Tasks 13-16)

### Task 13: Agent Benchmarks Schema

Create `backend/supabase/migrations/20260312900003_agent_benchmarks.sql`:

```sql
CREATE TABLE IF NOT EXISTS benchmark_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  suite_name TEXT NOT NULL,
  description TEXT,
  test_cases JSONB NOT NULL DEFAULT '[]',
  scoring_method TEXT DEFAULT 'average' CHECK (scoring_method IN ('average', 'weighted', 'min', 'max')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, suite_name)
);

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id UUID NOT NULL REFERENCES benchmark_suites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  overall_score NUMERIC(5,2),
  test_results JSONB DEFAULT '[]',
  total_tests INTEGER DEFAULT 0,
  passed_tests INTEGER DEFAULT 0,
  failed_tests INTEGER DEFAULT 0,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_benchmark_suites_user ON benchmark_suites(user_id, created_at DESC);
CREATE INDEX idx_benchmark_runs_suite ON benchmark_runs(suite_id, started_at DESC);
CREATE INDEX idx_benchmark_runs_agent ON benchmark_runs(agent_id, started_at DESC);
CREATE INDEX idx_benchmark_runs_user ON benchmark_runs(user_id, started_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Agent Benchmarks API

Create `backend/core/agents/agent_benchmarks_api.py`:

Router with tag `"agent-benchmarks"`:
- `POST /benchmarks/suites` — create suite. Body: `{ suite_name, description?, test_cases: [{name, prompt, expected_keywords?, max_tokens?}], scoring_method? }`. Auth required.
- `GET /benchmarks/suites` — list suites. Auth required.
- `GET /benchmarks/suites/{suite_id}` — get suite detail. Auth required.
- `PATCH /benchmarks/suites/{suite_id}` — update. Auth required.
- `DELETE /benchmarks/suites/{suite_id}` — delete. Auth required.
- `POST /benchmarks/suites/{suite_id}/run` — start benchmark run. Body: `{ agent_id }`. Simulates test execution: for each test case, generate random score (60-100), check if expected_keywords present in simulated response (random 50% hit rate). Compute overall_score. Set status='completed'. Auth required.
- `GET /benchmarks/runs` — list runs. Query: `agent_id`, `suite_id`, `limit`. Auth required.
- `GET /benchmarks/runs/{run_id}` — get run detail with test_results. Auth required.
- `GET /benchmarks/suites/{suite_id}/leaderboard` — runs sorted by overall_score desc. Auth required.

Register in `backend/api.py`.

### Task 15: Create frontend API + hooks files.
### Task 16: Create benchmarks page with suite list, run button, score leaderboard, test result breakdown table.

---

## Phase 5: Plugin Registry (Tasks 17-20)

### Task 17: Plugin Registry Schema

Create `backend/supabase/migrations/20260312900004_plugin_registry.sql`:

```sql
CREATE TABLE IF NOT EXISTS plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plugin_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  version TEXT DEFAULT '1.0.0',
  description TEXT,
  plugin_type TEXT DEFAULT 'tool' CHECK (plugin_type IN ('tool', 'prompt_modifier', 'output_formatter', 'data_source', 'integration')),
  config_schema JSONB DEFAULT '{}',
  implementation JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  install_count INTEGER DEFAULT 0,
  rating_avg NUMERIC(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, plugin_name)
);

CREATE TABLE IF NOT EXISTS agent_plugin_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  plugin_id UUID NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  config_values JSONB DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT true,
  installed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, plugin_id)
);

CREATE TABLE IF NOT EXISTS plugin_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id UUID NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  review TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (plugin_id, user_id)
);

CREATE INDEX idx_plugins_user ON plugins(user_id, created_at DESC);
CREATE INDEX idx_plugins_type ON plugins(plugin_type, is_active);
CREATE INDEX idx_plugins_public ON plugins(is_public, rating_avg DESC);
CREATE INDEX idx_plugin_installs_agent ON agent_plugin_installs(agent_id);
CREATE INDEX idx_plugin_installs_user ON agent_plugin_installs(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Plugin Registry API

Create `backend/core/agents/plugin_registry_api.py`:

Router with tag `"plugin-registry"`:
- `POST /plugins` — create plugin. Body: `{ plugin_name, display_name, version?, description?, plugin_type?, config_schema?, implementation?, tags?, is_public? }`. Auth required.
- `GET /plugins` — list plugins. Query: `plugin_type`, `is_public` (bool), `search`, `limit`. Returns own plugins + public plugins from others. Auth required.
- `GET /plugins/{plugin_id}` — get detail. Auth required.
- `PATCH /plugins/{plugin_id}` — update (own plugins only, check user_id). Auth required.
- `DELETE /plugins/{plugin_id}` — delete (own plugins only). Auth required.
- `POST /agents/{agent_id}/plugins` — install plugin on agent. Body: `{ plugin_id, config_values? }`. Increments install_count. Auth required.
- `GET /agents/{agent_id}/plugins` — list installed plugins with plugin details. Auth required.
- `PATCH /agents/{agent_id}/plugins/{install_id}` — update config_values or is_enabled. Auth required.
- `DELETE /agents/{agent_id}/plugins/{install_id}` — uninstall. Auth required.
- `POST /plugins/{plugin_id}/rate` — rate plugin. Body: `{ rating, review? }`. Upserts rating. Recalculates rating_avg and rating_count on plugins table. Auth required.

Register in `backend/api.py`.

### Task 19: Create frontend API + hooks files.
### Task 20: Create plugin registry page with plugin marketplace grid, type filter, install button, rating stars, agent plugin manager.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 70 completion status.

---
