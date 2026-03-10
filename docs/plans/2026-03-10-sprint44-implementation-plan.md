# Sprint 44: Agent Scheduling Engine, Thread Tags, Agent Import/Export, Webhook Signatures & Bulk Thread Ops

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the scheduled agent execution engine, thread tagging/organization, full agent config import/export, webhook HMAC signature verification, and bulk thread operations — completing automation and organization capabilities.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Supabase with RLS. Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Scheduled Agent Execution Engine (Tasks 1-4)

### Task 1: Schedule Execution Schema

Create `backend/supabase/migrations/20260310300000_scheduled_executions.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  input_message TEXT,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  max_runs INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES agent_schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  output_summary TEXT
);

CREATE INDEX idx_schedules_user ON agent_schedules(user_id);
CREATE INDEX idx_schedules_agent ON agent_schedules(agent_id);
CREATE INDEX idx_schedules_next_run ON agent_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX idx_schedule_execs_schedule ON schedule_executions(schedule_id);
CREATE INDEX idx_schedule_execs_user ON schedule_executions(user_id, started_at DESC);

ALTER TABLE agent_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own schedules" ON agent_schedules FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can view own executions" ON schedule_executions FOR ALL USING (user_id = auth.uid());
```

### Task 2: Schedule Management API

Create `backend/core/agents/agent_schedule_api.py`:

Router with tag `"agent-schedules"`:
- `POST /agents/{agent_id}/schedules` — create schedule. Body: `{ name, cron_expression, timezone?, input_message?, max_runs? }`. Validates cron expression. Calculates next_run_at. Auth required.
- `GET /agents/{agent_id}/schedules` — list schedules for agent. Auth required.
- `GET /schedules` — list all user's schedules across all agents. Auth required.
- `PATCH /schedules/{schedule_id}` — update schedule (name, cron, timezone, input, is_active, max_runs). Recalculates next_run_at. Auth required.
- `DELETE /schedules/{schedule_id}` — delete schedule. Auth required.
- `POST /schedules/{schedule_id}/trigger` — manually trigger a scheduled run (creates schedule_execution, returns it). Auth required.
- `GET /schedules/{schedule_id}/executions` — list execution history. Query: `limit`, `offset`, `status`. Auth required.

Cron parsing: use `croniter` library to parse cron expressions and calculate next_run_at. Validate format on create/update.

Register in `backend/api.py`.

### Task 3: Schedule Frontend

Create `recoder-agents/src/lib/api/agent-schedules.ts` and `recoder-agents/src/hooks/agents/use-agent-schedules.ts`.

API client: `createSchedule`, `getAgentSchedules`, `getAllSchedules`, `updateSchedule`, `deleteSchedule`, `triggerSchedule`, `getScheduleExecutions`.

Hooks: `useAgentSchedules(agentId)`, `useAllSchedules()`, `useCreateSchedule()`, `useUpdateSchedule()`, `useDeleteSchedule()`, `useTriggerSchedule()`, `useScheduleExecutions(scheduleId)`.

### Task 4: Schedule Management UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/schedules-screen.tsx`:

Schedule management tab within agent config:
- Schedule list: name, cron expression (human-readable), timezone, status toggle, next run time, last run time, run count
- "New Schedule" dialog: name, cron expression with preset buttons (Every hour, Every 6h, Daily 9am, Weekly Monday, Monthly 1st), timezone selector, input message textarea, optional max runs
- Each schedule: edit, delete, "Run Now" button, view execution history
- Execution history panel (collapsible): status badge (completed=green, failed=red, running=blue), started/completed times, output summary, error message

Wire into agent config page as "Schedules" tab with Clock icon.

Create `recoder-agents/src/app/(dashboard)/schedules/page.tsx`:

All schedules overview page:
- Table of all schedules across agents: agent name, schedule name, cron, next run, last run, status, actions
- Filter: active only toggle, agent filter
- Summary cards: Total Schedules, Active, Runs Today, Failed Today

Add "Schedules" link in sidebar with CalendarClock icon.

---

## Phase 2: Thread Tags & Organization (Tasks 5-8)

### Task 5: Thread Tags Schema

Create `backend/supabase/migrations/20260310300001_thread_tags.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6b7280',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS thread_tag_assignments (
  thread_id TEXT NOT NULL,
  tag_id UUID NOT NULL REFERENCES thread_tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (thread_id, tag_id)
);

CREATE INDEX idx_thread_tags_user ON thread_tags(user_id);
CREATE INDEX idx_tag_assignments_thread ON thread_tag_assignments(thread_id);
CREATE INDEX idx_tag_assignments_tag ON thread_tag_assignments(tag_id);
CREATE INDEX idx_tag_assignments_user ON thread_tag_assignments(user_id);

ALTER TABLE thread_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tags" ON thread_tags FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage own assignments" ON thread_tag_assignments FOR ALL USING (user_id = auth.uid());
```

### Task 6: Thread Tags API

Create `backend/core/threads/thread_tags_api.py`:

Router with tag `"thread-tags"`:
- `POST /tags` — create tag. Body: `{ name, color? }`. Auth required.
- `GET /tags` — list user's tags with thread count per tag. Auth required.
- `PATCH /tags/{tag_id}` — update tag (name, color). Auth required.
- `DELETE /tags/{tag_id}` — delete tag (cascades assignments). Auth required.
- `POST /threads/{thread_id}/tags` — assign tag to thread. Body: `{ tag_id }`. Auth required.
- `DELETE /threads/{thread_id}/tags/{tag_id}` — remove tag from thread. Auth required.
- `GET /threads/{thread_id}/tags` — list tags on a thread. Auth required.
- `GET /tags/{tag_id}/threads` — list threads with a specific tag. Auth required.
- `POST /threads/bulk-tag` — assign tag to multiple threads. Body: `{ thread_ids[], tag_id }`. Auth required.

Register in `backend/api.py`.

### Task 7: Thread Tags Frontend

Create `recoder-agents/src/lib/api/thread-tags.ts` and `recoder-agents/src/hooks/threads/use-thread-tags.ts`.

Hooks: `useThreadTags()` (all user tags), `useThreadTagAssignments(threadId)`, `useCreateTag()`, `useUpdateTag()`, `useDeleteTag()`, `useAssignTag()`, `useRemoveTag()`, `useBulkTag()`, `useTaggedThreads(tagId)`.

### Task 8: Thread Tags UI

Create `recoder-agents/src/components/thread/thread-tag-manager.tsx`:

Tag management component:
- Inline tag pills on thread items in sidebar (small colored dots with name on hover)
- Tag selector popover: list of existing tags with checkboxes, search/filter, "Create new tag" inline (name + color picker)
- Tag management dialog (from settings): list all tags, edit name/color, delete, thread count

Modify `recoder-agents/src/components/sidebar/sidebar-thread-list.tsx`:
- Add tag pills next to thread titles
- Add "Tag" action to thread context menu (opens tag selector popover)
- Add tag filter dropdown at top of thread list (filter by tag)

---

## Phase 3: Agent Import/Export with Dependencies (Tasks 9-12)

### Task 9: Agent Export Backend

Create `backend/core/agents/agent_import_export_api.py`:

Router with tag `"agent-import-export"`:
- `GET /agents/{agent_id}/export` — export full agent config as JSON. Includes: name, instructions, model, tools, settings, knowledge_entries (names + content summaries, not full files), secrets (keys only, not values), schedules, quota config. Auth required.
- `POST /agents/import` — import agent from JSON config. Creates new agent with imported config. Body: JSON config object. Auth required.
- `POST /agents/{agent_id}/export/download` — same as GET but returns as downloadable file with Content-Disposition header.

Register in `backend/api.py`.

### Task 10: Agent Export Frontend

Create `recoder-agents/src/lib/api/agent-import-export.ts` and `recoder-agents/src/hooks/agents/use-agent-import-export.ts`.

Hooks: `useExportAgent(agentId)`, `useImportAgent()`, `useDownloadAgentExport(agentId)`.

### Task 11: Agent Export Dialog

Create `recoder-agents/src/components/agents/agent-export-dialog.tsx`:

Export dialog triggered from agent config or agent card:
- Preview of what will be exported: agent name, instructions preview, tool count, knowledge count, schedule count, secret keys (masked)
- Options: Include knowledge entries (names only), Include schedule configs, Include quota config
- "Download .json" button
- "Copy to Clipboard" button
- File named `agent-{name}-{date}.json`

### Task 12: Agent Import Dialog

Create `recoder-agents/src/components/agents/agent-import-dialog.tsx`:

Import dialog triggered from agents page or quick actions:
- File upload dropzone (accepts .json)
- OR paste JSON textarea
- Preview parsed config: agent name (editable), instructions preview, tool count, what will be created
- Warning: "Secrets will not be imported — you'll need to add them manually"
- "Import Agent" button that creates the agent and navigates to its config page

Wire export into agent card dropdown menu (Download icon) and agent config header.
Wire import into agents page header ("Import Agent" button) and agent quick actions FAB.

---

## Phase 4: Webhook HMAC Signature Verification (Tasks 13-15)

### Task 13: Webhook Signing Service

Create `backend/core/webhooks/webhook_signing.py`:

Signing utility:
- `generate_webhook_secret()` — generates a random 32-byte hex secret.
- `sign_payload(payload: str, secret: str) -> str` — HMAC-SHA256 signature of payload with secret.
- `verify_signature(payload: str, signature: str, secret: str) -> bool` — constant-time comparison of expected vs provided signature.

Modify webhook delivery logic (wherever webhooks are sent) to:
- Include `X-Recoder-Signature` header with HMAC-SHA256 signature
- Include `X-Recoder-Timestamp` header with Unix timestamp
- Signed payload format: `{timestamp}.{body}`

### Task 14: Webhook Secret Management

Modify existing webhook endpoints or create new ones:
- Each webhook endpoint gets a `signing_secret` column (auto-generated on create)
- `GET /webhooks/{webhook_id}/secret` — reveal signing secret (one-time view, similar to API keys). Auth required.
- `POST /webhooks/{webhook_id}/rotate-secret` — rotate signing secret. Auth required.

Create `backend/supabase/migrations/20260310300002_webhook_signing.sql`:
```sql
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS signing_secret TEXT;
```

### Task 15: Webhook Signing UI & Docs

Modify `recoder-agents/src/app/(dashboard)/developers/webhooks/page.tsx` (or wherever webhook management lives):
- Show "Signing Secret" field per webhook (masked, with reveal button)
- "Rotate Secret" button with confirmation
- Inline code snippet showing how to verify signatures in Python and TypeScript

Create `recoder-agents/src/components/developers/webhook-verification-guide.tsx`:
Expandable guide showing:
```python
# Python verification
import hmac, hashlib
def verify(payload, signature, secret, timestamp):
    expected = hmac.new(secret.encode(), f"{timestamp}.{payload}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```
```typescript
// TypeScript verification
import { createHmac, timingSafeEqual } from 'crypto';
function verify(payload: string, signature: string, secret: string, timestamp: string): boolean {
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

---

## Phase 5: Bulk Thread Operations (Tasks 16-19)

### Task 16: Bulk Thread Operations Backend

Create `backend/core/threads/thread_bulk_api.py`:

Router with tag `"thread-bulk"`:
- `POST /threads/bulk-delete` — delete multiple threads. Body: `{ thread_ids[] }`. Auth required.
- `POST /threads/bulk-archive` — archive threads (set archived flag). Body: `{ thread_ids[] }`. Auth required.
- `POST /threads/bulk-unarchive` — unarchive threads. Body: `{ thread_ids[] }`. Auth required.
- `GET /threads/archived` — list archived threads. Auth required.

Create `backend/supabase/migrations/20260310300003_thread_archive.sql`:
```sql
CREATE TABLE IF NOT EXISTS thread_archive_status (
  thread_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  archived_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_thread_archive_user ON thread_archive_status(user_id);

ALTER TABLE thread_archive_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own archives" ON thread_archive_status FOR ALL USING (user_id = auth.uid());
```

Register in `backend/api.py`.

### Task 17: Bulk Thread Frontend

Create `recoder-agents/src/lib/api/thread-bulk.ts` and `recoder-agents/src/hooks/threads/use-thread-bulk.ts`.

Hooks: `useBulkDeleteThreads()`, `useBulkArchiveThreads()`, `useBulkUnarchiveThreads()`, `useArchivedThreads()`.

### Task 18: Thread Selection & Bulk Actions UI

Modify `recoder-agents/src/components/sidebar/sidebar-thread-list.tsx`:

Add multi-select mode:
- "Select" toggle button in thread list header
- When active: checkboxes appear on each thread item
- "Select All" / "Deselect All" buttons
- Floating action bar at bottom: "Delete Selected" (red), "Archive Selected", "Tag Selected"
- Delete confirmation dialog with count
- Archive moves threads to archived section

### Task 19: Archived Threads Section

Create `recoder-agents/src/components/sidebar/archived-threads.tsx`:

Archived threads view:
- "Archived" collapsible section at bottom of thread list (or accessible via filter toggle)
- Archived thread items shown with muted styling
- Actions: Unarchive, Delete permanently
- Bulk unarchive button
- Empty state: "No archived threads"

Wire into sidebar-thread-list as a togglable section.

### Task 20: Update Status Docs

Update `tasks/todo.md` with Sprint 44 completion status.

---
