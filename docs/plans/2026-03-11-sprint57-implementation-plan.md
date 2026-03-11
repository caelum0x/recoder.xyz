# Sprint 57: Agent Model Routing Rules, Thread Annotations, Usage Anomaly Detection, Agent Deployment Slots & Custom Keyboard Shortcuts

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add configurable model routing rules per agent, collaborative thread annotations, automated usage anomaly detection with alerts, agent deployment slot management for staged rollouts, and user-customizable keyboard shortcuts — completing the AI optimization, collaboration, proactive monitoring, deployment management, and power-user UX features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Model Routing Rules (Tasks 1-4)

### Task 1: Model Routing Schema

Create `backend/supabase/migrations/20260311600000_model_routing_rules.sql`:

```sql
CREATE TABLE IF NOT EXISTS model_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('message_length', 'keyword', 'time_of_day', 'cost_threshold', 'complexity', 'fallback')),
  condition_value JSONB NOT NULL DEFAULT '{}',
  target_model TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_routing_rules_agent ON model_routing_rules(agent_id, priority DESC);
CREATE INDEX idx_routing_rules_user ON model_routing_rules(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Model Routing API

Create `backend/core/agents/model_routing_api.py`:

Router with tag `"model-routing"`:
- `POST /agents/{agent_id}/routing-rules` — create rule. Body: `{ name, priority?, condition_type, condition_value, target_model }`. Auth required.
- `GET /agents/{agent_id}/routing-rules` — list rules ordered by priority. Auth required.
- `PATCH /agents/{agent_id}/routing-rules/{rule_id}` — update rule. Auth required.
- `DELETE /agents/{agent_id}/routing-rules/{rule_id}` — delete. Auth required.
- `POST /agents/{agent_id}/routing-rules/evaluate` — evaluate rules against input. Body: `{ message }`. Returns matched rule and target model. Auth required.
- `GET /agents/{agent_id}/routing-rules/stats` — hit counts per rule. Auth required.

Register in `backend/api.py`.

### Task 3: Model Routing Frontend

Create `recoder-agents/src/lib/api/model-routing.ts` and `recoder-agents/src/hooks/agents/use-model-routing.ts`.

Hooks: `useRoutingRules(agentId)`, `useCreateRoutingRule()`, `useUpdateRoutingRule()`, `useDeleteRoutingRule()`, `useEvaluateRouting()`, `useRoutingStats(agentId)`.

### Task 4: Model Routing UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/routing-screen.tsx`:

Model routing screen:
- Rules list ordered by priority: name, condition type badge, condition summary, target model, hit count, active toggle, edit/delete
- "Add Rule" dialog: name, condition type selector, condition config (dynamic based on type), target model input, priority
- Condition configs: message_length → min/max inputs, keyword → keyword list, time_of_day → hour range, cost_threshold → max cost, complexity → simple/medium/complex, fallback → no config
- "Test Routing" section: input textarea, evaluate button, shows which rule matched
- Rule stats: horizontal bar chart of hit counts per rule

Wire into agent config as "Routing" tab with Route icon.

---

## Phase 2: Thread Annotations (Tasks 5-8)

### Task 5: Annotations Schema

Create `backend/supabase/migrations/20260311600001_thread_annotations.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER,
  annotation_type TEXT DEFAULT 'note' CHECK (annotation_type IN ('note', 'highlight', 'question', 'action', 'bug', 'insight')),
  content TEXT NOT NULL,
  color TEXT DEFAULT '#fbbf24',
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_annotations_thread ON thread_annotations(thread_id, created_at);
CREATE INDEX idx_annotations_user ON thread_annotations(user_id, created_at DESC);
CREATE INDEX idx_annotations_type ON thread_annotations(annotation_type);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Annotations API

Create `backend/core/threads/thread_annotations_api.py`:

Router with tag `"thread-annotations"`:
- `POST /threads/{thread_id}/annotations` — create. Body: `{ message_index?, annotation_type?, content, color? }`. Auth required.
- `GET /threads/{thread_id}/annotations` — list for thread. Query: `annotation_type`, `resolved`. Auth required.
- `PATCH /threads/{thread_id}/annotations/{annotation_id}` — update content, type, color, resolved. Auth required.
- `DELETE /threads/{thread_id}/annotations/{annotation_id}` — delete. Auth required.
- `GET /annotations/recent` — recent across all threads. Query: `limit`. Auth required.
- `GET /annotations/summary` — count by type, unresolved count. Auth required.

Register in `backend/api.py`.

### Task 7: Annotations Frontend

Create `recoder-agents/src/lib/api/thread-annotations.ts` and `recoder-agents/src/hooks/threads/use-thread-annotations.ts`.

Hooks: `useThreadAnnotations(threadId, filters)`, `useCreateAnnotation()`, `useUpdateAnnotation()`, `useDeleteAnnotation()`, `useRecentAnnotations()`, `useAnnotationSummary()`.

### Task 8: Annotations UI

Create `recoder-agents/src/components/thread/thread-annotation-panel.tsx`:

Annotation panel (slide-in sidebar):
- Annotation list: type icon, content, message reference, color indicator, resolved checkbox, edit/delete
- Type icons: note=StickyNote, highlight=Highlighter, question=HelpCircle, action=CheckSquare, bug=Bug, insight=Lightbulb
- Filter by type, show/hide resolved
- "Add Annotation" form: type selector, content textarea, color picker, optional message index
- Summary: count badges by type

Create `recoder-agents/src/components/thread/annotation-marker.tsx`:

Annotation marker on messages:
- Small colored dot/indicator on messages that have annotations
- Hover to show annotation preview
- Click to open annotation panel focused on that message

Wire annotation panel into thread view with a sidebar toggle button.

---

## Phase 3: Usage Anomaly Detection (Tasks 9-12)

### Task 9: Anomaly Detection Schema

Create `backend/supabase/migrations/20260311600002_usage_anomalies.sql`:

```sql
CREATE TABLE IF NOT EXISTS usage_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('cost_spike', 'run_surge', 'error_spike', 'latency_spike', 'token_surge', 'unusual_hours')),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  agent_id TEXT,
  description TEXT NOT NULL,
  current_value NUMERIC(12,4),
  baseline_value NUMERIC(12,4),
  deviation_percent NUMERIC(8,2),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_anomalies_user ON usage_anomalies(user_id, detected_at DESC);
CREATE INDEX idx_anomalies_status ON usage_anomalies(status) WHERE status = 'open';
CREATE INDEX idx_anomalies_agent ON usage_anomalies(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Anomaly Detection API

Create `backend/core/monitoring/anomaly_detection_api.py`:

Router with tag `"anomaly-detection"`:
- `GET /anomalies` — list anomalies. Query: `status`, `anomaly_type`, `severity`, `agent_id`, `limit`, `offset`. Auth required.
- `PATCH /anomalies/{anomaly_id}` — update status (acknowledge, resolve, dismiss). Auth required.
- `POST /anomalies/scan` — run anomaly detection scan. Compares last 24h vs previous 7d averages. Flags deviations >50% as anomalies. Checks: daily cost, run count, error count, avg latency. Auth required.
- `GET /anomalies/stats` — open count by severity, most affected agents, trend (anomalies per day last 30d). Auth required.

Register in `backend/api.py`.

### Task 11: Anomaly Detection Frontend

Create `recoder-agents/src/lib/api/anomaly-detection.ts` and `recoder-agents/src/hooks/monitoring/use-anomaly-detection.ts`.

Hooks: `useAnomalies(filters)`, `useUpdateAnomalyStatus()`, `useRunAnomalyScan()`, `useAnomalyStats()`.

### Task 12: Anomaly Detection UI

Create `recoder-agents/src/app/(dashboard)/monitoring/anomalies/page.tsx`:

Anomaly detection page:
- Stats header: Open anomalies by severity (badges), most affected agent, trend sparkline
- "Run Scan" button to trigger detection
- Anomaly list: severity icon (low=blue, medium=amber, high=orange, critical=red), type badge, description, agent name, current vs baseline values, deviation %, status, actions (Acknowledge/Resolve/Dismiss)
- Filter by status, type, severity, agent
- Click to expand: detailed comparison, suggested action

Wire into monitoring section.

---

## Phase 4: Agent Deployment Slots (Tasks 13-16)

### Task 13: Deployment Slots Schema

Create `backend/supabase/migrations/20260311600003_deployment_slots.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_deployment_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  slot_name TEXT NOT NULL CHECK (slot_name IN ('production', 'staging', 'canary', 'rollback')),
  config_snapshot JSONB NOT NULL DEFAULT '{}',
  traffic_percent INTEGER DEFAULT 0 CHECK (traffic_percent BETWEEN 0 AND 100),
  is_active BOOLEAN DEFAULT false,
  deployed_at TIMESTAMPTZ DEFAULT now(),
  deployed_by TEXT,
  UNIQUE (agent_id, slot_name)
);

CREATE TABLE IF NOT EXISTS deployment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  slot_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('deploy', 'promote', 'rollback', 'deactivate')),
  from_config JSONB,
  to_config JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_deployment_slots_agent ON agent_deployment_slots(agent_id);
CREATE INDEX idx_deployment_slots_user ON agent_deployment_slots(user_id);
CREATE INDEX idx_deployment_history_agent ON deployment_history(agent_id, created_at DESC);
CREATE INDEX idx_deployment_history_user ON deployment_history(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Deployment Slots API

Create `backend/core/agents/agent_deployment_api.py`:

Router with tag `"agent-deployment"`:
- `POST /agents/{agent_id}/deploy` — deploy to slot. Body: `{ slot_name, config_snapshot, traffic_percent? }`. Upsert. Records history. Auth required.
- `GET /agents/{agent_id}/slots` — list deployment slots. Auth required.
- `POST /agents/{agent_id}/promote` — promote staging to production. Swaps configs, records history. Auth required.
- `POST /agents/{agent_id}/rollback` — rollback production to rollback slot. Auth required.
- `PATCH /agents/{agent_id}/slots/{slot_name}/traffic` — update traffic percent. Body: `{ traffic_percent }`. Auth required.
- `GET /agents/{agent_id}/deployment-history` — list deployment history. Query: `limit`. Auth required.

Register in `backend/api.py`.

### Task 15: Deployment Slots Frontend

Create `recoder-agents/src/lib/api/agent-deployment.ts` and `recoder-agents/src/hooks/agents/use-agent-deployment.ts`.

Hooks: `useDeployToSlot()`, `useDeploymentSlots(agentId)`, `usePromoteSlot()`, `useRollbackSlot()`, `useUpdateTraffic()`, `useDeploymentHistory(agentId)`.

### Task 16: Deployment Slots UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/deployment-screen.tsx`:

Deployment management screen:
- Slot cards (4): Production, Staging, Canary, Rollback — each showing active/inactive, traffic %, deployed date, config preview
- Traffic distribution bar: visual bar showing % split across slots
- "Deploy to Staging" button → captures current config snapshot
- "Promote to Production" button with confirmation
- "Rollback" button with confirmation
- Traffic slider per slot (must total 100%)
- Deployment history timeline: action badge, slot, timestamp, config diff preview

Wire into agent config as "Deployment" tab with Rocket icon.

---

## Phase 5: Custom Keyboard Shortcuts (Tasks 17-20)

### Task 17: Shortcuts Schema

Create `backend/supabase/migrations/20260311600004_keyboard_shortcuts.sql`:

```sql
CREATE TABLE IF NOT EXISTS user_keyboard_shortcuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  key_combo TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, action)
);

CREATE INDEX idx_shortcuts_user ON user_keyboard_shortcuts(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Shortcuts API

Create `backend/core/preferences/keyboard_shortcuts_api.py`:

Router with tag `"keyboard-shortcuts"`:
- `GET /shortcuts` — list user's shortcuts. Auth required.
- `PUT /shortcuts` — batch set shortcuts. Body: `{ shortcuts: [{ action, key_combo, is_active? }] }`. Upserts. Auth required.
- `DELETE /shortcuts/{action}` — reset shortcut to default. Auth required.
- `POST /shortcuts/reset-all` — reset all to defaults. Auth required.

Register in `backend/api.py`.

### Task 19: Shortcuts Frontend

Create `recoder-agents/src/lib/api/keyboard-shortcuts.ts` and `recoder-agents/src/hooks/use-keyboard-shortcuts.ts`.

Hooks: `useKeyboardShortcuts()`, `useSetShortcuts()`, `useResetShortcut()`, `useResetAllShortcuts()`.

### Task 20: Shortcuts UI

Create `recoder-agents/src/app/(dashboard)/settings/keyboard-shortcuts/page.tsx`:

Keyboard shortcuts settings page:
- Shortcut list grouped by category: Navigation (New Thread, Search, Dashboard, Settings), Actions (Send Message, Export, Pin), Views (Toggle Sidebar, Toggle Dark Mode, Focus Chat)
- Each row: action name, current key combo displayed in kbd-style badges, "Edit" button
- Edit mode: click combo area, then press new key combo to capture, Escape to cancel
- Conflict detection: warn if combo already used
- "Reset to Defaults" button
- Default shortcuts reference table

Wire shortcut listener into app layout.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 57 completion status.

---
