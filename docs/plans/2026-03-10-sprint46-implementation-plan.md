# Sprint 46: Agent Versioning, Global Activity Timeline, Custom Dashboard Charts, Thread Folders & Developer API Keys Management

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add agent configuration versioning with rollback, global activity timeline across all resources, custom dashboard chart builder, thread folder organization, and enhanced developer API key management — completing the operational visibility, organization, and developer tooling features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Supabase with RLS. Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Configuration Versioning (Tasks 1-4)

### Task 1: Agent Version Schema

Create `backend/supabase/migrations/20260310500000_agent_versions.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  name TEXT,
  description TEXT,
  config_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, version_number)
);

CREATE INDEX idx_agent_versions_agent ON agent_config_versions(agent_id, version_number DESC);
CREATE INDEX idx_agent_versions_user ON agent_config_versions(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Agent Version API

Create `backend/core/agents/agent_versioning_api.py`:

Router with tag `"agent-versioning"`:
- `POST /agents/{agent_id}/versions` — snapshot current config as new version. Body: `{ name?, description? }`. Auto-increments version_number. Captures full config (instructions, model, tools, settings). Auth required.
- `GET /agents/{agent_id}/versions` — list all versions. Returns version_number, name, description, created_at. Auth required.
- `GET /agents/{agent_id}/versions/{version_number}` — get version detail with full config snapshot. Auth required.
- `POST /agents/{agent_id}/versions/{version_number}/restore` — restore agent to this version's config. Overwrites current agent config. Auth required.
- `GET /agents/{agent_id}/versions/diff` — compare two versions. Query: `from_version`, `to_version`. Returns field-by-field diff. Auth required.
- `DELETE /agents/{agent_id}/versions/{version_number}` — delete a version. Auth required.

Register in `backend/api.py`.

### Task 3: Agent Version Frontend

Create `recoder-agents/src/lib/api/agent-versions.ts` and `recoder-agents/src/hooks/agents/use-agent-versions.ts`.

Hooks: `useAgentVersions(agentId)`, `useAgentVersion(agentId, versionNumber)`, `useCreateVersion()`, `useRestoreVersion()`, `useVersionDiff(agentId, from, to)`, `useDeleteVersion()`.

### Task 4: Agent Version UI

Enhance `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/versions-screen.tsx`:

Replace or enhance existing versions screen:
- Version timeline: vertical list with version number badge, name, description, created_at, restore button
- "Save Version" button at top: dialog with optional name + description
- "Compare" mode: select two versions, show side-by-side diff (instructions diff, tool changes, model changes)
- "Restore" button per version with confirmation dialog
- Delete version (trash icon) with confirmation
- Auto-version indicator: suggest saving a version when config changes are detected

---

## Phase 2: Global Activity Timeline (Tasks 5-8)

### Task 5: Unified Activity View Backend

Create `backend/core/activity/unified_activity_api.py` + `__init__.py`:

Router with tag `"unified-activity"`:
- `GET /activity/timeline` — unified timeline across all resource types (agents, threads, pipelines, teams, webhooks, etc.). Aggregates from `agent_activity`, `audit_logs`, `schedule_executions`. Query: `from_date`, `to_date`, `resource_type`, `limit` (default 50), `offset`. Auth required.
- `GET /activity/stats` — activity stats: events per day (last 30d), breakdown by resource type, most active hour, peak day. Auth required.
- `GET /activity/heatmap` — hourly activity counts for last 7 days (for heatmap visualization). Auth required.

Register in `backend/api.py`.

### Task 6: Unified Activity Frontend

Create `recoder-agents/src/lib/api/unified-activity.ts` and `recoder-agents/src/hooks/platform/use-unified-activity.ts`.

Hooks: `useActivityTimeline(filters)`, `useActivityStats()`, `useActivityHeatmap()`.

### Task 7: Activity Timeline Page

Create `recoder-agents/src/app/(dashboard)/activity/page.tsx`:

Unified activity timeline page:
- Summary cards: Events Today, Events This Week, Most Active Resource, Peak Hour
- Activity heatmap: 7-day x 24-hour grid (green intensity), similar to GitHub contribution graph
- Timeline feed: chronological list with resource type icon, action description, relative time, linked resource
- Filter bar: resource type dropdown (All/Agents/Threads/Pipelines/Teams), date range
- Daily activity line chart (Recharts)
- Pagination (load more)

### Task 8: Activity Dashboard Widget

Create `recoder-agents/src/components/dashboard/activity-heatmap-widget.tsx`:

Compact heatmap widget for dashboard:
- 7-day heatmap (last week) showing activity intensity
- Total events count
- "View Timeline" link

Register in widget store + registry as `activity-heatmap` widget type.

---

## Phase 3: Custom Dashboard Chart Builder (Tasks 9-12)

### Task 9: Custom Chart Schema

Create `backend/supabase/migrations/20260310500001_custom_charts.sql`:

```sql
CREATE TABLE IF NOT EXISTS custom_dashboard_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  chart_type TEXT NOT NULL CHECK (chart_type IN ('line', 'bar', 'area', 'pie', 'number')),
  data_source TEXT NOT NULL CHECK (data_source IN ('agent_runs', 'costs', 'tokens', 'errors', 'api_usage', 'thread_count')),
  agent_id TEXT,
  time_range TEXT DEFAULT '30d' CHECK (time_range IN ('7d', '14d', '30d', '90d')),
  display_order INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_custom_charts_user ON custom_dashboard_charts(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Custom Chart API

Create `backend/core/dashboard/custom_charts_api.py` + `__init__.py`:

Router with tag `"custom-charts"`:
- `POST /dashboard/charts` — create chart. Body: `{ title, chart_type, data_source, agent_id?, time_range? }`. Auth required.
- `GET /dashboard/charts` — list user's charts. Auth required.
- `PATCH /dashboard/charts/{chart_id}` — update chart config. Auth required.
- `DELETE /dashboard/charts/{chart_id}` — delete chart. Auth required.
- `GET /dashboard/charts/{chart_id}/data` — fetch chart data based on config. Returns time-series data points. Auth required.

Data sources query from existing tables:
- `agent_runs` → count from `agent_analytics_daily`
- `costs` → sum from `agent_analytics_daily.total_cost`
- `tokens` → sum from `agent_analytics_daily.total_tokens_in + total_tokens_out`
- `errors` → count from `agent_analytics_daily.error_count`
- `api_usage` → count from `api_key_daily_stats.request_count`
- `thread_count` → count from threads table

Register in `backend/api.py`.

### Task 11: Custom Chart Frontend

Create `recoder-agents/src/lib/api/custom-charts.ts` and `recoder-agents/src/hooks/dashboard/use-custom-charts.ts`.

Hooks: `useCustomCharts()`, `useCreateChart()`, `useUpdateChart()`, `useDeleteChart()`, `useChartData(chartId)`.

### Task 12: Chart Builder UI

Create `recoder-agents/src/components/dashboard/chart-builder-dialog.tsx`:

Chart builder dialog:
- Title input
- Chart type selector: Line, Bar, Area, Pie, Number (icons for each)
- Data source selector: Agent Runs, Costs, Token Usage, Errors, API Usage, Thread Count
- Optional agent filter (only count data for specific agent)
- Time range: 7d, 14d, 30d, 90d
- Live preview of chart with sample data

Create `recoder-agents/src/components/dashboard/custom-chart-card.tsx`:

Renders a single custom chart:
- Title header with edit/delete actions
- Recharts visualization based on chart_type (LineChart, BarChart, AreaChart, PieChart, or single number display)
- Loading skeleton while data fetches

Add "Add Chart" button to dashboard customizer that opens chart builder.
Render custom charts in dashboard-content below widget section.

---

## Phase 4: Thread Folders (Tasks 13-16)

### Task 13: Thread Folder Schema

Create `backend/supabase/migrations/20260310500002_thread_folders.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6b7280',
  icon TEXT DEFAULT 'folder',
  parent_id UUID REFERENCES thread_folders(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name, parent_id)
);

CREATE TABLE IF NOT EXISTS thread_folder_assignments (
  thread_id TEXT NOT NULL,
  folder_id UUID NOT NULL REFERENCES thread_folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (thread_id, folder_id)
);

CREATE INDEX idx_thread_folders_user ON thread_folders(user_id);
CREATE INDEX idx_thread_folder_assigns_folder ON thread_folder_assignments(folder_id);
CREATE INDEX idx_thread_folder_assigns_user ON thread_folder_assignments(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Thread Folder API

Create `backend/core/threads/thread_folders_api.py`:

Router with tag `"thread-folders"`:
- `POST /thread-folders` — create folder. Body: `{ name, color?, icon?, parent_id? }`. Auth required.
- `GET /thread-folders` — list user's folders with thread counts. Auth required.
- `PATCH /thread-folders/{folder_id}` — update (name, color, icon, parent_id, display_order). Auth required.
- `DELETE /thread-folders/{folder_id}` — delete folder (cascade assignments). Auth required.
- `POST /threads/{thread_id}/folder` — assign thread to folder. Body: `{ folder_id }`. Auth required.
- `DELETE /threads/{thread_id}/folder/{folder_id}` — remove thread from folder. Auth required.
- `GET /thread-folders/{folder_id}/threads` — list threads in folder. Auth required.

Register in `backend/api.py`.

### Task 15: Thread Folder Frontend

Create `recoder-agents/src/lib/api/thread-folders.ts` and `recoder-agents/src/hooks/threads/use-thread-folders.ts`.

Hooks: `useThreadFolders()`, `useCreateFolder()`, `useUpdateFolder()`, `useDeleteFolder()`, `useAssignThreadToFolder()`, `useRemoveThreadFromFolder()`, `useFolderThreads(folderId)`.

### Task 16: Thread Folder UI

Create `recoder-agents/src/components/sidebar/thread-folder-list.tsx`:

Folder section in sidebar thread list:
- Folder list above thread list: colored folder icons, name, thread count badge
- Click folder to filter threads to that folder
- Right-click context menu: Rename, Change color, Delete
- "New Folder" button (plus icon)
- Drag threads into folders (or use context menu "Move to folder" with folder picker)
- "All Threads" option to show unfiltered

Wire into sidebar-thread-list above the thread items.

---

## Phase 5: Enhanced Developer API Key Management (Tasks 17-20)

### Task 17: API Key Enhancement Schema

Create `backend/supabase/migrations/20260310500003_api_key_enhancements.sql`:

```sql
CREATE TABLE IF NOT EXISTS api_key_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  allowed_endpoints TEXT[] DEFAULT '{}',
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_day INTEGER DEFAULT 10000,
  ip_whitelist TEXT[] DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (key_id)
);

CREATE INDEX idx_api_key_perms_key ON api_key_permissions(key_id);
CREATE INDEX idx_api_key_perms_user ON api_key_permissions(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: API Key Permission API

Create `backend/core/developers/api_key_permissions_api.py`:

Router with tag `"api-key-permissions"`:
- `GET /api-keys/{key_id}/permissions` — get permissions for key. Auth required.
- `PUT /api-keys/{key_id}/permissions` — set permissions. Body: `{ allowed_endpoints[], rate_limit_per_minute?, rate_limit_per_day?, ip_whitelist[], expires_at? }`. Upsert. Auth required.
- `DELETE /api-keys/{key_id}/permissions` — remove custom permissions (use defaults). Auth required.
- `POST /api-keys/{key_id}/test` — test API key by making a sample request. Returns key status, permissions, rate limit remaining. Auth required.

Register in `backend/api.py`.

### Task 19: API Key Permission Frontend

Create `recoder-agents/src/lib/api/api-key-permissions.ts` and `recoder-agents/src/hooks/developers/use-api-key-permissions.ts`.

Hooks: `useApiKeyPermissions(keyId)`, `useUpdateApiKeyPermissions()`, `useDeleteApiKeyPermissions()`, `useTestApiKey()`.

### Task 20: API Key Management UI

Create `recoder-agents/src/app/(dashboard)/developers/keys/page.tsx`:

Enhanced API key management page:
- Key list: name, masked key, created date, expires badge, status, usage count
- Click key to expand: permissions panel
- Permissions panel: endpoint access checkboxes (grouped by category), rate limits (per-minute + per-day sliders), IP whitelist (tag input), expiration date picker
- "Test Key" button: shows key status, permissions, remaining rate limit
- "Regenerate" button with confirmation
- Key creation dialog: name, optional expiration, initial permissions

Add "API Keys" tab in developers layout.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 46 completion status.

---
