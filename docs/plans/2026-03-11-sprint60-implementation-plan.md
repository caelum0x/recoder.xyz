# Sprint 60: Agent Versioned Configs, Thread Search & Filters, Audit Log Viewer, Agent Performance Benchmarks & Custom Dashboard Layouts

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add versioned agent configuration snapshots with diff comparison, advanced full-text thread search with filter operators, comprehensive audit log viewer with export capability, agent performance benchmark suite with historical tracking, and drag-and-drop custom dashboard layouts — completing the configuration management, discoverability, compliance, performance testing, and personalization features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Versioned Configs (Tasks 1-4)

### Task 1: Versioned Configs Schema

Create `backend/supabase/migrations/20260311900000_agent_versioned_configs.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_config_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  label TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  change_summary TEXT,
  is_active BOOLEAN DEFAULT false,
  created_by TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, version_number)
);

CREATE TABLE IF NOT EXISTS config_diff_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_a_id UUID NOT NULL REFERENCES agent_config_snapshots(id) ON DELETE CASCADE,
  snapshot_b_id UUID NOT NULL REFERENCES agent_config_snapshots(id) ON DELETE CASCADE,
  diff JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (snapshot_a_id, snapshot_b_id)
);

CREATE INDEX idx_config_snapshots_agent ON agent_config_snapshots(agent_id, version_number DESC);
CREATE INDEX idx_config_snapshots_user ON agent_config_snapshots(user_id, created_at DESC);
CREATE INDEX idx_config_snapshots_active ON agent_config_snapshots(agent_id, is_active) WHERE is_active = true;

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Versioned Configs API

Create `backend/core/agents/agent_versioned_configs_api.py`:

Router with tag `"agent-versioned-configs"`:
- `POST /agents/{agent_id}/config-snapshots` — create snapshot. Body: `{ label?, config, change_summary? }`. Auto-increments version_number. Auth required.
- `GET /agents/{agent_id}/config-snapshots` — list snapshots. Query: `limit`. Auth required.
- `GET /agents/{agent_id}/config-snapshots/{snapshot_id}` — get snapshot detail. Auth required.
- `POST /agents/{agent_id}/config-snapshots/{snapshot_id}/activate` — set as active config. Deactivates others. Auth required.
- `POST /agents/{agent_id}/config-snapshots/diff` — compare two snapshots. Body: `{ snapshot_a_id, snapshot_b_id }`. Returns key-by-key diff. Caches result. Auth required.
- `POST /agents/{agent_id}/config-snapshots/{snapshot_id}/rollback` — rollback to snapshot: creates new snapshot from old config, sets as active. Auth required.

Register in `backend/api.py`.

### Task 3: Versioned Configs Frontend

Create `recoder-agents/src/lib/api/agent-versioned-configs.ts` and `recoder-agents/src/hooks/agents/use-agent-versioned-configs.ts`.

Hooks: `useConfigSnapshots(agentId)`, `useCreateConfigSnapshot()`, `useConfigSnapshotDetail(snapshotId)`, `useActivateSnapshot()`, `useDiffSnapshots()`, `useRollbackSnapshot()`.

### Task 4: Versioned Configs UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/config-versions-screen.tsx`:

Config versions screen:
- Version timeline: vertical list of snapshots with version number, label, change summary, date, active badge, created_by
- "Save Snapshot" button: captures current config with optional label and change summary
- "Compare" mode: select two versions, show diff (added=green, removed=red, changed=amber keys)
- "Activate" button per version with confirmation
- "Rollback" button with confirmation (creates new version from old)
- Active version highlighted with star icon
- Diff viewer: side-by-side JSON comparison with highlighted changes

Wire into agent config as "Versions" tab with History icon.

---

## Phase 2: Thread Search & Filters (Tasks 5-8)

### Task 5: Thread Search Schema

Create `backend/supabase/migrations/20260311900001_thread_search.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  agent_id TEXT,
  content_preview TEXT,
  message_count INTEGER DEFAULT 0,
  has_tool_calls BOOLEAN DEFAULT false,
  has_errors BOOLEAN DEFAULT false,
  last_message_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  indexed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  query TEXT NOT NULL,
  filters JSONB DEFAULT '{}',
  result_count INTEGER DEFAULT 0,
  searched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_thread_search_user ON thread_search_index(user_id, last_message_at DESC);
CREATE INDEX idx_thread_search_agent ON thread_search_index(agent_id);
CREATE INDEX idx_thread_search_tags ON thread_search_index USING GIN (tags);
CREATE INDEX idx_search_history_user ON search_history(user_id, searched_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Thread Search API

Create `backend/core/threads/thread_search_api.py`:

Router with tag `"thread-search"`:
- `POST /threads/search` — search threads. Body: `{ query?, agent_id?, has_tool_calls?, has_errors?, tags?, date_from?, date_to?, sort_by?, limit?, offset? }`. Searches content_preview with ILIKE. Records search history. Auth required.
- `POST /threads/{thread_id}/index` — index/reindex a thread. Builds search index entry from thread data. Auth required.
- `GET /threads/search/history` — recent searches. Query: `limit`. Auth required.
- `GET /threads/search/suggestions` — search suggestions based on recent queries and popular filters. Auth required.
- `DELETE /threads/search/history` — clear search history. Auth required.

Register in `backend/api.py`.

### Task 7: Thread Search Frontend

Create `recoder-agents/src/lib/api/thread-search.ts` and `recoder-agents/src/hooks/threads/use-thread-search.ts`.

Hooks: `useSearchThreads()`, `useIndexThread()`, `useSearchHistory()`, `useSearchSuggestions()`, `useClearSearchHistory()`.

### Task 8: Thread Search UI

Create `recoder-agents/src/components/thread/thread-search-panel.tsx`:

Thread search panel:
- Search input with search icon, debounced (300ms)
- Filter bar: agent selector, has tool calls toggle, has errors toggle, date range picker, tags input
- Sort options: recent first, oldest first, most messages
- Results list: thread preview card with content snippet (highlighted match), agent name, message count, date, tags
- Search history dropdown: recent searches, click to re-run
- Search suggestions: popular filters, recent queries
- "Clear History" button
- Empty state and no results state

Wire into sidebar or threads section as a search feature.

---

## Phase 3: Audit Log Viewer (Tasks 9-12)

### Task 9: Audit Log Schema

Create `backend/supabase/migrations/20260311900002_audit_log.sql`:

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('agent', 'thread', 'webhook', 'api_key', 'team', 'billing', 'settings', 'deployment', 'integration')),
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at DESC);
CREATE INDEX idx_audit_log_date ON audit_log(created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Audit Log API

Create `backend/core/monitoring/audit_log_api.py`:

Router with tag `"audit-log"`:
- `GET /audit/logs` — list audit logs. Query: `resource_type`, `action`, `resource_id`, `date_from`, `date_to`, `limit` (default 50), `offset`. Auth required.
- `POST /audit/logs` — record audit event (internal). Body: `{ action, resource_type, resource_id?, details?, ip_address?, user_agent? }`. Auth required.
- `GET /audit/logs/summary` — summary: events per resource type, most active hours, top actions. Query: `days` (default 7). Auth required.
- `GET /audit/logs/export` — export logs as JSON. Query: same filters as list. Auth required.
- `GET /audit/logs/timeline` — events per day for charting. Query: `days` (default 30). Auth required.

Register in `backend/api.py`.

### Task 11: Audit Log Frontend

Create `recoder-agents/src/lib/api/audit-log.ts` and `recoder-agents/src/hooks/monitoring/use-audit-log.ts`.

Hooks: `useAuditLogs(filters)`, `useAuditSummary(days?)`, `useExportAuditLogs(filters)`, `useAuditTimeline(days?)`.

### Task 12: Audit Log UI

Create `recoder-agents/src/app/(dashboard)/monitoring/audit/page.tsx`:

Audit log viewer:
- Summary cards: Total Events (7d), Most Active Resource, Top Action, Peak Hour
- Timeline chart: events per day bar chart (Recharts)
- Filter bar: resource type selector, action search, date range, resource ID search
- Log table: timestamp, action, resource type badge (colored), resource ID, details preview, IP
- Click to expand: full details JSON viewer
- "Export" button: downloads filtered logs as JSON
- Pagination with offset

Wire into monitoring section.

---

## Phase 4: Agent Performance Benchmarks (Tasks 13-16)

### Task 13: Benchmarks Schema

Create `backend/supabase/migrations/20260311900003_agent_benchmarks.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  benchmark_name TEXT NOT NULL,
  benchmark_type TEXT DEFAULT 'latency' CHECK (benchmark_type IN ('latency', 'throughput', 'accuracy', 'cost', 'custom')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS benchmark_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID NOT NULL REFERENCES agent_benchmarks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  score NUMERIC(12,4) NOT NULL,
  metrics JSONB DEFAULT '{}',
  duration_ms INTEGER,
  status TEXT DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  run_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_benchmarks_agent ON agent_benchmarks(agent_id);
CREATE INDEX idx_benchmarks_user ON agent_benchmarks(user_id);
CREATE INDEX idx_benchmark_results_benchmark ON benchmark_results(benchmark_id, run_at DESC);
CREATE INDEX idx_benchmark_results_agent ON benchmark_results(agent_id, run_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Benchmarks API

Create `backend/core/agents/agent_benchmarks_api.py`:

Router with tag `"agent-benchmarks"`:
- `POST /agents/{agent_id}/benchmarks` — create benchmark. Body: `{ benchmark_name, benchmark_type?, config? }`. Auth required.
- `GET /agents/{agent_id}/benchmarks` — list benchmarks. Auth required.
- `DELETE /agents/{agent_id}/benchmarks/{benchmark_id}` — delete. Auth required.
- `POST /agents/{agent_id}/benchmarks/{benchmark_id}/run` — run benchmark. Simulates execution, records result with score and metrics. Auth required.
- `GET /agents/{agent_id}/benchmarks/{benchmark_id}/results` — list results. Query: `limit`. Auth required.
- `GET /agents/{agent_id}/benchmark-summary` — summary: best/worst/avg scores per benchmark, trend. Auth required.

Register in `backend/api.py`.

### Task 15: Benchmarks Frontend

Create `recoder-agents/src/lib/api/agent-benchmarks.ts` and `recoder-agents/src/hooks/agents/use-agent-benchmarks.ts`.

Hooks: `useAgentBenchmarks(agentId)`, `useCreateBenchmark()`, `useDeleteBenchmark()`, `useRunBenchmark()`, `useBenchmarkResults(benchmarkId)`, `useBenchmarkSummary(agentId)`.

### Task 16: Benchmarks UI

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/benchmarks-screen.tsx`:

Benchmarks screen:
- Benchmark list: name, type badge, last score, best score, run count, last run date, run/delete actions
- "New Benchmark" dialog: name, type selector, config options per type (latency: iterations, throughput: concurrent, accuracy: test cases, cost: budget limit)
- "Run" button with progress indicator
- Results history per benchmark: score trend line chart (Recharts), result table with score, metrics, duration, date
- Summary section: best/worst/avg scores across all benchmarks
- Score comparison across agents (if multiple benchmarks exist)

Wire into agent config as "Benchmarks" tab with Gauge icon.

---

## Phase 5: Custom Dashboard Layouts (Tasks 17-20)

### Task 17: Dashboard Layouts Schema

Create `backend/supabase/migrations/20260311900004_dashboard_layouts.sql`:

```sql
CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  layout JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT false,
  is_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_layout_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id UUID NOT NULL REFERENCES dashboard_layouts(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL CHECK (widget_type IN ('agent_status', 'recent_threads', 'activity_feed', 'health_status', 'quick_actions', 'favorites', 'stats_card', 'chart', 'checklist', 'bookmarks')),
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 1,
  height INTEGER DEFAULT 1,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_layouts_user ON dashboard_layouts(user_id);
CREATE INDEX idx_layouts_active ON dashboard_layouts(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_layout_widgets ON dashboard_layout_widgets(layout_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Dashboard Layouts API

Create `backend/core/preferences/dashboard_layouts_api.py`:

Router with tag `"dashboard-layouts"`:
- `POST /dashboard/layouts` — create layout. Body: `{ name, widgets[]? }`. Auth required.
- `GET /dashboard/layouts` — list layouts. Auth required.
- `GET /dashboard/layouts/{layout_id}` — get layout with widgets. Auth required.
- `PATCH /dashboard/layouts/{layout_id}` — update layout (name, set active). Auth required.
- `DELETE /dashboard/layouts/{layout_id}` — delete. Auth required.
- `PUT /dashboard/layouts/{layout_id}/widgets` — batch set widgets. Body: `{ widgets: [{ widget_type, position_x, position_y, width, height, config? }] }`. Replaces all. Auth required.
- `POST /dashboard/layouts/templates` — list template layouts. Auth required.

Register in `backend/api.py`.

### Task 19: Dashboard Layouts Frontend

Create `recoder-agents/src/lib/api/dashboard-layouts.ts` and `recoder-agents/src/hooks/dashboard/use-dashboard-layouts.ts`.

Hooks: `useDashboardLayouts()`, `useLayoutDetail(layoutId)`, `useCreateLayout()`, `useUpdateLayout()`, `useDeleteLayout()`, `useSetLayoutWidgets()`, `useLayoutTemplates()`.

### Task 20: Dashboard Layouts UI

Create `recoder-agents/src/components/dashboard/customizable-dashboard.tsx`:

Customizable dashboard:
- Grid layout: 12-column CSS grid, widgets occupy configurable cells (position_x, position_y, width, height)
- Edit mode toggle: "Customize" button switches to edit mode
- In edit mode: widgets show drag handles and resize handles, "Add Widget" button with widget type selector
- Widget types render appropriate content: agent status card, recent threads list, activity feed, health status, quick actions, favorites bar, stats card, chart, checklist, bookmarks
- Layout selector: dropdown of saved layouts, active layout highlighted
- "Save Layout" and "New Layout" buttons
- Template gallery: pre-made layouts (Default, Minimal, Developer, Manager)

Create `recoder-agents/src/app/(dashboard)/dashboard/page.tsx` (or update existing):

Dashboard page using customizable layout:
- Loads active layout
- Falls back to default layout if none
- Edit mode for customization
- Layout management panel

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 60 completion status.

---
