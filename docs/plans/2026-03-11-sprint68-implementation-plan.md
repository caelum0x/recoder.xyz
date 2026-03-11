# Sprint 68: Agent Approval Workflows, Thread Comparisons, Log Aggregation, Agent Skill Trees & Deployment Pipelines

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add human-in-the-loop approval workflows for agent actions, side-by-side thread comparison for evaluating responses, centralized log aggregation with search and filters, visual agent skill tree progression system, and multi-stage deployment pipelines with gates — completing the governance, evaluation, observability, gamification, and deployment workflow features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Approval Workflows (Tasks 1-4)

### Task 1: Approval Workflows Schema

Create `backend/supabase/migrations/20260312700000_approval_workflows.sql`:

```sql
CREATE TABLE IF NOT EXISTS approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workflow_name TEXT NOT NULL,
  agent_id TEXT,
  trigger_conditions JSONB DEFAULT '{}',
  approvers TEXT[] DEFAULT '{}',
  approval_timeout_hours INTEGER DEFAULT 24,
  auto_reject_on_timeout BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES approval_workflows(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_data JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  decision_note TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_approval_workflows_user ON approval_workflows(user_id);
CREATE INDEX idx_approval_workflows_agent ON approval_workflows(agent_id);
CREATE INDEX idx_approval_requests_user ON approval_requests(user_id, created_at DESC);
CREATE INDEX idx_approval_requests_status ON approval_requests(status, created_at DESC);
CREATE INDEX idx_approval_requests_agent ON approval_requests(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Approval Workflows API

Create `backend/core/agents/approval_workflows_api.py`:

Router with tag `"approval-workflows"`:
- `POST /approval/workflows` — create workflow. Body: `{ workflow_name, agent_id?, trigger_conditions?, approvers?, approval_timeout_hours?, auto_reject_on_timeout? }`. Auth required.
- `GET /approval/workflows` — list workflows. Auth required.
- `PATCH /approval/workflows/{workflow_id}` — update. Auth required.
- `DELETE /approval/workflows/{workflow_id}` — delete. Auth required.
- `POST /approval/requests` — create approval request. Body: `{ agent_id, action_type, action_data, workflow_id? }`. Sets expires_at from workflow timeout. Auth required.
- `GET /approval/requests` — list requests. Query: `status`, `agent_id`, `limit`. Auth required.
- `GET /approval/requests/{request_id}` — get detail. Auth required.
- `POST /approval/requests/{request_id}/approve` — approve. Body: `{ decision_note? }`. Auth required.
- `POST /approval/requests/{request_id}/reject` — reject. Body: `{ decision_note? }`. Auth required.
- `POST /approval/requests/{request_id}/cancel` — cancel. Auth required.
- `GET /approval/stats` — pending count, approval rate, avg decision time, by action_type. Auth required.

Register in `backend/api.py`.

### Task 3: Create frontend API + hooks files.
### Task 4: Create approval workflows page with workflow config, pending requests inbox, approve/reject actions, stats.

---

## Phase 2: Thread Comparisons (Tasks 5-8)

### Task 5: Thread Comparisons Schema

Create `backend/supabase/migrations/20260312700001_thread_comparisons.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  comparison_name TEXT,
  thread_ids TEXT[] NOT NULL,
  comparison_config JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comparison_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES thread_comparisons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 10),
  criteria_scores JSONB DEFAULT '{}',
  strengths TEXT[] DEFAULT '{}',
  weaknesses TEXT[] DEFAULT '{}',
  preferred BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (comparison_id, thread_id)
);

CREATE INDEX idx_comparisons_user ON thread_comparisons(user_id, created_at DESC);
CREATE INDEX idx_evaluations_comparison ON comparison_evaluations(comparison_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Comparisons API

Create `backend/core/threads/thread_comparisons_api.py`:

Router with tag `"thread-comparisons"`:
- `POST /thread-comparisons` — create comparison. Body: `{ thread_ids, comparison_name?, notes?, comparison_config? }`. Auth required.
- `GET /thread-comparisons` — list comparisons. Auth required.
- `GET /thread-comparisons/{comparison_id}` — get with evaluations. Auth required.
- `DELETE /thread-comparisons/{comparison_id}` — delete. Auth required.
- `POST /thread-comparisons/{comparison_id}/evaluate` — submit evaluation. Body: `{ thread_id, quality_score, criteria_scores?, strengths?, weaknesses?, preferred?, notes? }`. Upserts. Auth required.
- `GET /thread-comparisons/{comparison_id}/evaluations` — list evaluations. Auth required.
- `GET /thread-comparisons/stats` — total comparisons, avg quality scores, most evaluated threads. Auth required.

Register in `backend/api.py`.

### Task 7: Create frontend API + hooks files.
### Task 8: Create thread comparison page with side-by-side thread viewer, scoring form, winner badge, history.

---

## Phase 3: Log Aggregation (Tasks 9-12)

### Task 9: Log Aggregation Schema

Create `backend/supabase/migrations/20260312700002_log_aggregation.sql`:

```sql
CREATE TABLE IF NOT EXISTS aggregated_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  log_level TEXT DEFAULT 'info' CHECK (log_level IN ('debug', 'info', 'warning', 'error', 'critical')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  trace_id TEXT,
  span_id TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS log_saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  filter_name TEXT NOT NULL,
  filter_config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_logs_user ON aggregated_logs(user_id, created_at DESC);
CREATE INDEX idx_logs_level ON aggregated_logs(log_level, created_at DESC);
CREATE INDEX idx_logs_agent ON aggregated_logs(agent_id, created_at DESC);
CREATE INDEX idx_logs_trace ON aggregated_logs(trace_id);
CREATE INDEX idx_logs_tags ON aggregated_logs USING GIN (tags);
CREATE INDEX idx_log_filters_user ON log_saved_filters(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Log Aggregation API

Create `backend/core/monitoring/log_aggregation_api.py`:

Router with tag `"log-aggregation"`:
- `POST /logs` — ingest log entry. Body: `{ agent_id?, log_level?, source, message, details?, trace_id?, span_id?, tags? }`. Auth required.
- `POST /logs/batch` — ingest multiple log entries. Body: `{ logs: [{...}] }`. Auth required.
- `GET /logs` — query logs. Query: `agent_id`, `log_level`, `source`, `search` (ILIKE message), `trace_id`, `tags`, `from_time`, `to_time`, `limit` (default 100), `offset`. Auth required.
- `GET /logs/stats` — count by level, by agent, by source, top tags, logs per hour (last 24h). Auth required.
- `GET /logs/trace/{trace_id}` — get all logs for trace. Auth required.
- `DELETE /logs` — delete logs older than N days. Query: `days`. Auth required.
- `POST /logs/saved-filters` — save a filter config. Body: `{ filter_name, filter_config }`. Auth required.
- `GET /logs/saved-filters` — list saved filters. Auth required.
- `DELETE /logs/saved-filters/{filter_id}` — delete saved filter. Auth required.

Register in `backend/api.py`.

### Task 11: Create frontend API + hooks files.
### Task 12: Create log viewer page with level-color coded rows, search, filters, trace grouping, export, saved filters.

---

## Phase 4: Agent Skill Trees (Tasks 13-16)

### Task 13: Skill Trees Schema

Create `backend/supabase/migrations/20260312700003_agent_skill_trees.sql`:

```sql
CREATE TABLE IF NOT EXISTS skill_tree_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  skill_description TEXT,
  skill_category TEXT DEFAULT 'general',
  parent_skill_id UUID REFERENCES skill_tree_nodes(id) ON DELETE SET NULL,
  level_required INTEGER DEFAULT 1,
  xp_cost INTEGER DEFAULT 100,
  icon TEXT DEFAULT 'star',
  is_unlocked BOOLEAN DEFAULT false,
  unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, skill_name)
);

CREATE TABLE IF NOT EXISTS skill_xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  xp_amount INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_skill_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  total_xp INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  skills_unlocked INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX idx_skill_nodes_agent ON skill_tree_nodes(agent_id);
CREATE INDEX idx_skill_nodes_user ON skill_tree_nodes(user_id, agent_id);
CREATE INDEX idx_skill_xp_agent ON skill_xp_events(agent_id, created_at DESC);
CREATE INDEX idx_skill_progress_user ON agent_skill_progress(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Skill Trees API

Create `backend/core/agents/agent_skill_trees_api.py`:

Router with tag `"agent-skill-trees"`:
- `POST /agents/{agent_id}/skills` — create skill node. Body: `{ skill_name, skill_description?, skill_category?, parent_skill_id?, level_required?, xp_cost?, icon? }`. Auth required.
- `GET /agents/{agent_id}/skills` — list skill tree. Returns nodes with hierarchy. Auth required.
- `POST /agents/{agent_id}/skills/{skill_id}/unlock` — unlock skill. Checks xp and prerequisites. Deducts xp. Auth required.
- `DELETE /agents/{agent_id}/skills/{skill_id}` — delete skill. Auth required.
- `POST /agents/{agent_id}/xp` — award XP. Body: `{ xp_amount, event_type, description? }`. Updates progress. Recalculates level (level = floor(total_xp / 500) + 1). Auth required.
- `GET /agents/{agent_id}/xp` — list XP events. Auth required.
- `GET /agents/{agent_id}/progress` — get progress summary (total_xp, level, skills_unlocked). Auth required.

Register in `backend/api.py`.

### Task 15: Create frontend API + hooks files.
### Task 16: Create skill tree screen in agent config with visual tree, XP bar, unlock buttons, level display.

---

## Phase 5: Deployment Pipelines (Tasks 17-20)

### Task 17: Deployment Pipelines Schema

Create `backend/supabase/migrations/20260312700004_deployment_pipelines.sql`:

```sql
CREATE TABLE IF NOT EXISTS deployment_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pipeline_name TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  stages JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  auto_promote BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES deployment_pipelines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  current_stage_index INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'failed', 'cancelled')),
  stage_results JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pipeline_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES deployment_pipelines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  stage_index INTEGER NOT NULL,
  gate_type TEXT DEFAULT 'manual' CHECK (gate_type IN ('manual', 'auto', 'approval')),
  conditions JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'skipped')),
  evaluated_at TIMESTAMPTZ
);

CREATE INDEX idx_pipelines_user ON deployment_pipelines(user_id);
CREATE INDEX idx_pipelines_agent ON deployment_pipelines(agent_id);
CREATE INDEX idx_pipeline_runs_pipeline ON pipeline_runs(pipeline_id, started_at DESC);
CREATE INDEX idx_pipeline_runs_user ON pipeline_runs(user_id, started_at DESC);
CREATE INDEX idx_pipeline_gates_pipeline ON pipeline_gates(pipeline_id, stage_index);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Deployment Pipelines API

Create `backend/core/agents/deployment_pipelines_api.py`:

Router with tag `"deployment-pipelines"`:
- `POST /deployment/pipelines` — create pipeline. Body: `{ pipeline_name, agent_id, stages: [{name, type, config}], auto_promote? }`. Auth required.
- `GET /deployment/pipelines` — list pipelines. Query: `agent_id`. Auth required.
- `GET /deployment/pipelines/{pipeline_id}` — get detail. Auth required.
- `PATCH /deployment/pipelines/{pipeline_id}` — update. Auth required.
- `DELETE /deployment/pipelines/{pipeline_id}` — delete. Auth required.
- `POST /deployment/pipelines/{pipeline_id}/run` — start pipeline run. Auth required.
- `GET /deployment/pipelines/{pipeline_id}/runs` — list runs. Auth required.
- `GET /deployment/runs/{run_id}` — get run detail with stage_results. Auth required.
- `POST /deployment/runs/{run_id}/advance` — advance to next stage (if gate passes). Auth required.
- `POST /deployment/runs/{run_id}/cancel` — cancel run. Auth required.
- `GET /deployment/pipelines/{pipeline_id}/gates` — list gates for pipeline. Auth required.
- `POST /deployment/gates/{gate_id}/pass` — manually pass a gate. Auth required.
- `POST /deployment/gates/{gate_id}/fail` — manually fail a gate. Auth required.

Register in `backend/api.py`.

### Task 19: Create frontend API + hooks files.
### Task 20: Create deployment pipelines page with stage visualization, run history, gate controls, stage results.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 68 completion status.

---
