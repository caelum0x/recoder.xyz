# Sprint 56: Agent Run Logs Viewer, Thread Export System, API Playground Enhancements, Agent Tags & Labels, Run Retry & Recovery

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured agent run log viewing with filtering and search, multi-format thread export system, enhanced API playground with request history, flexible agent tagging and labeling system, and automatic run retry with recovery strategies — completing the debugging, data portability, developer tooling, organization, and reliability features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Run Logs Viewer (Tasks 1-4)

### Task 1: Run Logs Schema

Create `backend/supabase/migrations/20260311500000_agent_run_logs.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_run_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  log_level TEXT DEFAULT 'info' CHECK (log_level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  message TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  step_index INTEGER,
  tool_name TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_run_logs_run ON agent_run_logs(run_id, created_at);
CREATE INDEX idx_run_logs_user ON agent_run_logs(user_id, created_at DESC);
CREATE INDEX idx_run_logs_agent ON agent_run_logs(agent_id, created_at DESC);
CREATE INDEX idx_run_logs_level ON agent_run_logs(log_level) WHERE log_level IN ('error', 'fatal');

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Run Logs API

Create `backend/core/agents/agent_run_logs_api.py`:

Router with tag `"agent-run-logs"`:
- `GET /runs/{run_id}/logs` — get logs for a run. Query: `log_level`, `search`, `limit` (default 100), `offset`. Auth required.
- `POST /runs/{run_id}/logs` — write log entry (called by runtime). Body: `{ log_level?, message, context?, step_index?, tool_name?, duration_ms? }`. Auth required.
- `GET /runs/{run_id}/logs/summary` — log summary: count by level, most common errors, total duration. Auth required.
- `GET /logs/search` — search across all logs. Query: `search`, `agent_id`, `log_level`, `days` (default 7), `limit`. Auth required.
- `GET /logs/error-frequency` — error frequency: top error messages grouped with counts. Query: `agent_id`, `days`. Auth required.

Register in `backend/api.py`.

### Task 3: Run Logs Frontend

Create `recoder-agents/src/lib/api/agent-run-logs.ts` and `recoder-agents/src/hooks/agents/use-agent-run-logs.ts`.

Hooks: `useRunLogs(runId, filters)`, `useRunLogSummary(runId)`, `useSearchLogs(params)`, `useErrorFrequency(agentId?, days?)`.

### Task 4: Run Logs UI

Create `recoder-agents/src/app/(dashboard)/agents/runs/[runId]/logs/page.tsx`:

Run logs viewer page:
- Log summary bar: count badges by level (debug=gray, info=blue, warn=amber, error=red, fatal=purple), total duration
- Filter bar: log level multi-select, search input, tool name filter
- Log entries list (monospace font, terminal-style):
  - Timestamp (HH:mm:ss.SSS), level badge (colored), message, tool name tag, duration
  - Click to expand: full context JSON viewer
  - Error/fatal rows highlighted with red/purple left border
- Auto-scroll toggle (follows new logs)
- "Search All Logs" tab: cross-run log search with results grouped by run
- Error frequency panel: top 10 error messages with count bars

Wire into runs detail page as "Logs" tab.

---

## Phase 2: Thread Export System (Tasks 5-8)

### Task 5: Thread Export Schema

Create `backend/supabase/migrations/20260311500001_thread_exports.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  export_format TEXT NOT NULL CHECK (export_format IN ('json', 'markdown', 'csv', 'pdf', 'html')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_url TEXT,
  file_size_bytes INTEGER,
  options JSONB DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_thread_exports_user ON thread_exports(user_id, created_at DESC);
CREATE INDEX idx_thread_exports_thread ON thread_exports(thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Export API

Create `backend/core/threads/thread_export_api.py`:

Router with tag `"thread-export"`:
- `POST /threads/{thread_id}/export` — start export. Body: `{ export_format, options? }`. Options: include_tool_calls (bool), include_metadata (bool), include_timestamps (bool). Creates export record, generates content based on format, stores as JSONB in file_url field (simplified — no actual file storage). Auth required.
- `GET /threads/{thread_id}/exports` — list exports for thread. Auth required.
- `GET /exports/{export_id}` — get export detail with data. Auth required.
- `DELETE /exports/{export_id}` — delete export. Auth required.
- `GET /exports/recent` — recent exports across all threads. Query: `limit`. Auth required.

Register in `backend/api.py`.

### Task 7: Thread Export Frontend

Create `recoder-agents/src/lib/api/thread-export.ts` and `recoder-agents/src/hooks/threads/use-thread-export.ts`.

Hooks: `useExportThread()`, `useThreadExports(threadId)`, `useExportDetail(exportId)`, `useDeleteExport()`, `useRecentExports()`.

### Task 8: Thread Export UI

Create `recoder-agents/src/components/thread/thread-export-dialog.tsx`:

Export dialog (triggered from thread header):
- Format selector: JSON, Markdown, CSV, HTML (radio buttons with icons)
- Options checkboxes: Include tool calls, Include metadata, Include timestamps
- "Export" button → shows progress → success with download/copy button
- Format previews: brief description of what each format looks like

Create `recoder-agents/src/app/(dashboard)/exports/page.tsx`:

Exports history page:
- Recent exports list: thread name, format badge, status, file size, date, download/delete
- Filter by format
- Empty state

Wire export button into thread header.

---

## Phase 3: API Playground Enhancements (Tasks 9-12)

### Task 9: Playground History Schema

Create `backend/supabase/migrations/20260311500002_api_playground.sql`:

```sql
CREATE TABLE IF NOT EXISTS api_playground_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  headers JSONB DEFAULT '{}',
  body JSONB,
  response_status INTEGER,
  response_body JSONB,
  response_time_ms INTEGER,
  is_saved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_playground_history_user ON api_playground_history(user_id, created_at DESC);
CREATE INDEX idx_playground_saved ON api_playground_history(user_id, is_saved) WHERE is_saved = true;

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Playground API

Create `backend/core/developers/api_playground_api.py`:

Router with tag `"api-playground"`:
- `POST /playground/execute` — execute API request. Body: `{ method, endpoint, headers?, body? }`. Proxies to internal API, records result. Auth required.
- `GET /playground/history` — list request history. Query: `saved_only`, `limit`, `offset`. Auth required.
- `PATCH /playground/history/{entry_id}` — save/name entry. Body: `{ name?, is_saved? }`. Auth required.
- `DELETE /playground/history/{entry_id}` — delete entry. Auth required.
- `GET /playground/endpoints` — list available API endpoints with method, path, description. Auth required.

Register in `backend/api.py`.

### Task 11: Playground Frontend

Create `recoder-agents/src/lib/api/api-playground.ts` and `recoder-agents/src/hooks/developers/use-api-playground.ts`.

Hooks: `useExecuteRequest()`, `usePlaygroundHistory(savedOnly?)`, `useSavePlaygroundEntry()`, `useDeletePlaygroundEntry()`, `useAvailableEndpoints()`.

### Task 12: Playground UI

Create `recoder-agents/src/app/(dashboard)/developers/playground/page.tsx`:

API playground page:
- Request builder: method selector (GET/POST/PATCH/PUT/DELETE), endpoint input with autocomplete from available endpoints, headers key-value editor, body JSON textarea
- "Send" button with loading state
- Response panel: status code badge (green 2xx, red 4xx/5xx), response time, formatted JSON body, headers
- History sidebar (collapsible): recent requests, saved requests (starred), click to reload
- "Save" button to name and star a request
- Endpoint reference: searchable list of available endpoints

Wire into developers section.

---

## Phase 4: Agent Tags & Labels (Tasks 13-16)

### Task 13: Tags Schema

Create `backend/supabase/migrations/20260311500003_agent_tags.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS agent_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  tag_id UUID NOT NULL REFERENCES agent_tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, tag_id)
);

CREATE INDEX idx_agent_tags_user ON agent_tags(user_id);
CREATE INDEX idx_tag_assignments_agent ON agent_tag_assignments(agent_id);
CREATE INDEX idx_tag_assignments_tag ON agent_tag_assignments(tag_id);
CREATE INDEX idx_tag_assignments_user ON agent_tag_assignments(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Tags API

Create `backend/core/agents/agent_tags_api.py`:

Router with tag `"agent-tags"`:
- `POST /tags` — create tag. Body: `{ name, color?, description? }`. Auth required.
- `GET /tags` — list tags with agent count per tag. Auth required.
- `PATCH /tags/{tag_id}` — update tag. Auth required.
- `DELETE /tags/{tag_id}` — delete tag (cascades assignments). Auth required.
- `POST /agents/{agent_id}/tags` — assign tag. Body: `{ tag_id }`. Auth required.
- `DELETE /agents/{agent_id}/tags/{tag_id}` — remove tag from agent. Auth required.
- `GET /agents/{agent_id}/tags` — list tags for agent. Auth required.
- `GET /tags/{tag_id}/agents` — list agents with this tag. Auth required.

Register in `backend/api.py`.

### Task 15: Tags Frontend

Create `recoder-agents/src/lib/api/agent-tags.ts` and `recoder-agents/src/hooks/agents/use-agent-tags.ts`.

Hooks: `useTags()`, `useCreateTag()`, `useUpdateTag()`, `useDeleteTag()`, `useAgentTags(agentId)`, `useAssignTag()`, `useRemoveTag()`, `useTagAgents(tagId)`.

### Task 16: Tags UI

Create `recoder-agents/src/components/agents/tag-manager.tsx`:

Tag manager component:
- Tag pills display: colored badges with tag name, X to remove
- "Add Tag" button: dropdown of existing tags + inline create new tag option
- New tag form: name input, 8 color presets
- Used in agent config header and agent cards

Create `recoder-agents/src/app/(dashboard)/agents/tags/page.tsx`:

Tags management page:
- Tag list: name, color dot, description, agent count, edit/delete
- "New Tag" dialog: name, color picker, description
- Click tag → shows agents with that tag
- Filter agents by tag (useful for agents page integration)

Wire tag pills into agent grid cards and agent config page.

---

## Phase 5: Run Retry & Recovery (Tasks 17-20)

### Task 17: Retry Schema

Create `backend/supabase/migrations/20260311500004_run_retry.sql`:

```sql
CREATE TABLE IF NOT EXISTS run_retry_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  name TEXT NOT NULL,
  max_retries INTEGER DEFAULT 3,
  retry_delay_seconds INTEGER DEFAULT 30,
  backoff_multiplier NUMERIC(3,1) DEFAULT 2.0,
  retry_on_errors TEXT[] DEFAULT '{timeout,rate_limit,server_error}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE TABLE IF NOT EXISTS run_retry_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  original_run_id TEXT NOT NULL,
  retry_run_id TEXT,
  agent_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  error_type TEXT,
  error_message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'succeeded', 'failed', 'exhausted')),
  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_retry_policies_user ON run_retry_policies(user_id);
CREATE INDEX idx_retry_policies_agent ON run_retry_policies(agent_id);
CREATE INDEX idx_retry_attempts_run ON run_retry_attempts(original_run_id);
CREATE INDEX idx_retry_attempts_user ON run_retry_attempts(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Retry API

Create `backend/core/agents/agent_retry_api.py`:

Router with tag `"agent-retry"`:
- `POST /retry/policies` — create/update retry policy. Body: `{ agent_id?, name, max_retries?, retry_delay_seconds?, backoff_multiplier?, retry_on_errors? }`. Upsert on (user_id, agent_id). Auth required.
- `GET /retry/policies` — list policies. Auth required.
- `DELETE /retry/policies/{policy_id}` — delete policy. Auth required.
- `POST /runs/{run_id}/retry` — manually retry a failed run. Body: `{ override_input? }`. Creates retry attempt. Auth required.
- `GET /runs/{run_id}/retry-attempts` — list retry attempts for a run. Auth required.
- `GET /retry/stats` — retry stats: total retries, success rate, most retried agents, avg attempts to success. Auth required.

Register in `backend/api.py`.

### Task 19: Retry Frontend

Create `recoder-agents/src/lib/api/agent-retry.ts` and `recoder-agents/src/hooks/agents/use-agent-retry.ts`.

Hooks: `useRetryPolicies()`, `useCreateRetryPolicy()`, `useDeleteRetryPolicy()`, `useRetryRun()`, `useRetryAttempts(runId)`, `useRetryStats()`.

### Task 20: Retry UI

Create `recoder-agents/src/components/agents/retry-policy-manager.tsx`:

Retry policy manager:
- Policy list: agent scope (specific or global), max retries, delay, backoff, error types, active toggle
- "New Policy" dialog: agent selector (optional = global), name, max retries slider (1-10), delay seconds, backoff multiplier, error type checkboxes (timeout, rate_limit, server_error, invalid_response, tool_failure)
- Retry stats cards: total retries, success rate %, most retried agent, avg attempts

Create `recoder-agents/src/components/agents/run-retry-button.tsx`:

Retry button for failed runs:
- "Retry" button shown on failed run entries
- Click opens dialog: shows error info, optional input override, confirm retry
- Retry attempt history below: attempt #, status badge, scheduled/executed times

Wire retry policy manager into agent config or settings. Wire retry button into run detail views.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 56 completion status.

---
