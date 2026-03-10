# Sprint 42: Agent Debug Logs, API Usage Analytics, Secrets Management & Dashboard Widgets

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add agent execution debug logs, API key usage analytics, per-agent secrets/env vars, customizable dashboard widgets, and in-thread message search — filling the remaining operational and power-user gaps.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Supabase with RLS. Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Execution Debug Logs (Tasks 1-4)

### Task 1: Execution Logs Database Schema

Create `backend/supabase/migrations/20260310100000_execution_logs.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  level TEXT DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'tool_call', 'llm_request', 'llm_response', 'system', 'user_input')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_exec_logs_run ON agent_execution_logs(agent_run_id);
CREATE INDEX idx_exec_logs_agent ON agent_execution_logs(agent_id);
CREATE INDEX idx_exec_logs_user_ts ON agent_execution_logs(user_id, timestamp DESC);

ALTER TABLE agent_execution_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own logs"
  ON agent_execution_logs FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "System can insert logs"
  ON agent_execution_logs FOR INSERT
  WITH CHECK (true);
```

### Task 2: Execution Logs API

Create `backend/core/agents/execution_logs_api.py`:

Router with tag `"execution-logs"`:
- `GET /agents/{agent_id}/logs` — paginated logs for an agent. Query: `level`, `category`, `run_id`, `limit` (default 50), `offset`. Auth required.
- `GET /runs/{run_id}/logs` — logs for a specific run. Query: `level`, `category`. Auth required.
- `GET /agents/{agent_id}/logs/summary` — log level counts for agent (debug/info/warn/error totals). Auth required.

Register in `backend/api.py`.

### Task 3: Execution Logs Frontend

Create `recoder-agents/src/lib/api/execution-logs.ts` and `recoder-agents/src/hooks/agents/use-execution-logs.ts`.

Hooks: `useAgentLogs(agentId, filters)`, `useRunLogs(runId, filters)`, `useLogSummary(agentId)`.

### Task 4: Agent Debug Logs Page

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/logs-screen.tsx`:

Debug logs tab within agent config:
- Filter bar: level selector (All/Debug/Info/Warn/Error), category filter, date range
- Log table: timestamp, level badge (color-coded: debug=gray, info=blue, warn=amber, error=red), category badge, message, expandable metadata JSON
- Log level summary cards at top: total entries, error count, warning count
- "View Run Logs" link per entry that filters to that run
- Pagination (load more)
- Auto-refresh toggle (poll every 10s when enabled)

Wire into agent config page: add "Logs" tab in the config menu alongside existing tabs (Instructions, Tools, etc).

---

## Phase 2: API Key Usage Analytics (Tasks 5-7)

### Task 5: API Usage Tracking Schema

Create `backend/supabase/migrations/20260310100001_api_key_usage.sql`:

```sql
CREATE TABLE IF NOT EXISTS api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  tokens_used INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_api_usage_key ON api_key_usage(key_id);
CREATE INDEX idx_api_usage_user_ts ON api_key_usage(user_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS api_key_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  request_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT 0,
  UNIQUE (key_id, date)
);

CREATE INDEX idx_api_daily_key ON api_key_daily_stats(key_id);

ALTER TABLE api_key_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own usage" ON api_key_usage FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can view own stats" ON api_key_daily_stats FOR SELECT USING (user_id = auth.uid());
```

### Task 6: API Usage Analytics Backend

Create `backend/core/services/api_usage_api.py`:

Router with tag `"api-usage"`, prefix `/api-keys`:
- `GET /api-keys/{key_id}/usage` — daily stats for a key. Query: `days` (default 30). Returns array of daily stats.
- `GET /api-keys/{key_id}/usage/recent` — last 50 requests with endpoint, method, status, response time.
- `GET /api-keys/usage/summary` — aggregate usage across all keys: total requests, error rate, avg response time, most used endpoints.

Register in `backend/api.py`.

### Task 7: API Usage Dashboard

Create `recoder-agents/src/app/(dashboard)/developers/usage/page.tsx`:

API usage analytics page:
- Summary cards: Total Requests (30d), Error Rate (%), Avg Response Time (ms), Active Keys
- Per-key usage table: key name, requests today, total requests, error rate, last used
- Click key row to expand: daily request line chart (Recharts), endpoint breakdown bar chart, recent requests table
- Date range selector
- Add as tab in developers layout

---

## Phase 3: Agent Secrets & Environment Variables (Tasks 8-10)

### Task 8: Agent Secrets Backend

Create `backend/supabase/migrations/20260310100002_agent_secrets.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, key)
);

CREATE INDEX idx_agent_secrets_agent ON agent_secrets(agent_id);

ALTER TABLE agent_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own secrets"
  ON agent_secrets FOR ALL
  USING (user_id = auth.uid());
```

Create `backend/core/agents/agent_secrets_api.py`:

Router with tag `"agent-secrets"`:
- `POST /agents/{agent_id}/secrets` — create/update secret. Body: `{ key, value, description? }`. Upsert on (agent_id, key).
- `GET /agents/{agent_id}/secrets` — list secrets (returns key + description, NOT the value — mask it).
- `GET /agents/{agent_id}/secrets/{key}` — get secret value (returns full value for authorized user).
- `DELETE /agents/{agent_id}/secrets/{key}` — delete secret.

Register in `backend/api.py`.

### Task 9: Agent Secrets Frontend

Create `recoder-agents/src/lib/api/agent-secrets.ts` and `recoder-agents/src/hooks/agents/use-agent-secrets.ts`.

### Task 10: Agent Secrets Config Screen

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/secrets-screen.tsx`:

Secrets management tab within agent config:
- List of secrets: key name, description, masked value (•••••), created date
- "Reveal" button per secret (shows value temporarily for 5 seconds then re-masks)
- "Add Secret" dialog: key input (uppercase snake_case suggested), value input, description
- Edit/delete actions per secret
- Info banner: "Secrets are encrypted and available to your agent at runtime via environment variables."

Wire into agent config page as a new "Secrets" tab.

---

## Phase 4: Customizable Dashboard Widgets (Tasks 11-14)

### Task 11: Widget Configuration Schema

Store widget layout in localStorage (no backend needed):

Widget types:
- `agent-status` — agent status overview cards (already built)
- `quick-resume` — thread quick resume bar (already built)
- `activity-feed` — activity feed
- `platform-stats` — platform stats cards
- `quick-actions` — quick action buttons
- `recent-runs` — recent agent runs
- `cost-summary` — cost overview

### Task 12: Widget Registry & Layout Store

Create `recoder-agents/src/stores/dashboard-widgets-store.ts`:

Zustand store for dashboard widget layout:
- `widgets: WidgetConfig[]` — ordered array of enabled widgets
- `addWidget(type)`, `removeWidget(id)`, `reorderWidgets(newOrder)`, `toggleWidget(id)`
- Persist to localStorage
- Default layout: all widgets enabled in sensible order

Create `recoder-agents/src/components/dashboard/widget-registry.tsx`:

Widget registry mapping widget type to component:
```
agent-status → AgentStatusCards
quick-resume → QuickResumeBar
activity-feed → ActivityFeed
platform-stats → PlatformStats
quick-actions → QuickActions
recent-runs → RecentRunsWidget (new)
cost-summary → CostSummaryWidget (new)
```

### Task 13: Dashboard Customization UI

Create `recoder-agents/src/components/dashboard/dashboard-customizer.tsx`:

Customization dialog accessible from dashboard header:
- List of available widgets with toggle switches (on/off)
- Drag handle icons for reordering
- Preview of current layout
- "Reset to Default" button

### Task 14: Dynamic Dashboard Content

Modify `recoder-agents/src/components/dashboard/dashboard-content.tsx`:

Replace static layout with dynamic rendering:
- Read widget config from store
- Render enabled widgets in order using widget registry
- Add "Customize" button (Settings2 icon) in dashboard header that opens customizer
- Create small `RecentRunsWidget` and `CostSummaryWidget` components inline

---

## Phase 5: In-Thread Message Search (Tasks 15-18)

### Task 15: Thread Message Search Backend

Add to threads API:
- `GET /threads/{thread_id}/search?q=<query>` — full-text search within a thread's messages. Returns matching messages with highlighted snippets. Auth required, scoped to thread owner.

### Task 16: Thread Message Search Frontend

Create `recoder-agents/src/hooks/threads/use-thread-search-messages.ts`:

Hook: `useThreadMessageSearch(threadId, query)` — debounced search within thread messages.

### Task 17: Thread Search UI

Create `recoder-agents/src/components/thread/thread-message-search.tsx`:

Search bar component for within-thread search:
- Search icon button in thread header that expands to search input
- Debounced query (300ms)
- Results dropdown: message preview, role badge, timestamp, click to scroll to message
- Match count display: "3 of 12 results"
- Up/down arrows to navigate between matches
- Esc to close
- Highlights matching text in the message

Wire into thread-site-header.tsx.

### Task 18: Update Status Docs

Update `tasks/todo.md` with Sprint 42 completion status.

---
