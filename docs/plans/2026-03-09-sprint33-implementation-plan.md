# Sprint 33: Cross-App Integration & Platform Maturity

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the 5 Recoder apps into a cohesive platform with unified activity, team collaboration, webhook automation, and production-grade error handling.

**Architecture:** Cross-app features use the Python backend (`api.recoder.xyz`) as the aggregation layer. Frontend features land in `recoder-agents` (primary surface) with shared components. Agency client UX completes the existing schema.

**Tech Stack:** Next.js 15, FastAPI, React Query, Supabase (Postgres + RLS), Novu, SSE, Tailwind CSS

---

## Phase 1: Cross-App Unified Dashboard (Tasks 1-5)

### Task 1: Cross-App Activity Aggregation API

**Files:**
- Create: `backend/core/platform/activity_api.py`
- Modify: `backend/api.py` (register router)

**What:** A FastAPI endpoint that aggregates recent activity from agents, agency, and PM into a single feed.

**Implementation:**
```python
# backend/core/platform/activity_api.py
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.db import execute

router = APIRouter(prefix="/platform", tags=["Platform"])

class ActivityItem(BaseModel):
    id: str
    app: str  # "agents" | "agency" | "pm"
    type: str  # "thread_created" | "workflow_run" | "project_update" | "agent_deployed"
    title: str
    description: Optional[str] = None
    timestamp: datetime
    metadata: Optional[dict] = None

class ActivityFeedResponse(BaseModel):
    items: list[ActivityItem]
    total: int
    has_more: bool

@router.get("/activity", response_model=ActivityFeedResponse, summary="Get cross-app activity feed")
async def get_activity_feed(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
    limit: int = Query(default=20, le=50),
    offset: int = Query(default=0, ge=0),
    app_filter: Optional[str] = Query(default=None),
):
    """Aggregates activity from agents threads, agency projects, and PM features."""
    conditions = ["a.user_id = :user_id"]
    params = {"user_id": user_id, "limit": limit, "offset": offset}

    if app_filter:
        conditions.append("a.app = :app_filter")
        params["app_filter"] = app_filter

    where = " AND ".join(conditions)

    rows = await execute(
        f"""SELECT id, app, type, title, description, timestamp, metadata
            FROM platform_activity a
            WHERE {where}
            ORDER BY timestamp DESC
            LIMIT :limit OFFSET :offset""",
        params
    )

    count_row = await execute(
        f"SELECT count(*) as total FROM platform_activity a WHERE {where}",
        params
    )

    total = count_row[0]["total"] if count_row else 0

    return ActivityFeedResponse(
        items=[ActivityItem(**r) for r in rows],
        total=total,
        has_more=(offset + limit) < total,
    )

@router.get("/stats", summary="Get cross-app summary stats")
async def get_platform_stats(
    user_id: str = Depends(verify_and_get_user_id_from_jwt),
):
    """Quick stat counts across all apps."""
    stats = await execute(
        """SELECT
            (SELECT count(*) FROM agents WHERE account_id = :uid) as agent_count,
            (SELECT count(*) FROM threads WHERE account_id = :uid AND created_at > now() - interval '7 days') as threads_7d,
            (SELECT count(*) FROM workflows WHERE account_id = :uid) as workflow_count,
            (SELECT count(*) FROM agent_analytics_daily WHERE account_id = :uid AND date = current_date) as runs_today
        """,
        {"uid": user_id}
    )
    return stats[0] if stats else {}
```

Register in `backend/api.py`:
```python
from core.platform.activity_api import router as platform_router
app.include_router(platform_router)
```

### Task 2: Platform Activity Database Migration

**Files:**
- Create: `backend/supabase/migrations/20260309400000_platform_activity.sql`

**What:** Activity log table with proper RLS and indexes.

```sql
CREATE TABLE IF NOT EXISTS platform_activity (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    app text NOT NULL CHECK (app IN ('agents', 'agency', 'pm', 'web')),
    type text NOT NULL,
    title text NOT NULL,
    description text,
    timestamp timestamptz NOT NULL DEFAULT now(),
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_activity_user_ts ON platform_activity (user_id, timestamp DESC);
CREATE INDEX idx_platform_activity_app ON platform_activity (app, timestamp DESC);

ALTER TABLE platform_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_activity_user_policy ON platform_activity
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
```

### Task 3: Unified Dashboard Frontend — Activity Feed

**Files:**
- Create: `recoder-agents/src/lib/api/platform.ts`
- Create: `recoder-agents/src/hooks/platform/use-platform-activity.ts`
- Create: `recoder-agents/src/components/dashboard/activity-feed.tsx`

**What:** API client, hook, and component for displaying cross-app activity.

API client (`platform.ts`):
```typescript
import { backendApi } from './streaming';

export interface ActivityItem {
  id: string;
  app: 'agents' | 'agency' | 'pm' | 'web';
  type: string;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityFeedResponse {
  items: ActivityItem[];
  total: number;
  has_more: boolean;
}

export async function getActivityFeed(params?: {
  limit?: number;
  offset?: number;
  app_filter?: string;
}): Promise<ActivityFeedResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  if (params?.app_filter) searchParams.set('app_filter', params.app_filter);
  const qs = searchParams.toString();
  return backendApi.get<ActivityFeedResponse>(`/platform/activity${qs ? `?${qs}` : ''}`);
}

export async function getPlatformStats(): Promise<Record<string, number>> {
  return backendApi.get<Record<string, number>>('/platform/stats');
}
```

Hook (`use-platform-activity.ts`):
```typescript
import { useQuery } from '@tanstack/react-query';
import { getActivityFeed, getPlatformStats } from '@/lib/api/platform';

export function usePlatformActivity(appFilter?: string) {
  return useQuery({
    queryKey: ['platform-activity', appFilter],
    queryFn: () => getActivityFeed({ limit: 20, app_filter: appFilter }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: ['platform-stats'],
    queryFn: getPlatformStats,
    staleTime: 60_000,
  });
}
```

Component (`activity-feed.tsx`): A card-based vertical timeline showing activity items with app badges (color-coded), relative timestamps, and click-to-navigate. Filter tabs for All/Agents/Agency/PM. Empty state when no activity.

### Task 4: Unified Dashboard Frontend — Stats Cards

**Files:**
- Create: `recoder-agents/src/components/dashboard/platform-stats.tsx`
- Modify: `recoder-agents/src/components/dashboard/dashboard-content.tsx`

**What:** Top-of-dashboard stat cards showing agent count, threads this week, workflow count, runs today. Wire stats + activity feed into the main dashboard.

Stats cards: 4 cards in a responsive grid (`grid-cols-2 md:grid-cols-4`). Each card shows icon, label, and count with loading skeleton.

Wire into `dashboard-content.tsx`: Import and render `<PlatformStats />` at top, then `<ActivityFeed />` below existing content.

### Task 5: Cross-App Quick Actions

**Files:**
- Create: `recoder-agents/src/components/dashboard/quick-actions.tsx`

**What:** A row of quick-action buttons below stats: "New Agent", "New Thread", "New Workflow", "View Analytics". Each navigates to the relevant page. Responsive: 2x2 grid on mobile, 1x4 on desktop.

---

## Phase 2: Agent Team Collaboration (Tasks 6-10)

### Task 6: Team Sharing Database Schema

**Files:**
- Create: `backend/supabase/migrations/20260309400001_team_sharing.sql`

```sql
CREATE TABLE IF NOT EXISTS thread_collaborators (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
    invited_by uuid NOT NULL,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS agent_team_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'editor', 'admin')),
    granted_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (agent_id, user_id)
);

ALTER TABLE thread_collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY thread_collab_policy ON thread_collaborators
    FOR ALL USING (
        user_id = auth.uid()
        OR invited_by = auth.uid()
        OR EXISTS (SELECT 1 FROM threads t WHERE t.id = thread_collaborators.thread_id AND t.account_id = auth.uid())
    );

ALTER TABLE agent_team_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_access_policy ON agent_team_access
    FOR ALL USING (
        user_id = auth.uid()
        OR granted_by = auth.uid()
        OR EXISTS (SELECT 1 FROM agents a WHERE a.id = agent_team_access.agent_id AND a.account_id = auth.uid())
    );
```

### Task 7: Team Sharing API Endpoints

**Files:**
- Create: `backend/core/collaboration/sharing_api.py`
- Modify: `backend/api.py` (register router)

**What:** CRUD for thread_collaborators and agent_team_access. Endpoints:
- `POST /collaboration/threads/{thread_id}/share` — invite user by email
- `GET /collaboration/threads/{thread_id}/collaborators` — list collaborators
- `DELETE /collaboration/threads/{thread_id}/collaborators/{user_id}` — remove
- `POST /collaboration/agents/{agent_id}/share` — share agent with team member
- `GET /collaboration/agents/{agent_id}/team` — list team access
- `DELETE /collaboration/agents/{agent_id}/team/{user_id}` — remove

All endpoints require auth via `Depends(verify_and_get_user_id_from_jwt)` and verify ownership.

### Task 8: Thread Share Dialog — Granular Invites

**Files:**
- Create: `recoder-agents/src/lib/api/collaboration.ts`
- Create: `recoder-agents/src/hooks/threads/use-thread-collaborators.ts`
- Modify: `recoder-agents/src/components/sidebar/share-modal.tsx`

**What:** Enhance the existing share modal to add a "Team" tab with:
- Email input to invite collaborators
- Role selector (viewer/editor)
- List of current collaborators with role badges and remove button
- Keep existing public link sharing as separate tab

### Task 9: Agent Team Access UI

**Files:**
- Create: `recoder-agents/src/components/agents/agent-team-access.tsx`
- Modify: `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/page.tsx`

**What:** A new "Team" tab in agent config showing who has access. Email invite with role selector. List of team members with role badges. Owner badge for the creator.

### Task 10: Shared-With-Me Views

**Files:**
- Create: `recoder-agents/src/app/(dashboard)/shared/page.tsx`
- Create: `recoder-agents/src/app/(dashboard)/shared/layout.tsx`
- Modify: `recoder-agents/src/components/sidebar/sidebar-left.tsx`

**What:** A new "Shared with me" page in the sidebar showing threads and agents shared by others. Two sections: Shared Threads and Shared Agents. Each shows the item name, who shared it, role badge, and last activity. Add sidebar link with Users icon.

---

## Phase 3: Webhook & Automation System (Tasks 11-15)

### Task 11: Webhook Delivery Infrastructure

**Files:**
- Create: `backend/core/webhooks/webhook_service.py`
- Create: `backend/supabase/migrations/20260309400002_webhooks.sql`

**What:** Database table for webhook endpoints + delivery log. Service class to send webhook payloads with retry logic (3 attempts, exponential backoff).

Migration:
```sql
CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    url text NOT NULL,
    secret text NOT NULL,
    events text[] NOT NULL DEFAULT '{}',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event text NOT NULL,
    payload jsonb NOT NULL,
    response_status int,
    response_body text,
    attempts int NOT NULL DEFAULT 0,
    next_retry_at timestamptz,
    delivered_at timestamptz,
    failed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_endpoints_policy ON webhook_endpoints
    FOR ALL USING (account_id = auth.uid()) WITH CHECK (account_id = auth.uid());

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_policy ON webhook_deliveries
    FOR ALL USING (EXISTS (
        SELECT 1 FROM webhook_endpoints we
        WHERE we.id = webhook_deliveries.webhook_id AND we.account_id = auth.uid()
    ));
```

Service: `WebhookService` class with `send(account_id, event, payload)` that:
1. Looks up active endpoints matching the event
2. Signs payload with HMAC-SHA256 using endpoint secret
3. POSTs to URL with `X-Recoder-Signature` header
4. Logs delivery in `webhook_deliveries`
5. Schedules retry on failure

### Task 12: Webhook Management API

**Files:**
- Create: `backend/core/webhooks/webhook_api.py`
- Modify: `backend/api.py` (register router)

**What:** CRUD endpoints for webhook_endpoints:
- `POST /webhooks` — create endpoint (url, events, secret auto-generated)
- `GET /webhooks` — list endpoints
- `GET /webhooks/{id}` — get endpoint with recent deliveries
- `PATCH /webhooks/{id}` — update (url, events, active)
- `DELETE /webhooks/{id}` — delete
- `POST /webhooks/{id}/test` — send test payload
- `GET /webhooks/{id}/deliveries` — list deliveries with status
- `POST /webhooks/deliveries/{id}/retry` — manually retry failed delivery

### Task 13: Webhook Management UI

**Files:**
- Create: `recoder-agents/src/lib/api/webhooks.ts`
- Create: `recoder-agents/src/hooks/platform/use-webhooks.ts`
- Create: `recoder-agents/src/app/(dashboard)/developers/webhooks/page.tsx`
- Modify: `recoder-agents/src/app/(dashboard)/developers/layout.tsx`

**What:** A "Webhooks" tab in the developers section. UI shows:
- List of webhook endpoints with active toggle
- Create dialog: URL input, event multi-select checklist, auto-generated secret (copyable)
- Endpoint detail: recent deliveries with status badges (delivered/failed/pending), payload preview, retry button
- Test button sends sample payload

### Task 14: Event Emission — Wire Webhook Triggers

**Files:**
- Modify: `backend/core/agents/agent_service.py`
- Modify: `backend/core/threads/api.py`

**What:** Emit webhook events at key lifecycle points:
- `agent.created`, `agent.updated`, `agent.deleted`
- `thread.created`, `thread.completed`, `thread.failed`
- `workflow.executed`, `workflow.completed`, `workflow.failed`

Each emitter calls `webhook_service.send(account_id, event_name, payload)` after the main operation succeeds.

### Task 15: Webhook Documentation

**Files:**
- Create: `docs/sdk/webhooks.md`

**What:** Document all webhook events, payload schemas, signature verification, and retry behavior. Include code examples in Python and TypeScript for verifying HMAC signatures.

---

## Phase 4: Agency Client Experience (Tasks 16-20)

### Task 16: Milestone Approval UI for Client Portal

**Files:**
- Create: `recoder-agency/apps/agency/app/(client)/portal/projects/[projectId]/milestones/page.tsx`

**What:** Client-facing page showing project milestones/deliverables with approval buttons. Each milestone card shows: title, description, status (pending/approved/rejected/revision_requested), due date, attached files preview. Action buttons: Approve, Request Revision (with comment field). Uses the existing `milestoneApprovals` schema.

### Task 17: Client Notification Digest

**Files:**
- Create: `recoder-agency/apps/agency/lib/notifications/client-digest.ts`
- Create: `recoder-agency/apps/agency/app/api/cron/client-digest/route.ts`

**What:** A daily digest email for agency clients summarizing:
- New deliverables ready for review
- Project status changes
- Upcoming milestones
- Quote/SOW updates awaiting action

Implemented as a cron-triggered API route that queries pending items per client and sends via existing email service.

### Task 18: Client Activity Timeline

**Files:**
- Create: `recoder-agency/apps/agency/app/(client)/portal/projects/[projectId]/timeline/page.tsx`

**What:** A timeline view for each project showing all status transitions, deliverable submissions, approvals, and comments. Uses the existing `projectStatusTransitions` table. Each entry shows: timestamp, actor, action, and optional comment. Filterable by type.

### Task 19: Agency Dashboard — Revenue Overview

**Files:**
- Create: `recoder-agency/apps/agency/app/(admin)/revenue/page.tsx`

**What:** Revenue dashboard for agency operators:
- Monthly recurring revenue from active projects
- Revenue by client (bar chart)
- Outstanding invoices and payment status
- Project profitability (revenue - AI cost - time cost)
- Uses existing `invoices` and `quotes` tables

### Task 20: Agency Showcase — Featured Items

**Files:**
- Modify: `recoder-agency/apps/agency/app/(main)/lobby/lobby-client.tsx`
- Modify: `recoder-agency/apps/agency/app/(main)/lobby/actions.ts`

**What:** Implement the "Featured items" section that's currently a TODO comment in the lobby. Show curated/pinned workflows and apps. Add a "Feature" button for team admins. Featured items appear in a highlighted section at the top of the lobby.

---

## Phase 5: Production Polish & Error Handling (Tasks 21-25)

### Task 21: Global Error Boundaries

**Files:**
- Create: `recoder-agents/src/components/ui/error-boundary.tsx`
- Modify: `recoder-agents/src/app/(dashboard)/error.tsx`
- Modify: `recoder-agents/src/app/error.tsx`

**What:** A reusable error boundary component with:
- Friendly error message with retry button
- "Report this issue" link
- Collapsible error details for debugging
- Different styles for page-level vs component-level errors
Wire into existing error.tsx pages.

### Task 22: Suspense Loading States

**Files:**
- Create: `recoder-agents/src/components/ui/page-skeleton.tsx`
- Modify: `recoder-agents/src/app/(dashboard)/agents/config/[agentId]/screens/analytics-screen.tsx`
- Modify: `recoder-agents/src/app/(dashboard)/billing/cost-dashboard/page.tsx`

**What:** Standardized loading skeletons for dashboard pages. Consistent shimmer animation. Replace any raw "Loading..." text with proper skeletons.

### Task 23: Empty State Components

**Files:**
- Create: `recoder-agents/src/components/ui/empty-state.tsx`
- Modify: `recoder-agents/src/app/(dashboard)/shared/page.tsx` (if created in Task 10)

**What:** Reusable empty state component with:
- Icon, title, description, and optional CTA button
- Variants: no-data, no-results, error, no-access
- Use consistently across new pages (shared, webhooks, activity feed)

### Task 24: API Error Toast Improvements

**Files:**
- Modify: `recoder-agents/src/lib/error-handler.ts`

**What:** Improve error handling:
- Parse backend error responses to show user-friendly messages
- Rate-limit toast notifications (max 3 per 10 seconds)
- Add "Copy error details" button for support
- Distinguish between network errors, auth errors, and server errors

### Task 25: Update Status Docs

**Files:**
- Modify: `tasks/todo.md`
- Modify: `tasks/lessons.md`

**What:** Add Sprint 33 completion status with all task results. Add any new lessons learned.
