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
      count: vi.fn().mockResolvedValue(0),
    },
    users: {
      findUnique: vi.fn(),
    },
    web_push_subscriptions: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
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

// Mock plan limits
vi.mock("@/lib/plan-limits", () => ({
  checkPlanLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

// Mock push server
vi.mock("@/lib/push-server", () => ({
  sendWebPush: vi.fn().mockResolvedValue({ ok: true, endpoint: "test" }),
  isWebPushEnabled: vi.fn().mockReturnValue(false),
  isStaleSubscription: vi.fn().mockReturnValue(false),
}));

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
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
    (verifyInternalServiceRequest as any).mockReturnValue({ ok: true });
    (sendEmail as any).mockResolvedValue({ ok: true });
    (prisma.notification_settings.findUnique as any).mockResolvedValue({
      emailNotifications: true,
      pushNotifications: false,
    });
    (prisma.notifications.create as any).mockResolvedValue({ id: "n1" });
    (prisma.users.findUnique as any).mockResolvedValue({ email: "test@test.com", name: "Test" });
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
