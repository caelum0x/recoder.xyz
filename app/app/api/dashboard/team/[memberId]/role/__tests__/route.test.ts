import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    users: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { NextResponse } from "next/server";

function patchRequest(role: string) {
  return new Request("https://recoder.xyz/api/dashboard/team/target-id/role", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  }) as any;
}

const ctx = { params: Promise.resolve({ memberId: "target-id" }) };

describe("PATCH /api/dashboard/team/[memberId]/role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuth as any).mockResolvedValue({
      error: false,
      user: { email: "caller@recoder.xyz" },
    });
    // Target exists in caller's org by default.
    (prisma.users.findFirst as any).mockResolvedValue({ id: "target-id" });
    (prisma.users.updateMany as any).mockResolvedValue({ count: 1 });
  });

  it("returns 401 when unauthenticated", async () => {
    (requireAuth as any).mockResolvedValue({
      error: true,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const { PATCH } = await import("../route");
    const res = await PATCH(patchRequest("admin"), ctx);
    expect(res.status).toBe(401);
    expect(prisma.users.updateMany).not.toHaveBeenCalled();
  });

  it("blocks a plain member from changing roles (privilege escalation)", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "caller-id",
      organization: "Acme",
      role: "member",
    });
    const { PATCH } = await import("../route");
    const res = await PATCH(patchRequest("admin"), ctx);
    expect(res.status).toBe(403);
    expect(prisma.users.updateMany).not.toHaveBeenCalled();
  });

  it("allows an admin to change a member's role", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "caller-id",
      organization: "Acme",
      role: "admin",
    });
    const { PATCH } = await import("../route");
    const res = await PATCH(patchRequest("member"), ctx);
    expect(res.status).toBe(200);
    expect(prisma.users.updateMany).toHaveBeenCalledOnce();
  });

  it("allows the owner (null/user role) to change a member's role", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "caller-id",
      organization: "Acme",
      role: null,
    });
    const { PATCH } = await import("../route");
    const res = await PATCH(patchRequest("admin"), ctx);
    expect(res.status).toBe(200);
    expect(prisma.users.updateMany).toHaveBeenCalledOnce();
  });

  it("returns 400 when the caller has no organization", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "caller-id",
      organization: null,
      role: "admin",
    });
    const { PATCH } = await import("../route");
    const res = await PATCH(patchRequest("admin"), ctx);
    expect(res.status).toBe(400);
    expect(prisma.users.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the target is not in the caller's org", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "caller-id",
      organization: "Acme",
      role: "admin",
    });
    (prisma.users.findFirst as any).mockResolvedValue(null);
    const { PATCH } = await import("../route");
    const res = await PATCH(patchRequest("admin"), ctx);
    expect(res.status).toBe(404);
    expect(prisma.users.updateMany).not.toHaveBeenCalled();
  });

  it("rejects changing your own role here", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "target-id",
      organization: "Acme",
      role: "admin",
    });
    const { PATCH } = await import("../route");
    const res = await PATCH(patchRequest("member"), ctx);
    expect(res.status).toBe(400);
    expect(prisma.users.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid role value", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "caller-id",
      organization: "Acme",
      role: "admin",
    });
    const { PATCH } = await import("../route");
    const res = await PATCH(patchRequest("superadmin"), ctx);
    expect(res.status).toBe(400);
    expect(prisma.users.updateMany).not.toHaveBeenCalled();
  });
});
