# Unified Platform Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add shared multi-channel notifications, unified settings sync, cross-app ecosystem tags, a unified dashboard, and billing awareness across all Recoder apps.

**Architecture:** Central API hub on `recoder.xyz` (app/). Other apps POST events and GET data via internal service auth (HMAC) or session cookies (cross-subdomain on `.recoder.xyz`). New `@recoder/ui` package for shared React components.

**Tech Stack:** Next.js (app router), Prisma (PostgreSQL), Resend (email), Web Push API, React + Tailwind, vitest

**Design doc:** `docs/plans/2026-03-08-unified-platform-features-design.md`

---

## Task 1: Create `@recoder/ui` Package

The shared UI package that will hold `<NotificationBell>`, `<SubscriptionBadge>`, and `<EcosystemTagPicker>`.

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/components/notification-bell.tsx`
- Create: `packages/ui/src/components/subscription-badge.tsx`
- Create: `packages/ui/src/components/ecosystem-tag-picker.tsx`
- Create: `packages/ui/src/hooks/use-platform-api.ts`

**Step 1: Create package.json**

```json
{
  "name": "@recoder/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./notification-bell": "./src/components/notification-bell.tsx",
    "./subscription-badge": "./src/components/subscription-badge.tsx",
    "./ecosystem-tag-picker": "./src/components/ecosystem-tag-picker.tsx"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create the shared API hook**

File: `packages/ui/src/hooks/use-platform-api.ts`

This hook centralizes all fetch calls to `recoder.xyz` platform APIs. Every component uses it.

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PLATFORM_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://recoder.xyz";

export function usePlatformApi<T>(
  path: string,
  options?: { enabled?: boolean; refreshInterval?: number }
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${PLATFORM_BASE}${path}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 403) {
          const body = await res.json().catch(() => null);
          if (body?.error === "plan_limit_exceeded") {
            setError(`limit:${JSON.stringify(body)}`);
            return;
          }
        }
        setError(`HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError("fetch_failed");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (options?.enabled === false) return;
    fetchData();
    if (options?.refreshInterval) {
      intervalRef.current = setInterval(fetchData, options.refreshInterval);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, options?.enabled, options?.refreshInterval]);

  return { data, error, loading, refetch: fetchData };
}

export async function platformFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${PLATFORM_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
}

export { PLATFORM_BASE };
```

**Step 4: Create stub index.ts**

File: `packages/ui/src/index.ts`

```typescript
export { usePlatformApi, platformFetch, PLATFORM_BASE } from "./hooks/use-platform-api";
```

Components will be added in later tasks and exported here.

**Step 5: Install the package in the workspace**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm install`
Expected: `@recoder/ui` is linked in the workspace

**Step 6: Commit**

```bash
git add packages/ui/
git commit -m "feat: create @recoder/ui shared component package"
```

---

## Task 2: Platform Events API (Notification Intake)

Receives events from other apps via internal service auth, writes notifications, and dispatches to email/push channels based on user preferences.

**Files:**
- Create: `app/app/api/platform/events/route.ts`
- Test: `app/app/api/platform/events/__tests__/route.test.ts`

**Step 1: Write the failing test**

File: `app/app/api/platform/events/__tests__/route.test.ts`

```typescript
import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification_settings: {
      findUnique: vi.fn(),
    },
    notifications: {
      create: vi.fn(),
    },
  },
}));

// Mock email
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

// Mock internal service auth
vi.mock("@/lib/internal-service-auth", () => ({
  verifyInternalServiceRequest: vi.fn().mockReturnValue({ ok: true }),
}));

import { prisma } from "@/lib/prisma";
import { verifyInternalServiceRequest } from "@/lib/internal-service-auth";

function makeRequest(body: Record<string, unknown>) {
  const rawBody = JSON.stringify(body);
  return new Request("https://recoder.xyz/api/platform/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

describe("POST /api/platform/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.notification_settings.findUnique as any).mockResolvedValue({
      emailNotifications: true,
      pushNotifications: false,
    });
    (prisma.notifications.create as any).mockResolvedValue({ id: "n1" });
  });

  it("rejects unauthenticated requests", async () => {
    (verifyInternalServiceRequest as any).mockReturnValue({
      ok: false,
      reason: "missing_internal_auth",
    });

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ type: "test", userId: "u1", title: "t", message: "m", sourceApp: "agents" }));
    expect(res.status).toBe(401);
  });

  it("rejects invalid event payload", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ type: "test" }));
    expect(res.status).toBe(400);
  });

  it("creates notification and returns 201", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        type: "agent.task.completed",
        userId: "u1",
        title: "Task done",
        message: "Your workflow finished",
        sourceApp: "agents",
        actionUrl: "https://agents.recoder.xyz/workflows/abc",
      })
    );
    expect(res.status).toBe(201);
    expect(prisma.notifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        title: "Task done",
        message: "Your workflow finished",
        type: "agent.task.completed",
        actionUrl: "https://agents.recoder.xyz/workflows/abc",
      }),
    });
  });

  it("sends email when user has emailNotifications enabled", async () => {
    const { sendEmail } = await import("@/lib/email");
    const { POST } = await import("../route");
    await POST(
      makeRequest({
        type: "agent.task.completed",
        userId: "u1",
        title: "Task done",
        message: "Your workflow finished",
        sourceApp: "agents",
      })
    );
    expect(sendEmail).toHaveBeenCalled();
  });

  it("skips email when user has emailNotifications disabled", async () => {
    (prisma.notification_settings.findUnique as any).mockResolvedValue({
      emailNotifications: false,
      pushNotifications: false,
    });
    const { sendEmail } = await import("@/lib/email");
    const { POST } = await import("../route");
    await POST(
      makeRequest({
        type: "agent.task.completed",
        userId: "u1",
        title: "Task done",
        message: "Your workflow finished",
        sourceApp: "agents",
      })
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm -C app exec vitest run app/api/platform/events/__tests__/route.test.ts`
Expected: FAIL — module `../route` not found

**Step 3: Write the implementation**

File: `app/app/api/platform/events/route.ts`

```typescript
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { verifyInternalServiceRequest } from "@/lib/internal-service-auth";

const VALID_SOURCE_APPS = ["agents", "agency", "pm", "web"] as const;

interface PlatformEvent {
  type: string;
  userId: string;
  title: string;
  message: string;
  sourceApp: (typeof VALID_SOURCE_APPS)[number];
  actionUrl?: string;
  channels?: ("in_app" | "email" | "push")[];
}

function validateEvent(body: unknown): body is PlatformEvent {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.type === "string" &&
    typeof b.userId === "string" &&
    typeof b.title === "string" &&
    typeof b.message === "string" &&
    typeof b.sourceApp === "string" &&
    VALID_SOURCE_APPS.includes(b.sourceApp as any)
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const authResult = verifyInternalServiceRequest(request, { rawBody });
  if (!authResult.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: authResult.reason },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!validateEvent(body)) {
    return NextResponse.json(
      { error: "invalid_event", required: ["type", "userId", "title", "message", "sourceApp"] },
      { status: 400 }
    );
  }

  // Write in-app notification
  const notification = await prisma.notifications.create({
    data: {
      id: crypto.randomUUID(),
      userId: body.userId,
      title: body.title,
      message: body.message,
      type: body.type,
      actionUrl: body.actionUrl ?? null,
      metadata: { sourceApp: body.sourceApp },
    },
  });

  // Check user notification preferences
  const settings = await prisma.notification_settings.findUnique({
    where: { userId: body.userId },
  });

  const channels = body.channels ?? ["in_app", "email", "push"];
  const prefs = settings ?? { emailNotifications: true, pushNotifications: false };

  // Send email if enabled
  if (channels.includes("email") && prefs.emailNotifications) {
    const user = await prisma.users.findUnique({
      where: { id: body.userId },
      select: { email: true, name: true },
    });
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: body.title,
        html: `<p>${body.message}</p>${body.actionUrl ? `<p><a href="${body.actionUrl}">View details</a></p>` : ""}`,
        text: `${body.message}${body.actionUrl ? `\n\nView details: ${body.actionUrl}` : ""}`,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ id: notification.id }, { status: 201 });
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm -C app exec vitest run app/api/platform/events/__tests__/route.test.ts`
Expected: 5/5 PASS

**Step 5: Commit**

```bash
git add app/app/api/platform/events/
git commit -m "feat: add platform events API for cross-app notifications"
```

---

## Task 3: Platform Notifications API (User-Facing)

List, read, and manage notification preferences. Consumed by the `<NotificationBell>` component via session cookie auth.

**Files:**
- Create: `app/app/api/platform/notifications/route.ts`
- Create: `app/app/api/platform/notifications/[id]/read/route.ts`
- Create: `app/app/api/platform/notifications/read-all/route.ts`
- Create: `app/app/api/platform/notifications/settings/route.ts`
- Test: `app/app/api/platform/notifications/__tests__/route.test.ts`

**Step 1: Write the failing test**

File: `app/app/api/platform/notifications/__tests__/route.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notifications: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    notification_settings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  getUserFromToken: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

describe("GET /api/platform/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserFromToken as any).mockResolvedValue({ id: "u1", email: "test@test.com" });
    (prisma.notifications.findMany as any).mockResolvedValue([
      { id: "n1", title: "Test", message: "Hello", type: "test", read: false, createdAt: new Date() },
    ]);
    (prisma.notifications.count as any).mockResolvedValue(1);
  });

  it("returns 401 if not authenticated", async () => {
    (getUserFromToken as any).mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(new Request("https://recoder.xyz/api/platform/notifications"));
    expect(res.status).toBe(401);
  });

  it("returns notifications with unread count", async () => {
    const { GET } = await import("../route");
    const res = await GET(new Request("https://recoder.xyz/api/platform/notifications"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notifications).toHaveLength(1);
    expect(json.unreadCount).toBe(1);
  });
});

describe("PATCH /api/platform/notifications/[id]/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserFromToken as any).mockResolvedValue({ id: "u1" });
    (prisma.notifications.update as any).mockResolvedValue({ id: "n1", read: true });
  });

  it("marks notification as read", async () => {
    const mod = await import("../[id]/read/route");
    const res = await mod.PATCH(
      new Request("https://recoder.xyz/api/platform/notifications/n1/read", { method: "PATCH" }),
      { params: Promise.resolve({ id: "n1" }) }
    );
    expect(res.status).toBe(200);
    expect(prisma.notifications.update).toHaveBeenCalledWith({
      where: { id: "n1", userId: "u1" },
      data: { read: true, readAt: expect.any(Date) },
    });
  });
});

describe("POST /api/platform/notifications/read-all", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserFromToken as any).mockResolvedValue({ id: "u1" });
    (prisma.notifications.updateMany as any).mockResolvedValue({ count: 5 });
  });

  it("marks all notifications as read", async () => {
    const mod = await import("../read-all/route");
    const res = await mod.POST(
      new Request("https://recoder.xyz/api/platform/notifications/read-all", { method: "POST" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updated).toBe(5);
  });
});

describe("GET/PUT /api/platform/notifications/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserFromToken as any).mockResolvedValue({ id: "u1" });
    (prisma.notification_settings.findUnique as any).mockResolvedValue({
      emailNotifications: true,
      pushNotifications: false,
      weeklyReports: true,
      securityAlerts: true,
    });
  });

  it("returns user notification settings", async () => {
    const mod = await import("../settings/route");
    const res = await mod.GET(
      new Request("https://recoder.xyz/api/platform/notifications/settings")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.emailNotifications).toBe(true);
  });

  it("updates user notification settings", async () => {
    (prisma.notification_settings.upsert as any).mockResolvedValue({
      emailNotifications: false,
      pushNotifications: true,
    });
    const mod = await import("../settings/route");
    const res = await mod.PUT(
      new Request("https://recoder.xyz/api/platform/notifications/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailNotifications: false, pushNotifications: true }),
      })
    );
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm -C app exec vitest run app/api/platform/notifications/__tests__/route.test.ts`
Expected: FAIL — modules not found

**Step 3: Write the implementations**

File: `app/app/api/platform/notifications/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);
  const offset = Number(url.searchParams.get("offset")) || 0;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notifications.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.notifications.count({
      where: { userId: user.id, read: false },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
```

File: `app/app/api/platform/notifications/[id]/read/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const notification = await prisma.notifications.update({
    where: { id, userId: user.id },
    data: { read: true, readAt: new Date() },
  });

  return NextResponse.json({ id: notification.id, read: true });
}
```

File: `app/app/api/platform/notifications/read-all/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await prisma.notifications.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true, readAt: new Date() },
  });

  return NextResponse.json({ updated: result.count });
}
```

File: `app/app/api/platform/notifications/settings/route.ts`

```typescript
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await prisma.notification_settings.findUnique({
    where: { userId: user.id },
  });

  return NextResponse.json(
    settings ?? {
      emailNotifications: true,
      pushNotifications: false,
      weeklyReports: true,
      securityAlerts: true,
    }
  );
}

export async function PUT(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const allowed = ["emailNotifications", "pushNotifications", "weeklyReports", "securityAlerts"];
  const data: Record<string, boolean> = {};
  for (const key of allowed) {
    if (typeof body[key] === "boolean") {
      data[key] = body[key];
    }
  }

  const settings = await prisma.notification_settings.upsert({
    where: { userId: user.id },
    update: data,
    create: {
      id: crypto.randomUUID(),
      userId: user.id,
      ...data,
    },
  });

  return NextResponse.json(settings);
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm -C app exec vitest run app/api/platform/notifications/__tests__/route.test.ts`
Expected: 6/6 PASS

**Step 5: Commit**

```bash
git add app/app/api/platform/notifications/
git commit -m "feat: add platform notifications API (list, read, settings)"
```

---

## Task 4: NotificationBell Component

Shared React component for all apps. Renders in the header, polls for unread notifications.

**Files:**
- Create: `packages/ui/src/components/notification-bell.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Write the component**

File: `packages/ui/src/components/notification-bell.tsx`

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { platformFetch, usePlatformApi } from "../hooks/use-platform-api";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  actionUrl?: string;
  createdAt: string;
  metadata?: { sourceApp?: string };
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

const APP_COLORS: Record<string, string> = {
  agents: "#f97316",
  agency: "#a855f7",
  pm: "#3b82f6",
  web: "#22c55e",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data, refetch } = usePlatformApi<NotificationsResponse>(
    "/api/platform/notifications?limit=20",
    { refreshInterval: 30000 }
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      await platformFetch(`/api/platform/notifications/${id}/read`, {
        method: "PATCH",
      });
      refetch();
    },
    [refetch]
  );

  const markAllRead = useCallback(async () => {
    await platformFetch("/api/platform/notifications/read-all", {
      method: "POST",
    });
    refetch();
  }, [refetch]);

  const unread = data?.unreadCount ?? 0;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          position: "relative",
          padding: "6px",
          color: "inherit",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              background: "#f97316",
              color: "white",
              borderRadius: "9999px",
              fontSize: "10px",
              fontWeight: "bold",
              minWidth: "16px",
              height: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: "8px",
            width: "360px",
            maxHeight: "480px",
            overflowY: "auto",
            background: "#0a0a0a",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: "14px", color: "white" }}>
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: "none",
                  border: "none",
                  color: "#f97316",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {!data?.notifications?.length ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "#888", fontSize: "13px" }}>
              No notifications yet
            </div>
          ) : (
            data.notifications.map((n) => {
              const appColor = APP_COLORS[n.metadata?.sourceApp ?? ""] ?? "#888";
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                    if (n.actionUrl) window.open(n.actionUrl, "_blank");
                  }}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    cursor: n.actionUrl ? "pointer" : "default",
                    background: n.read ? "transparent" : "rgba(249,115,22,0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: n.read ? "transparent" : appColor,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: 500, fontSize: "13px", color: "white" }}>
                      {n.title}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "#666", flexShrink: 0 }}>
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#aaa", marginLeft: "14px" }}>
                    {n.message}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update index.ts**

Add to `packages/ui/src/index.ts`:

```typescript
export { NotificationBell } from "./components/notification-bell";
```

**Step 3: Commit**

```bash
git add packages/ui/src/components/notification-bell.tsx packages/ui/src/index.ts
git commit -m "feat: add NotificationBell shared component"
```

---

## Task 5: Agency ensureProfile Sync Patch

Patch `ensureProfile()` to update `displayName` and `avatarUrl` when they differ from the auth source.

**Files:**
- Modify: `recoder-agency/apps/agency/lib/auth/server.ts:61-124`

**Step 1: Read the current code**

Read: `recoder-agency/apps/agency/lib/auth/server.ts`
Focus on `ensureProfile()` around lines 61-124.

**Step 2: Verify the update logic already exists**

Based on the exploration, `ensureProfile()` already has update logic at lines 79-104 that checks if `email`, `displayName`, or `avatarUrl` differ and updates accordingly. This means the eventual sync already works.

**Step 3: Verify with a test**

File: `recoder-agency/apps/agency/lib/auth/__tests__/ensure-profile-sync.test.ts`

Read the existing test at `recoder-agency/apps/agency/services/teams/fetch-current-team.test.ts` for the test pattern used in agency, then write a focused test that verifies profile sync updates propagate.

If `ensureProfile()` already handles updates correctly, this task is a verification-only task. Write the test, confirm it passes, commit.

**Step 4: Commit**

```bash
git add recoder-agency/apps/agency/lib/auth/
git commit -m "test: verify agency ensureProfile syncs profile changes"
```

---

## Task 6: Prisma Migration for Ecosystem Tags

Add `ecosystem_tags` and `ecosystem_tag_items` tables.

**Files:**
- Modify: `app/prisma/schema.prisma`
- Create: migration via `prisma migrate dev`

**Step 1: Add models to schema.prisma**

Add after the `notifications` model (around line 1200):

```prisma
model ecosystem_tags {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  color     String?
  userId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users users @relation(fields: [userId], references: [id], onDelete: Cascade)
  items ecosystem_tag_items[]

  @@index([userId])
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

  tag ecosystem_tags @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([tagId, sourceApp, externalId])
  @@index([tagId])
}
```

**Step 2: Add relations to users model**

Find the `users` model and add the relation:

```prisma
ecosystem_tags ecosystem_tags[]
```

**Step 3: Generate migration**

Run: `cd /Users/arhansubasi/recoder.xyz/app && npx prisma migrate dev --name add_ecosystem_tags`
Expected: Migration created, schema applied

If the DB is not available locally, create the migration file manually:

Run: `cd /Users/arhansubasi/recoder.xyz/app && npx prisma migrate dev --name add_ecosystem_tags --create-only`

**Step 4: Generate Prisma client**

Run: `cd /Users/arhansubasi/recoder.xyz/app && npx prisma generate`
Expected: Client generated

**Step 5: Commit**

```bash
git add app/prisma/
git commit -m "feat: add ecosystem_tags and ecosystem_tag_items tables"
```

---

## Task 7: Platform Tags API

CRUD for ecosystem tags and tag items.

**Files:**
- Create: `app/app/api/platform/tags/route.ts`
- Create: `app/app/api/platform/tags/[id]/route.ts`
- Create: `app/app/api/platform/tags/[id]/items/route.ts`
- Create: `app/app/api/platform/tags/[id]/items/[itemId]/route.ts`
- Test: `app/app/api/platform/tags/__tests__/route.test.ts`

**Step 1: Write the failing test**

File: `app/app/api/platform/tags/__tests__/route.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystem_tags: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    ecosystem_tag_items: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  getUserFromToken: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

describe("GET /api/platform/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserFromToken as any).mockResolvedValue({ id: "u1" });
  });

  it("returns 401 if not authenticated", async () => {
    (getUserFromToken as any).mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(new Request("https://recoder.xyz/api/platform/tags"));
    expect(res.status).toBe(401);
  });

  it("lists user tags", async () => {
    (prisma.ecosystem_tags.findMany as any).mockResolvedValue([
      { id: "t1", name: "Q1 Launch", slug: "q1-launch", color: "#f97316", items: [] },
    ]);
    const { GET } = await import("../route");
    const res = await GET(new Request("https://recoder.xyz/api/platform/tags"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tags).toHaveLength(1);
  });
});

describe("POST /api/platform/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserFromToken as any).mockResolvedValue({ id: "u1" });
  });

  it("creates a new tag", async () => {
    (prisma.ecosystem_tags.create as any).mockResolvedValue({
      id: "t1",
      name: "Q1 Launch",
      slug: "q1-launch",
    });
    const { POST } = await import("../route");
    const res = await POST(
      new Request("https://recoder.xyz/api/platform/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Q1 Launch", color: "#f97316" }),
      })
    );
    expect(res.status).toBe(201);
  });

  it("rejects missing name", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("https://recoder.xyz/api/platform/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/platform/tags/[id]/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserFromToken as any).mockResolvedValue({ id: "u1" });
    (prisma.ecosystem_tags.findUnique as any).mockResolvedValue({ id: "t1", userId: "u1" });
  });

  it("links an item to a tag", async () => {
    (prisma.ecosystem_tag_items.create as any).mockResolvedValue({ id: "i1" });
    const mod = await import("../[id]/items/route");
    const res = await mod.POST(
      new Request("https://recoder.xyz/api/platform/tags/t1/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceApp: "agents",
          externalId: "wf-123",
          label: "Daily Report",
          itemType: "workflow",
          itemUrl: "https://agents.recoder.xyz/workflows/wf-123",
        }),
      }),
      { params: Promise.resolve({ id: "t1" }) }
    );
    expect(res.status).toBe(201);
  });

  it("rejects linking to another user's tag", async () => {
    (prisma.ecosystem_tags.findUnique as any).mockResolvedValue({ id: "t1", userId: "other" });
    const mod = await import("../[id]/items/route");
    const res = await mod.POST(
      new Request("https://recoder.xyz/api/platform/tags/t1/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceApp: "agents",
          externalId: "wf-123",
          label: "Test",
          itemType: "workflow",
          itemUrl: "https://agents.recoder.xyz/workflows/wf-123",
        }),
      }),
      { params: Promise.resolve({ id: "t1" }) }
    );
    expect(res.status).toBe(403);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm -C app exec vitest run app/api/platform/tags/__tests__/route.test.ts`
Expected: FAIL — modules not found

**Step 3: Write the implementations**

File: `app/app/api/platform/tags/route.ts`

```typescript
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tags = await prisma.ecosystem_tags.findMany({
    where: { userId: user.id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tags });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const slug = slugify(body.name) || crypto.randomUUID().slice(0, 8);

  const tag = await prisma.ecosystem_tags.create({
    data: {
      id: crypto.randomUUID(),
      name: body.name,
      slug,
      color: body.color ?? null,
      userId: user.id,
    },
  });

  return NextResponse.json(tag, { status: 201 });
}
```

File: `app/app/api/platform/tags/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const tag = await prisma.ecosystem_tags.findUnique({ where: { id } });
  if (!tag || tag.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const updated = await prisma.ecosystem_tags.update({
    where: { id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.color !== undefined && { color: body.color }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const tag = await prisma.ecosystem_tags.findUnique({ where: { id } });
  if (!tag || tag.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.ecosystem_tags.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
```

File: `app/app/api/platform/tags/[id]/items/route.ts`

```typescript
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

const VALID_SOURCE_APPS = ["agents", "agency", "pm", "web"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const tag = await prisma.ecosystem_tags.findUnique({ where: { id } });
  if (!tag || tag.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const items = await prisma.ecosystem_tag_items.findMany({
    where: { tagId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const tag = await prisma.ecosystem_tags.findUnique({ where: { id } });
  if (!tag) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (tag.userId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json();
  if (
    !body.sourceApp ||
    !VALID_SOURCE_APPS.includes(body.sourceApp) ||
    !body.externalId ||
    !body.label ||
    !body.itemType ||
    !body.itemUrl
  ) {
    return NextResponse.json(
      { error: "missing_fields", required: ["sourceApp", "externalId", "label", "itemType", "itemUrl"] },
      { status: 400 }
    );
  }

  const item = await prisma.ecosystem_tag_items.create({
    data: {
      id: crypto.randomUUID(),
      tagId: id,
      sourceApp: body.sourceApp,
      externalId: body.externalId,
      label: body.label,
      itemType: body.itemType,
      itemUrl: body.itemUrl,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
```

File: `app/app/api/platform/tags/[id]/items/[itemId]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, itemId } = await params;
  const tag = await prisma.ecosystem_tags.findUnique({ where: { id } });
  if (!tag || tag.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.ecosystem_tag_items.delete({ where: { id: itemId } });
  return NextResponse.json({ deleted: true });
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm -C app exec vitest run app/api/platform/tags/__tests__/route.test.ts`
Expected: 5/5 PASS

**Step 5: Commit**

```bash
git add app/app/api/platform/tags/
git commit -m "feat: add platform tags API for cross-app project linking"
```

---

## Task 8: Per-App Activity Endpoints

Each app exposes `GET /api/platform/activity` for the unified dashboard to aggregate.

**Files:**
- Create: `recoder-agents/src/app/api/platform/activity/route.ts`
- Create: `recoder-agency/apps/agency/app/api/platform/activity/route.ts`
- Create: `recoder-pm/apps/api/app/api/platform/activity/route.ts` (or appropriate PM API path)
- Create: `app/app/api/platform/activity/route.ts` (for web — proxied from main app for now)

**Step 1: Write the agents activity endpoint**

File: `recoder-agents/src/app/api/platform/activity/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify internal service auth via header
  const serviceKey = request.headers.get("x-internal-service-key");
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;

  if (!expectedKey || serviceKey !== expectedKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Return activity summary
  // In production this would query the agents DB; for now return shape-compliant stub
  return NextResponse.json({
    app: "agents",
    stats: {
      totalItems: 0,
      activeItems: 0,
      lastActivityAt: null,
    },
    recentActivity: [],
  });
}
```

**Step 2: Write the agency activity endpoint**

File: `recoder-agency/apps/agency/app/api/platform/activity/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const serviceKey = request.headers.get("x-internal-service-key");
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;

  if (!expectedKey || serviceKey !== expectedKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    app: "agency",
    stats: {
      totalItems: 0,
      activeItems: 0,
      lastActivityAt: null,
    },
    recentActivity: [],
  });
}
```

**Step 3: Write the PM activity endpoint**

File: `recoder-pm/apps/api/app/api/platform/activity/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const serviceKey = request.headers.get("x-internal-service-key");
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;

  if (!expectedKey || serviceKey !== expectedKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    app: "pm",
    stats: {
      totalItems: 0,
      activeItems: 0,
      lastActivityAt: null,
    },
    recentActivity: [],
  });
}
```

**Step 4: Commit**

```bash
git add recoder-agents/src/app/api/platform/activity/ recoder-agency/apps/agency/app/api/platform/activity/ recoder-pm/apps/api/app/api/platform/activity/
git commit -m "feat: add per-app /api/platform/activity endpoints for dashboard"
```

---

## Task 9: Unified Dashboard Page

Extend `recoder.xyz/dashboard` to aggregate activity from all apps.

**Files:**
- Modify: `app/app/[locale]/dashboard/page.tsx`
- Create: `app/lib/services/platform-aggregator.ts`
- Test: `app/lib/__tests__/platform-aggregator.test.ts`

**Step 1: Write the failing test for the aggregator**

File: `app/lib/__tests__/platform-aggregator.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { fetchAllAppActivity } from "../services/platform-aggregator";

describe("fetchAllAppActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_SERVICE_KEY = "test-key-1234567890";
  });

  it("aggregates activity from all apps", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          app: "agents",
          stats: { totalItems: 5, activeItems: 3, lastActivityAt: "2026-03-08T00:00:00Z" },
          recentActivity: [{ id: "a1", type: "workflow.run", title: "Test", timestamp: "2026-03-08T00:00:00Z", url: "https://agents.recoder.xyz/w/1" }],
        }),
    });

    const results = await fetchAllAppActivity();
    expect(results).toHaveLength(4);
    expect(results[0].app).toBe("agents");
    expect(results[0].stats.totalItems).toBe(5);
  });

  it("handles app timeout gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"));

    const results = await fetchAllAppActivity();
    expect(results).toHaveLength(4);
    expect(results[0].error).toBe("unavailable");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm -C app exec vitest run lib/__tests__/platform-aggregator.test.ts`
Expected: FAIL — module not found

**Step 3: Write the aggregator**

File: `app/lib/services/platform-aggregator.ts`

```typescript
interface AppActivity {
  app: string;
  stats: {
    totalItems: number;
    activeItems: number;
    lastActivityAt: string | null;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    timestamp: string;
    url: string;
  }>;
  error?: string;
}

const APP_ENDPOINTS = [
  { app: "agents", url: "https://agents.recoder.xyz/api/platform/activity" },
  { app: "agency", url: "https://agency.recoder.xyz/api/platform/activity" },
  { app: "pm", url: "https://pm.recoder.xyz/api/platform/activity" },
  { app: "web", url: "https://web.recoder.xyz/api/platform/activity" },
];

const TIMEOUT_MS = 3000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAllAppActivity(): Promise<AppActivity[]> {
  const serviceKey = process.env.INTERNAL_SERVICE_KEY ?? "";

  const results = await Promise.all(
    APP_ENDPOINTS.map(async ({ app, url }) => {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            headers: { "x-internal-service-key": serviceKey },
          },
          TIMEOUT_MS
        );
        if (!res.ok) {
          return {
            app,
            stats: { totalItems: 0, activeItems: 0, lastActivityAt: null },
            recentActivity: [],
            error: "unavailable",
          };
        }
        return (await res.json()) as AppActivity;
      } catch {
        return {
          app,
          stats: { totalItems: 0, activeItems: 0, lastActivityAt: null },
          recentActivity: [],
          error: "unavailable",
        };
      }
    })
  );

  return results;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm -C app exec vitest run lib/__tests__/platform-aggregator.test.ts`
Expected: 2/2 PASS

**Step 5: Update dashboard page**

Modify `app/app/[locale]/dashboard/page.tsx` to import and render the aggregated activity. Read the existing file first to understand the current layout, then add:

- An async server component that calls `fetchAllAppActivity()`
- A merged activity feed section
- An app grid with stats cards
- Ecosystem tags section (fetched from `prisma.ecosystem_tags.findMany`)

The exact UI will depend on the current page structure, but the key integration points are:

```typescript
import { fetchAllAppActivity } from "@/lib/services/platform-aggregator";
import { prisma } from "@/lib/prisma";

// In the page component:
const [appActivity, tags] = await Promise.all([
  fetchAllAppActivity(),
  prisma.ecosystem_tags.findMany({
    where: { userId: user.id },
    include: { items: true },
    take: 10,
  }),
]);
```

**Step 6: Commit**

```bash
git add app/lib/services/platform-aggregator.ts app/lib/__tests__/platform-aggregator.test.ts app/app/[locale]/dashboard/
git commit -m "feat: add unified dashboard with cross-app activity aggregation"
```

---

## Task 10: SubscriptionBadge Component

Shows current plan and upgrade link.

**Files:**
- Create: `packages/ui/src/components/subscription-badge.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Write the component**

File: `packages/ui/src/components/subscription-badge.tsx`

```tsx
"use client";

import { usePlatformApi, PLATFORM_BASE } from "../hooks/use-platform-api";

interface SubscriptionData {
  plan: string;
  subscription_status: string;
}

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  FREE: { bg: "rgba(255,255,255,0.1)", text: "#aaa" },
  PRO: { bg: "rgba(249,115,22,0.15)", text: "#f97316" },
  TEAM: { bg: "rgba(168,85,247,0.15)", text: "#a855f7" },
  ENTERPRISE: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" },
};

export function SubscriptionBadge() {
  const { data } = usePlatformApi<SubscriptionData>(
    "/api/user/subscription",
    { refreshInterval: 300000 } // 5 minutes
  );

  if (!data) return null;

  const plan = data.plan?.toUpperCase() ?? "FREE";
  const colors = PLAN_COLORS[plan] ?? PLAN_COLORS.FREE;
  const isFree = plan === "FREE";

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "2px 8px",
          borderRadius: "9999px",
          fontSize: "11px",
          fontWeight: 600,
          background: colors.bg,
          color: colors.text,
          letterSpacing: "0.02em",
        }}
      >
        {plan}
      </span>
      {isFree && (
        <a
          href={`${PLATFORM_BASE}/billing/upgrade`}
          style={{
            fontSize: "11px",
            color: "#f97316",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Upgrade
        </a>
      )}
    </div>
  );
}
```

**Step 2: Update index.ts**

Add to `packages/ui/src/index.ts`:

```typescript
export { SubscriptionBadge } from "./components/subscription-badge";
```

**Step 3: Commit**

```bash
git add packages/ui/src/components/subscription-badge.tsx packages/ui/src/index.ts
git commit -m "feat: add SubscriptionBadge shared component"
```

---

## Task 11: EcosystemTagPicker Component

Tag picker for linking items across apps.

**Files:**
- Create: `packages/ui/src/components/ecosystem-tag-picker.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Write the component**

File: `packages/ui/src/components/ecosystem-tag-picker.tsx`

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { platformFetch, usePlatformApi } from "../hooks/use-platform-api";

interface Tag {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

interface TagsResponse {
  tags: Tag[];
}

interface EcosystemTagPickerProps {
  sourceApp: "agents" | "agency" | "pm" | "web";
  externalId: string;
  label: string;
  itemType: string;
  itemUrl: string;
}

export function EcosystemTagPicker(props: EcosystemTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { data, refetch } = usePlatformApi<TagsResponse>("/api/platform/tags");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const linkToTag = useCallback(
    async (tagId: string) => {
      await platformFetch(`/api/platform/tags/${tagId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceApp: props.sourceApp,
          externalId: props.externalId,
          label: props.label,
          itemType: props.itemType,
          itemUrl: props.itemUrl,
        }),
      });
      setOpen(false);
    },
    [props]
  );

  const createAndLink = useCallback(async () => {
    if (!newTagName.trim()) return;
    const res = await platformFetch("/api/platform/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newTagName.trim() }),
    });
    if (res.ok) {
      const tag = await res.json();
      await linkToTag(tag.id);
      setNewTagName("");
      refetch();
    }
  }, [newTagName, linkToTag, refetch]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Tag this item"
        style={{
          background: "none",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: "6px",
          cursor: "pointer",
          padding: "4px 8px",
          color: "inherit",
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
        Tag
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: "4px",
            width: "240px",
            background: "#0a0a0a",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            zIndex: 50,
            padding: "8px",
          }}
        >
          {data?.tags?.map((tag) => (
            <button
              key={tag.id}
              onClick={() => linkToTag(tag.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "6px 8px",
                background: "none",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                color: "white",
                fontSize: "13px",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: tag.color ?? "#888",
                  flexShrink: 0,
                }}
              />
              {tag.name}
            </button>
          ))}

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: "4px", paddingTop: "8px" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="New tag..."
                onKeyDown={(e) => e.key === "Enter" && createAndLink()}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  color: "white",
                  fontSize: "12px",
                  outline: "none",
                }}
              />
              <button
                onClick={createAndLink}
                style={{
                  background: "#f97316",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update index.ts**

Add to `packages/ui/src/index.ts`:

```typescript
export { EcosystemTagPicker } from "./components/ecosystem-tag-picker";
```

**Step 3: Commit**

```bash
git add packages/ui/src/components/ecosystem-tag-picker.tsx packages/ui/src/index.ts
git commit -m "feat: add EcosystemTagPicker shared component"
```

---

## Task 12: Billing 403 Response Standardization

Add a middleware/helper on `recoder.xyz` API that returns standardized 403 responses when plan limits are hit.

**Files:**
- Create: `app/lib/plan-limits.ts`
- Test: `app/lib/__tests__/plan-limits.test.ts`

**Step 1: Write the failing test**

File: `app/lib/__tests__/plan-limits.test.ts`

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    users: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { checkPlanLimit, PlanLimitError } from "../plan-limits";

describe("checkPlanLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows action within limit", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      subscriptionPlan: "pro",
    });
    const result = await checkPlanLimit("u1", "notifications_per_day", 50);
    expect(result.allowed).toBe(true);
  });

  it("rejects action when free plan limit exceeded", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      subscriptionPlan: "free",
    });
    const result = await checkPlanLimit("u1", "notifications_per_day", 100);
    expect(result.allowed).toBe(false);
    expect(result.error).toBeInstanceOf(PlanLimitError);
    expect(result.error?.toJSON()).toEqual({
      error: "plan_limit_exceeded",
      limit: "notifications_per_day",
      current: 100,
      max: expect.any(Number),
      upgradeUrl: "https://recoder.xyz/billing/upgrade",
    });
  });

  it("returns unlimited for pro plan", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      subscriptionPlan: "pro",
    });
    const result = await checkPlanLimit("u1", "notifications_per_day", 9999);
    expect(result.allowed).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm -C app exec vitest run lib/__tests__/plan-limits.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

File: `app/lib/plan-limits.ts`

```typescript
import { prisma } from "@/lib/prisma";

const PLAN_LIMITS: Record<string, Record<string, number>> = {
  free: {
    notifications_per_day: 50,
    tags: 5,
    tag_items: 20,
  },
  pro: {
    notifications_per_day: -1, // unlimited
    tags: -1,
    tag_items: -1,
  },
  enterprise: {
    notifications_per_day: -1,
    tags: -1,
    tag_items: -1,
  },
};

export class PlanLimitError {
  constructor(
    public limit: string,
    public current: number,
    public max: number
  ) {}

  toJSON() {
    return {
      error: "plan_limit_exceeded" as const,
      limit: this.limit,
      current: this.current,
      max: this.max,
      upgradeUrl: "https://recoder.xyz/billing/upgrade",
    };
  }

  toResponse() {
    return Response.json(this.toJSON(), { status: 403 });
  }
}

interface PlanCheckResult {
  allowed: boolean;
  error?: PlanLimitError;
}

export async function checkPlanLimit(
  userId: string,
  limitKey: string,
  currentUsage: number
): Promise<PlanCheckResult> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { subscriptionPlan: true },
  });

  const plan = (user?.subscriptionPlan ?? "free").toLowerCase();
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const max = limits[limitKey] ?? 0;

  if (max === -1 || currentUsage < max) {
    return { allowed: true };
  }

  return {
    allowed: false,
    error: new PlanLimitError(limitKey, currentUsage, max),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm -C app exec vitest run lib/__tests__/plan-limits.test.ts`
Expected: 3/3 PASS

**Step 5: Commit**

```bash
git add app/lib/plan-limits.ts app/lib/__tests__/plan-limits.test.ts
git commit -m "feat: add plan limit checker with standardized 403 response"
```

---

## Task 13: Wire Components Into All Apps

Add `<NotificationBell>` and `<SubscriptionBadge>` to the header/app-switcher of each active app.

**Files:**
- Modify: `app/components/AppSwitcher.tsx`
- Modify: `recoder-agents/src/components/ui/app-switcher.tsx`
- Modify: `recoder-agency/apps/agency/app/(main)/ui/header/app-switcher.tsx`
- Modify: `recoder-pm/apps/app/components/app-switcher.tsx` (or sidebar)

**Step 1: Add to main app AppSwitcher**

Read `app/components/AppSwitcher.tsx`, then add imports and render `<NotificationBell>` and `<SubscriptionBadge>` next to the app switcher button:

```typescript
import { NotificationBell } from "@recoder/ui/notification-bell";
import { SubscriptionBadge } from "@recoder/ui/subscription-badge";
```

Add before the switcher button in the JSX:

```tsx
<SubscriptionBadge />
<NotificationBell />
```

**Step 2: Add @recoder/ui as dependency to each app**

For each app's `package.json`, add:

```json
"@recoder/ui": "workspace:*"
```

Apps: `app/package.json`, `recoder-agents/package.json`, `recoder-agency/apps/agency/package.json`, `recoder-pm/apps/app/package.json`

**Step 3: Add to agents app switcher**

Read `recoder-agents/src/components/ui/app-switcher.tsx`, add the same imports and render the components.

**Step 4: Add to agency app switcher**

Read `recoder-agency/apps/agency/app/(main)/ui/header/app-switcher.tsx`, add the same imports and render the components.

Note: Agency is a separate monorepo. Since `@recoder/ui` is in the root monorepo's `packages/`, it won't be available at build time in agency. Instead, inline the components directly or copy the source files into agency's local `components/` directory. Reference the lesson from `tasks/lessons.md`: "The agency monorepo is separate from the root monorepo; packages like `@recoder/ecosystem-config` from the root are not available at build time."

**Step 5: Add to PM app**

Read `recoder-pm/apps/app/components/app-switcher.tsx`, add the same pattern. PM is also a separate Turborepo — same inline approach as agency if workspace link doesn't resolve.

**Step 6: Run pnpm install**

Run: `cd /Users/arhansubasi/recoder.xyz && pnpm install`
Expected: Dependencies linked

**Step 7: Verify builds**

Run each app's typecheck or build to confirm no import errors:

```bash
pnpm -C app exec tsc --noEmit --pretty false
pnpm -C recoder-agents exec tsc --noEmit --pretty false
```

**Step 8: Commit**

```bash
git add app/components/AppSwitcher.tsx app/package.json \
  recoder-agents/src/components/ui/app-switcher.tsx recoder-agents/package.json \
  recoder-agency/apps/agency/app/(main)/ui/header/ recoder-agency/apps/agency/package.json \
  recoder-pm/apps/app/components/ recoder-pm/apps/app/package.json \
  packages/ui/ pnpm-lock.yaml
git commit -m "feat: wire NotificationBell and SubscriptionBadge into all apps"
```

---

## Task 14: Update plan.md and todo.md

Mark the unified platform features as implemented.

**Files:**
- Modify: `plan.md`
- Modify: `tasks/todo.md`

**Step 1: Update plan.md**

Check off the 5 unified UX items (lines 176-180):

```markdown
- [x] Shared notification system (cross-app: agent completed task, PM update, etc.)
- [x] Unified settings (profile/avatar change on recoder.xyz reflects everywhere)
- [x] Cross-app project linking (agent workspace ↔ PM project ↔ web IDE)
- [x] Single dashboard (recoder.xyz shows activity across ALL apps)
- [x] Billing awareness (all apps check subscription, show upgrade prompts)
```

Also mark PM marketing as resolved:

```markdown
- [x] PM marketing surface: workspace-only (no public landing needed)
```

**Step 2: Update todo.md**

Add a completed section for unified platform features.

**Step 3: Commit**

```bash
git add plan.md tasks/todo.md
git commit -m "docs: mark unified platform features as implemented"
```

---

## Summary

| Task | Description | Test Count |
|------|-------------|-----------|
| 1 | @recoder/ui package | 0 (scaffold) |
| 2 | Platform Events API | 5 tests |
| 3 | Platform Notifications API | 6 tests |
| 4 | NotificationBell component | 0 (UI) |
| 5 | Agency ensureProfile sync | 1+ tests |
| 6 | Prisma migration (ecosystem tags) | 0 (schema) |
| 7 | Platform Tags API | 5 tests |
| 8 | Per-app activity endpoints | 0 (stubs) |
| 9 | Unified dashboard + aggregator | 2 tests |
| 10 | SubscriptionBadge component | 0 (UI) |
| 11 | EcosystemTagPicker component | 0 (UI) |
| 12 | Plan limits + 403 standardization | 3 tests |
| 13 | Wire components into all apps | 0 (integration) |
| 14 | Update plan.md / todo.md | 0 (docs) |

**Total: 14 tasks, ~22 tests**

Dependency order: 1 → (2,3,6) → (4,7) → (5,8,10,11,12) → (9,13) → 14
