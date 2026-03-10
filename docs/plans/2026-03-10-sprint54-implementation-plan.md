# Sprint 54: Agent Scheduled Reports, Thread Pinned Messages, API Usage Heatmap, Agent Favorites & Quick Launch, Workspace Onboarding Checklists

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automated scheduled report generation for agents, per-thread pinned message system, visual API usage heatmap dashboard, personal agent favorites with quick-launch bar, and customizable workspace onboarding checklists — completing the reporting automation, thread organization, API visibility, daily workflow acceleration, and team onboarding features.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Neon PostgreSQL (raw SQL migrations, NO Supabase RLS). Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Scheduled Reports (Tasks 1-4)

### Task 1: Scheduled Reports Schema

Create `backend/supabase/migrations/20260311300000_scheduled_reports.sql`:

```sql
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('agent_summary', 'cost_breakdown', 'run_analytics', 'health_digest', 'usage_overview', 'custom')),
  agent_ids TEXT[] DEFAULT '{}',
  schedule_cron TEXT NOT NULL,
  schedule_description TEXT,
  output_format TEXT DEFAULT 'json' CHECK (output_format IN ('json', 'csv', 'markdown')),
  last_generated_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'partial')),
  data JSONB NOT NULL DEFAULT '{}',
  row_count INTEGER DEFAULT 0,
  generation_time_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scheduled_reports_user ON scheduled_reports(user_id);
CREATE INDEX idx_scheduled_reports_active ON scheduled_reports(is_active, next_run_at) WHERE is_active = true;
CREATE INDEX idx_report_history_report ON report_history(report_id, created_at DESC);
CREATE INDEX idx_report_history_user ON report_history(user_id, created_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 2: Scheduled Reports API

Create `backend/core/reports/scheduled_reports_api.py` + `__init__.py`:

Router with tag `"scheduled-reports"`:
- `POST /reports/scheduled` — create scheduled report. Body: `{ name, report_type, agent_ids?, schedule_cron, schedule_description?, output_format?, config? }`. Auth required.
- `GET /reports/scheduled` — list scheduled reports. Auth required.
- `PATCH /reports/scheduled/{report_id}` — update report config. Auth required.
- `DELETE /reports/scheduled/{report_id}` — delete. Auth required.
- `POST /reports/scheduled/{report_id}/generate` — manually trigger report generation. Auth required.
- `GET /reports/scheduled/{report_id}/history` — list past generations. Query: `limit`, `offset`. Auth required.
- `GET /reports/history/{history_id}` — get specific report data. Auth required.

Register in `backend/api.py`.

### Task 3: Scheduled Reports Frontend

Create `recoder-agents/src/lib/api/scheduled-reports.ts` and `recoder-agents/src/hooks/reports/use-scheduled-reports.ts`.

Hooks: `useScheduledReports()`, `useCreateScheduledReport()`, `useUpdateScheduledReport()`, `useDeleteScheduledReport()`, `useGenerateReport()`, `useReportHistory(reportId)`, `useReportData(historyId)`.

### Task 4: Scheduled Reports UI

Create `recoder-agents/src/app/(dashboard)/reports/scheduled/page.tsx`:

Scheduled reports page:
- Report list: name, type badge, schedule (cron description), next run, last generated, active toggle, actions
- "New Report" dialog: name, report type selector (6 types), agent multi-select, cron schedule input with presets (Daily, Weekly, Monthly), output format, config options per type
- Report history panel (click to expand): status badge, row count, generation time, download/view data
- "Generate Now" button for manual trigger
- Report data viewer: JSON tree view or table depending on format

Wire into sidebar or reports section.

---

## Phase 2: Thread Pinned Messages (Tasks 5-8)

### Task 5: Pinned Messages Schema

Create `backend/supabase/migrations/20260311300001_thread_pinned_messages.sql`:

```sql
CREATE TABLE IF NOT EXISTS thread_pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  message_preview TEXT,
  pin_note TEXT,
  pin_color TEXT DEFAULT 'default',
  pinned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, thread_id, message_index)
);

CREATE INDEX idx_pinned_messages_user ON thread_pinned_messages(user_id);
CREATE INDEX idx_pinned_messages_thread ON thread_pinned_messages(thread_id, pinned_at DESC);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 6: Pinned Messages API

Create `backend/core/threads/pinned_messages_api.py`:

Router with tag `"pinned-messages"`:
- `POST /threads/{thread_id}/pins` — pin a message. Body: `{ message_index, message_preview?, pin_note?, pin_color? }`. Auth required.
- `GET /threads/{thread_id}/pins` — list pinned messages for thread. Auth required.
- `DELETE /threads/{thread_id}/pins/{pin_id}` — unpin. Auth required.
- `PATCH /threads/{thread_id}/pins/{pin_id}` — update note or color. Auth required.
- `GET /pins/recent` — recent pins across all threads. Query: `limit`. Auth required.

Register in `backend/api.py`.

### Task 7: Pinned Messages Frontend

Create `recoder-agents/src/lib/api/pinned-messages.ts` and `recoder-agents/src/hooks/threads/use-pinned-messages.ts`.

Hooks: `usePinnedMessages(threadId)`, `usePinMessage()`, `useUnpinMessage()`, `useUpdatePin()`, `useRecentPins()`.

### Task 8: Pinned Messages UI

Create `recoder-agents/src/components/thread/pinned-messages-bar.tsx`:

Pinned messages bar (above thread messages):
- Collapsible bar showing pinned message count
- Expand to show pinned messages list: message preview, pin note, color indicator, jump-to button, unpin button
- Pin colors: default (blue), important (red), reference (green), todo (amber)

Create `recoder-agents/src/components/thread/pin-message-button.tsx`:

Pin button for individual messages:
- Pin icon on message hover (right side)
- Click to pin with optional note popover
- Color selector (4 options)
- Filled pin icon when already pinned

Wire pinned messages bar into thread view. Wire pin button into message rendering.

---

## Phase 3: API Usage Heatmap (Tasks 9-12)

### Task 9: API Usage Tracking Schema

Create `backend/supabase/migrations/20260311300002_api_usage_heatmap.sql`:

```sql
CREATE TABLE IF NOT EXISTS api_usage_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  hour_bucket TIMESTAMPTZ NOT NULL,
  endpoint_group TEXT NOT NULL,
  request_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  avg_latency_ms INTEGER DEFAULT 0,
  UNIQUE (user_id, hour_bucket, endpoint_group)
);

CREATE INDEX idx_api_usage_user ON api_usage_hourly(user_id, hour_bucket DESC);
CREATE INDEX idx_api_usage_endpoint ON api_usage_hourly(endpoint_group);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 10: API Usage Heatmap API

Create `backend/core/developers/api_usage_heatmap_api.py`:

Router with tag `"api-usage-heatmap"`:
- `GET /api-usage/heatmap` — heatmap data: 7 days x 24 hours grid of request counts. Query: `days` (default 7), `endpoint_group`. Auth required.
- `GET /api-usage/endpoints` — distinct endpoint groups with total counts. Auth required.
- `POST /api-usage/record` — record API usage (called internally). Body: `{ endpoint_group, request_count?, error_count?, avg_latency_ms? }`. Auth required.
- `GET /api-usage/peak-hours` — busiest hours with avg request count. Auth required.

Register in `backend/api.py`.

### Task 11: API Usage Heatmap Frontend

Create `recoder-agents/src/lib/api/api-usage-heatmap.ts` and `recoder-agents/src/hooks/developers/use-api-usage-heatmap.ts`.

Hooks: `useApiUsageHeatmap(days?, endpointGroup?)`, `useApiEndpoints()`, `useApiPeakHours()`.

### Task 12: API Usage Heatmap UI

Create `recoder-agents/src/app/(dashboard)/developers/api-heatmap/page.tsx`:

API usage heatmap page:
- Heatmap grid: 7 columns (days) x 24 rows (hours), cells colored by intensity (white→green→yellow→red)
- Cell tooltip: day, hour, request count, error count, avg latency
- Endpoint filter dropdown
- Peak hours summary: top 5 busiest hours with bar indicators
- Legend for color intensity scale
- Stats cards: total requests (7d), peak hour, avg requests/hour, error rate

Wire into developers section.

---

## Phase 4: Agent Favorites & Quick Launch (Tasks 13-16)

### Task 13: Favorites Schema

Create `backend/supabase/migrations/20260311300003_agent_favorites.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  quick_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX idx_agent_favorites_user ON agent_favorites(user_id, display_order);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 14: Favorites API

Create `backend/core/agents/agent_favorites_api.py`:

Router with tag `"agent-favorites"`:
- `POST /agents/favorites` — add favorite. Body: `{ agent_id, quick_prompt? }`. Auth required.
- `GET /agents/favorites` — list favorites ordered by display_order. Auth required.
- `DELETE /agents/favorites/{agent_id}` — remove favorite. Auth required.
- `PUT /agents/favorites/reorder` — reorder favorites. Body: `{ agent_ids[] }`. Auth required.
- `PATCH /agents/favorites/{agent_id}` — update quick prompt. Auth required.

Register in `backend/api.py`.

### Task 15: Favorites Frontend

Create `recoder-agents/src/lib/api/agent-favorites.ts` and `recoder-agents/src/hooks/agents/use-agent-favorites.ts`.

Hooks: `useAgentFavorites()`, `useAddFavorite()`, `useRemoveFavorite()`, `useReorderFavorites()`, `useUpdateFavoritePrompt()`.

### Task 16: Favorites & Quick Launch UI

Create `recoder-agents/src/components/agents/favorites-bar.tsx`:

Quick launch bar (horizontal, top of dashboard or sidebar):
- Horizontal row of favorite agent avatars/icons
- Click agent → start new thread with that agent (or use quick prompt if set)
- Long press/right click → edit quick prompt, remove from favorites
- "+" button to add favorites from agent list
- Reorderable via drag or arrow buttons

Create `recoder-agents/src/components/agents/favorite-toggle.tsx`:

Favorite toggle for agent cards/detail:
- Star icon (filled when favorited, outline when not)
- Click to toggle favorite status
- Toast confirmation

Wire favorites bar into dashboard. Wire favorite toggle into agent grid cards.

---

## Phase 5: Workspace Onboarding Checklists (Tasks 17-20)

### Task 17: Onboarding Checklist Schema

Create `backend/supabase/migrations/20260311300004_onboarding_checklists.sql`:

```sql
CREATE TABLE IF NOT EXISTS onboarding_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  checklist_type TEXT DEFAULT 'workspace' CHECK (checklist_type IN ('workspace', 'agent', 'team', 'custom')),
  is_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS onboarding_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES onboarding_checklists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  action_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_checklists_user ON onboarding_checklists(user_id);
CREATE INDEX idx_checklists_type ON onboarding_checklists(checklist_type);
CREATE INDEX idx_checklist_items_checklist ON onboarding_checklist_items(checklist_id, sort_order);
CREATE INDEX idx_checklist_items_user ON onboarding_checklist_items(user_id);

-- Access control enforced at application layer (WHERE user_id = :user_id)
```

### Task 18: Onboarding Checklist API

Create `backend/core/onboarding/onboarding_checklists_api.py` + `__init__.py`:

Router with tag `"onboarding-checklists"`:
- `POST /onboarding/checklists` — create checklist. Body: `{ name, description?, checklist_type?, items[]? }`. Auth required.
- `GET /onboarding/checklists` — list checklists with progress (completed/total). Auth required.
- `GET /onboarding/checklists/{checklist_id}` — detail with items. Auth required.
- `DELETE /onboarding/checklists/{checklist_id}` — delete. Auth required.
- `POST /onboarding/checklists/{checklist_id}/items` — add item. Body: `{ title, description?, action_url?, sort_order? }`. Auth required.
- `PATCH /onboarding/checklists/{checklist_id}/items/{item_id}` — update item (toggle completed, edit). Auth required.
- `DELETE /onboarding/checklists/{checklist_id}/items/{item_id}` — remove item. Auth required.
- `POST /onboarding/checklists/seed` — seed default workspace checklist (Create first agent, Start a thread, Configure tools, Set up KB, Invite team). Auth required.

Register in `backend/api.py`.

### Task 19: Onboarding Checklist Frontend

Create `recoder-agents/src/lib/api/onboarding-checklists.ts` and `recoder-agents/src/hooks/onboarding/use-onboarding-checklists.ts`.

Hooks: `useOnboardingChecklists()`, `useChecklist(id)`, `useCreateChecklist()`, `useDeleteChecklist()`, `useAddChecklistItem()`, `useUpdateChecklistItem()`, `useDeleteChecklistItem()`, `useSeedChecklist()`.

### Task 20: Onboarding Checklist UI

Create `recoder-agents/src/components/onboarding/onboarding-checklist-card.tsx`:

Checklist card (dashboard widget or standalone):
- Progress bar showing completed/total
- Item list: checkbox, title, description, action link button, completed strikethrough
- Click checkbox to toggle completion
- Confetti or subtle animation on 100% completion
- "Add Item" inline form
- Collapse/expand

Create `recoder-agents/src/app/(dashboard)/onboarding/checklist/page.tsx`:

Checklists management page:
- Checklist list: name, type badge, progress bar, actions
- "New Checklist" dialog: name, description, type, initial items
- "Seed Defaults" button for first-time users
- Checklist detail: full item list with reorder, edit, add, delete
- Template checklists section (is_template=true) for reuse

Wire checklist card into dashboard as a widget option.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 54 completion status.

---
