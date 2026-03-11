# Sprint 62: Agent Workflow Templates, Thread Labels & Organization, SLA Monitoring, Agent Resource Quotas & User Preferences Sync

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add reusable workflow templates for agent automation chains, hierarchical thread labels with drag-and-drop organization, SLA monitoring with breach alerts, per-agent resource quota enforcement, and cross-device user preferences synchronization — completing the automation reuse, conversation management, service level monitoring, resource governance, and cross-platform UX features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Workflow Templates (Tasks 1-4)

### Task 1: Workflow Templates Schema

Create `backend/supabase/migrations/20260312100000_workflow_templates.sql`:

```sql
CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'data_pipeline', 'content_generation', 'monitoring', 'integration', 'custom')),
  steps JSONB NOT NULL DEFAULT '[]',
  variables JSONB DEFAULT '[]',
  is_public BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_template_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  variable_values JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  current_step INTEGER DEFAULT 0,
  results JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wf_templates_user ON workflow_templates(user_id, updated_at DESC);
CREATE INDEX idx_wf_templates_category ON workflow_templates(category);
CREATE INDEX idx_wf_templates_public ON workflow_templates(is_public) WHERE is_public = true;
CREATE INDEX idx_wf_runs_template ON workflow_template_runs(template_id, created_at DESC);
CREATE INDEX idx_wf_runs_user ON workflow_template_runs(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Workflow Templates API

Create `backend/core/workflows/workflow_templates_api.py` + `__init__.py`:

Router with tag `"workflow-templates"`:
- `POST /workflows/templates` — create template. Body: `{ name, description?, category?, steps[], variables?, is_public? }`. Steps: `[{ agent_id, instruction, order }]`. Auth required.
- `GET /workflows/templates` — list templates. Query: `category`, `search`, `public_only`, `limit`. Auth required.
- `GET /workflows/templates/{template_id}` — get detail with run count. Auth required.
- `PATCH /workflows/templates/{template_id}` — update. Auth required.
- `DELETE /workflows/templates/{template_id}` — delete. Auth required.
- `POST /workflows/templates/{template_id}/run` — run template. Body: `{ variable_values? }`. Creates run record. Auth required.
- `GET /workflows/templates/{template_id}/runs` — list runs for template. Auth required.

Register in `backend/api.py`.

### Task 3: Workflow Templates Frontend

Create `recoder-agents/src/lib/api/workflow-templates.ts` and `recoder-agents/src/hooks/workflows/use-workflow-templates.ts`.

Hooks: `useWorkflowTemplates(filters)`, `useWorkflowTemplateDetail(id)`, `useCreateWorkflowTemplate()`, `useUpdateWorkflowTemplate()`, `useDeleteWorkflowTemplate()`, `useRunWorkflowTemplate()`, `useWorkflowTemplateRuns(templateId)`.

### Task 4: Workflow Templates UI

Create `recoder-agents/src/app/(dashboard)/workflows/templates/page.tsx`:

Workflow templates page:
- Template cards: name, description preview, category badge, step count, use count, public badge
- Category filter tabs
- "New Template" dialog: name, description, category, step builder (ordered list: agent selector + instruction textarea), variables definition
- Template detail: full step visualization (numbered pipeline), variable inputs, "Run" button, run history list
- Run status tracking: step progress indicator, status badges

---

## Phase 2: Thread Labels & Organization (Tasks 5-8)

### Task 5: Thread Labels Schema

Create `backend/supabase/migrations/20260312100001_thread_labels.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  parent_id UUID REFERENCES thread_labels(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS thread_label_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT NOT NULL,
  label_id UUID NOT NULL REFERENCES thread_labels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (thread_id, label_id)
);

CREATE INDEX idx_thread_labels_user ON thread_labels(user_id, sort_order);
CREATE INDEX idx_thread_labels_parent ON thread_labels(parent_id);
CREATE INDEX idx_label_assignments_thread ON thread_label_assignments(thread_id);
CREATE INDEX idx_label_assignments_label ON thread_label_assignments(label_id);
CREATE INDEX idx_label_assignments_user ON thread_label_assignments(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Labels API

Create `backend/core/threads/thread_labels_api.py`:

Router with tag `"thread-labels"`:
- `POST /thread-labels` — create label. Body: `{ name, color?, parent_id? }`. Auth required.
- `GET /thread-labels` — list labels as tree (with children nested). Auth required.
- `PATCH /thread-labels/{label_id}` — update. Auth required.
- `DELETE /thread-labels/{label_id}` — delete (children become root). Auth required.
- `POST /threads/{thread_id}/labels` — assign label. Body: `{ label_id }`. Auth required.
- `DELETE /threads/{thread_id}/labels/{label_id}` — remove label. Auth required.
- `GET /threads/{thread_id}/labels` — list labels for thread. Auth required.
- `GET /thread-labels/{label_id}/threads` — list threads with label. Auth required.

Register in `backend/api.py`.

### Task 7: Thread Labels Frontend

Create `recoder-agents/src/lib/api/thread-labels.ts` and `recoder-agents/src/hooks/threads/use-thread-labels.ts`.

Hooks: `useThreadLabels()`, `useCreateThreadLabel()`, `useUpdateThreadLabel()`, `useDeleteThreadLabel()`, `useAssignLabel()`, `useRemoveLabel()`, `useThreadLabelsList(threadId)`, `useLabelThreads(labelId)`.

### Task 8: Thread Labels UI

Create `recoder-agents/src/components/thread/thread-label-manager.tsx`:

Thread label manager:
- Label tree: hierarchical display with indent, color dots, thread count per label
- "New Label" with parent selector, name, color picker (8 presets)
- Label pills on thread entries: colored badges, click to filter
- Assign labels from thread: dropdown of available labels with create-new inline
- Label sidebar in threads view: filter threads by clicking labels in tree

---

## Phase 3: SLA Monitoring (Tasks 9-12)

### Task 9: SLA Schema

Create `backend/supabase/migrations/20260312100002_sla_monitoring.sql`:

```sql
CREATE TABLE IF NOT EXISTS sla_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  agent_id TEXT,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('response_time', 'uptime', 'error_rate', 'throughput', 'resolution_time')),
  target_value NUMERIC(10,4) NOT NULL,
  target_unit TEXT DEFAULT 'ms' CHECK (target_unit IN ('ms', 'percent', 'count', 'seconds', 'minutes')),
  evaluation_window TEXT DEFAULT 'daily' CHECK (evaluation_window IN ('hourly', 'daily', 'weekly', 'monthly')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sla_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_id UUID NOT NULL REFERENCES sla_definitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  measured_value NUMERIC(10,4) NOT NULL,
  is_breach BOOLEAN DEFAULT false,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  measured_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sla_defs_user ON sla_definitions(user_id);
CREATE INDEX idx_sla_defs_agent ON sla_definitions(agent_id);
CREATE INDEX idx_sla_measurements_sla ON sla_measurements(sla_id, measured_at DESC);
CREATE INDEX idx_sla_measurements_breach ON sla_measurements(is_breach) WHERE is_breach = true;

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: SLA Monitoring API

Create `backend/core/monitoring/sla_monitoring_api.py`:

Router with tag `"sla-monitoring"`:
- `POST /sla/definitions` — create SLA. Body: `{ name, agent_id?, metric_type, target_value, target_unit?, evaluation_window? }`. Auth required.
- `GET /sla/definitions` — list SLAs with compliance rate. Auth required.
- `PATCH /sla/definitions/{sla_id}` — update. Auth required.
- `DELETE /sla/definitions/{sla_id}` — delete. Auth required.
- `POST /sla/measure` — record measurement for all active SLAs. Simulates measurements, detects breaches. Auth required.
- `GET /sla/{sla_id}/measurements` — list measurements. Query: `breach_only`, `limit`. Auth required.
- `GET /sla/dashboard` — overall SLA dashboard: compliance rate per SLA, recent breaches, worst performing. Auth required.

Register in `backend/api.py`.

### Task 11: SLA Frontend

Create `recoder-agents/src/lib/api/sla-monitoring.ts` and `recoder-agents/src/hooks/monitoring/use-sla-monitoring.ts`.

Hooks: `useSlaDefinitions()`, `useCreateSla()`, `useUpdateSla()`, `useDeleteSla()`, `useMeasureSla()`, `useSlaMeasurements(slaId, filters)`, `useSlaDashboard()`.

### Task 12: SLA Dashboard UI

Create `recoder-agents/src/app/(dashboard)/monitoring/sla/page.tsx`:

SLA monitoring dashboard:
- Overall compliance banner: green (>95%), amber (90-95%), red (<90%)
- SLA cards: name, metric type, target value, compliance % (green/amber/red), agent scope, breach count
- "New SLA" dialog: name, agent selector, metric type, target value, target unit, evaluation window
- "Measure Now" button
- Per-SLA detail: measurement history, breach indicators, compliance trend
- Recent breaches table: SLA name, measured vs target, when
- Filter by agent and metric type

---

## Phase 4: Agent Resource Quotas (Tasks 13-16)

### Task 13: Resource Quotas Schema

Create `backend/supabase/migrations/20260312100003_agent_resource_quotas.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_resource_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('runs_per_day', 'runs_per_hour', 'max_tokens', 'max_cost_daily', 'max_concurrent', 'max_duration_seconds')),
  quota_value NUMERIC(12,4) NOT NULL,
  current_usage NUMERIC(12,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  last_reset_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id, resource_type)
);

CREATE TABLE IF NOT EXISTS quota_violation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_id UUID NOT NULL REFERENCES agent_resource_quotas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  attempted_value NUMERIC(12,4),
  quota_value NUMERIC(12,4),
  violated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_quotas_agent ON agent_resource_quotas(agent_id);
CREATE INDEX idx_quotas_user ON agent_resource_quotas(user_id);
CREATE INDEX idx_violations_user ON quota_violation_log(user_id, violated_at DESC);
CREATE INDEX idx_violations_agent ON quota_violation_log(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Resource Quotas API

Create `backend/core/agents/agent_resource_quotas_api.py`:

Router with tag `"agent-resource-quotas"`:
- `POST /agents/{agent_id}/quotas` — set quota. Body: `{ resource_type, quota_value }`. Upserts. Auth required.
- `GET /agents/{agent_id}/quotas` — list quotas with usage %. Auth required.
- `DELETE /agents/{agent_id}/quotas/{quota_id}` — remove quota. Auth required.
- `POST /agents/{agent_id}/quotas/check` — check if action would violate quota. Body: `{ resource_type, requested_amount }`. Returns allowed/denied. Auth required.
- `POST /agents/{agent_id}/quotas/record-usage` — record resource usage. Body: `{ resource_type, amount }`. Increments current_usage. Auth required.
- `POST /agents/{agent_id}/quotas/reset` — reset usage counters. Auth required.
- `GET /quotas/violations` — list violations. Query: `agent_id`, `limit`. Auth required.

Register in `backend/api.py`.

### Task 15: Resource Quotas Frontend

Create `recoder-agents/src/lib/api/agent-resource-quotas.ts` and `recoder-agents/src/hooks/agents/use-agent-resource-quotas.ts`.

Hooks: `useAgentQuotas(agentId)`, `useSetQuota()`, `useDeleteQuota()`, `useCheckQuota()`, `useRecordUsage()`, `useResetQuotas()`, `useQuotaViolations(agentId?)`.

### Task 16: Resource Quotas UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/quotas-screen.tsx`:

Resource quotas screen:
- Quota cards: resource type, quota value, current usage, usage % bar (green <80%, amber 80-95%, red >95%), last reset, edit/delete
- "Set Quota" dialog: resource type selector, quota value input, explanation of each type
- Usage bars: visual progress bars per quota
- "Reset Usage" button with confirmation
- Violations log: resource type, attempted vs allowed, timestamp
- Auto-reset schedule info

Wire into agent config as "Quotas" tab with Shield icon.

---

## Phase 5: User Preferences Sync (Tasks 17-20)

### Task 17: Preferences Sync Schema

Create `backend/supabase/migrations/20260312100004_user_preferences_sync.sql`:

```sql
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL DEFAULT '{}',
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'appearance', 'editor', 'notifications', 'shortcuts', 'layout', 'privacy')),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, preference_key)
);

CREATE TABLE IF NOT EXISTS preference_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  sync_type TEXT DEFAULT 'push' CHECK (sync_type IN ('push', 'pull', 'conflict_resolved')),
  preferences_synced INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_preferences_user ON user_preferences(user_id, category);
CREATE INDEX idx_preferences_key ON user_preferences(preference_key);
CREATE INDEX idx_sync_log_user ON preference_sync_log(user_id, synced_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Preferences Sync API

Create `backend/core/preferences/user_preferences_sync_api.py`:

Router with tag `"user-preferences-sync"`:
- `GET /preferences` — get all preferences. Query: `category`. Auth required.
- `PUT /preferences` — set preference. Body: `{ preference_key, preference_value, category? }`. Upserts. Auth required.
- `PUT /preferences/batch` — batch set. Body: `{ preferences: [{ preference_key, preference_value, category? }] }`. Auth required.
- `DELETE /preferences/{preference_key}` — delete preference. Auth required.
- `POST /preferences/sync` — sync push: sends local preferences to server. Body: `{ device_id, preferences[] }`. Records sync log. Auth required.
- `GET /preferences/sync` — sync pull: get all preferences for device. Query: `since` (timestamp, returns only changed). Auth required.
- `GET /preferences/sync/log` — sync history. Query: `limit`. Auth required.

Register in `backend/api.py`.

### Task 19: Preferences Sync Frontend

Create `recoder-agents/src/lib/api/user-preferences-sync.ts` and `recoder-agents/src/hooks/settings/use-user-preferences-sync.ts`.

Hooks: `usePreferences(category?)`, `useSetPreference()`, `useBatchSetPreferences()`, `useDeletePreference()`, `useSyncPush()`, `useSyncPull()`, `useSyncLog()`.

### Task 20: Preferences Sync UI

Create `recoder-agents/src/app/(dashboard)/settings/preferences-sync/page.tsx`:

Preferences sync settings page:
- Preferences list grouped by category: general, appearance, editor, notifications, shortcuts, layout, privacy
- Each preference: key name, value preview, last updated, edit/delete
- "Sync Now" button: pushes current preferences to server
- Sync status: last sync time, sync log showing device_id, sync type, count, timestamp
- "Import Preferences" and "Export Preferences" buttons (JSON)
- Conflict indicator if server has newer version

Wire into settings section.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 62 completion status.

---
