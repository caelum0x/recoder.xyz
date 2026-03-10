# Sprint 53: Agent Permissions & RBAC, Conversation Templates, Run Cost Allocation, Notification Rules Engine & Agent Comparison Matrix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add granular agent-level permissions with role-based access control, reusable conversation starter templates, per-run cost allocation to projects/teams, configurable notification rule engine with conditions and actions, and side-by-side agent comparison matrix — completing the access control, UX efficiency, financial attribution, alerting intelligence, and decision-support features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Permissions & RBAC (Tasks 1-4)

### Task 1: Permissions Schema

Create `backend/supabase/migrations/20260311200000_agent_permissions.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT[] DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS agent_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES agent_roles(id) ON DELETE CASCADE,
  assigned_by UUID,
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE (agent_id, role_id)
);

CREATE TABLE IF NOT EXISTS agent_permission_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  permission_required TEXT,
  was_allowed BOOLEAN NOT NULL,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_roles_user ON agent_roles(user_id);
CREATE INDEX idx_role_assignments_agent ON agent_role_assignments(agent_id);
CREATE INDEX idx_role_assignments_user ON agent_role_assignments(user_id);
CREATE INDEX idx_permission_audit_agent ON agent_permission_audit(agent_id, created_at DESC);
CREATE INDEX idx_permission_audit_user ON agent_permission_audit(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Permissions API

Create `backend/core/agents/agent_permissions_api.py`:

Router with tag `"agent-permissions"`:
- `POST /roles` — create role. Body: `{ name, description?, permissions[] }`. Permissions: `run`, `configure`, `delete`, `export`, `share`, `view_logs`, `manage_triggers`, `manage_kb`, `manage_env`. Auth required.
- `GET /roles` — list roles. Auth required.
- `PATCH /roles/{role_id}` — update role. Auth required.
- `DELETE /roles/{role_id}` — delete role (not system roles). Auth required.
- `POST /agents/{agent_id}/roles` — assign role to agent. Body: `{ role_id, expires_at? }`. Auth required.
- `GET /agents/{agent_id}/roles` — list roles assigned to agent. Auth required.
- `DELETE /agents/{agent_id}/roles/{assignment_id}` — remove role assignment. Auth required.
- `GET /agents/{agent_id}/permissions/audit` — permission audit log. Query: `limit`, `offset`. Auth required.
- `POST /roles/seed` — seed system roles (admin, operator, viewer). Auth required.

Register in `backend/api.py`.

### Task 3: Permissions Frontend

Create `recoder-agents/src/lib/api/agent-permissions.ts` and `recoder-agents/src/hooks/agents/use-agent-permissions.ts`.

Hooks: `useRoles()`, `useCreateRole()`, `useUpdateRole()`, `useDeleteRole()`, `useAgentRoles(agentId)`, `useAssignRole()`, `useRemoveRoleAssignment()`, `usePermissionAudit(agentId)`, `useSeedRoles()`.

### Task 4: Permissions UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/permissions-screen.tsx`:

Permissions screen:
- Assigned roles list: role name, description, permissions badges, expiry, remove button
- "Assign Role" dialog: role selector dropdown, optional expiry date picker
- Permission audit log table: timestamp, action, permission required, allowed/denied badge
- Quick role creation: name, description, permission checkboxes grid (9 permissions)

Create `recoder-agents/src/app/(dashboard)/settings/roles/page.tsx`:

Roles management page:
- Role list: name, description, permission count badge, system role indicator, edit/delete
- "New Role" dialog: name, description, permissions multi-select checkboxes
- "Seed Defaults" button for first-time setup
- 3 system roles displayed read-only: Admin (all), Operator (run, configure, view_logs), Viewer (view_logs only)

Wire permissions screen into agent config as "Permissions" tab with Shield icon. Add "Roles" link in settings.

---

## Phase 2: Conversation Templates (Tasks 5-8)

### Task 5: Conversation Template Schema

Create `backend/supabase/migrations/20260311200001_conversation_templates.sql`:

```sql
CREATE TABLE IF NOT EXISTS conversation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'coding', 'analysis', 'writing', 'research', 'debugging', 'planning', 'custom')),
  starter_messages JSONB NOT NULL DEFAULT '[]',
  agent_id TEXT,
  variables TEXT[] DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_conv_templates_user ON conversation_templates(user_id);
CREATE INDEX idx_conv_templates_category ON conversation_templates(category);
CREATE INDEX idx_conv_templates_agent ON conversation_templates(agent_id);
CREATE INDEX idx_conv_templates_public ON conversation_templates(is_public) WHERE is_public = true;

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Conversation Template API

Create `backend/core/threads/conversation_templates_api.py`:

Router with tag `"conversation-templates"`:
- `POST /conversation-templates` — create template. Body: `{ title, description?, category?, starter_messages, agent_id?, variables?, is_public? }`. Auth required.
- `GET /conversation-templates` — list templates. Query: `category`, `agent_id`, `search`, `limit`, `offset`. Auth required.
- `GET /conversation-templates/{template_id}` — get detail. Auth required.
- `PATCH /conversation-templates/{template_id}` — update. Auth required.
- `DELETE /conversation-templates/{template_id}` — delete. Auth required.
- `POST /conversation-templates/{template_id}/use` — increment usage count, return template with resolved variables. Body: `{ variable_values? }`. Auth required.
- `GET /conversation-templates/popular` — most used templates. Query: `limit`. Auth required.

Register in `backend/api.py`.

### Task 7: Conversation Template Frontend

Create `recoder-agents/src/lib/api/conversation-templates.ts` and `recoder-agents/src/hooks/threads/use-conversation-templates.ts`.

Hooks: `useConversationTemplates(filters)`, `useConversationTemplate(id)`, `useCreateTemplate()`, `useUpdateTemplate()`, `useDeleteTemplate()`, `useTemplateAction()`, `usePopularTemplates()`.

### Task 8: Conversation Template UI

Create `recoder-agents/src/app/(dashboard)/templates/conversations/page.tsx`:

Conversation templates page:
- Category tabs: All, Coding, Analysis, Writing, Research, Debugging, Planning, Custom
- Template cards: title, description preview, category badge, agent name (if scoped), usage count, actions
- Click card to preview: full starter messages, variables list, "Start Conversation" button
- Create template dialog: title, description, category, starter messages editor (add/remove/reorder), variable definitions, agent selector, public toggle
- Popular section showing most-used templates

Create `recoder-agents/src/components/thread/template-starter.tsx`:

Template picker for new threads:
- Compact selector shown when starting a new thread
- Grid of recent/popular templates
- Click to pre-fill the conversation with template messages
- Variable input form if template has variables

Wire template picker into new thread creation flow.

---

## Phase 3: Run Cost Allocation (Tasks 9-12)

### Task 9: Cost Allocation Schema

Create `backend/supabase/migrations/20260311200002_cost_allocation.sql`:

```sql
CREATE TABLE IF NOT EXISTS cost_allocation_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  budget NUMERIC(10,2),
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS run_cost_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id TEXT NOT NULL,
  agent_id TEXT,
  project_id UUID REFERENCES cost_allocation_projects(id) ON DELETE SET NULL,
  cost NUMERIC(10,6) NOT NULL DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  model TEXT,
  allocated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (run_id)
);

CREATE INDEX idx_cost_projects_user ON cost_allocation_projects(user_id);
CREATE INDEX idx_cost_allocations_user ON run_cost_allocations(user_id, allocated_at DESC);
CREATE INDEX idx_cost_allocations_project ON run_cost_allocations(project_id, allocated_at DESC);
CREATE INDEX idx_cost_allocations_agent ON run_cost_allocations(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Cost Allocation API

Create `backend/core/billing/cost_allocation_api.py`:

Router with tag `"cost-allocation"`:
- `POST /cost/projects` — create cost project. Body: `{ name, description?, budget?, color? }`. Auth required.
- `GET /cost/projects` — list cost projects with total spend. Auth required.
- `PATCH /cost/projects/{project_id}` — update project. Auth required.
- `DELETE /cost/projects/{project_id}` — delete project. Auth required.
- `POST /cost/allocate` — allocate a run to a project. Body: `{ run_id, agent_id?, project_id, cost, tokens_in?, tokens_out?, model? }`. Auth required.
- `GET /cost/allocations` — list allocations. Query: `project_id`, `agent_id`, `days` (default 30), `limit`, `offset`. Auth required.
- `GET /cost/report` — cost report by project. Query: `days`. Returns per-project totals, budget vs actual, top agents by cost. Auth required.

Register in `backend/api.py`.

### Task 11: Cost Allocation Frontend

Create `recoder-agents/src/lib/api/cost-allocation.ts` and `recoder-agents/src/hooks/billing/use-cost-allocation.ts`.

Hooks: `useCostProjects()`, `useCreateCostProject()`, `useUpdateCostProject()`, `useDeleteCostProject()`, `useAllocateRunCost()`, `useCostAllocations(filters)`, `useCostReport(days)`.

### Task 12: Cost Allocation UI

Create `recoder-agents/src/app/(dashboard)/billing/cost-allocation/page.tsx`:

Cost allocation dashboard:
- Project cards: name, color dot, total spend, budget gauge (% used), run count
- "New Project" dialog: name, description, budget input, color picker (8 presets)
- Cost report section: stacked bar chart by project (Recharts), budget vs actual bars
- Allocation table: run ID, agent name, project badge, cost, tokens, model, date
- Top agents by cost table
- Period selector: 7d, 14d, 30d

Wire into billing section navigation.

---

## Phase 4: Notification Rules Engine (Tasks 13-16)

### Task 13: Notification Rules Schema

Create `backend/supabase/migrations/20260311200003_notification_rules.sql`:

```sql
CREATE TABLE IF NOT EXISTS notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN ('run_completed', 'run_failed', 'cost_exceeded', 'agent_error', 'health_degraded', 'quota_warning', 'thread_completed', 'schedule_missed')),
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  cooldown_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_rule_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES notification_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  trigger_event TEXT NOT NULL,
  conditions_met JSONB DEFAULT '{}',
  actions_taken JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notification_rules_user ON notification_rules(user_id);
CREATE INDEX idx_notification_rules_event ON notification_rules(trigger_event);
CREATE INDEX idx_notification_rule_log_rule ON notification_rule_log(rule_id, created_at DESC);
CREATE INDEX idx_notification_rule_log_user ON notification_rule_log(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Notification Rules API

Create `backend/core/notifications/notification_rules_api.py` + `__init__.py`:

Router with tag `"notification-rules"`:
- `POST /notification-rules` — create rule. Body: `{ name, description?, trigger_event, conditions?, actions?, cooldown_minutes? }`. Conditions: `[{ field, operator, value }]`. Actions: `[{ type, config }]` where type is `in_app`, `email`, `webhook`. Auth required.
- `GET /notification-rules` — list rules. Auth required.
- `GET /notification-rules/{rule_id}` — rule detail with recent log entries. Auth required.
- `PATCH /notification-rules/{rule_id}` — update rule. Auth required.
- `DELETE /notification-rules/{rule_id}` — delete rule. Auth required.
- `POST /notification-rules/{rule_id}/test` — test rule against mock data. Auth required.
- `GET /notification-rules/log` — list all rule executions. Query: `rule_id`, `limit`, `offset`. Auth required.

Register in `backend/api.py`.

### Task 15: Notification Rules Frontend

Create `recoder-agents/src/lib/api/notification-rules.ts` and `recoder-agents/src/hooks/notifications/use-notification-rules.ts`.

Hooks: `useNotificationRules()`, `useNotificationRule(ruleId)`, `useCreateRule()`, `useUpdateRule()`, `useDeleteRule()`, `useTestRule()`, `useNotificationRuleLog(ruleId?)`.

### Task 16: Notification Rules UI

Create `recoder-agents/src/app/(dashboard)/settings/notification-rules/page.tsx`:

Notification rules manager:
- Rule list: name, trigger event badge, conditions count, actions count, active toggle, last triggered, trigger count
- "New Rule" dialog:
  - Name input, description
  - Trigger event selector: Run Completed, Run Failed, Cost Exceeded, Agent Error, Health Degraded, Quota Warning, Thread Completed, Schedule Missed
  - Conditions builder: add condition rows (field selector, operator selector, value input), remove row
  - Actions builder: add action (In-App Notification, Email, Webhook URL), configure each
  - Cooldown minutes input
- Rule detail view: full config display, execution log timeline
- "Test Rule" button with mock data
- Active/inactive filter

Wire into settings navigation.

---

## Phase 5: Agent Comparison Matrix (Tasks 17-20)

### Task 17: Comparison Data Schema

Create `backend/supabase/migrations/20260311200004_agent_comparisons.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT,
  agent_ids TEXT[] NOT NULL,
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_comparison_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES agent_comparisons(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC(12,4),
  period TEXT DEFAULT '30d',
  captured_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comparisons_user ON agent_comparisons(user_id, created_at DESC);
CREATE INDEX idx_comparison_snapshots_comparison ON agent_comparison_snapshots(comparison_id);
CREATE INDEX idx_comparison_snapshots_agent ON agent_comparison_snapshots(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Comparison API

Create `backend/core/agents/agent_comparison_api.py`:

Router with tag `"agent-comparison"`:
- `POST /agents/compare` — create comparison. Body: `{ name?, agent_ids[] }`. Calculates metrics for each agent: success_rate, avg_latency, avg_cost, total_runs, avg_tokens, health_score. Auth required.
- `GET /agents/comparisons` — list saved comparisons. Auth required.
- `GET /agents/comparisons/{comparison_id}` — get comparison with snapshots. Auth required.
- `DELETE /agents/comparisons/{comparison_id}` — delete. Auth required.
- `POST /agents/compare/live` — compare agents without saving. Body: `{ agent_ids[], period? }`. Returns metrics side by side. Auth required.

Register in `backend/api.py`.

### Task 19: Comparison Frontend

Create `recoder-agents/src/lib/api/agent-comparison.ts` and `recoder-agents/src/hooks/agents/use-agent-comparison.ts`.

Hooks: `useCreateComparison()`, `useSavedComparisons()`, `useComparison(comparisonId)`, `useDeleteComparison()`, `useLiveComparison()`.

### Task 20: Agent Comparison Matrix UI

Create `recoder-agents/src/app/(dashboard)/agents/compare/page.tsx`:

Agent comparison page:
- Agent selector: multi-select up to 5 agents
- "Compare" button triggers live comparison
- Comparison matrix table:
  - Columns: one per agent
  - Rows: Success Rate, Avg Latency (ms), Avg Cost ($), Total Runs, Avg Tokens, Health Score
  - Best value in each row highlighted green, worst highlighted red
- Radar chart (Recharts): overlay of all agents on normalized 0-100 scale for each metric
- "Save Comparison" button to persist
- Saved comparisons list at bottom
- Period selector: 7d, 14d, 30d

Wire into agents section navigation as "Compare" link with GitCompare icon.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 53 completion status.

---
