# Sprint 52: Agent Export/Import Bundles, Thread Bookmarks & Collections, Custom Dashboard Widgets, Workspace Activity Feed & Agent Collaboration Rooms

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add portable agent export/import bundles with full config serialization, thread bookmarks with user-defined collections, customizable dashboard widget system, workspace-scoped activity feeds, and real-time agent collaboration rooms — completing the portability, organization, personalization, team awareness, and collaborative development features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Export/Import Bundles (Tasks 1-4)

### Task 1: Export Bundle Schema

Create `backend/supabase/migrations/20260311100000_agent_bundles.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  bundle_name TEXT NOT NULL,
  bundle_version TEXT DEFAULT '1.0.0',
  bundle_type TEXT DEFAULT 'full' CHECK (bundle_type IN ('full', 'config_only', 'template')),
  config_data JSONB NOT NULL,
  included_sections TEXT[] DEFAULT '{instructions,tools,model,env_vars,triggers,kb_refs}',
  file_size_bytes INTEGER DEFAULT 0,
  checksum TEXT,
  is_public BOOLEAN DEFAULT false,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bundles_user ON agent_bundles(user_id, created_at DESC);
CREATE INDEX idx_bundles_agent ON agent_bundles(agent_id);
CREATE INDEX idx_bundles_public ON agent_bundles(is_public) WHERE is_public = true;

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Export/Import API

Create `backend/core/agents/agent_bundles_api.py`:

Router with tag `"agent-bundles"`:
- `POST /agents/{agent_id}/export` — export agent as bundle. Body: `{ bundle_name, bundle_type?, included_sections?, is_public? }`. Serializes agent config, tools, env vars (secrets masked), triggers, KB refs into JSONB. Auth required.
- `POST /agents/import` — import agent from bundle. Body: `{ bundle_id?, bundle_data? }`. Creates new agent from bundle config. Auth required.
- `GET /bundles` — list user's bundles. Query: `agent_id`, `bundle_type`, `limit`, `offset`. Auth required.
- `GET /bundles/{bundle_id}` — get bundle detail. Auth required.
- `DELETE /bundles/{bundle_id}` — delete bundle. Auth required.
- `GET /bundles/public` — browse public bundles. Query: `search`, `limit`, `offset`. Auth required.
- `POST /bundles/{bundle_id}/download` — increment download count, return bundle data. Auth required.

Register in `backend/api.py`.

### Task 3: Export/Import Frontend

Create `recoder-agents/src/lib/api/agent-bundles.ts` and `recoder-agents/src/hooks/agents/use-agent-bundles.ts`.

Hooks: `useExportAgent()`, `useImportAgent()`, `useAgentBundles(agentId?)`, `useBundleDetail(bundleId)`, `useDeleteBundle()`, `usePublicBundles(search)`, `useDownloadBundle()`.

### Task 4: Export/Import UI

Create `recoder-agents/src/components/agents/export-import-dialog.tsx`:

Export dialog:
- Bundle name input, version input
- Bundle type selector: Full, Config Only, Template
- Section checkboxes: Instructions, Tools, Model, Env Vars, Triggers, KB References
- Public toggle with explanation text
- Preview: estimated bundle size, sections included
- "Export" button → creates bundle + shows success with copy-link option

Import dialog:
- Two modes: "From My Bundles" (list picker) or "From Bundle ID" (paste ID)
- Bundle preview: name, version, sections, original agent name
- "Import as New Agent" button
- Override options: custom name, skip env vars toggle

Wire into agent config page header as "Export" button (Download icon) and agents page as "Import Agent" button (Upload icon).

---

## Phase 2: Thread Bookmarks & Collections (Tasks 5-8)

### Task 5: Bookmarks Schema

Create `backend/supabase/migrations/20260311100001_thread_bookmarks.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_bookmark_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'bookmark',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS thread_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  collection_id UUID REFERENCES thread_bookmark_collections(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id)
);

CREATE INDEX idx_bookmark_collections_user ON thread_bookmark_collections(user_id, sort_order);
CREATE INDEX idx_bookmarks_user ON thread_bookmarks(user_id, created_at DESC);
CREATE INDEX idx_bookmarks_collection ON thread_bookmarks(collection_id);
CREATE INDEX idx_bookmarks_thread ON thread_bookmarks(thread_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Bookmarks API

Create `backend/core/threads/thread_bookmarks_api.py`:

Router with tag `"thread-bookmarks"`:
- `POST /bookmarks/collections` — create collection. Body: `{ name, description?, color?, icon? }`. Auth required.
- `GET /bookmarks/collections` — list collections with bookmark count. Auth required.
- `PATCH /bookmarks/collections/{collection_id}` — update collection. Auth required.
- `DELETE /bookmarks/collections/{collection_id}` — delete collection (bookmarks become uncollected). Auth required.
- `POST /bookmarks` — bookmark a thread. Body: `{ thread_id, collection_id?, note? }`. Upsert. Auth required.
- `GET /bookmarks` — list bookmarks. Query: `collection_id`, `limit`, `offset`. Auth required.
- `DELETE /bookmarks/{bookmark_id}` — remove bookmark. Auth required.
- `PATCH /bookmarks/{bookmark_id}` — update note or move to different collection. Auth required.

Register in `backend/api.py`.

### Task 7: Bookmarks Frontend

Create `recoder-agents/src/lib/api/thread-bookmarks.ts` and `recoder-agents/src/hooks/threads/use-thread-bookmarks.ts`.

Hooks: `useBookmarkCollections()`, `useCreateCollection()`, `useUpdateCollection()`, `useDeleteCollection()`, `useBookmarks(collectionId?)`, `useToggleBookmark()`, `useUpdateBookmark()`.

### Task 8: Bookmarks UI

Create `recoder-agents/src/components/thread/bookmark-button.tsx`:

Bookmark toggle button for thread header:
- Bookmark icon (filled when bookmarked)
- Dropdown on click: quick add to collection, create new collection, add note
- Shows collection color dot if assigned

Create `recoder-agents/src/app/(dashboard)/bookmarks/page.tsx`:

Bookmarks page:
- Collection sidebar: list of collections with color dots, counts, reorder drag handle
- "All Bookmarks" default view
- Create collection dialog: name, description, color picker (8 presets), icon selector
- Bookmark list: thread title, agent name, collection badge, note preview, date
- Click thread to navigate, click note to edit inline
- Empty state with "Bookmark your first thread" guidance

Wire bookmark button into thread header. Add "Bookmarks" link in sidebar with Bookmark icon.

---

## Phase 3: Custom Dashboard Widgets (Tasks 9-12)

### Task 9: Widget Configuration Schema

Create `backend/supabase/migrations/20260311100002_dashboard_widgets.sql`:

```sql
CREATE TABLE IF NOT EXISTS dashboard_widget_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  widget_type TEXT NOT NULL CHECK (widget_type IN ('stats_card', 'chart', 'recent_threads', 'active_runs', 'agent_health', 'cost_summary', 'quick_actions', 'bookmarks', 'calendar', 'notes')),
  title TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 1,
  height INTEGER DEFAULT 1,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_widget_configs_user ON dashboard_widget_configs(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: Widget API

Create `backend/core/dashboard/widget_config_api.py` + `__init__.py`:

Router with tag `"dashboard-widgets"`:
- `GET /dashboard/widgets` — list user's widget configs. Auth required.
- `POST /dashboard/widgets` — create widget. Body: `{ widget_type, title, config?, position_x?, position_y?, width?, height? }`. Auth required.
- `PATCH /dashboard/widgets/{widget_id}` — update widget (position, size, config, visibility). Auth required.
- `DELETE /dashboard/widgets/{widget_id}` — delete widget. Auth required.
- `POST /dashboard/widgets/reset` — reset to default widget layout. Auth required.
- `PUT /dashboard/widgets/layout` — batch update positions/sizes. Body: `{ widgets: [{ id, position_x, position_y, width, height }] }`. Auth required.

Register in `backend/api.py`.

### Task 11: Widget Frontend

Create `recoder-agents/src/lib/api/dashboard-widgets.ts` and `recoder-agents/src/hooks/dashboard/use-dashboard-widgets.ts`.

Hooks: `useDashboardWidgets()`, `useCreateWidget()`, `useUpdateWidget()`, `useDeleteWidget()`, `useResetWidgets()`, `useBatchUpdateLayout()`.

### Task 12: Widget UI

Create `recoder-agents/src/components/dashboard/widget-grid.tsx`:

Widget grid layout:
- CSS Grid-based layout (no heavy drag library)
- Responsive: 4 columns on desktop, 2 on tablet, 1 on mobile
- Each widget: header (title, drag handle, settings gear, close X), content area
- "Add Widget" button opens widget picker dialog

Create `recoder-agents/src/components/dashboard/widgets/`:
- `stats-card-widget.tsx` — configurable stat (total agents, runs today, cost this month, etc.)
- `chart-widget.tsx` — mini chart (runs over time, cost trend) using Recharts
- `recent-threads-widget.tsx` — last 5 threads with agent name and timestamp
- `active-runs-widget.tsx` — currently running agents with progress
- `quick-actions-widget.tsx` — customizable action buttons (new thread, new agent, etc.)
- `notes-widget.tsx` — simple text area for personal notes (saved to widget config)
- `widget-picker-dialog.tsx` — grid of available widget types with preview + "Add" button

Wire into dashboard page, replacing or augmenting existing dashboard content.

---

## Phase 4: Workspace Activity Feed (Tasks 13-16)

### Task 13: Workspace Activity Schema

Create `backend/supabase/migrations/20260311100003_workspace_activity.sql`:

```sql
CREATE TABLE IF NOT EXISTS workspace_activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id TEXT,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('agent_created', 'agent_updated', 'agent_deleted', 'thread_started', 'thread_completed', 'run_started', 'run_completed', 'run_failed', 'member_joined', 'member_left', 'config_changed', 'deploy_completed')),
  actor_name TEXT,
  target_type TEXT,
  target_id TEXT,
  target_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_workspace_activity_user ON workspace_activity_feed(user_id, created_at DESC);
CREATE INDEX idx_workspace_activity_workspace ON workspace_activity_feed(workspace_id, created_at DESC);
CREATE INDEX idx_workspace_activity_type ON workspace_activity_feed(activity_type);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Workspace Activity API

Create `backend/core/workspaces/workspace_activity_api.py` + `__init__.py`:

Router with tag `"workspace-activity"`:
- `GET /workspaces/activity` — list activity feed. Query: `workspace_id`, `activity_type`, `limit` (default 50), `offset`. Auth required.
- `POST /workspaces/activity` — record activity (called internally). Body: `{ workspace_id?, activity_type, actor_name?, target_type?, target_id?, target_name?, metadata? }`. Auth required.
- `GET /workspaces/activity/summary` — activity summary: count by type for last 24h, most active agents, busiest hours. Auth required.
- `GET /workspaces/activity/timeline` — hourly activity counts for charts. Query: `hours` (default 24). Auth required.

Register in `backend/api.py`.

### Task 15: Workspace Activity Frontend

Create `recoder-agents/src/lib/api/workspace-activity.ts` and `recoder-agents/src/hooks/workspaces/use-workspace-activity.ts`.

Hooks: `useWorkspaceActivity(filters)`, `useWorkspaceActivitySummary()`, `useWorkspaceActivityTimeline(hours)`.

### Task 16: Workspace Activity UI

Create `recoder-agents/src/components/dashboard/workspace-activity-feed.tsx`:

Activity feed component:
- Vertical timeline with activity type icons and color coding
- Activity types: agent_created (Plus/green), agent_updated (Pencil/blue), thread_started (MessageSquare/purple), run_completed (CheckCircle/green), run_failed (XCircle/red), config_changed (Settings/amber)
- Each entry: icon, actor name, action description, target link, relative timestamp
- Filter dropdown by activity type
- "Load more" pagination
- Auto-refresh every 30 seconds

Create `recoder-agents/src/app/(dashboard)/activity/feed/page.tsx`:

Full activity feed page:
- Activity summary cards: events today, most active agent, busiest hour
- Activity timeline chart (hourly bar chart, last 24h)
- Full activity list with filters

Wire activity feed widget into dashboard. Add "Activity Feed" link in sidebar.

---

## Phase 5: Agent Collaboration Rooms (Tasks 17-20)

### Task 17: Collaboration Room Schema

Create `backend/supabase/migrations/20260311100004_collaboration_rooms.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_collaboration_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  room_type TEXT DEFAULT 'discussion' CHECK (room_type IN ('discussion', 'review', 'debugging', 'planning')),
  agent_ids TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collaboration_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES agent_collaboration_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  sender_type TEXT DEFAULT 'user' CHECK (sender_type IN ('user', 'agent', 'system')),
  sender_name TEXT,
  agent_id TEXT,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'code', 'suggestion', 'decision', 'action_item')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_collab_rooms_user ON agent_collaboration_rooms(user_id, created_at DESC);
CREATE INDEX idx_collab_rooms_status ON agent_collaboration_rooms(status) WHERE status = 'active';
CREATE INDEX idx_collab_messages_room ON collaboration_messages(room_id, created_at);
CREATE INDEX idx_collab_messages_user ON collaboration_messages(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Collaboration Room API

Create `backend/core/collaboration/collaboration_rooms_api.py` + `__init__.py`:

Router with tag `"collaboration-rooms"`:
- `POST /collaboration/rooms` — create room. Body: `{ name, description?, room_type?, agent_ids? }`. Auth required.
- `GET /collaboration/rooms` — list rooms. Query: `status`, `limit`. Auth required.
- `GET /collaboration/rooms/{room_id}` — room detail with recent messages. Auth required.
- `PATCH /collaboration/rooms/{room_id}` — update room (name, status, agent_ids). Auth required.
- `DELETE /collaboration/rooms/{room_id}` — delete room. Auth required.
- `POST /collaboration/rooms/{room_id}/messages` — send message. Body: `{ content, message_type?, agent_id? }`. Auth required.
- `GET /collaboration/rooms/{room_id}/messages` — list messages. Query: `limit`, `offset`. Auth required.
- `GET /collaboration/rooms/{room_id}/summary` — room summary: message count, participants, action items, last activity. Auth required.

Register in `backend/api.py`.

### Task 19: Collaboration Room Frontend

Create `recoder-agents/src/lib/api/collaboration-rooms.ts` and `recoder-agents/src/hooks/collaboration/use-collaboration-rooms.ts`.

Hooks: `useCollaborationRooms(status?)`, `useRoom(roomId)`, `useCreateRoom()`, `useUpdateRoom()`, `useDeleteRoom()`, `useRoomMessages(roomId)`, `useSendMessage()`, `useRoomSummary(roomId)`.

### Task 20: Collaboration Room UI

Create `recoder-agents/src/app/(dashboard)/collaboration/page.tsx`:

Collaboration rooms page:
- Room list: name, type badge, agent count, last activity, status indicator
- "New Room" dialog: name, description, type selector (Discussion/Review/Debugging/Planning), agent multi-select
- Room detail view (click room):
  - Header: room name, type badge, agent avatars, status, archive/resolve buttons
  - Message list: sender avatar, name, content, message type badge (code=purple, suggestion=blue, decision=green, action_item=amber), timestamp
  - Input area: text input, message type selector, "Send as Agent" dropdown (select which agent context to use)
  - Action items sidebar: extracted from messages tagged as action_item
- Filter by room type and status
- Empty state with "Create your first collaboration room"

Wire into sidebar with Users icon as "Collaboration" link.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 52 completion status.

---
