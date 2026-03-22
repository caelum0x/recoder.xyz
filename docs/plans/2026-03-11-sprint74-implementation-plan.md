# Sprint 74: Agent Response Templates, Thread Analytics, Error Recovery Playbooks, Agent Comparison & Workspace Management

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add reusable agent response templates for consistent output formatting, per-thread analytics for engagement tracking, automated error recovery playbooks for self-healing agents, side-by-side agent comparison tools, and organizational workspaces for grouping agents and threads — completing the consistency, analytics, resilience, evaluation, and organization features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Response Templates (Tasks 1-4)

### Task 1: Agent Response Templates Schema

Create `backend/supabase/migrations/20260312904000_agent_response_templates.sql`:

```sql
CREATE TABLE IF NOT EXISTS response_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  template_body TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  output_format TEXT DEFAULT 'text' CHECK (output_format IN ('text', 'markdown', 'json', 'html', 'structured')),
  agent_ids TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, template_name)
);

CREATE TABLE IF NOT EXISTS template_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES response_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT,
  thread_id TEXT,
  rendered_output TEXT NOT NULL,
  variables_used JSONB DEFAULT '{}',
  rendered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_response_templates_user ON response_templates(user_id, created_at DESC);
CREATE INDEX idx_response_templates_category ON response_templates(category);
CREATE INDEX idx_template_renders_template ON template_renders(template_id, rendered_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Agent Response Templates API

Create `backend/core/agents/response_templates_api.py`:

Router with tag `"response-templates"`:
- `POST /response-templates` — create. Body: `{ template_name, description?, category?, template_body, variables?, output_format?, agent_ids? }`. Auth required.
- `GET /response-templates` — list. Query: `category`, `output_format`, `limit`. Auth required.
- `GET /response-templates/stats` — total, by category, by format, top by use_count. Auth required. (before /{id})
- `GET /response-templates/{template_id}` — get detail. Auth required.
- `PATCH /response-templates/{template_id}` — update. Auth required.
- `DELETE /response-templates/{template_id}` — delete. Auth required.
- `POST /response-templates/{template_id}/render` — render with variables. Body: `{ variables: {}, agent_id?, thread_id? }`. Replace `{{key}}` placeholders. Increments use_count. Records in template_renders. Returns rendered output. Auth required.
- `GET /response-templates/{template_id}/renders` — list renders. Auth required.

Register in `backend/api.py`.

### Task 3: Create frontend API + hooks files.
### Task 4: Create response templates page with template list, format badges, render preview, variable inputs, render history.

---

## Phase 2: Thread Analytics (Tasks 5-8)

### Task 5: Thread Analytics Schema

Create `backend/supabase/migrations/20260312904001_thread_analytics.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  agent_id TEXT,
  total_messages INTEGER DEFAULT 0,
  user_messages INTEGER DEFAULT 0,
  agent_messages INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  session_duration_ms INTEGER DEFAULT 0,
  user_satisfaction_score NUMERIC(3,2),
  completion_rate NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS thread_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('message_sent', 'message_received', 'file_uploaded', 'tool_used', 'session_start', 'session_end', 'error', 'rating')),
  event_data JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_thread_analytics_user ON thread_analytics(user_id, created_at DESC);
CREATE INDEX idx_thread_analytics_agent ON thread_analytics(agent_id);
CREATE INDEX idx_thread_events_thread ON thread_events(thread_id, occurred_at ASC);
CREATE INDEX idx_thread_events_user ON thread_events(user_id, occurred_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Analytics API

Create `backend/core/threads/thread_analytics_api.py`:

Router with tag `"thread-analytics"`:
- `POST /threads/{thread_id}/analytics` — record/update analytics. Body: `{ agent_id?, total_messages?, user_messages?, agent_messages?, total_tokens?, avg_response_time_ms?, session_duration_ms?, user_satisfaction_score?, completion_rate? }`. Upserts. Auth required.
- `GET /threads/{thread_id}/analytics` — get analytics. Returns 404 if none. Auth required.
- `POST /threads/{thread_id}/events` — record event. Body: `{ event_type, event_data? }`. Auth required.
- `GET /threads/{thread_id}/events` — list events. Auth required.
- `GET /analytics/summary` — aggregate across all threads: total threads, avg messages, avg tokens, avg response time, avg satisfaction, by agent breakdown. Auth required.
- `GET /analytics/trends` — daily thread counts and avg satisfaction over last 30 days. Auth required.
- `GET /analytics/top-threads` — threads by total_messages DESC. Query: `limit` (default 10). Auth required.

Register in `backend/api.py`.

### Task 7: Create frontend API + hooks files.
### Task 8: Create thread analytics page with summary stats, engagement trends chart, top threads table, event timeline per thread.

---

## Phase 3: Error Recovery Playbooks (Tasks 9-12)

### Task 9: Error Recovery Playbooks Schema

Create `backend/supabase/migrations/20260312904002_error_recovery_playbooks.sql`:

```sql
CREATE TABLE IF NOT EXISTS recovery_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  playbook_name TEXT NOT NULL,
  description TEXT,
  error_pattern TEXT NOT NULL,
  error_type TEXT DEFAULT 'general' CHECK (error_type IN ('timeout', 'rate_limit', 'auth_failure', 'network', 'validation', 'general')),
  recovery_steps JSONB NOT NULL DEFAULT '[]',
  auto_execute BOOLEAN DEFAULT false,
  max_retries INTEGER DEFAULT 3,
  cooldown_seconds INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT true,
  trigger_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, playbook_name)
);

CREATE TABLE IF NOT EXISTS recovery_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID NOT NULL REFERENCES recovery_playbooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT,
  error_message TEXT,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  steps_completed INTEGER DEFAULT 0,
  execution_log JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_playbooks_user ON recovery_playbooks(user_id);
CREATE INDEX idx_playbooks_error_type ON recovery_playbooks(error_type, is_active);
CREATE INDEX idx_recovery_executions_playbook ON recovery_executions(playbook_id, started_at DESC);
CREATE INDEX idx_recovery_executions_agent ON recovery_executions(agent_id, started_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Error Recovery Playbooks API

Create `backend/core/agents/error_recovery_api.py`:

Router with tag `"error-recovery"`:
- `POST /playbooks` — create. Body: `{ playbook_name, description?, error_pattern, error_type?, recovery_steps: [{step, action, timeout_seconds?}], auto_execute?, max_retries?, cooldown_seconds? }`. Auth required.
- `GET /playbooks` — list. Query: `error_type`. Auth required.
- `GET /playbooks/{playbook_id}` — detail. Auth required.
- `PATCH /playbooks/{playbook_id}` — update. Auth required.
- `DELETE /playbooks/{playbook_id}` — delete. Auth required.
- `POST /playbooks/{playbook_id}/execute` — run playbook. Body: `{ agent_id?, error_message? }`. Simulates: import random; total = len(recovery_steps); completed = random.randint(total//2, total); status = 'success' if completed==total else 'failed'; log=[{step, action, result} for each step]. Insert execution. Update playbook trigger_count, success_count if success. Auth required.
- `GET /playbooks/{playbook_id}/executions` — list executions. Auth required.
- `GET /playbooks/stats` — total playbooks, success rate overall, by error_type. Auth required. (before /{id})

Register in `backend/api.py`.

### Task 11: Create frontend API + hooks files.
### Task 12: Create error recovery page with playbook list, step editor, execution history, trigger simulation, success rate stats.

---

## Phase 4: Agent Comparison (Tasks 13-16)

### Task 13: Agent Comparison Schema

Create `backend/supabase/migrations/20260312904003_agent_comparison.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  comparison_name TEXT NOT NULL,
  agent_ids TEXT[] NOT NULL,
  comparison_metrics TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, comparison_name)
);

CREATE TABLE IF NOT EXISTS comparison_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES agent_comparisons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC(12,4) NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_comparisons_user ON agent_comparisons(user_id, created_at DESC);
CREATE INDEX idx_comparison_snapshots_comparison ON comparison_metric_snapshots(comparison_id, agent_id);
CREATE INDEX idx_comparison_snapshots_agent ON comparison_metric_snapshots(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Agent Comparison API

Create `backend/core/agents/agent_comparison_api.py`:

Router with tag `"agent-comparison"`:
- `POST /agent-comparisons` — create. Body: `{ comparison_name, agent_ids: list, comparison_metrics?, notes? }`. Auth required.
- `GET /agent-comparisons` — list. Auth required.
- `GET /agent-comparisons/{comparison_id}` — get with all snapshots. Auth required.
- `PATCH /agent-comparisons/{comparison_id}` — update notes, comparison_metrics. Auth required.
- `DELETE /agent-comparisons/{comparison_id}` — delete. Auth required.
- `POST /agent-comparisons/{comparison_id}/metrics` — record metric for an agent. Body: `{ agent_id, metric_name, metric_value }`. Auth required.
- `GET /agent-comparisons/{comparison_id}/summary` — for each metric, return dict of agent_id → value, and which agent has best (highest) value. Auth required.

Register in `backend/api.py`.

### Task 15: Create frontend API + hooks files.
### Task 16: Create agent comparison page with comparison setup, metric snapshot recording, side-by-side agent metric table, best-performer highlights.

---

## Phase 5: Workspace Management (Tasks 17-20)

### Task 17: Workspace Management Schema

Create `backend/supabase/migrations/20260312904004_workspace_management.sql`:

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'folder',
  agent_ids TEXT[] DEFAULT '{}',
  thread_ids TEXT[] DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, workspace_name)
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  description TEXT,
  occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_workspaces_user ON workspaces(user_id, created_at DESC);
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_activity_workspace ON workspace_activity(workspace_id, occurred_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Workspace Management API

Create `backend/core/agents/workspace_management_api.py`:

Router with tag `"workspace-management"`:
- `POST /workspaces` — create. Body: `{ workspace_name, description?, color?, icon?, is_default? }`. Auth required.
- `GET /workspaces` — list with member count and agent/thread counts. Auth required.
- `GET /workspaces/{workspace_id}` — get detail. Auth required.
- `PATCH /workspaces/{workspace_id}` — update. Auth required.
- `DELETE /workspaces/{workspace_id}` — delete. Auth required.
- `POST /workspaces/{workspace_id}/agents` — add agent to workspace. Body: `{ agent_id }`. Appends to agent_ids array: UPDATE ... SET agent_ids = array_append(agent_ids, :agent_id). Auth required.
- `DELETE /workspaces/{workspace_id}/agents/{agent_id}` — remove agent: UPDATE ... SET agent_ids = array_remove(agent_ids, :agent_id). Auth required.
- `POST /workspaces/{workspace_id}/threads` — add thread: UPDATE ... SET thread_ids = array_append. Auth required.
- `DELETE /workspaces/{workspace_id}/threads/{thread_id}` — remove thread. Auth required.
- `POST /workspaces/{workspace_id}/activity` — record activity. Body: `{ activity_type, entity_type?, entity_id?, description? }`. Auth required.
- `GET /workspaces/{workspace_id}/activity` — list activity. Query: `limit` (default 50). Auth required.

Register in `backend/api.py`.

### Task 19: Create frontend API + hooks files.
### Task 20: Create workspaces page with workspace grid, agent/thread counts, color-coded icons, add/remove agents and threads, activity feed.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 74 completion status.

---
