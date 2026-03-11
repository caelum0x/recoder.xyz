# Sprint 61: Agent Shared Prompts Library, Thread Branching, Incident Postmortems, Agent Cost Alerts & Data Retention Policies

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add shared prompt library with versioning across agents, thread branching to explore alternative conversation paths, structured incident postmortem reports, per-agent cost threshold alerts, and configurable data retention policies with automatic cleanup — completing the prompt reuse, conversation exploration, incident management, cost governance, and data lifecycle features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Shared Prompts Library (Tasks 1-4)

### Task 1: Shared Prompts Schema

Create `backend/supabase/migrations/20260312000000_shared_prompts.sql`:

```sql
CREATE TABLE IF NOT EXISTS shared_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'system', 'coding', 'writing', 'analysis', 'creative', 'custom')),
  tags TEXT[] DEFAULT '{}',
  version INTEGER DEFAULT 1,
  is_public BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shared_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES shared_prompts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  change_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (prompt_id, version)
);

CREATE INDEX idx_shared_prompts_user ON shared_prompts(user_id, updated_at DESC);
CREATE INDEX idx_shared_prompts_category ON shared_prompts(category);
CREATE INDEX idx_shared_prompts_tags ON shared_prompts USING GIN (tags);
CREATE INDEX idx_shared_prompts_public ON shared_prompts(is_public) WHERE is_public = true;
CREATE INDEX idx_prompt_versions_prompt ON shared_prompt_versions(prompt_id, version DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Shared Prompts API

Create `backend/core/prompts/shared_prompts_api.py` + `__init__.py`:

Router with tag `"shared-prompts"`:
- `POST /prompts/shared` — create prompt. Body: `{ title, content, category?, tags?, is_public? }`. Creates version 1. Auth required.
- `GET /prompts/shared` — list prompts. Query: `category`, `search`, `tags`, `public_only`, `limit`, `offset`. Auth required.
- `GET /prompts/shared/{prompt_id}` — get prompt detail with versions. Auth required.
- `PATCH /prompts/shared/{prompt_id}` — update prompt. Body: `{ title?, content?, category?, tags?, is_public? }`. If content changed, creates new version. Auth required.
- `DELETE /prompts/shared/{prompt_id}` — delete. Auth required.
- `POST /prompts/shared/{prompt_id}/use` — increment use count, return content. Auth required.
- `GET /prompts/shared/{prompt_id}/versions` — list version history. Auth required.

Register in `backend/api.py`.

### Task 3: Shared Prompts Frontend

Create `recoder-agents/src/lib/api/shared-prompts.ts` and `recoder-agents/src/hooks/prompts/use-shared-prompts.ts`.

Hooks: `useSharedPrompts(filters)`, `useSharedPromptDetail(promptId)`, `useCreateSharedPrompt()`, `useUpdateSharedPrompt()`, `useDeleteSharedPrompt()`, `useSharedPrompt()`, `usePromptVersions(promptId)`.

### Task 4: Shared Prompts UI

Create `recoder-agents/src/app/(dashboard)/prompts/shared/page.tsx`:

Shared prompts library page:
- Search bar with category filter tabs (All, System, Coding, Writing, Analysis, Creative, Custom)
- Prompt cards: title, content preview (truncated), category badge, tags, use count, public/private badge, version number
- "New Prompt" dialog: title, content textarea with preview, category select, tags input, public toggle
- Click card to expand: full content, version history timeline, "Use Prompt" button, edit/delete
- Version diff: compare current vs previous version (added=green, removed=red)
- "Copy to Clipboard" button on each prompt

Wire into sidebar prompts section.

---

## Phase 2: Thread Branching (Tasks 5-8)

### Task 5: Thread Branches Schema

Create `backend/supabase/migrations/20260312000001_thread_branches.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_thread_id TEXT NOT NULL,
  branch_thread_id TEXT NOT NULL,
  branch_point_index INTEGER NOT NULL,
  branch_name TEXT,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'merged', 'archived', 'deleted')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_branches_source ON thread_branches(source_thread_id);
CREATE INDEX idx_branches_branch ON thread_branches(branch_thread_id);
CREATE INDEX idx_branches_user ON thread_branches(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Branches API

Create `backend/core/threads/thread_branches_api.py`:

Router with tag `"thread-branches"`:
- `POST /threads/{thread_id}/branch` — create branch at message index. Body: `{ branch_point_index, branch_name?, description? }`. Creates new thread record, copies messages up to branch point. Auth required.
- `GET /threads/{thread_id}/branches` — list branches from this thread. Auth required.
- `GET /branches/{branch_id}` — get branch detail. Auth required.
- `PATCH /branches/{branch_id}` — update name, description, status. Auth required.
- `DELETE /branches/{branch_id}` — delete branch (marks deleted). Auth required.
- `GET /branches/tree/{thread_id}` — get full branch tree (recursive). Returns tree structure of thread and all branches. Auth required.

Register in `backend/api.py`.

### Task 7: Thread Branches Frontend

Create `recoder-agents/src/lib/api/thread-branches.ts` and `recoder-agents/src/hooks/threads/use-thread-branches.ts`.

Hooks: `useCreateBranch()`, `useThreadBranches(threadId)`, `useBranchDetail(branchId)`, `useUpdateBranch()`, `useDeleteBranch()`, `useBranchTree(threadId)`.

### Task 8: Thread Branches UI

Create `recoder-agents/src/components/thread/thread-branch-panel.tsx`:

Thread branch panel:
- Branch tree visualization: vertical tree showing parent thread and branches with branch points marked
- "Branch Here" button on message hover (git branch icon)
- Branch dialog: name input, optional description
- Branch list: name, branch point, message count, status badge, date, open/archive/delete actions
- Click branch to navigate to branch thread
- Merge indicator for merged branches
- Branch status badges: active=green, merged=blue, archived=gray

Wire branch button into thread message rendering. Wire branch panel into thread sidebar.

---

## Phase 3: Incident Postmortems (Tasks 9-12)

### Task 9: Postmortems Schema

Create `backend/supabase/migrations/20260312000002_incident_postmortems.sql`:

```sql
CREATE TABLE IF NOT EXISTS incident_postmortems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  incident_id TEXT,
  title TEXT NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'published', 'archived')),
  summary TEXT,
  timeline JSONB DEFAULT '[]',
  root_cause TEXT,
  impact TEXT,
  action_items JSONB DEFAULT '[]',
  lessons_learned TEXT[] DEFAULT '{}',
  affected_agents TEXT[] DEFAULT '{}',
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_postmortems_user ON incident_postmortems(user_id, created_at DESC);
CREATE INDEX idx_postmortems_status ON incident_postmortems(status);
CREATE INDEX idx_postmortems_severity ON incident_postmortems(severity);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Postmortems API

Create `backend/core/monitoring/incident_postmortems_api.py`:

Router with tag `"incident-postmortems"`:
- `POST /postmortems` — create postmortem. Body: `{ title, incident_id?, severity?, summary?, root_cause?, impact?, action_items?, lessons_learned?, affected_agents?, started_at?, resolved_at? }`. Auth required.
- `GET /postmortems` — list postmortems. Query: `status`, `severity`, `limit`, `offset`. Auth required.
- `GET /postmortems/{postmortem_id}` — get detail. Auth required.
- `PATCH /postmortems/{postmortem_id}` — update any field. Auth required.
- `DELETE /postmortems/{postmortem_id}` — delete. Auth required.
- `POST /postmortems/{postmortem_id}/publish` — set status to published. Auth required.
- `GET /postmortems/stats` — stats: total, by severity, avg resolution time, top root causes. Auth required.

Register in `backend/api.py`.

### Task 11: Postmortems Frontend

Create `recoder-agents/src/lib/api/incident-postmortems.ts` and `recoder-agents/src/hooks/monitoring/use-incident-postmortems.ts`.

Hooks: `usePostmortems(filters)`, `usePostmortemDetail(id)`, `useCreatePostmortem()`, `useUpdatePostmortem()`, `useDeletePostmortem()`, `usePublishPostmortem()`, `usePostmortemStats()`.

### Task 12: Postmortems UI

Create `recoder-agents/src/app/(dashboard)/monitoring/postmortems/page.tsx`:

Incident postmortems page:
- Stats header: total postmortems, by severity breakdown, avg resolution time
- Postmortem list: title, severity badge, status badge, affected agents, resolution time, date
- "New Postmortem" dialog: title, severity, summary, root cause, impact, action items (add/remove list), lessons learned, affected agents multi-select, timestamps
- Postmortem detail view: structured layout with timeline, root cause, impact, action items (checkbox style), lessons learned
- "Publish" button to finalize
- Status workflow: Draft → In Review → Published
- Filter by status and severity

Wire into monitoring section.

---

## Phase 4: Agent Cost Alerts (Tasks 13-16)

### Task 13: Cost Alerts Schema

Create `backend/supabase/migrations/20260312000003_agent_cost_alerts.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_cost_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  name TEXT NOT NULL,
  threshold_amount NUMERIC(10,4) NOT NULL,
  threshold_period TEXT DEFAULT 'daily' CHECK (threshold_period IN ('hourly', 'daily', 'weekly', 'monthly')),
  alert_type TEXT DEFAULT 'warning' CHECK (alert_type IN ('info', 'warning', 'critical')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id, threshold_period)
);

CREATE TABLE IF NOT EXISTS agent_cost_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES agent_cost_alert_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT,
  triggered_amount NUMERIC(10,4) NOT NULL,
  threshold_amount NUMERIC(10,4) NOT NULL,
  status TEXT DEFAULT 'triggered' CHECK (status IN ('triggered', 'acknowledged', 'resolved')),
  triggered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cost_rules_user ON agent_cost_alert_rules(user_id);
CREATE INDEX idx_cost_rules_agent ON agent_cost_alert_rules(agent_id);
CREATE INDEX idx_cost_history_user ON agent_cost_alert_history(user_id, triggered_at DESC);
CREATE INDEX idx_cost_history_rule ON agent_cost_alert_history(rule_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Cost Alerts API

Create `backend/core/billing/agent_cost_alerts_api.py` + `__init__.py`:

Router with tag `"agent-cost-alerts"`:
- `POST /cost-alerts/rules` — create alert rule. Body: `{ agent_id?, name, threshold_amount, threshold_period?, alert_type? }`. Auth required.
- `GET /cost-alerts/rules` — list rules. Auth required.
- `PATCH /cost-alerts/rules/{rule_id}` — update rule. Auth required.
- `DELETE /cost-alerts/rules/{rule_id}` — delete rule. Auth required.
- `POST /cost-alerts/check` — check all rules against current usage. Creates alert history entries for triggered rules. Auth required.
- `GET /cost-alerts/history` — list alert history. Query: `status`, `agent_id`, `limit`. Auth required.
- `PATCH /cost-alerts/history/{alert_id}` — acknowledge/resolve alert. Body: `{ status }`. Auth required.

Register in `backend/api.py`.

### Task 15: Cost Alerts Frontend

Create `recoder-agents/src/lib/api/agent-cost-alerts.ts` and `recoder-agents/src/hooks/billing/use-agent-cost-alerts.ts`.

Hooks: `useCostAlertRules()`, `useCreateCostAlertRule()`, `useUpdateCostAlertRule()`, `useDeleteCostAlertRule()`, `useCheckCostAlerts()`, `useCostAlertHistory(filters)`, `useUpdateCostAlert()`.

### Task 16: Cost Alerts UI

Create `recoder-agents/src/app/(dashboard)/billing/cost-alerts/page.tsx`:

Cost alerts page:
- Alert rules list: name, agent scope, threshold amount with currency, period badge, alert type badge (colored), active toggle, edit/delete
- "New Rule" dialog: name, agent selector (optional = all), threshold amount input, period selector, alert type selector
- "Check Now" button to run cost check
- Alert history: triggered amount vs threshold, agent name, status badge, timestamp, acknowledge/resolve buttons
- Active alerts highlighted with colored border (info=blue, warning=amber, critical=red)
- Filter history by status and agent

Wire into billing section.

---

## Phase 5: Data Retention Policies (Tasks 17-20)

### Task 17: Retention Policies Schema

Create `backend/supabase/migrations/20260312000004_data_retention.sql`:

```sql
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('threads', 'run_logs', 'audit_logs', 'exports', 'analytics', 'notifications', 'webhook_deliveries')),
  retention_days INTEGER NOT NULL DEFAULT 90,
  is_active BOOLEAN DEFAULT true,
  last_cleanup_at TIMESTAMPTZ,
  items_cleaned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, resource_type)
);

CREATE TABLE IF NOT EXISTS retention_cleanup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES data_retention_policies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  resource_type TEXT NOT NULL,
  items_deleted INTEGER DEFAULT 0,
  oldest_item_date TIMESTAMPTZ,
  cleanup_duration_ms INTEGER,
  cleaned_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_retention_policies_user ON data_retention_policies(user_id);
CREATE INDEX idx_retention_cleanup_policy ON retention_cleanup_log(policy_id, cleaned_at DESC);
CREATE INDEX idx_retention_cleanup_user ON retention_cleanup_log(user_id, cleaned_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Retention Policies API

Create `backend/core/preferences/data_retention_api.py`:

Router with tag `"data-retention"`:
- `GET /retention/policies` — list policies. Auth required.
- `PUT /retention/policies` — set policy. Body: `{ resource_type, retention_days, is_active? }`. Upserts. Auth required.
- `DELETE /retention/policies/{policy_id}` — delete policy. Auth required.
- `POST /retention/cleanup` — run cleanup for all active policies. Deletes items older than retention_days per resource type. Records in cleanup log. Auth required.
- `GET /retention/cleanup-log` — list cleanup history. Query: `resource_type`, `limit`. Auth required.
- `GET /retention/preview` — preview cleanup: for each active policy, count items that would be deleted. Auth required.

Register in `backend/api.py`.

### Task 19: Retention Frontend

Create `recoder-agents/src/lib/api/data-retention.ts` and `recoder-agents/src/hooks/settings/use-data-retention.ts`.

Hooks: `useRetentionPolicies()`, `useSetRetentionPolicy()`, `useDeleteRetentionPolicy()`, `useRunCleanup()`, `useCleanupLog(resourceType?)`, `useCleanupPreview()`.

### Task 20: Retention Policies UI

Create `recoder-agents/src/app/(dashboard)/settings/data-retention/page.tsx`:

Data retention settings page:
- Policy list: resource type name, retention days, active toggle, last cleanup date, total items cleaned
- Edit per policy: retention days slider (7-365), active toggle, save
- "Preview Cleanup" button: shows how many items would be deleted per policy
- "Run Cleanup Now" button with confirmation showing preview
- Cleanup log: resource type, items deleted, oldest item date, duration, timestamp
- Recommended defaults note: threads=180d, run_logs=90d, audit_logs=365d, exports=30d, analytics=180d, notifications=60d, webhook_deliveries=30d

Wire into settings section.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 61 completion status.

---
