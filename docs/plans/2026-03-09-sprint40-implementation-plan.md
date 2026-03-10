# Sprint 40: Agent Comparison, Favorites, Notifications & Onboarding Improvements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build agent comparison leaderboard, thread/agent favorites, real-time notification toasts, and improved onboarding — filling the remaining UX gaps users hit in daily workflows.

**Architecture:** Backend endpoints in FastAPI (`backend/core/`). Frontend in `recoder-agents/`. Uses existing auth, React Query patterns, and shadcn/ui component library. All new tables in Supabase with RLS.

**Tech Stack:** Next.js 15, FastAPI, React Query, Recharts, Tailwind CSS, shadcn/ui, lucide-react

---

## Phase 1: Agent Comparison Leaderboard (Tasks 1-4)

### Task 1: Agent Comparison Backend

Create `backend/core/agents/agent_comparison_api.py`:

FastAPI router with tag `"agent-comparison"`:

Endpoints:
- `GET /agents/compare` — compare up to 5 agents by ID. Query param: `agent_ids` (comma-separated). Returns per-agent: name, total_runs, success_rate, avg_latency_ms, total_cost, avg_cost_per_run, total_tokens, most_used_tool, model. Auth required via `Depends(verify_and_get_user_id_from_jwt)`.

- `GET /agents/leaderboard` — ranked list of user's agents by a sortable metric. Query params: `metric` (runs|success_rate|cost_efficiency|speed), `limit` (default 10). Returns sorted array with rank field. Auth required.

Both pull from `agent_analytics_daily` table (already exists) + `agents` table for name/model.

Register in `backend/api.py`:
```python
from core.agents.agent_comparison_api import router as agent_comparison_router
api_router.include_router(agent_comparison_router)
```

### Task 2: Agent Comparison Frontend API + Hooks

Create `recoder-agents/src/lib/api/agent-comparison.ts`:

```typescript
import { backendApi } from '@/lib/api-client';

export interface AgentComparisonData {
  agent_id: string;
  name: string;
  total_runs: number;
  success_rate: number;
  avg_latency_ms: number;
  total_cost: number;
  avg_cost_per_run: number;
  total_tokens: number;
  most_used_tool: string;
  model: string;
}

export interface LeaderboardEntry extends AgentComparisonData {
  rank: number;
}

export const compareAgents = async (agentIds: string[]): Promise<AgentComparisonData[]> => {
  const response = await backendApi.get<AgentComparisonData[]>(
    `/agents/compare?agent_ids=${agentIds.join(',')}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};

export const getAgentLeaderboard = async (
  metric: string = 'runs',
  limit: number = 10
): Promise<LeaderboardEntry[]> => {
  const response = await backendApi.get<LeaderboardEntry[]>(
    `/agents/leaderboard?metric=${metric}&limit=${limit}`,
    { showErrors: false }
  );
  if (response.error) throw new Error(response.error.message);
  return response.data!;
};
```

Create `recoder-agents/src/hooks/agents/use-agent-comparison.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { compareAgents, getAgentLeaderboard } from '@/lib/api/agent-comparison';

export function useAgentComparison(agentIds: string[]) {
  return useQuery({
    queryKey: ['agent-comparison', agentIds],
    queryFn: () => compareAgents(agentIds),
    enabled: agentIds.length >= 2,
    staleTime: 60_000,
  });
}

export function useAgentLeaderboard(metric: string = 'runs', limit: number = 10) {
  return useQuery({
    queryKey: ['agent-leaderboard', metric, limit],
    queryFn: () => getAgentLeaderboard(metric, limit),
    staleTime: 60_000,
  });
}
```

### Task 3: Agent Leaderboard Page

Create `recoder-agents/src/app/(dashboard)/agents/leaderboard/page.tsx`:

Full leaderboard page with:
- Metric selector tabs: Most Used, Best Success Rate, Most Cost-Efficient, Fastest
- Ranked table: position medal (gold/silver/bronze for top 3), agent name, metric value, sparkline trend
- Each row links to `/agents/config/[agentId]`
- Summary stat cards at top: Total Agents, Total Runs (all agents), Avg Success Rate, Total Spend

### Task 4: Agent Comparison Dialog

Create `recoder-agents/src/components/agents/agent-comparison-dialog.tsx`:

Dialog triggered from agents grid ("Compare" button in bulk actions bar):
- Side-by-side cards for 2-5 selected agents
- Metrics rows: Runs, Success Rate, Avg Latency, Cost/Run, Total Tokens, Model
- Color-coded "best" indicator per metric (green highlight on winning value)
- Horizontal bar chart comparing selected agents on a chosen metric
- "View Leaderboard" link at bottom

Wire into existing `bulk-actions-bar.tsx` as a new action.

---

## Phase 2: Favorites & Bookmarks (Tasks 5-8)

### Task 5: Favorites Database Schema

Create `backend/supabase/migrations/20260309600000_favorites.sql`:

```sql
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('agent', 'thread', 'workflow', 'knowledge_entry')),
  item_id TEXT NOT NULL,
  item_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

CREATE INDEX idx_favorites_user ON user_favorites(user_id);
CREATE INDEX idx_favorites_user_type ON user_favorites(user_id, item_type);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own favorites"
  ON user_favorites FOR ALL
  USING (user_id = auth.uid());
```

### Task 6: Favorites API Backend

Create `backend/core/favorites/favorites_api.py` + `__init__.py`:

Router with tag `"favorites"`:
- `POST /favorites` — body: `{ item_type, item_id, item_name }`. Upsert (ignore conflict).
- `DELETE /favorites/{item_type}/{item_id}` — remove favorite.
- `GET /favorites` — list all user favorites. Optional query param `type` to filter.
- `GET /favorites/check/{item_type}/{item_id}` — returns `{ is_favorited: bool }`.

All endpoints auth-gated with `Depends(verify_and_get_user_id_from_jwt)`.

Register in `backend/api.py`.

### Task 7: Favorites Frontend

Create `recoder-agents/src/lib/api/favorites.ts` and `recoder-agents/src/hooks/platform/use-favorites.ts`:

API client: `addFavorite`, `removeFavorite`, `getFavorites`, `checkFavorite`.

Hooks:
- `useFavorites(type?: string)` — list favorites
- `useIsFavorited(itemType, itemId)` — single check
- `useToggleFavorite()` — mutation that adds/removes + invalidates cache

Create `recoder-agents/src/components/ui/favorite-button.tsx`:

Star icon button (filled yellow when favorited, outline when not). Props: `itemType`, `itemId`, `itemName`, `size`. Uses `useIsFavorited` + `useToggleFavorite`.

### Task 8: Favorites Page + Integration

Create `recoder-agents/src/app/(dashboard)/favorites/page.tsx`:

Favorites page:
- Tab filter: All, Agents, Threads, Workflows, Knowledge
- Grid of favorited items with type badge, name, date added, link to item
- Empty state per tab
- Sidebar link with Star icon

Add `FavoriteButton` to:
- Agent card actions (in `agents-grid.tsx` action dropdown)
- Thread header (in `thread-site-header.tsx`)

---

## Phase 3: Real-Time Notification Toasts (Tasks 9-11)

### Task 9: Notification SSE Endpoint

Create `backend/core/notifications/notification_stream_api.py`:

SSE endpoint for real-time notifications:
- `GET /notifications/stream` — Server-Sent Events stream. Auth required.
- On connect: send any unread notifications from last 5 minutes.
- Uses `asyncio.Queue` per connection. Queue is fed by a helper function `push_notification(user_id, data)` that other backend modules call.
- Heartbeat every 30s to keep connection alive.
- Graceful disconnect on client close.

Register in `backend/api.py`.

### Task 10: Notification Toast Provider

Create `recoder-agents/src/components/notifications/notification-toast-provider.tsx`:

Client component that:
- Opens EventSource to `/v1/notifications/stream` on mount (with auth header via custom fetch)
- Parses incoming SSE events
- Shows toast notifications using existing toast system (from shadcn)
- Event types: `agent.completed` (green), `agent.failed` (red), `thread.message` (blue), `system.alert` (amber)
- Each toast: icon, title, message, timestamp, click-to-navigate action
- Max 3 toasts visible at once, auto-dismiss after 5 seconds
- Respects notification preferences from localStorage (set in settings/notifications page)

Add to app layout.tsx inside providers.

### Task 11: Notification History Enhancement

Modify `recoder-agents/src/components/notifications/notification-dropdown.tsx`:

Add:
- Group notifications by date (Today, Yesterday, This Week, Older)
- "Mark all as read" bulk action
- Click notification to navigate to related item
- Unread count badge on notification bell (already exists but wire to real data)
- Empty state: "No notifications yet"

---

## Phase 4: Onboarding Tour & Tips (Tasks 12-15)

### Task 12: Feature Tour Framework

Create `recoder-agents/src/components/onboarding/feature-tour.tsx`:

Lightweight tooltip tour component:
- `FeatureTour` wrapper: manages step state, renders highlight overlay + tooltip
- `TourStep` config: `{ target: string (CSS selector), title, description, position: 'top'|'bottom'|'left'|'right' }`
- Navigation: "Next" / "Skip Tour" / step dots
- Stores completion in localStorage: `tour-{tourId}-completed`
- Overlay: semi-transparent backdrop with cutout around target element

### Task 13: Dashboard Tour

Create `recoder-agents/src/components/onboarding/tours/dashboard-tour.ts`:

Tour steps for new users hitting the dashboard first time:
1. Sidebar agents section: "Your AI agents live here. Create one to get started."
2. New agent button: "Click here to create your first agent."
3. Knowledge base link: "Upload documents for your agents to reference."
4. Global search: "Press Cmd+K to search across everything."
5. App switcher: "Switch between Recoder apps here."

Trigger: show if `tour-dashboard-completed` is not set AND user has < 2 agents.

### Task 14: Agent Config Tour

Create `recoder-agents/src/components/onboarding/tours/agent-config-tour.ts`:

Tour steps for users who just created their first agent:
1. Instructions tab: "Write what your agent should do."
2. Tools tab: "Choose what capabilities your agent has."
3. Knowledge tab: "Connect documents for your agent to reference."
4. Triggers tab: "Set up automatic triggers to run your agent."
5. Analytics tab: "Track your agent's performance here."

Trigger: show on agent config page if `tour-agent-config-completed` is not set AND agent has default instructions.

### Task 15: Contextual Tips Component

Create `recoder-agents/src/components/onboarding/contextual-tip.tsx`:

Small inline tip component:
- Renders as a subtle info banner (blue-50 bg, blue-600 text)
- Props: `tipId`, `title`, `description`, `action?` (button text + onClick)
- Dismissible: X button, stores `tip-{tipId}-dismissed` in localStorage
- Auto-hide after 3 views (stores view count)

Add contextual tips to:
- Empty agents page: "Agents can search the web, write code, and analyze documents."
- Empty knowledge base: "Upload PDFs, docs, or clone a git repo for your agents to reference."
- First thread: "Type a message to start a conversation with your agent."

---

## Phase 5: Quick Agent Actions & Productivity (Tasks 16-19)

### Task 16: Agent Quick Actions Menu

Create `recoder-agents/src/components/agents/agent-quick-actions.tsx`:

Floating action button (bottom-right) on the agents page:
- "New Agent" (primary)
- "Import from Template"
- "Clone from Marketplace"
- "Import JSON Config"
- Speed dial style: click FAB to expand options, click outside to collapse
- Only shows on `/agents` page

### Task 17: Thread Quick Resume

Create `recoder-agents/src/components/thread/quick-resume-bar.tsx`:

Horizontal bar at top of dashboard showing last 3 active threads:
- Thread title (truncated), agent name badge, last message preview, relative time
- Click to navigate to thread
- "Clear" button to dismiss
- Data from existing thread list API, filtered to most recent 3 with messages
- Only shows if user has active threads

### Task 18: Agent Status Overview Cards

Create `recoder-agents/src/components/dashboard/agent-status-cards.tsx`:

Row of small status cards for the dashboard:
- Active Agents (green): count of agents with runs in last 24h
- Idle Agents (gray): agents with no recent activity
- Errored Agents (red): agents with failed runs in last 24h
- Each card clickable, filters agents list by status
- Uses existing analytics data from `useAgentLeaderboard`

Add to `dashboard-content.tsx` above existing content.

### Task 19: Update Status Docs

Update `tasks/todo.md` with Sprint 40 completion status.

---
