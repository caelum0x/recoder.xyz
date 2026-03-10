# Sprint 43: Audit Logs, User Preferences Sync, KB Folder Management, Thread Export & Quota Dashboard

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive audit logging, backend-synced user preferences, knowledge base folder management, thread conversation export, and agent quota management dashboard — completing the operational maturity and power-user feature set.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. All new tables in Supabase with RLS. Uses existing React Query, shadcn/ui, and backendApi patterns.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Comprehensive Audit Logging (Tasks 1-4)

### Task 1: Audit Log Database Schema

Create `backend/supabase/migrations/20260310200000_audit_logs.sql`:

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('agent', 'thread', 'workflow', 'pipeline', 'team', 'secret', 'webhook', 'knowledge_entry', 'api_key', 'settings', 'billing')),
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_ts ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own audit logs"
  ON audit_logs FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);
```

### Task 2: Audit Log API

Create `backend/core/audit/audit_api.py` + `__init__.py`:

Router with tag `"audit-logs"`, prefix `/audit`:
- `GET /audit/logs` — paginated audit logs. Query: `resource_type`, `action`, `from_date`, `to_date`, `limit` (default 50), `offset`. Auth required.
- `GET /audit/logs/summary` — count of actions by resource_type for last 30 days. Auth required.
- `GET /audit/logs/export` — export logs as JSON for date range (max 90 days). Auth required.

Create `backend/core/audit/audit_service.py`:

Helper function `log_audit_event(user_id, action, resource_type, resource_id, details, request)` that inserts into audit_logs, extracting IP and user-agent from request. Fire-and-forget (no await needed by callers).

Register in `backend/api.py`.

### Task 3: Audit Log Frontend

Create `recoder-agents/src/lib/api/audit-logs.ts` and `recoder-agents/src/hooks/platform/use-audit-logs.ts`.

API client: `getAuditLogs(filters)`, `getAuditSummary()`, `exportAuditLogs(from, to)`.

Hooks: `useAuditLogs(filters)`, `useAuditSummary()`, `useExportAuditLogs()`.

### Task 4: Audit Log Page

Create `recoder-agents/src/app/(dashboard)/admin/audit/page.tsx`:

Audit log viewer page:
- Summary cards at top: total events (30d), most active resource type, most common action
- Filter bar: resource type dropdown, action text search, date range picker
- Log table: timestamp, action (verb badge), resource type badge (color-coded), resource ID (linked), details expandable, IP address
- "Export JSON" button for date range
- Pagination (load more)

Add "Audit Logs" link in admin section of sidebar with FileText icon.

---

## Phase 2: User Preferences Backend Sync (Tasks 5-8)

### Task 5: User Preferences Schema

Create `backend/supabase/migrations/20260310200001_user_preferences.sql`:

```sql
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY,
  theme TEXT DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  language TEXT DEFAULT 'en',
  font_size TEXT DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large')),
  compact_mode BOOLEAN DEFAULT false,
  reduced_animations BOOLEAN DEFAULT false,
  sidebar_collapsed BOOLEAN DEFAULT false,
  notification_email BOOLEAN DEFAULT true,
  notification_push BOOLEAN DEFAULT true,
  notification_in_app BOOLEAN DEFAULT true,
  notification_agent_completed BOOLEAN DEFAULT true,
  notification_agent_failed BOOLEAN DEFAULT true,
  notification_thread_message BOOLEAN DEFAULT true,
  notification_system_alert BOOLEAN DEFAULT true,
  dashboard_widget_order TEXT[] DEFAULT '{}',
  timezone TEXT DEFAULT 'UTC',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own preferences"
  ON user_preferences FOR ALL
  USING (user_id = auth.uid());
```

### Task 6: User Preferences API

Create `backend/core/settings/user_preferences_api.py` + `__init__.py`:

Router with tag `"user-preferences"`, prefix `/preferences`:
- `GET /preferences` — get user preferences. Returns defaults if no row exists. Auth required.
- `PUT /preferences` — update preferences (upsert). Body: partial preferences object. Auth required.
- `POST /preferences/reset` — reset to defaults (delete row). Auth required.

Register in `backend/api.py`.

### Task 7: User Preferences Frontend

Create `recoder-agents/src/lib/api/user-preferences.ts` and `recoder-agents/src/hooks/platform/use-user-preferences.ts`.

API client: `getPreferences()`, `updatePreferences(partial)`, `resetPreferences()`.

Hooks: `useUserPreferences()`, `useUpdatePreferences()`, `useResetPreferences()`.

Create `recoder-agents/src/stores/preferences-store.ts`:

Zustand store that syncs with backend:
- On mount: load from backend, fallback to localStorage
- On update: write to backend + localStorage (localStorage is offline cache)
- `theme`, `fontSize`, `compactMode`, `reducedAnimations`, `sidebarCollapsed`, notification toggles
- `syncFromBackend()`, `updatePreference(key, value)`, `resetAll()`

### Task 8: Wire Preferences into Settings Pages

Modify existing settings pages to use the new preferences store:
- `recoder-agents/src/components/settings/user-settings-modal.tsx` — appearance settings use `useUserPreferences` + `useUpdatePreferences` instead of localStorage-only
- `recoder-agents/src/components/notifications/notification-settings.tsx` — notification toggles sync to backend via preferences API (granular per-event-type toggles)
- Add "Sync Status" indicator: small cloud icon showing if prefs are synced to backend

---

## Phase 3: Knowledge Base Folder Management (Tasks 9-12)

### Task 9: KB Folder Operations Backend

Create `backend/core/knowledge_base/folder_management_api.py`:

Router with tag `"kb-folders"`, prefix `/knowledge-base/folders`:
- `POST /knowledge-base/folders/{folder_id}/move` — move folder to new parent. Body: `{ parent_folder_id }`. Auth required.
- `POST /knowledge-base/folders/{folder_id}/duplicate` — duplicate folder + contents. Auth required.
- `POST /knowledge-base/entries/bulk-move` — move multiple entries. Body: `{ entry_ids[], target_folder_id }`. Auth required.
- `POST /knowledge-base/entries/bulk-delete` — delete multiple entries. Body: `{ entry_ids[] }`. Auth required.
- `GET /knowledge-base/stats` — storage stats: total entries, total size, entries per folder. Auth required.

Register in `backend/api.py`.

### Task 10: KB Folder Frontend Hooks

Create `recoder-agents/src/lib/api/kb-folders.ts` and `recoder-agents/src/hooks/knowledge-base/use-kb-folders.ts`.

API client: `moveFolder(folderId, parentId)`, `duplicateFolder(folderId)`, `bulkMoveEntries(entryIds, targetFolderId)`, `bulkDeleteEntries(entryIds)`, `getKbStats()`.

Hooks: `useMoveFolder()`, `useDuplicateFolder()`, `useBulkMoveEntries()`, `useBulkDeleteEntries()`, `useKbStats()`.

### Task 11: KB Enhanced Manager UI

Modify `recoder-agents/src/components/knowledge-base/knowledge-base-manager.tsx`:

Add to existing KB manager:
- Multi-select mode: checkbox on each entry, floating action bar with bulk move/delete
- Folder context menu: right-click → Move, Duplicate, Rename, Delete
- Entry drag-and-drop: drag entries between folders (uses `useBulkMoveEntries`)
- Storage stats bar: shows entry count, total size, breakdown per folder (at top of manager)
- Bulk delete confirmation: dialog listing all entries to be deleted with warning

### Task 12: KB Folder Navigation Improvements

Create `recoder-agents/src/components/knowledge-base/kb-folder-tree.tsx`:

Tree navigation sidebar for KB:
- Collapsible folder tree with indent levels
- Folder icons (open/closed state)
- Entry count badge per folder
- Right-click context menu (move, duplicate, rename, delete)
- "New Folder" button at root level
- Highlight current folder
- Uses existing folder API data

Wire into knowledge-base-manager as left sidebar panel.

---

## Phase 4: Thread Conversation Export (Tasks 13-16)

### Task 13: Thread Export Backend

Create `backend/core/threads/thread_export_api.py`:

Router with tag `"thread-export"`, prefix `/threads`:
- `POST /threads/{thread_id}/export` — export thread conversation. Body: `{ format: 'markdown' | 'json' | 'txt', include_tool_calls?: bool, include_metadata?: bool }`. Returns formatted content as string. Auth required.
- `GET /threads/{thread_id}/export/pdf` — export as PDF. Uses basic HTML-to-PDF conversion. Returns PDF blob. Auth required.

For markdown export: format as `## Agent Name\n\n**User:** message\n\n**Assistant:** response\n\n---\n\n` pattern.
For JSON export: structured array of `{ role, content, timestamp, tool_calls? }`.
For txt export: plain text with role labels.
For PDF: render markdown to HTML, use weasyprint or basic HTML template.

Register in `backend/api.py`.

### Task 14: Thread Export Frontend

Create `recoder-agents/src/lib/api/thread-export.ts` and `recoder-agents/src/hooks/threads/use-thread-export.ts`.

API client: `exportThread(threadId, options)`, `exportThreadPdf(threadId)`.

Hooks: `useExportThread()`, `useExportThreadPdf()` — mutations that trigger download.

### Task 15: Thread Export Dialog

Create `recoder-agents/src/components/thread/thread-export-dialog.tsx`:

Export dialog triggered from thread header:
- Format selector: Markdown, JSON, Plain Text, PDF
- Options toggles: Include tool calls, Include metadata/timestamps
- Preview panel: shows first 20 lines of exported content
- "Download" button that triggers browser download with filename `thread-{title}-{date}.{ext}`
- "Copy to Clipboard" button for text formats

### Task 16: Wire Thread Export

Modify `recoder-agents/src/components/thread/thread-site-header.tsx`:

Add "Export" action to thread header dropdown menu with Download icon. Opens ThreadExportDialog.

---

## Phase 5: Agent Quota Management Dashboard (Tasks 17-20)

### Task 17: Quota Configuration Schema

Create `backend/supabase/migrations/20260310200002_agent_quotas.sql`:

```sql
CREATE TABLE IF NOT EXISTS agent_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  max_runs_per_day INTEGER,
  max_tokens_per_day INTEGER,
  max_cost_per_day NUMERIC(10,4),
  max_runs_per_month INTEGER,
  max_tokens_per_month INTEGER,
  max_cost_per_month NUMERIC(10,4),
  alert_threshold_pct INTEGER DEFAULT 80,
  is_enforced BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, agent_id)
);

CREATE INDEX idx_agent_quotas_user ON agent_quotas(user_id);
CREATE INDEX idx_agent_quotas_agent ON agent_quotas(agent_id);

ALTER TABLE agent_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own quotas"
  ON agent_quotas FOR ALL
  USING (user_id = auth.uid());
```

### Task 18: Quota Management API

Create `backend/core/agents/agent_quota_api.py`:

Router with tag `"agent-quotas"`:
- `GET /agents/{agent_id}/quota` — get quota config + current usage against limits. Auth required.
- `PUT /agents/{agent_id}/quota` — set/update quota. Body: partial quota fields. Upsert. Auth required.
- `DELETE /agents/{agent_id}/quota` — remove quota (unlimited). Auth required.
- `GET /agents/quotas/overview` — all agents with their quota status (% used). Auth required.
- `GET /agents/quotas/alerts` — agents approaching or exceeding limits. Auth required.

Register in `backend/api.py`.

### Task 19: Quota Frontend

Create `recoder-agents/src/lib/api/agent-quotas.ts` and `recoder-agents/src/hooks/agents/use-agent-quotas.ts`.

API client: `getAgentQuota(agentId)`, `updateAgentQuota(agentId, quota)`, `deleteAgentQuota(agentId)`, `getQuotasOverview()`, `getQuotaAlerts()`.

Hooks: `useAgentQuota(agentId)`, `useUpdateAgentQuota()`, `useDeleteAgentQuota()`, `useQuotasOverview()`, `useQuotaAlerts()`.

### Task 20: Quota Dashboard & Agent Config

Create `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/quota-screen.tsx`:

Quota management tab within agent config:
- Current usage cards: Runs Today (X / limit), Tokens Today (X / limit), Cost Today ($X / $limit)
- Monthly usage cards: same for monthly period
- Progress bars with color coding: green (<60%), amber (60-80%), red (>80%)
- Quota configuration form: set daily/monthly limits for runs, tokens, cost
- Alert threshold slider (default 80%)
- "Enforce limits" toggle (when on, agent runs are blocked at 100%)
- "Remove all limits" button with confirmation

Wire into agent config page as "Quota" tab with Gauge icon.

Create `recoder-agents/src/app/(dashboard)/admin/quotas/page.tsx`:

Admin quota overview page:
- Table of all agents with quota status: agent name, daily usage %, monthly usage %, enforcement status
- Filter: only show agents near/over limits
- Bulk actions: set default quota for all agents
- Alert banner for agents exceeding limits

Add "Quotas" link in admin section.

### Task 21: Update Status Docs

Update `tasks/todo.md` with Sprint 43 completion status.

---
