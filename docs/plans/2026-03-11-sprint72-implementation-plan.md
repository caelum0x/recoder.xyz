# Sprint 72: Agent Feedback Collection, Thread Search, Alert Escalation, Agent Audit Log & Data Pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured agent feedback collection for quality improvement, full-text thread search across conversations, multi-level alert escalation policies, detailed agent audit logging for compliance, and a data pipeline manager for ETL workflows — completing the quality feedback, discoverability, incident management, compliance, and data integration features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Feedback Collection (Tasks 1-4)

### Task 1: Agent Feedback Schema

Create `backend/supabase/migrations/20260312902000_agent_feedback.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT,
  message_index INTEGER,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  feedback_type TEXT DEFAULT 'general' CHECK (feedback_type IN ('general', 'accuracy', 'speed', 'helpfulness', 'formatting', 'bug_report')),
  comment TEXT,
  tags TEXT[] DEFAULT '{}',
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  category_name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  feedback_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, category_name)
);

CREATE INDEX idx_agent_feedback_agent ON agent_feedback(agent_id, created_at DESC);
CREATE INDEX idx_agent_feedback_user ON agent_feedback(user_id, created_at DESC);
CREATE INDEX idx_agent_feedback_rating ON agent_feedback(rating, created_at DESC);
CREATE INDEX idx_feedback_categories_user ON feedback_categories(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Agent Feedback API

Create `backend/core/agents/agent_feedback_api.py`:

Router with tag `"agent-feedback"`:
- `POST /agents/{agent_id}/feedback` — submit feedback. Body: `{ thread_id?, message_index?, rating?, feedback_type?, comment?, tags? }`. Auth required.
- `GET /agents/{agent_id}/feedback` — list feedback. Query: `feedback_type`, `rating`, `is_resolved`, `limit`. Auth required.
- `PATCH /feedback/{feedback_id}` — update is_resolved, comment. Auth required.
- `DELETE /feedback/{feedback_id}` — delete. Auth required.
- `GET /agents/{agent_id}/feedback/stats` — avg_rating, count by type, count by rating (histogram), resolution rate, recent trend. Auth required.
- `GET /feedback/all` — list all feedback across agents. Query: `agent_id`, `feedback_type`, `limit`. Auth required.
- `POST /feedback-categories` — create category. Body: `{ category_name, description?, color? }`. Auth required.
- `GET /feedback-categories` — list categories with feedback_count. Auth required.
- `DELETE /feedback-categories/{category_id}` — delete. Auth required.

Register in `backend/api.py`.

### Task 3: Create frontend API + hooks files.
### Task 4: Create feedback page with rating histogram, feedback list with resolve actions, category manager, per-agent stats.

---

## Phase 2: Thread Search (Tasks 5-8)

### Task 5: Thread Search Schema

Create `backend/supabase/migrations/20260312902001_thread_search_index.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  agent_id TEXT,
  title TEXT,
  content_snippet TEXT,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  search_vector TSVECTOR,
  indexed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  searched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_thread_search_user ON thread_search_index(user_id, last_message_at DESC);
CREATE INDEX idx_thread_search_vector ON thread_search_index USING GIN (search_vector);
CREATE INDEX idx_thread_search_agent ON thread_search_index(agent_id);
CREATE INDEX idx_search_history_user ON search_history(user_id, searched_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Search API

Create `backend/core/threads/thread_search_api.py`:

Router with tag `"thread-search"`:
- `POST /threads/index` — index a thread. Body: `{ thread_id, agent_id?, title?, content_snippet?, message_count?, last_message_at?, tags? }`. Upserts. Computes search_vector using `to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content_snippet,''))`. Auth required.
- `POST /threads/index/batch` — index multiple threads. Body: `{ threads: [{...}] }`. Auth required.
- `GET /threads/search` — search threads. Query: `q` (text search), `agent_id`, `tags`, `limit` (default 20). If q provided: use `search_vector @@ to_tsquery('english', :q)` with ORDER BY ts_rank. Else return recent. Records search history. Auth required.
- `DELETE /threads/index/{thread_id}` — remove from index. Auth required.
- `GET /threads/search/history` — list recent searches. Query: `limit` (default 20). Auth required.
- `DELETE /threads/search/history` — clear search history. Auth required.
- `GET /threads/search/stats` — total indexed threads, by agent, recent search volume, top queries. Auth required.

Register in `backend/api.py`.

### Task 7: Create frontend API + hooks files.
### Task 8: Create thread search page with search bar, result cards with snippet highlighting, search history sidebar, index management.

---

## Phase 3: Alert Escalation (Tasks 9-12)

### Task 9: Alert Escalation Schema

Create `backend/supabase/migrations/20260312902002_alert_escalation.sql`:

```sql
CREATE TABLE IF NOT EXISTS escalation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  policy_name TEXT NOT NULL,
  description TEXT,
  escalation_steps JSONB NOT NULL DEFAULT '[]',
  repeat_interval_minutes INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, policy_name)
);

CREATE TABLE IF NOT EXISTS escalation_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES escalation_policies(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'escalated', 'resolved', 'closed')),
  source TEXT,
  details JSONB DEFAULT '{}',
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS escalation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES escalation_incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action_type TEXT DEFAULT 'notify' CHECK (action_type IN ('notify', 'acknowledge', 'escalate', 'resolve', 'comment')),
  step_index INTEGER DEFAULT 0,
  notes TEXT,
  performed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_escalation_policies_user ON escalation_policies(user_id);
CREATE INDEX idx_escalation_incidents_user ON escalation_incidents(user_id, created_at DESC);
CREATE INDEX idx_escalation_incidents_status ON escalation_incidents(status, created_at DESC);
CREATE INDEX idx_escalation_actions_incident ON escalation_actions(incident_id, performed_at ASC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Alert Escalation API

Create `backend/core/monitoring/alert_escalation_api.py`:

Router with tag `"alert-escalation"`:
- `POST /escalation/policies` — create policy. Body: `{ policy_name, description?, escalation_steps: [{step, notify_after_minutes, action}], repeat_interval_minutes?, is_active? }`. Auth required.
- `GET /escalation/policies` — list policies. Auth required.
- `PATCH /escalation/policies/{policy_id}` — update. Auth required.
- `DELETE /escalation/policies/{policy_id}` — delete. Auth required.
- `POST /escalation/incidents` — create incident. Body: `{ title, severity?, policy_id?, source?, details? }`. Auth required.
- `GET /escalation/incidents` — list incidents. Query: `status`, `severity`, `limit`. Auth required.
- `GET /escalation/incidents/{incident_id}` — get with actions. Auth required.
- `POST /escalation/incidents/{incident_id}/acknowledge` — set status=acknowledged, acknowledged_at=now(). Record action. Auth required.
- `POST /escalation/incidents/{incident_id}/escalate` — increment current_step, set status=escalated. Body: `{ notes? }`. Record action. Auth required.
- `POST /escalation/incidents/{incident_id}/resolve` — set status=resolved, resolved_at=now(). Body: `{ notes? }`. Record action. Auth required.
- `GET /escalation/stats` — open count, by severity, avg resolution time, escalation rate. Auth required.

Register in `backend/api.py`.

### Task 11: Create frontend API + hooks files.
### Task 12: Create alert escalation page with incident feed (severity badges), policy config, escalation timeline, acknowledge/escalate/resolve actions.

---

## Phase 4: Agent Audit Log (Tasks 13-16)

### Task 13: Agent Audit Log Schema

Create `backend/supabase/migrations/20260312902003_agent_audit_log.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  event_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  action TEXT NOT NULL,
  actor TEXT DEFAULT 'user',
  old_values JSONB DEFAULT '{}',
  new_values JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  retention_days INTEGER DEFAULT 90,
  export_before_delete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_audit_events_user ON agent_audit_events(user_id, created_at DESC);
CREATE INDEX idx_audit_events_agent ON agent_audit_events(agent_id, created_at DESC);
CREATE INDEX idx_audit_events_type ON agent_audit_events(event_type, created_at DESC);
CREATE INDEX idx_audit_events_resource ON agent_audit_events(resource_type, resource_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Agent Audit Log API

Create `backend/core/agents/agent_audit_log_api.py`:

Router with tag `"agent-audit-log"`:
- `POST /audit/events` — log event. Body: `{ agent_id?, event_type, resource_type?, resource_id?, action, actor?, old_values?, new_values?, ip_address?, user_agent?, metadata? }`. Auth required.
- `POST /audit/events/batch` — log multiple events. Body: `{ events: [{...}] }`. Auth required.
- `GET /audit/events` — query events. Query: `agent_id`, `event_type`, `resource_type`, `action`, `from_date`, `to_date`, `limit` (default 100), `offset`. Auth required.
- `GET /audit/events/{event_id}` — get detail. Auth required.
- `GET /audit/stats` — total events, by event_type, by agent, by action, events per day (last 7 days). Auth required.
- `GET /audit/retention` — get retention policy (defaults if none). Auth required.
- `PUT /audit/retention` — set retention policy. Body: `{ retention_days, export_before_delete? }`. Upserts. Auth required.
- `DELETE /audit/events/cleanup` — delete events older than retention_days. Returns `{ deleted_count }`. Auth required.

Register in `backend/api.py`.

### Task 15: Create frontend API + hooks files.
### Task 16: Create audit log page with event timeline, filters (event_type, agent, date range), stats chart, retention settings panel.

---

## Phase 5: Data Pipeline (Tasks 17-20)

### Task 17: Data Pipeline Schema

Create `backend/supabase/migrations/20260312902004_data_pipelines.sql`:

```sql
CREATE TABLE IF NOT EXISTS data_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pipeline_name TEXT NOT NULL,
  description TEXT,
  source_type TEXT DEFAULT 'api' CHECK (source_type IN ('api', 'database', 'file', 'webhook', 'stream')),
  destination_type TEXT DEFAULT 'database' CHECK (destination_type IN ('database', 'file', 'api', 'webhook')),
  transform_steps JSONB DEFAULT '[]',
  schedule_cron TEXT,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  run_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, pipeline_name)
);

CREATE TABLE IF NOT EXISTS pipeline_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES data_pipelines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  execution_log JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

CREATE INDEX idx_data_pipelines_user ON data_pipelines(user_id, created_at DESC);
CREATE INDEX idx_pipeline_executions_pipeline ON pipeline_executions(pipeline_id, started_at DESC);
CREATE INDEX idx_pipeline_executions_user ON pipeline_executions(user_id, started_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Data Pipeline API

Create `backend/core/agents/data_pipeline_api.py`:

Router with tag `"data-pipelines"`:
- `POST /data-pipelines` — create pipeline. Body: `{ pipeline_name, description?, source_type?, destination_type?, transform_steps?, schedule_cron?, is_active? }`. Auth required.
- `GET /data-pipelines` — list pipelines. Auth required.
- `GET /data-pipelines/{pipeline_id}` — get detail. Auth required.
- `PATCH /data-pipelines/{pipeline_id}` — update. Auth required.
- `DELETE /data-pipelines/{pipeline_id}` — delete. Auth required.
- `POST /data-pipelines/{pipeline_id}/run` — execute pipeline. Simulates ETL: import random; records = random.randint(10,1000); failed = random.randint(0, records//10); duration_ms = random.randint(100, 5000). Set status='completed'. Updates pipeline last_run_at, last_run_status, run_count. Auth required.
- `GET /data-pipelines/{pipeline_id}/executions` — list execution history. Query: `limit` (default 20). Auth required.
- `GET /data-pipelines/executions/{execution_id}` — get execution detail with execution_log. Auth required. (prefix path to avoid shadowing: use `/pipeline-executions/{execution_id}`)
- `POST /data-pipelines/executions/{execution_id}/cancel` — set status=cancelled. Auth required. (use `/pipeline-executions/{execution_id}/cancel`)
- `GET /data-pipelines/stats` — total pipelines, active pipelines, total executions, success rate, total records processed. Auth required. (place BEFORE /{pipeline_id})

Register in `backend/api.py`.

### Task 19: Create frontend API + hooks files.
### Task 20: Create data pipeline page with pipeline list, source→transform→destination flow diagram, run history, execution stats bar chart.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 72 completion status.

---
