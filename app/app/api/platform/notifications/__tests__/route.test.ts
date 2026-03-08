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
    const res = await GET(new Request("https://recoder.xyz/api/platform/notifications") as any);
    expect(res.status).toBe(401);
  });

  it("returns notifications with unread count", async () => {
    const { GET } = await import("../route");
    const res = await GET(new Request("https://recoder.xyz/api/platform/notifications") as any);
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
      new Request("https://recoder.xyz/api/platform/notifications/n1/read", { method: "PATCH" }) as any,
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
      new Request("https://recoder.xyz/api/platform/notifications/read-all", { method: "POST" }) as any
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
      new Request("https://recoder.xyz/api/platform/notifications/settings") as any
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
      }) as any
    );
    expect(res.status).toBe(200);
  });
});
