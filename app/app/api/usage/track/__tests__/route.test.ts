import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/internal-service-auth", () => ({
  verifyInternalServiceRequest: vi.fn(() => ({ ok: false, reason: "missing_internal_auth" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    users: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/usage-tracking", () => ({
  trackUsage: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { requireAuth } from "@/lib/auth-helpers";
import { verifyInternalServiceRequest } from "@/lib/internal-service-auth";
import { prisma } from "@/lib/prisma";
import { trackUsage } from "@/lib/usage-tracking";

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://recoder.xyz/api/usage/track", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as any;
}

const unauthenticated = { error: true, response: undefined };

describe("POST /api/usage/track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (trackUsage as any).mockResolvedValue({ allowed: true, remaining: 4 });
    (verifyInternalServiceRequest as any).mockReturnValue({ ok: false, reason: "missing_internal_auth" });
  });

  it("rejects an unauthenticated caller with 401 (no quota write)", async () => {
    (requireAuth as any).mockResolvedValue(unauthenticated);
    const { POST } = await import("../route");
    const res = await POST(postRequest({ userId: "victim", requestType: "cli" }));
    expect(res.status).toBe(401);
    expect(trackUsage).not.toHaveBeenCalled();
  });

  it("ignores body.userId and uses the verified session identity", async () => {
    (requireAuth as any).mockResolvedValue({
      error: false,
      user: { id: "session-id", email: "real@user.com" },
    });
    (prisma.users.findUnique as any).mockResolvedValue({ id: "app-user-id" });
    const { POST } = await import("../route");
    const res = await POST(
      postRequest({ userId: "victim", requestType: "cli", tokensUsed: 10 }),
    );
    expect(res.status).toBe(200);
    // Verified app-user id used, attacker-supplied "victim" ignored.
    expect(trackUsage).toHaveBeenCalledWith(
      "app-user-id",
      null,
      "cli",
      expect.objectContaining({ tokensUsed: 10 }),
    );
  });

  it("authenticates a CLI Bearer token via requireAuth and derives the userId", async () => {
    // requireAuth resolves Bearer tokens internally (getUserFromToken).
    (requireAuth as any).mockResolvedValue({
      error: false,
      user: { id: "cli-user", email: "cli@user.com" },
    });
    (prisma.users.findUnique as any).mockResolvedValue({ id: "cli-user" });
    const { POST } = await import("../route");
    const res = await POST(
      postRequest({ requestType: "cli" }, { authorization: "Bearer tok_abc" }),
    );
    expect(res.status).toBe(200);
    expect(trackUsage).toHaveBeenCalledWith(
      "cli-user",
      null,
      "cli",
      expect.any(Object),
    );
  });

  it("allows a signed internal service call to specify the userId in the body", async () => {
    (requireAuth as any).mockResolvedValue(unauthenticated);
    (verifyInternalServiceRequest as any).mockReturnValue({ ok: true });
    const { POST } = await import("../route");
    const res = await POST(postRequest({ userId: "on-behalf-of", requestType: "api" }));
    expect(res.status).toBe(200);
    expect(trackUsage).toHaveBeenCalledWith(
      "on-behalf-of",
      null,
      "api",
      expect.any(Object),
    );
  });

  it("rejects an internal service call with no userId", async () => {
    (requireAuth as any).mockResolvedValue(unauthenticated);
    (verifyInternalServiceRequest as any).mockReturnValue({ ok: true });
    const { POST } = await import("../route");
    const res = await POST(postRequest({ requestType: "api" }));
    expect(res.status).toBe(400);
    expect(trackUsage).not.toHaveBeenCalled();
  });

  it("rejects a missing requestType with 400", async () => {
    (requireAuth as any).mockResolvedValue({
      error: false,
      user: { id: "u1", email: "u1@user.com" },
    });
    const { POST } = await import("../route");
    const res = await POST(postRequest({ userId: "u1" }));
    expect(res.status).toBe(400);
    expect(trackUsage).not.toHaveBeenCalled();
  });
});
