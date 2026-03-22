# Sprint 71: Agent Secrets Vault, Thread Labels, Execution Traces, A/B Testing & Notification Templates

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an encrypted agent secrets vault for managing API keys and tokens, a thread labeling system for organizing conversations, detailed execution trace logging for debugging agent decisions, an A/B testing framework for comparing agent configurations, and customizable notification message templates — completing the secrets management, organization, observability, experimentation, and messaging features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Secrets Vault (Tasks 1-4)

### Task 1: Secrets Vault Schema

Create `backend/supabase/migrations/20260312901000_agent_secrets_vault.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  secret_name TEXT NOT NULL,
  secret_value TEXT NOT NULL,
  description TEXT,
  secret_type TEXT DEFAULT 'api_key' CHECK (secret_type IN ('api_key', 'token', 'password', 'certificate', 'other')),
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id, secret_name)
);

CREATE TABLE IF NOT EXISTS secret_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id UUID NOT NULL REFERENCES agent_secrets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  accessed_at TIMESTAMPTZ DEFAULT now(),
  access_reason TEXT,
  ip_address TEXT
);

CREATE INDEX idx_agent_secrets_user ON agent_secrets(user_id, created_at DESC);
CREATE INDEX idx_agent_secrets_agent ON agent_secrets(agent_id);
CREATE INDEX idx_secret_access_log_secret ON secret_access_log(secret_id, accessed_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Secrets Vault API

Create `backend/core/agents/agent_secrets_api.py`:

Router with tag `"agent-secrets"`:
- `POST /secrets` — create secret. Body: `{ secret_name, secret_value, description?, secret_type?, agent_id?, expires_at? }`. Store secret_value as-is (simulated encryption prefix: `"enc::"+secret_value`). Auth required.
- `GET /secrets` — list secrets. Query: `agent_id`. Returns secrets WITHOUT secret_value (masked as `"••••••••"`). Auth required.
- `GET /secrets/{secret_id}` — get secret. Returns masked value. Auth required.
- `GET /secrets/{secret_id}/reveal` — get secret with actual value. Logs access. Increments access_count. Updates last_accessed_at. Returns actual decoded value (strip `"enc::"`). Auth required.
- `PATCH /secrets/{secret_id}` — update name, description, secret_type, is_active, expires_at. Optionally update value if provided. Auth required.
- `DELETE /secrets/{secret_id}` — delete. Auth required.
- `GET /secrets/{secret_id}/access-log` — list access log. Auth required.
- `GET /secrets/stats` — total secrets, active secrets, expired secrets, most accessed secret name. Auth required. (place BEFORE /{secret_id})

Register in `backend/api.py`.

### Task 3: Create frontend API + hooks files.
### Task 4: Create secrets vault page with masked secret list, reveal button (with confirmation), access log, type badges.

---

## Phase 2: Thread Labels (Tasks 5-8)

### Task 5: Thread Labels Schema

Create `backend/supabase/migrations/20260312901001_thread_labels.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_label_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  label_name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  description TEXT,
  icon TEXT DEFAULT 'tag',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, label_name)
);

CREATE TABLE IF NOT EXISTS thread_label_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  label_id UUID NOT NULL REFERENCES thread_label_definitions(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, label_id)
);

CREATE INDEX idx_label_defs_user ON thread_label_definitions(user_id);
CREATE INDEX idx_label_assignments_thread ON thread_label_assignments(thread_id);
CREATE INDEX idx_label_assignments_label ON thread_label_assignments(label_id);
CREATE INDEX idx_label_assignments_user ON thread_label_assignments(user_id, assigned_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Labels API

Create `backend/core/threads/thread_labels_api.py`:

Router with tag `"thread-labels"`:
- `POST /labels` — create label definition. Body: `{ label_name, color?, description?, icon? }`. Auth required.
- `GET /labels` — list label definitions with usage count (JOIN assignments). Auth required.
- `PATCH /labels/{label_id}` — update. Auth required.
- `DELETE /labels/{label_id}` — delete. Auth required.
- `POST /threads/{thread_id}/labels` — assign label. Body: `{ label_id }`. Upserts. Auth required.
- `DELETE /threads/{thread_id}/labels/{label_id}` — remove label from thread. Auth required.
- `GET /threads/{thread_id}/labels` — get labels for thread. Auth required.
- `GET /labels/{label_id}/threads` — get threads with this label. Auth required.
- `POST /labels/bulk-assign` — assign label to multiple threads. Body: `{ label_id, thread_ids: [] }`. Auth required.

Register in `backend/api.py`.

### Task 7: Create frontend API + hooks files.
### Task 8: Create labels management page with label CRUD, color picker, thread count per label, and bulk assign panel.

---

## Phase 3: Execution Traces (Tasks 9-12)

### Task 9: Execution Traces Schema

Create `backend/supabase/migrations/20260312901002_execution_traces.sql`:

```sql
CREATE TABLE IF NOT EXISTS execution_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT,
  trace_name TEXT,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  total_steps INTEGER DEFAULT 0,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trace_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL REFERENCES execution_traces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  step_index INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  step_type TEXT DEFAULT 'action' CHECK (step_type IN ('action', 'decision', 'tool_call', 'llm_call', 'data_fetch', 'output')),
  input_data JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  duration_ms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_exec_traces_user ON execution_traces(user_id, started_at DESC);
CREATE INDEX idx_exec_traces_agent ON execution_traces(agent_id, started_at DESC);
CREATE INDEX idx_trace_steps_trace ON trace_steps(trace_id, step_index ASC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Execution Traces API

Create `backend/core/agents/execution_traces_api.py`:

Router with tag `"execution-traces"`:
- `POST /traces` — start trace. Body: `{ agent_id, thread_id?, trace_name?, metadata? }`. Auth required.
- `GET /traces` — list traces. Query: `agent_id`, `status`, `limit` (default 50). Auth required.
- `GET /traces/{trace_id}` — get trace with steps. Auth required.
- `PATCH /traces/{trace_id}` — update status, duration_ms, completed_at. Auth required.
- `DELETE /traces/{trace_id}` — delete. Auth required.
- `POST /traces/{trace_id}/steps` — add step. Body: `{ step_index, step_name, step_type?, input_data?, output_data?, duration_ms?, status?, error_message? }`. Increments trace total_steps. Auth required.
- `GET /traces/{trace_id}/steps` — list steps ordered by step_index. Auth required.
- `GET /traces/stats` — total traces, avg duration, by status, by agent, steps per trace avg. Auth required. (place BEFORE /{trace_id})

Register in `backend/api.py`.

### Task 11: Create frontend API + hooks files.
### Task 12: Create execution traces page with trace list, step-by-step timeline visualization, duration bar chart, filter by agent/status.

---

## Phase 4: A/B Testing Framework (Tasks 13-16)

### Task 13: A/B Testing Schema

Create `backend/supabase/migrations/20260312901003_ab_testing.sql`:

```sql
CREATE TABLE IF NOT EXISTS ab_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  experiment_name TEXT NOT NULL,
  description TEXT,
  agent_id TEXT NOT NULL,
  variant_a_config JSONB NOT NULL DEFAULT '{}',
  variant_b_config JSONB NOT NULL DEFAULT '{}',
  traffic_split_pct INTEGER DEFAULT 50 CHECK (traffic_split_pct BETWEEN 0 AND 100),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
  winner TEXT CHECK (winner IN ('a', 'b', 'tie')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, experiment_name)
);

CREATE TABLE IF NOT EXISTS ab_experiment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('a', 'b')),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC(12,4) NOT NULL,
  sample_size INTEGER DEFAULT 1,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ab_experiments_user ON ab_experiments(user_id, created_at DESC);
CREATE INDEX idx_ab_experiments_agent ON ab_experiments(agent_id);
CREATE INDEX idx_ab_results_experiment ON ab_experiment_results(experiment_id, recorded_at DESC);
CREATE INDEX idx_ab_results_variant ON ab_experiment_results(experiment_id, variant);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: A/B Testing API

Create `backend/core/agents/ab_testing_api.py`:

Router with tag `"ab-testing"`:
- `POST /experiments` — create experiment. Body: `{ experiment_name, description?, agent_id, variant_a_config, variant_b_config, traffic_split_pct? }`. Auth required.
- `GET /experiments` — list experiments. Query: `agent_id`, `status`. Auth required.
- `GET /experiments/{experiment_id}` — get detail. Auth required.
- `PATCH /experiments/{experiment_id}` — update config, status, winner. Auth required.
- `DELETE /experiments/{experiment_id}` — delete. Auth required.
- `POST /experiments/{experiment_id}/start` — set status=running, started_at=now(). Auth required.
- `POST /experiments/{experiment_id}/stop` — set status=completed, ended_at=now(). Body: `{ winner? }`. Auth required.
- `POST /experiments/{experiment_id}/results` — record result. Body: `{ variant, metric_name, metric_value, sample_size? }`. Auth required.
- `GET /experiments/{experiment_id}/results` — list results with aggregation by variant+metric: avg, sum, count. Auth required.
- `GET /experiments/{experiment_id}/summary` — per-variant stats comparison: for each metric, variant_a avg vs variant_b avg, percent difference, suggested winner. Auth required.

Register in `backend/api.py`.

### Task 15: Create frontend API + hooks files.
### Task 16: Create A/B testing page with experiment list, variant config comparison, result recording, summary stats table with winner badge.

---

## Phase 5: Notification Templates (Tasks 17-20)

### Task 17: Notification Templates Schema

Create `backend/supabase/migrations/20260312901004_notification_templates.sql`:

```sql
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'push', 'webhook')),
  subject_template TEXT,
  body_template TEXT NOT NULL,
  variable_schema JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, template_name)
);

CREATE TABLE IF NOT EXISTS notification_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  rendered_subject TEXT,
  rendered_body TEXT NOT NULL,
  variables_used JSONB DEFAULT '{}',
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notif_templates_user ON notification_templates(user_id, created_at DESC);
CREATE INDEX idx_notif_templates_event ON notification_templates(event_type, channel);
CREATE INDEX idx_notif_sends_user ON notification_sends(user_id, sent_at DESC);
CREATE INDEX idx_notif_sends_template ON notification_sends(template_id, sent_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Notification Templates API

Create `backend/core/monitoring/notification_templates_api.py`:

Router with tag `"notification-templates"`:
- `POST /notification-templates` — create template. Body: `{ template_name, event_type, channel?, subject_template?, body_template, variable_schema?, is_default? }`. Auth required.
- `GET /notification-templates` — list templates. Query: `event_type`, `channel`. Auth required.
- `GET /notification-templates/stats` — total templates, by channel, by event_type, top used. Auth required. (place BEFORE /{template_id})
- `GET /notification-templates/{template_id}` — get detail. Auth required.
- `PATCH /notification-templates/{template_id}` — update. Auth required.
- `DELETE /notification-templates/{template_id}` — delete. Auth required.
- `POST /notification-templates/{template_id}/render` — render template. Body: `{ variables: {} }`. Replace `{{variable_name}}` in both subject_template and body_template. Records send with status='sent'. Increments use_count. Returns `{ rendered_subject, rendered_body, send_id }`. Auth required.
- `GET /notification-templates/sends` — list recent sends. Query: `limit` (default 50), `event_type`. Auth required. (place BEFORE /{template_id})

Register in `backend/api.py`.

### Task 19: Create frontend API + hooks files.
### Task 20: Create notification templates page with template list, channel badges, body editor with variable highlighting, render preview panel, send history.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 71 completion status.

---
