# Sprint 69: Agent Config Snapshots, Thread Export Templates, Cost Tracking, Agent Health Checks & Task Queue

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add named agent configuration snapshots for save/restore, thread export templates for formatted document output, AI cost tracking with budget alerts, automated agent health check probes, and a background task queue system — completing the configuration management, export/sharing, cost visibility, reliability monitoring, and async execution features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Config Snapshots (Tasks 1-4)

### Task 1: Agent Config Snapshots Schema

Create `backend/supabase/migrations/20260312800000_agent_config_snapshots.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_config_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  snapshot_name TEXT NOT NULL,
  description TEXT,
  config_data JSONB NOT NULL DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  is_pinned BOOLEAN DEFAULT false,
  restored_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS snapshot_restore_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES agent_config_snapshots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  restored_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

CREATE INDEX idx_config_snapshots_agent ON agent_config_snapshots(agent_id, created_at DESC);
CREATE INDEX idx_config_snapshots_user ON agent_config_snapshots(user_id, created_at DESC);
CREATE INDEX idx_config_snapshots_pinned ON agent_config_snapshots(user_id, is_pinned);
CREATE INDEX idx_snapshot_restore_log_snapshot ON snapshot_restore_log(snapshot_id, restored_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Agent Config Snapshots API

Create `backend/core/agents/agent_config_snapshots_api.py`:

Router with tag `"agent-config-snapshots"`:
- `POST /agents/{agent_id}/snapshots` — create snapshot. Body: `{ snapshot_name, description?, config_data, tags? }`. Auth required.
- `GET /agents/{agent_id}/snapshots` — list snapshots. Query: `pinned_only`, `limit`. Auth required.
- `GET /agents/{agent_id}/snapshots/{snapshot_id}` — get detail. Auth required.
- `PATCH /agents/{agent_id}/snapshots/{snapshot_id}` — update name, description, tags, is_pinned. Auth required.
- `DELETE /agents/{agent_id}/snapshots/{snapshot_id}` — delete. Auth required.
- `POST /agents/{agent_id}/snapshots/{snapshot_id}/restore` — mark as restored. Body: `{ notes? }`. Increments restored_count. Creates restore log entry. Auth required.
- `GET /agents/{agent_id}/snapshots/{snapshot_id}/restore-log` — list restore history. Auth required.
- `GET /agents/{agent_id}/snapshots/stats` — total snapshots, pinned count, most restored snapshot. Auth required.

Register in `backend/api.py`.

### Task 3: Create frontend API + hooks files.
### Task 4: Create config snapshots screen in agent config with snapshot list, create/restore actions, pinning, tag filter.

---

## Phase 2: Thread Export Templates (Tasks 5-8)

### Task 5: Thread Export Templates Schema

Create `backend/supabase/migrations/20260312800001_thread_export_templates.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_export_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  format TEXT DEFAULT 'markdown' CHECK (format IN ('markdown', 'html', 'json', 'csv', 'txt')),
  include_metadata BOOLEAN DEFAULT true,
  include_tool_calls BOOLEAN DEFAULT false,
  include_timestamps BOOLEAN DEFAULT true,
  header_template TEXT,
  footer_template TEXT,
  custom_css TEXT,
  is_default BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, template_name)
);

CREATE TABLE IF NOT EXISTS thread_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  template_id UUID REFERENCES thread_export_templates(id) ON DELETE SET NULL,
  format TEXT NOT NULL,
  export_size_bytes INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  exported_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_export_templates_user ON thread_export_templates(user_id, created_at DESC);
CREATE INDEX idx_thread_exports_user ON thread_exports(user_id, exported_at DESC);
CREATE INDEX idx_thread_exports_thread ON thread_exports(thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Export Templates API

Create `backend/core/threads/thread_export_templates_api.py`:

Router with tag `"thread-export-templates"`:
- `POST /export-templates` — create template. Body: `{ template_name, format?, include_metadata?, include_tool_calls?, include_timestamps?, header_template?, footer_template?, is_default? }`. Auth required.
- `GET /export-templates` — list templates. Auth required.
- `GET /export-templates/{template_id}` — get detail. Auth required.
- `PATCH /export-templates/{template_id}` — update. Auth required.
- `DELETE /export-templates/{template_id}` — delete. Auth required.
- `POST /threads/{thread_id}/export` — export thread. Body: `{ template_id?, format?, messages: [{role, content, created_at?}] }`. Applies template formatting. Records export. Increments use_count. Returns rendered export string. Auth required.
- `GET /threads/{thread_id}/exports` — list export history for thread. Auth required.
- `GET /export-templates/stats` — total exports, by format, top templates. Auth required.

Register in `backend/api.py`.

### Task 7: Create frontend API + hooks files.
### Task 8: Create export templates page with template list, format selector, preview panel, export history per thread.

---

## Phase 3: Cost Tracking (Tasks 9-12)

### Task 9: Cost Tracking Schema

Create `backend/supabase/migrations/20260312800002_cost_tracking.sql`:

```sql
CREATE TABLE IF NOT EXISTS cost_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  thread_id TEXT,
  model_name TEXT NOT NULL,
  provider TEXT DEFAULT 'anthropic',
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  operation_type TEXT DEFAULT 'inference' CHECK (operation_type IN ('inference', 'embedding', 'fine_tuning', 'other')),
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cost_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  budget_name TEXT NOT NULL,
  agent_id TEXT,
  period TEXT DEFAULT 'monthly' CHECK (period IN ('daily', 'weekly', 'monthly')),
  budget_usd NUMERIC(10,2) NOT NULL,
  alert_threshold_pct INTEGER DEFAULT 80,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, budget_name)
);

CREATE INDEX idx_cost_records_user ON cost_records(user_id, recorded_at DESC);
CREATE INDEX idx_cost_records_agent ON cost_records(agent_id, recorded_at DESC);
CREATE INDEX idx_cost_records_model ON cost_records(model_name, recorded_at DESC);
CREATE INDEX idx_cost_budgets_user ON cost_budgets(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Cost Tracking API

Create `backend/core/billing/cost_tracking_api.py`:

Router with tag `"cost-tracking"`:
- `POST /costs/record` — record cost entry. Body: `{ agent_id?, thread_id?, model_name, provider?, input_tokens, output_tokens, cost_usd, operation_type? }`. Auth required.
- `POST /costs/batch` — record multiple entries. Body: `{ records: [{...}] }`. Auth required.
- `GET /costs` — query costs. Query: `agent_id`, `model_name`, `provider`, `from_date`, `to_date`, `limit`. Auth required.
- `GET /costs/summary` — total cost, by agent, by model, by provider, cost per day (last 30 days). Auth required.
- `GET /costs/trends` — daily cost time series. Query: `days` (default 30), `agent_id`. Auth required.
- `POST /costs/budgets` — create budget. Auth required.
- `GET /costs/budgets` — list budgets with current usage percentage. Auth required.
- `PATCH /costs/budgets/{budget_id}` — update. Auth required.
- `DELETE /costs/budgets/{budget_id}` — delete. Auth required.
- `GET /costs/budgets/alerts` — budgets exceeding alert threshold. Auth required.

Register in `backend/api.py`.

### Task 11: Create frontend API + hooks files.
### Task 12: Create cost tracking page with cost summary cards, daily Recharts AreaChart, model breakdown table, budget list with usage bars.

---

## Phase 4: Agent Health Checks (Tasks 13-16)

### Task 13: Agent Health Checks Schema

Create `backend/supabase/migrations/20260312800003_agent_health_checks.sql`:

```sql
CREATE TABLE IF NOT EXISTS health_check_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  check_name TEXT NOT NULL,
  check_type TEXT DEFAULT 'ping' CHECK (check_type IN ('ping', 'api_call', 'response_quality', 'latency')),
  check_config JSONB DEFAULT '{}',
  interval_minutes INTEGER DEFAULT 60,
  timeout_seconds INTEGER DEFAULT 30,
  failure_threshold INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, check_name)
);

CREATE TABLE IF NOT EXISTS health_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES health_check_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'timeout')),
  response_time_ms INTEGER,
  error_message TEXT,
  details JSONB DEFAULT '{}',
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_uptime_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  uptime_pct NUMERIC(5,2) DEFAULT 100,
  total_checks INTEGER DEFAULT 0,
  failed_checks INTEGER DEFAULT 0,
  avg_response_ms INTEGER DEFAULT 0,
  last_status TEXT DEFAULT 'healthy',
  last_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX idx_health_configs_agent ON health_check_configs(agent_id);
CREATE INDEX idx_health_configs_user ON health_check_configs(user_id);
CREATE INDEX idx_health_results_config ON health_check_results(config_id, checked_at DESC);
CREATE INDEX idx_health_results_agent ON health_check_results(agent_id, checked_at DESC);
CREATE INDEX idx_uptime_user ON agent_uptime_summary(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Agent Health Checks API

Create `backend/core/agents/agent_health_checks_api.py`:

Router with tag `"agent-health-checks"`:
- `POST /agents/{agent_id}/health-checks` — create health check config. Body: `{ check_name, check_type?, check_config?, interval_minutes?, timeout_seconds?, failure_threshold? }`. Auth required.
- `GET /agents/{agent_id}/health-checks` — list configs. Auth required.
- `PATCH /agents/{agent_id}/health-checks/{config_id}` — update config. Auth required.
- `DELETE /agents/{agent_id}/health-checks/{config_id}` — delete config. Auth required.
- `POST /agents/{agent_id}/health-checks/{config_id}/run` — run check now. Simulates check: generates random response_time_ms (50-2000), status based on timeout_seconds threshold. Updates uptime summary. Auth required.
- `GET /agents/{agent_id}/health-checks/{config_id}/results` — list results. Query: `limit`, `status`. Auth required.
- `GET /agents/{agent_id}/uptime` — get uptime summary for agent. Auth required.
- `GET /health-checks/overview` — all agents' uptime summaries for user. Auth required.

Register in `backend/api.py`.

### Task 15: Create frontend API + hooks files.
### Task 16: Create health checks page with uptime overview grid, per-agent check history, run-now buttons, status timeline.

---

## Phase 5: Task Queue (Tasks 17-20)

### Task 17: Task Queue Schema

Create `backend/supabase/migrations/20260312800004_task_queue.sql`:

```sql
CREATE TABLE IF NOT EXISTS queued_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  task_type TEXT NOT NULL,
  task_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'retrying')),
  max_retries INTEGER DEFAULT 3,
  retry_count INTEGER DEFAULT 0,
  retry_delay_seconds INTEGER DEFAULT 60,
  result JSONB DEFAULT '{}',
  error_message TEXT,
  scheduled_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_queue_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  snapshot_at TIMESTAMPTZ DEFAULT now(),
  pending_count INTEGER DEFAULT 0,
  running_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  avg_wait_seconds NUMERIC(10,2) DEFAULT 0,
  avg_run_seconds NUMERIC(10,2) DEFAULT 0
);

CREATE INDEX idx_queued_tasks_user ON queued_tasks(user_id, created_at DESC);
CREATE INDEX idx_queued_tasks_status ON queued_tasks(status, scheduled_at ASC);
CREATE INDEX idx_queued_tasks_agent ON queued_tasks(agent_id, created_at DESC);
CREATE INDEX idx_task_queue_stats_user ON task_queue_stats(user_id, snapshot_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Task Queue API

Create `backend/core/agents/task_queue_api.py`:

Router with tag `"task-queue"`:
- `POST /tasks/queue` — enqueue task. Body: `{ agent_id?, task_type, task_name, payload?, priority?, max_retries?, retry_delay_seconds?, scheduled_at? }`. Auth required.
- `GET /tasks/queue` — list tasks. Query: `status`, `agent_id`, `task_type`, `limit`, `offset`. Auth required.
- `GET /tasks/queue/{task_id}` — get task detail. Auth required.
- `POST /tasks/queue/{task_id}/cancel` — cancel pending/retrying task. Auth required.
- `POST /tasks/queue/{task_id}/retry` — manually retry failed task. Resets retry_count. Sets status to pending. Auth required.
- `POST /tasks/queue/{task_id}/complete` — mark task as completed (for manual simulation). Body: `{ result? }`. Auth required.
- `POST /tasks/queue/{task_id}/fail` — mark as failed. Body: `{ error_message? }`. Increments retry_count. If retry_count < max_retries sets status=retrying, else failed. Auth required.
- `GET /tasks/queue/stats` — snapshot current counts + averages. Also records stats snapshot. Auth required.
- `DELETE /tasks/queue/completed` — delete completed tasks older than N days. Query: `days` (default 7). Auth required.

Register in `backend/api.py`.

### Task 19: Create frontend API + hooks files.
### Task 20: Create task queue page with status kanban columns, task detail drawer, retry/cancel actions, stats bar chart.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 69 completion status.

---
