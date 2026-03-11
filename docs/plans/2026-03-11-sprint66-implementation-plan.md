# Sprint 66: Agent Collaboration, Thread Pinning, Resource Monitoring, Custom Metrics & Webhook Templates

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-agent collaboration rooms for coordinating agent work, thread pinning to bookmark important conversations, live resource usage monitoring with CPU/memory/disk metrics, custom metric tracking for user-defined KPIs, and reusable webhook payload templates — completing the coordination, discoverability, operational visibility, analytics customization, and integration efficiency features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Collaboration Rooms (Tasks 1-4)

### Task 1: Collaboration Rooms Schema

Create `backend/supabase/migrations/20260312500000_agent_collaboration.sql`:

```sql
CREATE TABLE IF NOT EXISTS collaboration_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  room_name TEXT NOT NULL,
  description TEXT,
  agent_ids TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  objective TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collaboration_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES collaboration_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT,
  sender_type TEXT DEFAULT 'user' CHECK (sender_type IN ('user', 'agent', 'system')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'task_assignment', 'status_update', 'result', 'handoff')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collaboration_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES collaboration_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_agent_id TEXT,
  task_title TEXT NOT NULL,
  task_description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  result JSONB DEFAULT '{}',
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_collab_rooms_user ON collaboration_rooms(user_id, created_at DESC);
CREATE INDEX idx_collab_messages_room ON collaboration_messages(room_id, created_at ASC);
CREATE INDEX idx_collab_tasks_room ON collaboration_tasks(room_id, created_at DESC);
CREATE INDEX idx_collab_tasks_agent ON collaboration_tasks(assigned_agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Collaboration Rooms API

Create `backend/core/agents/collaboration_rooms_api.py`:

Router with tag `"agent-collaboration"`:
- `POST /collaboration/rooms` — create room. Body: `{ room_name, description?, agent_ids?, objective? }`. Auth required.
- `GET /collaboration/rooms` — list rooms. Query: `status`, `limit`. Auth required.
- `GET /collaboration/rooms/{room_id}` — get room with agents and tasks. Auth required.
- `PATCH /collaboration/rooms/{room_id}` — update room. Auth required.
- `DELETE /collaboration/rooms/{room_id}` — delete. Auth required.
- `POST /collaboration/rooms/{room_id}/messages` — post message. Body: `{ content, agent_id?, message_type?, metadata? }`. Auth required.
- `GET /collaboration/rooms/{room_id}/messages` — list messages. Query: `limit`, `offset`. Auth required.
- `POST /collaboration/rooms/{room_id}/tasks` — create task. Body: `{ task_title, task_description?, assigned_agent_id?, priority?, due_at? }`. Auth required.
- `PATCH /collaboration/rooms/{room_id}/tasks/{task_id}` — update task status, result. Auth required.
- `GET /collaboration/rooms/{room_id}/tasks` — list tasks. Auth required.

Register in `backend/api.py`.

### Task 3: Create frontend API + hooks files.
### Task 4: Create collaboration rooms page with room list, multi-agent room view, message feed, task board.

---

## Phase 2: Thread Pinning (Tasks 5-8)

### Task 5: Thread Pinning Schema

Create `backend/supabase/migrations/20260312500001_thread_pinning.sql`:

```sql
CREATE TABLE IF NOT EXISTS pinned_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  pin_label TEXT,
  pin_note TEXT,
  pin_color TEXT DEFAULT '#6366f1',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS thread_pin_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  collection_name TEXT NOT NULL,
  description TEXT,
  thread_ids TEXT[] DEFAULT '{}',
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pinned_threads_user ON pinned_threads(user_id, display_order);
CREATE INDEX idx_pin_collections_user ON thread_pin_collections(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Pinning API

Create `backend/core/threads/thread_pinning_api.py`:

Router with tag `"thread-pinning"`:
- `POST /threads/{thread_id}/pin` — pin thread. Body: `{ pin_label?, pin_note?, pin_color? }`. Auth required.
- `DELETE /threads/{thread_id}/pin` — unpin thread. Auth required.
- `GET /pinned-threads` — list pinned threads. Auth required.
- `PATCH /pinned-threads/{pin_id}` — update pin label/note/color/order. Auth required.
- `POST /pinned-threads/reorder` — reorder pins. Body: `{ pin_ids: [] }`. Auth required.
- `POST /pin-collections` — create collection. Body: `{ collection_name, description?, thread_ids? }`. Auth required.
- `GET /pin-collections` — list collections. Auth required.
- `PATCH /pin-collections/{collection_id}` — update. Auth required.
- `DELETE /pin-collections/{collection_id}` — delete. Auth required.

Register in `backend/api.py`.

### Task 7: Create frontend API + hooks files.
### Task 8: Create pinned threads panel with drag-to-reorder, colored pins, note display, collection organizer.

---

## Phase 3: Resource Monitoring (Tasks 9-12)

### Task 9: Resource Monitoring Schema

Create `backend/supabase/migrations/20260312500002_resource_monitoring.sql`:

```sql
CREATE TABLE IF NOT EXISTS resource_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  cpu_percent NUMERIC(5,2) DEFAULT 0,
  memory_mb NUMERIC(10,2) DEFAULT 0,
  memory_percent NUMERIC(5,2) DEFAULT 0,
  disk_mb NUMERIC(10,2) DEFAULT 0,
  network_in_kb NUMERIC(12,2) DEFAULT 0,
  network_out_kb NUMERIC(12,2) DEFAULT 0,
  active_connections INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  metric TEXT NOT NULL CHECK (metric IN ('cpu_percent', 'memory_percent', 'disk_mb', 'active_connections')),
  threshold NUMERIC(10,2) NOT NULL,
  comparison TEXT DEFAULT 'gt' CHECK (comparison IN ('gt', 'lt', 'eq')),
  is_active BOOLEAN DEFAULT true,
  cooldown_minutes INTEGER DEFAULT 15,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_resource_snapshots_user ON resource_snapshots(user_id, recorded_at DESC);
CREATE INDEX idx_resource_snapshots_agent ON resource_snapshots(agent_id, recorded_at DESC);
CREATE INDEX idx_resource_alerts_user ON resource_alert_rules(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Resource Monitoring API

Create `backend/core/monitoring/resource_monitoring_api.py`:

Router with tag `"resource-monitoring"`:
- `POST /resources/snapshot` — record resource snapshot. Body: `{ agent_id?, cpu_percent, memory_mb, memory_percent, disk_mb?, network_in_kb?, network_out_kb?, active_connections? }`. Auth required.
- `GET /resources/snapshots` — list snapshots. Query: `agent_id`, `minutes` (default 60), `limit`. Auth required.
- `GET /resources/current` — latest snapshot per agent. Returns summary. Auth required.
- `GET /resources/history` — aggregated time-series data. Query: `agent_id`, `hours` (default 24), `interval` (minute/hour). Auth required.
- `POST /resources/alert-rules` — create alert rule. Auth required.
- `GET /resources/alert-rules` — list rules. Auth required.
- `PATCH /resources/alert-rules/{rule_id}` — update. Auth required.
- `DELETE /resources/alert-rules/{rule_id}` — delete. Auth required.
- `POST /resources/check-alerts` — check snapshots against rules. Auth required.

Register in `backend/api.py`.

### Task 11: Create frontend API + hooks files.
### Task 12: Create resource monitoring page with live gauges, time-series charts, alert rules config.

---

## Phase 4: Custom Metrics (Tasks 13-16)

### Task 13: Custom Metrics Schema

Create `backend/supabase/migrations/20260312500003_custom_metrics.sql`:

```sql
CREATE TABLE IF NOT EXISTS custom_metric_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'count',
  aggregation TEXT DEFAULT 'sum' CHECK (aggregation IN ('sum', 'avg', 'min', 'max', 'count', 'last')),
  chart_type TEXT DEFAULT 'line' CHECK (chart_type IN ('line', 'bar', 'area', 'gauge', 'number')),
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, metric_name)
);

CREATE TABLE IF NOT EXISTS custom_metric_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id UUID NOT NULL REFERENCES custom_metric_definitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  value NUMERIC(12,4) NOT NULL,
  dimensions JSONB DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_metric_defs_user ON custom_metric_definitions(user_id);
CREATE INDEX idx_metric_values_metric ON custom_metric_values(metric_id, recorded_at DESC);
CREATE INDEX idx_metric_values_user ON custom_metric_values(user_id, recorded_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Custom Metrics API

Create `backend/core/monitoring/custom_metrics_api.py`:

Router with tag `"custom-metrics"`:
- `POST /custom-metrics/definitions` — create metric definition. Body: `{ metric_name, display_name, description?, unit?, aggregation?, chart_type?, color? }`. Auth required.
- `GET /custom-metrics/definitions` — list definitions. Auth required.
- `PATCH /custom-metrics/definitions/{metric_id}` — update. Auth required.
- `DELETE /custom-metrics/definitions/{metric_id}` — delete. Auth required.
- `POST /custom-metrics/{metric_id}/record` — record value. Body: `{ value, dimensions?, recorded_at? }`. Auth required.
- `GET /custom-metrics/{metric_id}/values` — list values. Query: `hours`, `limit`. Auth required.
- `GET /custom-metrics/{metric_id}/aggregate` — get aggregated stats: latest, min, max, avg, sum, trend. Auth required.
- `GET /custom-metrics/dashboard` — all metrics with latest values for dashboard. Auth required.

Register in `backend/api.py`.

### Task 15: Create frontend API + hooks files.
### Task 16: Create custom metrics page with metric card grid, record value form, time-series chart per metric, dashboard overview.

---

## Phase 5: Webhook Templates (Tasks 17-20)

### Task 17: Webhook Templates Schema

Create `backend/supabase/migrations/20260312500004_webhook_templates.sql`:

```sql
CREATE TABLE IF NOT EXISTS webhook_payload_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL,
  payload_template JSONB NOT NULL DEFAULT '{}',
  headers_template JSONB DEFAULT '{}',
  variable_definitions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_template_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES webhook_payload_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rendered_payload JSONB NOT NULL,
  variables_used JSONB DEFAULT '{}',
  rendered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wh_templates_user ON webhook_payload_templates(user_id, created_at DESC);
CREATE INDEX idx_wh_templates_event ON webhook_payload_templates(trigger_event);
CREATE INDEX idx_wh_renders_template ON webhook_template_renders(template_id, rendered_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Webhook Templates API

Create `backend/core/integrations/webhook_templates_api.py` + `__init__.py`:

Router with tag `"webhook-templates"`:
- `POST /webhook-templates` — create template. Body: `{ template_name, description?, trigger_event, payload_template, headers_template?, variable_definitions? }`. Auth required.
- `GET /webhook-templates` — list templates. Query: `trigger_event`, `limit`. Auth required.
- `GET /webhook-templates/{template_id}` — get detail. Auth required.
- `PATCH /webhook-templates/{template_id}` — update. Auth required.
- `DELETE /webhook-templates/{template_id}` — delete. Auth required.
- `POST /webhook-templates/{template_id}/render` — render template with variables. Body: `{ variables: {} }`. Replaces `{{variable}}` placeholders in payload. Returns rendered payload. Records render. Auth required.
- `GET /webhook-templates/{template_id}/renders` — list recent renders. Auth required.

Register in `backend/api.py`.

### Task 19: Create frontend API + hooks files.
### Task 20: Create webhook templates page with template list, JSON editor for payload, variable definitions, render preview, render history.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 66 completion status.

---
