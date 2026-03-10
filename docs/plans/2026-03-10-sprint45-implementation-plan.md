# Sprint 45: Agent A/B Testing, Notification Channels, Thread Bookmarks, API Playground & Agent Activity Feed

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add agent A/B testing framework, Slack/Discord notification channels, thread message bookmarks, interactive API playground, and per-agent activity feed — completing the experimentation, communication, and developer experience feature set.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Supabase with RLS. Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent A/B Testing Framework (Tasks 1-4)

### Task 1: A/B Test Database Schema

Create `backend/supabase/migrations/20260310400000_ab_tests.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  agent_a_id TEXT NOT NULL,
  agent_b_id TEXT NOT NULL,
  metric TEXT DEFAULT 'success_rate' CHECK (metric IN ('success_rate', 'latency', 'cost', 'user_rating')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'cancelled')),
  total_trials INTEGER DEFAULT 20,
  completed_trials INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ab_test_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES agent_ab_tests(id) ON DELETE CASCADE,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  agent_id TEXT NOT NULL,
  thread_id TEXT,
  input_message TEXT,
  success BOOLEAN,
  latency_ms INTEGER,
  cost NUMERIC(10,6),
  tokens_used INTEGER,
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ab_tests_user ON agent_ab_tests(user_id);
CREATE INDEX idx_ab_trials_test ON ab_test_trials(test_id);

ALTER TABLE agent_ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_trials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tests" ON agent_ab_tests FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage own trials" ON ab_test_trials FOR ALL USING (test_id IN (SELECT id FROM agent_ab_tests WHERE user_id = auth.uid()));
```

### Task 2: A/B Test API

Create `backend/core/agents/agent_ab_test_api.py`:

Router with tag `"agent-ab-tests"`:
- `POST /ab-tests` — create test. Body: `{ name, description?, agent_a_id, agent_b_id, metric?, total_trials? }`. Auth required.
- `GET /ab-tests` — list user's tests. Auth required.
- `GET /ab-tests/{test_id}` — test detail with trial results + statistical analysis. Auth required.
- `PATCH /ab-tests/{test_id}` — update (start, cancel). Auth required.
- `DELETE /ab-tests/{test_id}` — delete test. Auth required.
- `POST /ab-tests/{test_id}/trials` — record a trial result. Body: `{ variant, agent_id, thread_id?, input_message?, success?, latency_ms?, cost?, tokens_used?, user_rating? }`. Increments completed_trials. Auth required.
- `GET /ab-tests/{test_id}/results` — statistical comparison: per-variant averages, winner determination, confidence score (simple z-test for proportions). Auth required.

Register in `backend/api.py`.

### Task 3: A/B Test Frontend

Create `recoder-agents/src/lib/api/ab-tests.ts` and `recoder-agents/src/hooks/agents/use-ab-tests.ts`.

Hooks: `useAbTests()`, `useAbTest(id)`, `useCreateAbTest()`, `useUpdateAbTest()`, `useDeleteAbTest()`, `useRecordTrial()`, `useAbTestResults(id)`.

### Task 4: A/B Test UI

Create `recoder-agents/src/app/(dashboard)/agents/ab-tests/page.tsx`:

A/B test management page:
- Test list: name, agents A vs B, metric, status badge, progress (X/Y trials), created date
- "New A/B Test" dialog: name, select Agent A (dropdown), select Agent B (dropdown), metric selector, trial count
- Click test to expand: side-by-side comparison cards for A vs B showing averages (success rate, latency, cost, rating), bar chart comparison, winner badge with confidence %, trial history table
- Actions: Start, Cancel, Delete

Create `recoder-agents/src/app/(dashboard)/agents/ab-tests/[testId]/page.tsx`:

A/B test detail page:
- Header: test name, status, progress bar
- Side-by-side agent cards: name, metric averages, trial count
- Bar chart: metric comparison (Recharts)
- Statistical results: winner, confidence %, p-value interpretation
- Trial log table: variant, input preview, result, latency, cost, timestamp
- "Record Trial" button (manual entry for now)

Add "A/B Tests" link in agents section of sidebar with FlaskConical icon.

---

## Phase 2: Notification Channels — Slack & Discord (Tasks 5-8)

### Task 5: Notification Channel Schema

Create `backend/supabase/migrations/20260310400001_notification_channels.sql`:

```sql
CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('slack', 'discord', 'email')),
  name TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  events TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notification_channels_user ON notification_channels(user_id);

ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own channels" ON notification_channels FOR ALL USING (user_id = auth.uid());
```

### Task 6: Notification Channel API

Create `backend/core/notifications/notification_channels_api.py`:

Router with tag `"notification-channels"`:
- `POST /notification-channels` — create channel. Body: `{ channel_type, name, webhook_url, events[] }`. Auth required.
- `GET /notification-channels` — list user's channels. Auth required.
- `PATCH /notification-channels/{channel_id}` — update (name, webhook_url, is_active, events). Auth required.
- `DELETE /notification-channels/{channel_id}` — delete. Auth required.
- `POST /notification-channels/{channel_id}/test` — send test notification. Auth required.

Create `backend/core/notifications/channel_dispatcher.py`:

Dispatcher that sends notifications to configured channels:
- `dispatch_to_channels(user_id, event_type, payload)` — looks up active channels for user where event_type is in events[], sends to each.
- Slack format: POST to webhook_url with `{ text, blocks[] }` payload.
- Discord format: POST to webhook_url with `{ content, embeds[] }` payload.
- Fire-and-forget, log failures.

Register in `backend/api.py`.

### Task 7: Notification Channel Frontend

Create `recoder-agents/src/lib/api/notification-channels.ts` and `recoder-agents/src/hooks/platform/use-notification-channels.ts`.

Hooks: `useNotificationChannels()`, `useCreateChannel()`, `useUpdateChannel()`, `useDeleteChannel()`, `useTestChannel()`.

### Task 8: Notification Channel Settings UI

Create `recoder-agents/src/components/notifications/notification-channels.tsx`:

Notification channels management (add to notification settings page):
- Channel list: type icon (Slack/Discord/Mail), name, status toggle, event count, test button
- "Add Channel" dialog: type selector (Slack, Discord), name, webhook URL input, event checkboxes (agent.completed, agent.failed, thread.message, system.alert, schedule.triggered, quota.warning)
- Per-channel: edit, delete, test (sends sample notification)
- Setup instructions per type: "Create a Slack incoming webhook at..." / "Create a Discord webhook in channel settings..."

Wire into notification settings page or create a dedicated `/settings/channels` section.

---

## Phase 3: Thread Message Bookmarks (Tasks 9-12)

### Task 9: Message Bookmarks Schema

Create `backend/supabase/migrations/20260310400002_message_bookmarks.sql`:

```sql
CREATE TABLE IF NOT EXISTS message_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  message_preview TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, message_index)
);

CREATE INDEX idx_bookmarks_user ON message_bookmarks(user_id);
CREATE INDEX idx_bookmarks_thread ON message_bookmarks(user_id, thread_id);

ALTER TABLE message_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own bookmarks" ON message_bookmarks FOR ALL USING (user_id = auth.uid());
```

### Task 10: Message Bookmarks API

Create `backend/core/threads/message_bookmarks_api.py`:

Router with tag `"message-bookmarks"`:
- `POST /bookmarks` — create bookmark. Body: `{ thread_id, message_index, message_preview?, note? }`. Auth required.
- `GET /bookmarks` — list all bookmarks. Query: `thread_id` (optional filter). Auth required.
- `DELETE /bookmarks/{bookmark_id}` — remove bookmark. Auth required.
- `PATCH /bookmarks/{bookmark_id}` — update note. Auth required.

Register in `backend/api.py`.

### Task 11: Message Bookmarks Frontend

Create `recoder-agents/src/lib/api/message-bookmarks.ts` and `recoder-agents/src/hooks/threads/use-message-bookmarks.ts`.

Hooks: `useBookmarks(threadId?)`, `useCreateBookmark()`, `useDeleteBookmark()`, `useUpdateBookmarkNote()`.

### Task 12: Message Bookmark UI

Create `recoder-agents/src/components/thread/message-bookmark-button.tsx`:

Bookmark button for individual messages:
- Small bookmark icon that appears on message hover (top-right corner)
- Filled when bookmarked, outline when not
- Click to toggle bookmark
- Optional note popover when bookmarking (small textarea)

Create `recoder-agents/src/components/thread/bookmarks-panel.tsx`:

Bookmarks panel (sidebar or dropdown in thread header):
- List of bookmarks for current thread: message preview, note, timestamp
- Click to scroll to bookmarked message (with highlight)
- Edit note inline
- Delete bookmark
- "All Bookmarks" view across all threads

Wire bookmark button into message rendering in ThreadComponent.
Wire bookmarks panel into thread-site-header as a Bookmark icon button.

---

## Phase 4: Interactive API Playground (Tasks 13-16)

### Task 13: API Playground Backend

Create `backend/core/developers/api_playground_api.py`:

Router with tag `"api-playground"`:
- `GET /playground/endpoints` — list all available API endpoints with method, path, description, parameters, body schema. Extracted from FastAPI's OpenAPI schema.
- `POST /playground/execute` — proxy endpoint. Body: `{ method, path, body?, query_params? }`. Executes the request internally and returns the response. Auth required (uses caller's auth context).

Register in `backend/api.py`.

### Task 14: API Playground Frontend

Create `recoder-agents/src/lib/api/api-playground.ts` and `recoder-agents/src/hooks/developers/use-api-playground.ts`.

Hooks: `usePlaygroundEndpoints()`, `useExecutePlaygroundRequest()`.

### Task 15: API Playground Page

Create `recoder-agents/src/app/(dashboard)/developers/playground/page.tsx`:

Interactive API playground:
- Left panel: endpoint list grouped by tag, search bar, method badges (GET=green, POST=blue, PUT=amber, DELETE=red, PATCH=purple)
- Click endpoint to select
- Right panel (selected endpoint):
  - Method + path display
  - Description
  - Parameter inputs: path params, query params (auto-generated from schema)
  - Request body editor (JSON textarea with syntax highlighting via monospace font)
  - "Send Request" button
  - Response panel: status code badge, response time, formatted JSON response, headers
- Request history (last 10, stored in localStorage): endpoint, status, timestamp, click to replay

### Task 16: Wire API Playground

Add "API Playground" tab in developers section layout.
Add link from existing API Explorer page to playground.

---

## Phase 5: Agent Activity Feed (Tasks 17-20)

### Task 17: Agent Activity Schema

Create `backend/supabase/migrations/20260310400003_agent_activity.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('run_started', 'run_completed', 'run_failed', 'config_updated', 'tool_added', 'tool_removed', 'schedule_triggered', 'secret_updated', 'shared', 'cloned')),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_activity_agent ON agent_activity(agent_id, created_at DESC);
CREATE INDEX idx_agent_activity_user ON agent_activity(user_id, created_at DESC);

ALTER TABLE agent_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own activity" ON agent_activity FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "System can insert activity" ON agent_activity FOR INSERT WITH CHECK (true);
```

### Task 18: Agent Activity API

Create `backend/core/agents/agent_activity_api.py`:

Router with tag `"agent-activity"`:
- `GET /agents/{agent_id}/activity` — paginated activity feed for agent. Query: `limit`, `offset`, `activity_type`. Auth required.
- `GET /agents/activity/recent` — recent activity across all agents (last 50). Auth required.
- `GET /agents/{agent_id}/activity/summary` — activity counts by type for last 30 days. Auth required.

Create helper: `log_agent_activity(user_id, agent_id, activity_type, description, metadata)` — fire-and-forget insert.

Register in `backend/api.py`.

### Task 19: Agent Activity Frontend

Create `recoder-agents/src/lib/api/agent-activity.ts` and `recoder-agents/src/hooks/agents/use-agent-activity.ts`.

Hooks: `useAgentActivity(agentId, filters)`, `useRecentActivity()`, `useAgentActivitySummary(agentId)`.

### Task 20: Agent Activity UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/activity-screen.tsx`:

Activity feed tab within agent config:
- Activity timeline: vertical list with type icon (color-coded), description, relative timestamp, expandable metadata
- Activity type icons: run_started=Play, run_completed=CheckCircle, run_failed=XCircle, config_updated=Settings, tool_added=Plus, tool_removed=Minus, schedule_triggered=Clock, secret_updated=Key, shared=Share2, cloned=Copy
- Filter by activity type (dropdown)
- Summary cards: Total events (30d), Runs, Config changes, Errors
- Pagination (load more)

Wire into agent config page as "Activity" tab with Activity icon.

Create `recoder-agents/src/components/dashboard/recent-activity-widget.tsx`:

Dashboard widget showing recent activity across all agents:
- Last 5 activities: agent name badge, activity description, relative time
- "View All" link to activity page
- Register in widget registry for dashboard customization

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 45 completion status.

---
