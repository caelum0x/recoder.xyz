# Sprint 48: Agent Environment Variables, Response Rating System, Webhook Event Log, Cost Alerts & Agent Clone with Diff

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-agent environment variable management, user rating system for agent responses, webhook delivery event log with retry, cost threshold alerts with notification dispatch, and agent cloning with configuration diff — completing the developer experience, feedback, reliability, cost management, and agent lifecycle features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Environment Variables (Tasks 1-4)

### Task 1: Env Var Schema

Create `backend/supabase/migrations/20260310700000_agent_env_vars.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_env_vars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  is_secret BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, key)
);

CREATE INDEX idx_agent_env_vars_agent ON agent_env_vars(agent_id);
CREATE INDEX idx_agent_env_vars_user ON agent_env_vars(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Env Var API

Create `backend/core/agents/agent_env_vars_api.py`:

Router with tag `"agent-env-vars"`:
- `GET /agents/{agent_id}/env` — list env vars for agent. Secret values masked as `***`. Auth required.
- `POST /agents/{agent_id}/env` — create/update env var. Body: `{ key, value, is_secret?, description? }`. Upsert on (agent_id, key). Auth required.
- `DELETE /agents/{agent_id}/env/{key}` — delete env var by key. Auth required.
- `POST /agents/{agent_id}/env/bulk` — bulk set env vars. Body: `{ vars: [{ key, value, is_secret?, description? }] }`. Auth required.
- `GET /agents/{agent_id}/env/export` — export env vars as dotenv format (secrets masked). Auth required.

Register in `backend/api.py`.

### Task 3: Env Var Frontend

Create `recoder-agents/src/lib/api/agent-env-vars.ts` and `recoder-agents/src/hooks/agents/use-agent-env-vars.ts`.

Hooks: `useAgentEnvVars(agentId)`, `useSetEnvVar()`, `useDeleteEnvVar()`, `useBulkSetEnvVars()`.

### Task 4: Env Var UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/env-vars-screen.tsx`:

Environment variables screen:
- Key-value table: key (monospace), value (masked for secrets, reveal on click), description, actions
- "Add Variable" button: key input, value textarea, is_secret toggle, description
- Inline edit for existing vars
- Bulk import: paste .env format text, parse into vars
- Export button (download as .env file, secrets masked)
- Search/filter vars

Wire into agent config page as "Environment" tab with Terminal icon.

---

## Phase 2: Response Rating System (Tasks 5-8)

### Task 5: Rating Schema

Create `backend/supabase/migrations/20260310700001_response_ratings.sql`:

```sql
CREATE TABLE IF NOT EXISTS response_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  agent_id TEXT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, message_index)
);

CREATE INDEX idx_ratings_user ON response_ratings(user_id);
CREATE INDEX idx_ratings_agent ON response_ratings(agent_id);
CREATE INDEX idx_ratings_thread ON response_ratings(thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Rating API

Create `backend/core/threads/response_ratings_api.py`:

Router with tag `"response-ratings"`:
- `POST /ratings` — create/update rating. Body: `{ thread_id, message_index, agent_id?, rating, feedback?, tags? }`. Upsert. Auth required.
- `GET /ratings` — list ratings. Query: `thread_id`, `agent_id`, `min_rating`, `limit`, `offset`. Auth required.
- `GET /ratings/summary` — aggregate: avg rating, count by star, common tags. Query: `agent_id`. Auth required.
- `DELETE /ratings/{rating_id}` — delete rating. Auth required.

Register in `backend/api.py`.

### Task 7: Rating Frontend

Create `recoder-agents/src/lib/api/response-ratings.ts` and `recoder-agents/src/hooks/threads/use-response-ratings.ts`.

Hooks: `useRatings(filters)`, `useRateResponse()`, `useRatingSummary(agentId?)`, `useDeleteRating()`.

### Task 8: Rating UI

Create `recoder-agents/src/components/thread/response-rating.tsx`:

Rating component for agent messages:
- 5-star rating (clickable stars, filled/outline)
- Shows on hover of assistant messages (below message)
- Optional feedback textarea (appears after rating)
- Quick tags: "Helpful", "Accurate", "Creative", "Too verbose", "Off-topic", "Incorrect"
- Saved rating shows filled stars + feedback preview

Create `recoder-agents/src/components/agents/config/ratings-overview.tsx`:

Ratings overview for agent config:
- Average rating (large number + stars)
- Rating distribution (horizontal bars for 1-5 stars)
- Top tags
- Recent feedback list

Wire rating component into message rendering in ThreadComponent (assistant messages only).

---

## Phase 3: Webhook Event Log (Tasks 9-12)

### Task 9: Webhook Event Log Schema

Create `backend/supabase/migrations/20260310700002_webhook_event_log.sql`:

```sql
CREATE TABLE IF NOT EXISTS webhook_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  webhook_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'delivered', 'failed', 'retrying')),
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_events_user ON webhook_event_log(user_id, created_at DESC);
CREATE INDEX idx_webhook_events_webhook ON webhook_event_log(webhook_id, created_at DESC);
CREATE INDEX idx_webhook_events_status ON webhook_event_log(delivery_status) WHERE delivery_status != 'delivered';

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Webhook Event Log API

Create `backend/core/webhooks/webhook_event_log_api.py`:

Router with tag `"webhook-events"`:
- `GET /webhooks/{webhook_id}/events` — list events for webhook. Query: `delivery_status`, `limit`, `offset`. Auth required.
- `GET /webhooks/events/recent` — recent events across all webhooks. Query: `limit`. Auth required.
- `POST /webhooks/events/{event_id}/retry` — manually retry a failed event. Auth required.
- `GET /webhooks/events/stats` — delivery stats: total, delivered, failed, avg response time. Auth required.

Register in `backend/api.py`.

### Task 11: Webhook Event Log Frontend

Create `recoder-agents/src/lib/api/webhook-events.ts` and `recoder-agents/src/hooks/developers/use-webhook-events.ts`.

Hooks: `useWebhookEvents(webhookId, filters)`, `useRecentWebhookEvents()`, `useRetryWebhookEvent()`, `useWebhookEventStats()`.

### Task 12: Webhook Event Log UI

Create `recoder-agents/src/components/developers/webhook-event-log.tsx`:

Webhook event log panel:
- Event list: event type badge, delivery status (color-coded), timestamp, response status code, attempt count
- Click to expand: full payload (JSON), response body, error details, retry history
- "Retry" button for failed events
- Stats header: total events, success rate %, avg response time
- Filter by status: All, Delivered, Failed, Retrying

Wire into existing webhook management page in developers section.

---

## Phase 4: Cost Threshold Alerts (Tasks 13-16)

### Task 13: Cost Alert Schema

Create `backend/supabase/migrations/20260310700003_cost_alerts.sql`:

```sql
CREATE TABLE IF NOT EXISTS cost_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('daily_total', 'per_run', 'agent_daily', 'agent_monthly')),
  threshold NUMERIC(10,4) NOT NULL,
  agent_id TEXT,
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  notification_channels TEXT[] DEFAULT '{"in_app"}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cost_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES cost_alert_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  triggered_value NUMERIC(10,4) NOT NULL,
  threshold NUMERIC(10,4) NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cost_alert_rules_user ON cost_alert_rules(user_id);
CREATE INDEX idx_cost_alert_history_rule ON cost_alert_history(rule_id, created_at DESC);
CREATE INDEX idx_cost_alert_history_user ON cost_alert_history(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Cost Alert API

Create `backend/core/billing/cost_alerts_api.py` + `__init__.py`:

Router with tag `"cost-alerts"`:
- `POST /cost-alerts` — create alert rule. Body: `{ name, alert_type, threshold, agent_id?, notification_channels? }`. Auth required.
- `GET /cost-alerts` — list user's alert rules. Auth required.
- `PATCH /cost-alerts/{rule_id}` — update rule. Auth required.
- `DELETE /cost-alerts/{rule_id}` — delete. Auth required.
- `GET /cost-alerts/history` — list triggered alerts. Query: `rule_id`, `limit`. Auth required.
- `POST /cost-alerts/check` — manually check all rules against current data. Returns which rules would trigger. Auth required.

Register in `backend/api.py`.

### Task 15: Cost Alert Frontend

Create `recoder-agents/src/lib/api/cost-alerts.ts` and `recoder-agents/src/hooks/billing/use-cost-alerts.ts`.

Hooks: `useCostAlertRules()`, `useCreateCostAlert()`, `useUpdateCostAlert()`, `useDeleteCostAlert()`, `useCostAlertHistory()`, `useCheckCostAlerts()`.

### Task 16: Cost Alert UI

Create `recoder-agents/src/components/billing/cost-alert-manager.tsx`:

Cost alert management:
- Alert rule list: name, type badge, threshold ($X.XX), agent (if scoped), active toggle, last triggered
- "New Alert" dialog: name, type selector (Daily Total, Per Run, Agent Daily, Agent Monthly), threshold input, optional agent selector, notification channel checkboxes
- Alert history: timeline of triggered alerts with value, threshold, message
- "Check Now" button to manually evaluate rules
- Quick presets: "Alert if daily > $5", "Alert if single run > $1"

Wire into billing section or add as a tab in the cost dashboard.

---

## Phase 5: Agent Clone with Diff (Tasks 17-20)

### Task 17: Clone Tracking Schema

Create `backend/supabase/migrations/20260310700004_agent_clones.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_clone_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_agent_id TEXT NOT NULL,
  cloned_agent_id TEXT NOT NULL,
  modifications JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clone_history_user ON agent_clone_history(user_id);
CREATE INDEX idx_clone_history_source ON agent_clone_history(source_agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Clone API

Create `backend/core/agents/agent_clone_api.py`:

Router with tag `"agent-clone"`:
- `POST /agents/{agent_id}/clone` — clone agent with modifications. Body: `{ name?, instructions_override?, model_override?, tool_overrides? }`. Creates new agent + records in clone_history. Auth required.
- `GET /agents/{agent_id}/clones` — list clones made from this agent. Auth required.
- `GET /agents/clone-diff` — diff two agents. Query: `agent_a`, `agent_b`. Returns field-by-field comparison. Auth required.

Register in `backend/api.py`.

### Task 19: Clone Frontend

Create `recoder-agents/src/lib/api/agent-clone.ts` and `recoder-agents/src/hooks/agents/use-agent-clone.ts`.

Hooks: `useCloneAgent()`, `useAgentClones(agentId)`, `useAgentDiff(agentA, agentB)`.

### Task 20: Clone UI

Create `recoder-agents/src/components/agents/clone-agent-dialog.tsx`:

Enhanced clone dialog:
- Source agent info display
- Name override input (defaults to "Copy of [original]")
- Optional modifications: instructions override textarea, model selector, tool toggle checkboxes
- "Preview Changes" button: shows diff between source and proposed clone
- Diff view: side-by-side comparison of changed fields
- "Clone" button to execute

Wire into agent grid/list as a clone action (available from agent context menu or detail page).

Create `recoder-agents/src/components/agents/agent-diff-view.tsx`:

Agent comparison component:
- Side-by-side display: Agent A vs Agent B
- Field-by-field diff: name, instructions (text diff), model, tools (added/removed), settings
- Color-coded: green for additions, red for removals, amber for changes

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 48 completion status.

---
