# Sprint 55: Agent Run Queues, Thread Sentiment Tracker, API Key Scoping, Agent Activity Heatmap & Saved Filters

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add agent run queue management with priority scheduling, per-thread sentiment tracking over time, fine-grained API key scope restrictions, agent activity heatmap visualization, and persistent saved filter presets across all list views — completing the execution orchestration, conversation intelligence, API security, activity visibility, and UX personalization features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Run Queues (Tasks 1-4)

### Task 1: Run Queue Schema

Create `backend/supabase/migrations/20260311400000_agent_run_queues.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_run_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  run_id TEXT,
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  input_message TEXT,
  config JSONB DEFAULT '{}',
  queued_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  position INTEGER
);

CREATE TABLE IF NOT EXISTS run_queue_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  max_concurrent_runs INTEGER DEFAULT 3,
  default_priority INTEGER DEFAULT 5,
  auto_retry_failed BOOLEAN DEFAULT false,
  max_retries INTEGER DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_run_queue_user ON agent_run_queue(user_id, queued_at DESC);
CREATE INDEX idx_run_queue_agent ON agent_run_queue(agent_id);
CREATE INDEX idx_run_queue_status ON agent_run_queue(status) WHERE status IN ('queued', 'running');
CREATE INDEX idx_run_queue_priority ON agent_run_queue(priority DESC, queued_at ASC) WHERE status = 'queued';

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Run Queue API

Create `backend/core/agents/agent_run_queue_api.py`:

Router with tag `"agent-run-queue"`:
- `POST /queue/enqueue` — add run to queue. Body: `{ agent_id, input_message?, priority?, config? }`. Auto-assigns position. Auth required.
- `GET /queue` — list queue entries. Query: `status`, `agent_id`, `limit`, `offset`. Auth required.
- `DELETE /queue/{entry_id}` — cancel queued entry (only if status=queued). Auth required.
- `PATCH /queue/{entry_id}/priority` — update priority. Body: `{ priority }`. Auth required.
- `GET /queue/stats` — queue stats: queued count, running count, avg wait time, completed today. Auth required.
- `GET /queue/settings` — get queue settings. Auth required.
- `PUT /queue/settings` — update queue settings. Body: `{ max_concurrent_runs?, default_priority?, auto_retry_failed?, max_retries? }`. Auth required.
- `POST /queue/process-next` — dequeue next highest priority entry and mark running. Auth required.

Register in `backend/api.py`.

### Task 3: Run Queue Frontend

Create `recoder-agents/src/lib/api/agent-run-queue.ts` and `recoder-agents/src/hooks/agents/use-agent-run-queue.ts`.

Hooks: `useRunQueue(filters)`, `useEnqueueRun()`, `useCancelQueueEntry()`, `useUpdatePriority()`, `useQueueStats()`, `useQueueSettings()`, `useUpdateQueueSettings()`, `useProcessNext()`.

### Task 4: Run Queue UI

Create `recoder-agents/src/app/(dashboard)/agents/queue/page.tsx`:

Run queue management page:
- Stats header: Queued count, Running count, Avg Wait Time, Completed Today
- Queue list: agent name, input preview, priority badge (1-3=red/high, 4-6=amber/medium, 7-10=green/low), status badge, queued time, position, cancel/reprioritize actions
- "Enqueue Run" dialog: agent selector, input message, priority slider (1-10)
- Settings panel (collapsible): max concurrent, default priority, auto-retry toggle, max retries
- Filter by status and agent
- "Process Next" button for manual dequeue

Wire into agents section navigation.

---

## Phase 2: Thread Sentiment Tracker (Tasks 5-8)

### Task 5: Sentiment Tracking Schema

Create `backend/supabase/migrations/20260311400001_thread_sentiment.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_sentiment_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  agent_id TEXT,
  message_index INTEGER NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('very_positive', 'positive', 'neutral', 'negative', 'very_negative')),
  confidence NUMERIC(3,2) DEFAULT 0.8,
  keywords TEXT[] DEFAULT '{}',
  scored_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (thread_id, message_index)
);

CREATE INDEX idx_sentiment_thread ON thread_sentiment_scores(thread_id, message_index);
CREATE INDEX idx_sentiment_user ON thread_sentiment_scores(user_id);
CREATE INDEX idx_sentiment_agent ON thread_sentiment_scores(agent_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Sentiment Tracker API

Create `backend/core/threads/thread_sentiment_api.py`:

Router with tag `"thread-sentiment"`:
- `POST /threads/{thread_id}/sentiment/analyze` — analyze sentiment of thread messages. Simple keyword-based: positive words (great, thanks, helpful, excellent, perfect) → positive, negative words (wrong, error, fail, bad, broken, issue) → negative. Scores each message, upserts. Auth required.
- `GET /threads/{thread_id}/sentiment` — get sentiment scores for thread. Auth required.
- `GET /threads/{thread_id}/sentiment/trend` — sentiment over message progression (for charting). Auth required.
- `GET /sentiment/overview` — aggregate: avg sentiment distribution, most positive/negative threads, agent sentiment comparison. Auth required.

Register in `backend/api.py`.

### Task 7: Sentiment Tracker Frontend

Create `recoder-agents/src/lib/api/thread-sentiment.ts` and `recoder-agents/src/hooks/threads/use-thread-sentiment.ts`.

Hooks: `useAnalyzeSentiment()`, `useThreadSentiment(threadId)`, `useSentimentTrend(threadId)`, `useSentimentOverview()`.

### Task 8: Sentiment Tracker UI

Create `recoder-agents/src/components/thread/sentiment-indicator.tsx`:

Sentiment indicator for thread view:
- Small emoji/icon per message showing sentiment (😊 positive, 😐 neutral, 😟 negative)
- Thread-level sentiment summary badge in thread header
- "Analyze Sentiment" button

Create `recoder-agents/src/app/(dashboard)/analytics/sentiment/page.tsx`:

Sentiment analytics page:
- Distribution pie chart: very_positive, positive, neutral, negative, very_negative
- Sentiment trend line chart (per-thread, message progression)
- Most positive/negative threads list
- Agent sentiment comparison bar chart
- Period filter

Wire sentiment indicator into thread view.

---

## Phase 3: API Key Scoping (Tasks 9-12)

### Task 9: Key Scoping Schema

Create `backend/supabase/migrations/20260311400002_api_key_scopes.sql`:

```sql
CREATE TABLE IF NOT EXISTS api_key_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('agents:read', 'agents:write', 'threads:read', 'threads:write', 'runs:execute', 'kb:read', 'kb:write', 'billing:read', 'admin:all', 'webhooks:manage', 'search:read')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (key_id, scope)
);

CREATE TABLE IF NOT EXISTS api_key_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key_id TEXT NOT NULL UNIQUE,
  allowed_ips TEXT[] DEFAULT '{}',
  allowed_agents TEXT[] DEFAULT '{}',
  rate_limit_override INTEGER,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_key_scopes_key ON api_key_scopes(key_id);
CREATE INDEX idx_key_scopes_user ON api_key_scopes(user_id);
CREATE INDEX idx_key_restrictions_key ON api_key_restrictions(key_id);
CREATE INDEX idx_key_restrictions_user ON api_key_restrictions(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Key Scoping API

Create `backend/core/developers/api_key_scopes_api.py`:

Router with tag `"api-key-scopes"`:
- `GET /keys/{key_id}/scopes` — list scopes for key. Auth required.
- `PUT /keys/{key_id}/scopes` — set scopes for key. Body: `{ scopes[] }`. Replaces all. Auth required.
- `GET /keys/{key_id}/restrictions` — get restrictions. Auth required.
- `PUT /keys/{key_id}/restrictions` — set restrictions. Body: `{ allowed_ips?, allowed_agents?, rate_limit_override?, expires_at? }`. Auth required.
- `POST /keys/{key_id}/validate-scope` — check if key has a specific scope. Body: `{ scope }`. Auth required.

Register in `backend/api.py`.

### Task 11: Key Scoping Frontend

Create `recoder-agents/src/lib/api/api-key-scopes.ts` and `recoder-agents/src/hooks/developers/use-api-key-scopes.ts`.

Hooks: `useKeyScopes(keyId)`, `useSetKeyScopes()`, `useKeyRestrictions(keyId)`, `useSetKeyRestrictions()`, `useValidateKeyScope()`.

### Task 12: Key Scoping UI

Create `recoder-agents/src/components/developers/key-scope-editor.tsx`:

Key scope editor panel:
- Scope checkboxes grouped: Read (agents:read, threads:read, kb:read, billing:read, search:read), Write (agents:write, threads:write, kb:write), Execute (runs:execute), Manage (webhooks:manage, admin:all)
- "Select All Read" / "Select All Write" quick buttons
- Restrictions section: IP allowlist (tag input), agent allowlist (tag input), rate limit override number input, expiry date picker
- Save button

Wire into existing API keys management page as expandable section per key.

---

## Phase 4: Agent Activity Heatmap (Tasks 13-16)

### Task 13: Agent Activity Schema

Create `backend/supabase/migrations/20260311400003_agent_activity_heatmap.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_activity_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  run_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  total_cost NUMERIC(10,6) DEFAULT 0,
  UNIQUE (user_id, agent_id, date)
);

CREATE INDEX idx_agent_activity_user ON agent_activity_daily(user_id, date DESC);
CREATE INDEX idx_agent_activity_agent ON agent_activity_daily(agent_id, date DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Agent Activity Heatmap API

Create `backend/core/agents/agent_activity_heatmap_api.py`:

Router with tag `"agent-activity-heatmap"`:
- `GET /agents/activity/heatmap` — GitHub-style heatmap: daily activity for last 365 days. Returns `[{ date, run_count, message_count, error_count, total_cost }]`. Query: `agent_id` (optional, aggregate all if omitted). Auth required.
- `GET /agents/activity/streaks` — longest and current activity streaks (consecutive days with runs). Auth required.
- `POST /agents/activity/record` — record daily activity (called internally). Body: `{ agent_id, run_count?, message_count?, error_count?, total_cost? }`. Upserts. Auth required.
- `GET /agents/activity/weekly-summary` — last 4 weeks comparison: runs, messages, errors, cost. Auth required.

Register in `backend/api.py`.

### Task 15: Agent Activity Heatmap Frontend

Create `recoder-agents/src/lib/api/agent-activity-heatmap.ts` and `recoder-agents/src/hooks/agents/use-agent-activity-heatmap.ts`.

Hooks: `useAgentActivityHeatmap(agentId?)`, `useActivityStreaks()`, `useWeeklyActivitySummary()`.

### Task 16: Agent Activity Heatmap UI

Create `recoder-agents/src/components/agents/activity-heatmap.tsx`:

GitHub-style contribution heatmap:
- 52 columns (weeks) x 7 rows (days) grid of small squares
- Color intensity based on run_count (gray=0, light green=low, dark green=high)
- Tooltip on hover: date, runs, messages, errors, cost
- Month labels along top
- Day labels (Mon, Wed, Fri) on left
- Streak display: "Current streak: X days" and "Longest streak: X days"
- Agent filter dropdown (or show aggregate)
- Legend: Less ▪▪▪▪ More

Wire into agent config page or dashboard as a widget.

---

## Phase 5: Saved Filters (Tasks 17-20)

### Task 17: Saved Filters Schema

Create `backend/supabase/migrations/20260311400004_saved_filters.sql`:

```sql
CREATE TABLE IF NOT EXISTS saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  view_type TEXT NOT NULL CHECK (view_type IN ('threads', 'agents', 'runs', 'incidents', 'activity', 'billing', 'bookmarks', 'queue')),
  filters JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_saved_filters_user ON saved_filters(user_id, view_type);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Saved Filters API

Create `backend/core/preferences/saved_filters_api.py` + `__init__.py`:

Router with tag `"saved-filters"`:
- `POST /filters` — save filter. Body: `{ name, view_type, filters, is_default? }`. Auth required.
- `GET /filters` — list saved filters. Query: `view_type`. Auth required.
- `PATCH /filters/{filter_id}` — update. Auth required.
- `DELETE /filters/{filter_id}` — delete. Auth required.
- `PUT /filters/{filter_id}/default` — set as default for view_type (unsets other defaults). Auth required.

Register in `backend/api.py`.

### Task 19: Saved Filters Frontend

Create `recoder-agents/src/lib/api/saved-filters.ts` and `recoder-agents/src/hooks/use-saved-filters.ts`.

Hooks: `useSavedFilters(viewType)`, `useCreateFilter()`, `useUpdateFilter()`, `useDeleteFilter()`, `useSetDefaultFilter()`.

### Task 20: Saved Filters UI

Create `recoder-agents/src/components/filters/saved-filter-bar.tsx`:

Reusable saved filter bar component:
- Props: `viewType`, `currentFilters`, `onApplyFilter`
- Horizontal bar of saved filter pills/badges
- Default filter highlighted
- Click to apply filter (calls onApplyFilter with filter data)
- "Save Current" button: opens name input dialog, saves current filters
- Filter pill context menu: Set as Default, Rename, Delete
- Star icon on default filter

Wire into thread list, agents page, runs page, and other list views as appropriate.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 55 completion status.

---
