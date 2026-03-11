# Sprint 65: Agent Scheduled Tasks, Thread Annotations, Usage Forecasting, Agent Template Gallery & Activity Feed

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cron-like scheduled task execution for agents, collaborative thread annotations with mentions, predictive usage forecasting with trend analysis, curated agent template gallery with one-click creation, and unified activity feed across all platform features — completing the automation scheduling, collaboration, predictive analytics, onboarding, and activity visibility features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Scheduled Tasks (Tasks 1-4)

### Task 1: Scheduled Tasks Schema

Create `backend/supabase/migrations/20260312400000_agent_scheduled_tasks.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  task_name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  input_payload JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout_seconds INTEGER DEFAULT 300,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_task_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES agent_scheduled_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'timed_out', 'skipped')),
  output JSONB DEFAULT '{}',
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_scheduled_tasks_user ON agent_scheduled_tasks(user_id, created_at DESC);
CREATE INDEX idx_scheduled_tasks_agent ON agent_scheduled_tasks(agent_id);
CREATE INDEX idx_scheduled_tasks_next ON agent_scheduled_tasks(next_run_at) WHERE is_active = true;
CREATE INDEX idx_task_runs_task ON scheduled_task_runs(task_id, started_at DESC);
CREATE INDEX idx_task_runs_user ON scheduled_task_runs(user_id, started_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Scheduled Tasks API

Create `backend/core/agents/agent_scheduled_tasks_api.py`:

Router with tag `"agent-scheduled-tasks"`:
- `POST /agents/{agent_id}/scheduled-tasks` — create task. Body: `{ task_name, cron_expression, input_payload?, max_retries?, timeout_seconds? }`. Calculates next_run_at from cron. Auth required.
- `GET /agents/{agent_id}/scheduled-tasks` — list tasks. Auth required.
- `PATCH /agents/{agent_id}/scheduled-tasks/{task_id}` — update task. Auth required.
- `DELETE /agents/{agent_id}/scheduled-tasks/{task_id}` — delete. Auth required.
- `POST /agents/{agent_id}/scheduled-tasks/{task_id}/trigger` — manually trigger run. Creates run record. Auth required.
- `GET /agents/{agent_id}/scheduled-tasks/{task_id}/runs` — list runs. Query: `status`, `limit`. Auth required.
- `GET /scheduled-tasks/upcoming` — list next 20 upcoming runs across all agents. Auth required.

Register in `backend/api.py`.

### Task 3: Create frontend API + hooks files.
### Task 4: Create scheduled tasks screen with cron builder, task list, run history, manual trigger, upcoming runs timeline.

---

## Phase 2: Thread Annotations (Tasks 5-8)

### Task 5: Thread Annotations Schema

Create `backend/supabase/migrations/20260312400001_thread_annotations.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER,
  content TEXT NOT NULL,
  annotation_type TEXT DEFAULT 'note' CHECK (annotation_type IN ('note', 'question', 'action_item', 'highlight', 'warning')),
  color TEXT DEFAULT '#6366f1',
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS annotation_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id UUID NOT NULL REFERENCES thread_annotations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_annotations_thread ON thread_annotations(thread_id, created_at DESC);
CREATE INDEX idx_annotations_user ON thread_annotations(user_id, created_at DESC);
CREATE INDEX idx_annotations_type ON thread_annotations(annotation_type) WHERE NOT is_resolved;
CREATE INDEX idx_annotation_replies ON annotation_replies(annotation_id, created_at);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Annotations API

Create `backend/core/threads/thread_annotations_api.py`:

Router with tag `"thread-annotations"`:
- `POST /threads/{thread_id}/annotations` — create annotation. Body: `{ message_index?, content, annotation_type?, color? }`. Auth required.
- `GET /threads/{thread_id}/annotations` — list annotations. Query: `type`, `resolved`. Auth required.
- `PATCH /annotations/{annotation_id}` — update. Auth required.
- `DELETE /annotations/{annotation_id}` — delete. Auth required.
- `POST /annotations/{annotation_id}/resolve` — mark resolved. Auth required.
- `POST /annotations/{annotation_id}/replies` — add reply. Body: `{ content }`. Auth required.
- `GET /annotations/{annotation_id}/replies` — list replies. Auth required.
- `GET /annotations/action-items` — list all unresolved action items across threads. Auth required.

Register in `backend/api.py`.

### Task 7: Create frontend API + hooks files.
### Task 8: Create annotation panel with annotation markers on messages, type-colored badges, reply threads, action items dashboard.

---

## Phase 3: Usage Forecasting (Tasks 9-12)

### Task 9: Usage Forecasting Schema

Create `backend/supabase/migrations/20260312400002_usage_forecasting.sql`:

```sql
CREATE TABLE IF NOT EXISTS usage_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('tokens', 'api_calls', 'cost', 'storage', 'compute_minutes', 'thread_count')),
  forecast_period TEXT DEFAULT 'monthly' CHECK (forecast_period IN ('daily', 'weekly', 'monthly')),
  historical_data JSONB DEFAULT '[]',
  forecast_data JSONB DEFAULT '[]',
  trend TEXT DEFAULT 'stable' CHECK (trend IN ('increasing', 'decreasing', 'stable', 'volatile')),
  confidence_score NUMERIC(3,2) DEFAULT 0.0,
  alert_threshold NUMERIC(12,2),
  projected_value NUMERIC(12,2),
  generated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_type TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_forecasts_user ON usage_forecasts(user_id, metric_type);
CREATE INDEX idx_forecasts_period ON usage_forecasts(forecast_period, generated_at DESC);
CREATE INDEX idx_snapshots_user ON usage_snapshots(user_id, metric_type, recorded_at DESC);
CREATE INDEX idx_snapshots_period ON usage_snapshots(period_start, period_end);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Usage Forecasting API

Create `backend/core/billing/usage_forecasting_api.py`:

Router with tag `"usage-forecasting"`:
- `POST /usage/forecast/generate` — generate forecasts for all metric types. Uses linear regression on historical snapshots. Auth required.
- `GET /usage/forecasts` — list current forecasts. Query: `metric_type`, `period`. Auth required.
- `GET /usage/forecasts/{metric_type}` — get detailed forecast with historical and projected data. Auth required.
- `POST /usage/snapshots` — record usage snapshot. Body: `{ metric_type, value, period_start, period_end }`. Auth required.
- `GET /usage/snapshots` — list snapshots. Query: `metric_type`, `limit`. Auth required.
- `GET /usage/trends` — summary: trend per metric, highest growth, projected overages. Auth required.

Register in `backend/api.py`.

### Task 11: Create frontend API + hooks files.
### Task 12: Create usage forecasting page with trend charts (historical + projected), metric cards, alert thresholds, trend indicators.

---

## Phase 4: Agent Template Gallery (Tasks 13-16)

### Task 13: Template Gallery Schema

Create `backend/supabase/migrations/20260312400003_agent_template_gallery.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  template_name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'coding', 'writing', 'analysis', 'customer_support', 'data', 'automation', 'creative')),
  agent_config JSONB NOT NULL DEFAULT '{}',
  icon TEXT DEFAULT 'bot',
  is_official BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  preview_images TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_agent_id TEXT,
  used_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_templates_category ON agent_templates(category);
CREATE INDEX idx_templates_official ON agent_templates(is_official) WHERE is_official = true;
CREATE INDEX idx_templates_public ON agent_templates(is_public) WHERE is_public = true;
CREATE INDEX idx_templates_tags ON agent_templates USING GIN (tags);
CREATE INDEX idx_templates_popular ON agent_templates(use_count DESC);
CREATE INDEX idx_template_usage_template ON template_usage_log(template_id);
CREATE INDEX idx_template_usage_user ON template_usage_log(user_id, used_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Template Gallery API

Create `backend/core/agents/agent_template_gallery_api.py`:

Router with tag `"agent-template-gallery"`:
- `POST /agent-templates` — create template. Body: `{ template_name, description?, category?, agent_config, icon?, is_public?, tags? }`. Auth required.
- `GET /agent-templates` — list templates. Query: `category`, `search`, `tags`, `official_only`, `sort_by` (popular, recent), `limit`, `offset`. Auth required.
- `GET /agent-templates/{template_id}` — get detail. Auth required.
- `POST /agent-templates/{template_id}/use` — create agent from template. Increments use_count, logs usage. Returns created agent config. Auth required.
- `PATCH /agent-templates/{template_id}` — update own template. Auth required.
- `DELETE /agent-templates/{template_id}` — delete own template. Auth required.
- `POST /agent-templates/from-agent/{agent_id}` — create template from existing agent. Auth required.
- `GET /agent-templates/categories` — list categories with counts. Auth required.

Register in `backend/api.py`.

### Task 15: Create frontend API + hooks files.
### Task 16: Create template gallery page with category tabs, search, template cards with icons, "Use Template" button, "Create from Agent" flow.

---

## Phase 5: Activity Feed (Tasks 17-20)

### Task 17: Activity Feed Schema

Create `backend/supabase/migrations/20260312400004_activity_feed.sql`:

```sql
CREATE TABLE IF NOT EXISTS activity_feed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('agent_created', 'agent_updated', 'agent_deleted', 'thread_started', 'thread_completed', 'deployment_created', 'webhook_triggered', 'error_detected', 'benchmark_run', 'template_used', 'config_changed', 'scheduled_task_run', 'annotation_added')),
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_feed_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  muted_event_types TEXT[] DEFAULT '{}',
  show_read BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_activity_user ON activity_feed_events(user_id, created_at DESC);
CREATE INDEX idx_activity_type ON activity_feed_events(event_type, created_at DESC);
CREATE INDEX idx_activity_resource ON activity_feed_events(resource_type, resource_id);
CREATE INDEX idx_activity_unread ON activity_feed_events(user_id, is_read) WHERE NOT is_read;
CREATE INDEX idx_activity_prefs_user ON activity_feed_preferences(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Activity Feed API

Create `backend/core/monitoring/activity_feed_api.py`:

Router with tag `"activity-feed"`:
- `POST /activity/events` — record event. Body: `{ event_type, resource_type, resource_id?, title, description?, metadata? }`. Auth required.
- `GET /activity/feed` — list events. Query: `event_type`, `resource_type`, `unread_only`, `limit`, `offset`. Respects muted types. Auth required.
- `POST /activity/events/{event_id}/read` — mark as read. Auth required.
- `POST /activity/events/mark-all-read` — mark all as read. Auth required.
- `GET /activity/feed/preferences` — get feed preferences. Auth required.
- `PUT /activity/feed/preferences` — update preferences. Body: `{ muted_event_types?, show_read? }`. Auth required.
- `GET /activity/feed/stats` — unread count, events per type today, most active hour. Auth required.

Register in `backend/api.py`.

### Task 19: Create frontend API + hooks files.
### Task 20: Create activity feed page with event timeline, type filters, read/unread toggle, mute controls, stats header.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 65 completion status.

---
