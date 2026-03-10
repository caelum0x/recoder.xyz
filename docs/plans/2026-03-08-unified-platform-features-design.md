# Unified Platform Features — Design

> **Approved:** 2026-03-08

**Goal:** Add shared notifications (multi-channel), unified settings sync, cross-app project tagging, a single cross-app dashboard, and billing awareness across all Recoder apps.

**Architecture:** Central API hub on `recoder.xyz`. Other apps are thin consumers that POST events and GET data via internal service auth (existing HMAC) or session cookies (cross-subdomain). No event bus or message queue — synchronous HTTP within the same Hetzner box.

**Decisions:**
- PM marketing surface: workspace-only, no public landing page
- Notifications: full multi-channel (in-app + email + push) via Novu production activation
- Settings sync: eventual via shared auth DB (no active propagation)
- Project linking: loose ecosystem tags (not a central registry)
- Billing: hybrid — passive badge everywhere, active enforcement via central API 403s

---

## 1. Shared Notifications (Multi-Channel)

### Data Flow

```
App event (e.g., agent completes task)
  -> POST recoder.xyz/api/platform/events (internal service auth)
    -> Handler:
      1. Write to `notifications` table (in-app)
      2. Check user's `notification_settings`
      3. If email enabled -> send via Resend
      4. If push enabled -> send via Web Push
    -> Each app's <NotificationBell> polls GET /api/platform/notifications
```

### API Endpoints (on recoder.xyz)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/platform/events` | POST | Internal service | Receive events from any app |
| `/api/platform/notifications` | GET | Session cookie | List user's notifications |
| `/api/platform/notifications/[id]/read` | PATCH | Session cookie | Mark as read |
| `/api/platform/notifications/read-all` | POST | Session cookie | Mark all read |
| `/api/platform/notifications/settings` | GET/PUT | Session cookie | User notification preferences |

### Event Schema

```typescript
{
  type: "agent.task.completed" | "pm.feature.updated" | "agency.deliverable.ready" | ...,
  userId: string,
  title: string,
  message: string,
  sourceApp: "agents" | "agency" | "pm" | "web",
  actionUrl?: string,
  channels?: ("in_app" | "email" | "push")[]
}
```

### Shared Component

`<NotificationBell>` in `@recoder/ui` package:
- Fetches from `recoder.xyz/api/platform/notifications` with session cookie
- Shows unread count badge
- Renders dropdown with notification list
- Supports mark-read and click-through to `actionUrl`

---

## 2. Unified Settings (Eventual Sync)

No new infrastructure. Already works via shared auth DB:

1. User updates profile on `recoder.xyz/settings/profile`
2. Change writes to Better Auth `user` table
3. Other apps read updated data on next `verifySession()` call

### One Patch Needed

Agency's `ensureProfile()` (`recoder-agency/apps/agency/lib/auth/server.ts`) currently only creates users on first visit. Patch to also update `displayName` and `avatarUrl` when they differ from auth source.

---

## 3. Cross-App Project Linking (Ecosystem Tags)

### Data Model (app DB)

```prisma
model ecosystem_tags {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  color     String?
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users     users    @relation(fields: [userId], references: [id])
  items     ecosystem_tag_items[]
}

model ecosystem_tag_items {
  id         String   @id @default(uuid())
  tagId      String
  sourceApp  String
  externalId String
  label      String
  itemType   String
  itemUrl    String
  createdAt  DateTime @default(now())

  tag        ecosystem_tags @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([tagId, sourceApp, externalId])
}
```

### API Endpoints (on recoder.xyz)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/platform/tags` | GET/POST | Session cookie | List/create tags |
| `/api/platform/tags/[id]` | PUT/DELETE | Session cookie | Update/delete tag |
| `/api/platform/tags/[id]/items` | GET/POST | Session cookie | List/link items |
| `/api/platform/tags/[id]/items/[itemId]` | DELETE | Session cookie | Unlink item |

### App Integration

Each app adds a "Tag" button on entity views. Fetches user's tags via session cookie, POSTs item link with `sourceApp`, `externalId`, `label`, `itemType`, `itemUrl`.

---

## 4. Single Cross-App Dashboard

### Location

`recoder.xyz/dashboard` (existing auth-gated route, extended).

### Data Flow

```
User visits /dashboard
  -> Server fetches in parallel (3s timeout each):
    1. Local: notifications, subscription, ecosystem tags
    2. GET agents.recoder.xyz/api/platform/activity (internal service auth)
    3. GET agency.recoder.xyz/api/platform/activity (internal service auth)
    4. GET pm.recoder.xyz/api/platform/activity (internal service auth)
    5. GET web.recoder.xyz/api/platform/activity (internal service auth)
  -> Renders unified dashboard
```

### Per-App Activity Endpoint

Each app exposes `GET /api/platform/activity` (internal service auth):

```typescript
{
  app: "agents" | "agency" | "pm" | "web",
  stats: {
    totalItems: number,
    activeItems: number,
    lastActivityAt: string | null,
  },
  recentActivity: Array<{
    id: string,
    type: string,
    title: string,
    timestamp: string,
    url: string,
  }>,
}
```

### Dashboard Sections

1. Quick stats bar: plan badge, unread notifications, total items
2. Activity feed: merged timeline from all apps, sorted by timestamp
3. Tagged projects: grouped by ecosystem tag
4. App grid: cards with stats + "Open" link

### Resilience

3-second timeout per app. If down, section shows "Unavailable" with retry. Dashboard never fails entirely.

---

## 5. Billing Awareness (Hybrid)

### Passive: Subscription Badge

`<SubscriptionBadge>` in `@recoder/ui`:
- Fetches plan from `recoder.xyz/api/user/subscription` (session cookie, already exists)
- Caches in memory, refreshes every 5 minutes or on window focus
- Shows plan name pill; on free plan shows orange "Upgrade" link to `recoder.xyz/billing/upgrade`

### Active: Central API 403s

When plan limits are hit, central API returns:

```json
{
  "error": "plan_limit_exceeded",
  "limit": "notifications_per_day",
  "current": 100,
  "max": 100,
  "upgradeUrl": "https://recoder.xyz/billing/upgrade"
}
```

Apps catch 403 and show contextual upgrade prompt.

### No Per-App Enforcement

Apps do not duplicate plan limit logic. Central API is the single enforcement point.

---

## Shared UI Package: @recoder/ui

New package at `packages/ui/` exporting:
- `<NotificationBell>` — notification dropdown
- `<SubscriptionBadge>` — plan badge + upgrade link
- `<EcosystemTagPicker>` — tag selector for linking items

All components are React, styled with Tailwind, and fetch from `recoder.xyz` via session cookie.

---

## What's NOT In Scope

- Real-time WebSocket notifications (polling is sufficient for v1)
- PM marketing landing page (workspace-only)
- Active settings propagation (eventual sync is enough)
- Central project registry (tags are sufficient for v1)
- Per-app feature gating logic (central API enforces)
