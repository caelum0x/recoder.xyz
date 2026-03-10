# Sprint 34: User Experience Core & Integration Management

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fill the critical UX gaps — user account settings, activity log, integration management, and chat enhancements — that every user hits in their first session.

**Architecture:** Settings pages in `recoder-agents`. Backend endpoints in FastAPI. Auth integration via existing Better Auth.

**Tech Stack:** Next.js 15, FastAPI, React Query, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: User Account & Settings (Tasks 1-6)

### Task 1: Account Settings Page

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/settings/account/page.tsx`
- Create: `recoder-agents/src/app/(dashboard)/settings/account/layout.tsx`

Account settings page with:
- Profile section: display name input, email (read-only with "change email" link), avatar upload placeholder
- Password section: current password, new password, confirm password fields, "Update Password" button
- Danger zone: "Delete Account" button (confirmation dialog)
- Uses existing auth API for password changes

### Task 2: Settings Layout with Sidebar Navigation

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/settings/layout.tsx`

Settings layout with left sidebar nav:
- Account (User icon)
- Notifications (Bell icon)
- Appearance (Palette icon)
- Security (Shield icon)
- API Keys (Key icon — existing page)
- Credentials (Database icon — existing page)
- Data & Privacy (Download icon)

### Task 3: Notification Preferences Page

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/settings/notifications/page.tsx`
- Create: `recoder-agents/src/lib/api/notification-settings.ts`
- Create: `recoder-agents/src/hooks/platform/use-notification-settings.ts`

Notification settings with toggle switches:
- Email notifications: agent completed, agent failed, weekly digest
- Push notifications: real-time agent updates, system alerts
- In-app: all events (always on)
- Save button at bottom

### Task 4: Appearance/Theme Settings

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/settings/appearance/page.tsx`

Theme settings:
- Theme toggle: System / Light / Dark (radio group)
- Font size: Small / Medium / Large
- Compact mode toggle
- Save to localStorage + apply immediately

### Task 5: Security Settings Page

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/settings/security/page.tsx`
- Create: `recoder-agents/src/lib/api/security-settings.ts`

Security settings:
- Active sessions list (device, browser, last active, "Revoke" button)
- Login history (last 10 logins: date, IP, location, device)
- Two-factor authentication: enable/disable toggle with QR code setup flow
- Password last changed date

### Task 6: Data & Privacy Page

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/settings/data-privacy/page.tsx`

Data management:
- Export my data: button that triggers data export (calls existing export API if available)
- Connected apps: list of OAuth connections with "Disconnect" button
- Delete account: confirmation flow with password verification

---

## Phase 2: Activity & Audit Log (Tasks 7-9)

### Task 7: Activity Log Page

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/activity/page.tsx`
- Create: `recoder-agents/src/app/(dashboard)/activity/layout.tsx`

Personal activity feed page:
- Uses existing `usePlatformActivity` hook from Sprint 33
- Full page layout (not just dashboard widget)
- Filter bar: app filter (All/Agents/Agency/PM), date range picker, search
- Infinite scroll or "Load more" pagination
- Each event: app badge, type icon, title, description, timestamp
- Click navigates to related item

### Task 8: Activity Log Sidebar Link

**Files:**
- Modify: `recoder-agents/src/components/sidebar/sidebar-left.tsx`

Add "Activity" link with Clock icon between existing nav items.

### Task 9: Admin Activity Dashboard

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/admin/activity/page.tsx`

Admin view of all platform activity (for team admins):
- Same layout as personal activity but shows all team members' activity
- User filter dropdown
- Export to CSV button
- Summary stats: events today, most active user, most used feature

---

## Phase 3: Integration Management (Tasks 10-13)

### Task 10: Integration Status Dashboard

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/settings/integrations/page.tsx`
- Create: `recoder-agents/src/lib/api/integrations.ts`
- Create: `recoder-agents/src/hooks/platform/use-integrations.ts`

Integration overview:
- Grid of integration cards: icon, name, status (connected/disconnected/error), last sync time
- Integrations: Composio, Google Drive, GitHub, Slack, custom MCP servers
- Click to expand: permissions granted, connection details, "Disconnect" and "Refresh" buttons
- Error state: shows what went wrong with "Reconnect" button

### Task 11: Integration API Backend

**Files:**
- Create: `backend/core/integrations/integration_api.py`
- Create: `backend/core/integrations/__init__.py`
- Modify: `backend/api.py`

Endpoints:
- `GET /integrations` — list user's connected integrations with status
- `GET /integrations/{provider}` — get specific integration details
- `DELETE /integrations/{provider}` — disconnect integration
- `POST /integrations/{provider}/refresh` — refresh OAuth token

### Task 12: OAuth Disconnect Flow

**Files:**
- Create: `recoder-agents/src/components/settings/disconnect-dialog.tsx`

Confirmation dialog for disconnecting an integration:
- Warning about what will stop working
- List of agents using this integration
- "Disconnect" and "Cancel" buttons
- Toast notification on success/failure

### Task 13: Integration Error Recovery

**Files:**
- Create: `recoder-agents/src/components/settings/integration-error-banner.tsx`

A banner component that appears when an integration has expired auth:
- Shows which integration needs attention
- "Reconnect" button that opens OAuth flow
- Dismissible with "Remind me later" (24h snooze)
- Can be placed at top of dashboard or in sidebar

---

## Phase 4: Chat Input Enhancements (Tasks 14-18)

### Task 14: Slash Commands Framework

**Files:**
- Create: `recoder-agents/src/components/thread/chat-input/slash-command-menu.tsx`
- Modify: `recoder-agents/src/components/thread/chat-input/chat-input.tsx`

When user types "/" in chat input, show a popup menu with available commands:
- `/search <query>` — search knowledge base
- `/summarize` — summarize current thread
- `/clear` — clear thread context
- `/agent <name>` — switch to different agent
- `/export` — export thread as PDF/markdown
- `/help` — show available commands

Each command: icon, name, description. Arrow key navigation, Enter to select. Esc to dismiss.

### Task 15: @Mention Agent Selector

**Files:**
- Create: `recoder-agents/src/components/thread/chat-input/mention-menu.tsx`
- Modify: `recoder-agents/src/components/thread/chat-input/chat-input.tsx`

When user types "@" in chat input, show agent selector:
- List of user's agents with icons
- Fuzzy search as user types
- Selecting inserts `@AgentName` styled tag
- Mentions get sent as metadata with the message

### Task 16: Message Template Suggestions

**Files:**
- Create: `recoder-agents/src/components/thread/chat-input/suggestion-chips.tsx`

Show suggestion chips above the input when thread is empty:
- "Analyze this codebase"
- "Write unit tests for..."
- "Create a workflow for..."
- "Search my knowledge base"
- Clicking fills the input with the template text
- Hidden once user starts typing or thread has messages

### Task 17: Input Markdown Preview

**Files:**
- Create: `recoder-agents/src/components/thread/chat-input/markdown-toggle.tsx`
- Modify: `recoder-agents/src/components/thread/chat-input/chat-input.tsx`

Toggle button to preview markdown before sending:
- Small "Preview" toggle at bottom of input
- When active: renders the input as markdown (code blocks, bold, links, etc.)
- Uses existing markdown renderer from thread messages
- Toggle back to edit mode

### Task 18: Code Block Detection

**Files:**
- Modify: `recoder-agents/src/components/thread/chat-input/chat-input.tsx`

When user pastes code (detected by newlines + indentation patterns or backticks):
- Auto-wrap in triple backticks
- Detect language from content if possible
- Show small "Wrapped as code" indicator

---

## Phase 5: Global Search & Discovery (Tasks 19-22)

### Task 19: Global Search Backend

**Files:**
- Create: `backend/core/search/search_api.py`
- Create: `backend/core/search/__init__.py`
- Modify: `backend/api.py`

Unified search endpoint: `GET /search?q=<query>&types=agents,threads,workflows,knowledge`
- Searches across agents (name, description), threads (title, messages), workflows (name), knowledge base entries
- Returns typed results with relevance scoring
- Auth-scoped to user's data

### Task 20: Global Search UI

**Files:**
- Create: `recoder-agents/src/components/search/global-search-dialog.tsx`
- Create: `recoder-agents/src/lib/api/search.ts`
- Create: `recoder-agents/src/hooks/platform/use-global-search.ts`

CMD+K / Ctrl+K global search dialog:
- Input with search icon
- Type filter pills: All, Agents, Threads, Workflows, Knowledge
- Results grouped by type with type icons
- Recent searches section
- Keyboard navigation (arrow keys, enter to select, esc to close)
- Click navigates to the item

### Task 21: Wire Global Search to Sidebar

**Files:**
- Modify: `recoder-agents/src/components/sidebar/sidebar-left.tsx`

Add search button in sidebar header:
- Search icon button that opens the global search dialog
- CMD+K keyboard shortcut hint

### Task 22: Update Status Docs

**Files:**
- Modify: `tasks/todo.md`

Add Sprint 34 completion status.
