// @vitest-environment node
/**
 * Team Member Route Tests — DELETE /api/dashboard/team/[memberId] (remove a member)
 *
 * Focus: the privilege check. Identity/authority is derived from the VERIFIED
 * session (never the request body/params), and only an org owner/admin may
 * remove a member. A plain 'member' must NOT be able to evict the owner or
 * other admins (org takeover / griefing).
 *
 * These route handlers run in the `node` environment (see the pragma above)
 * with prisma/auth mocked, so they are deterministic regardless of the app's
 * React-version mismatch that affects component/hook tests.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    users: {
      findUnique: vi.fn(),
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

function deleteRequest() {
  return new Request("https://recoder.xyz/api/dashboard/team/target-id", {
    method: "DELETE",
  }) as any;
}

const ctx = { params: Promise.resolve({ memberId: "target-id" }) };

describe("DELETE /api/dashboard/team/[memberId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireAuth as any).mockResolvedValue({
      error: false,
      user: { email: "caller@recoder.xyz" },
    });
    (prisma.users.updateMany as any).mockResolvedValue({ count: 1 });
  });

  it("returns 401 when unauthenticated", async () => {
    (requireAuth as any).mockResolvedValue({
      error: true,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const { DELETE } = await import("../route");
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(401);
    expect(prisma.users.updateMany).not.toHaveBeenCalled();
  });

  it("blocks a plain member from removing the owner/admins (org takeover)", async () => {
    // Attacker is a plain 'member' of Acme calling DELETE on the owner's id.
    // Without the privilege check they could evict the owner + every admin.
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "attacker-id",
      organization: "Acme",
      role: "member",
    });
    const { DELETE } = await import("../route");
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("permission");
    // The destructive write must never fire for an unauthorized caller.
    expect(prisma.users.updateMany).not.toHaveBeenCalled();
  });

  it("allows an admin to remove a member", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "caller-id",
      organization: "Acme",
      role: "admin",
    });
    const { DELETE } = await import("../route");
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(200);
    // Delete is scoped to the caller's own organization.
    expect(prisma.users.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "target-id", organization: "Acme" },
      }),
    );
  });

  it("allows the owner (null/user role) to remove a member", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "caller-id",
      organization: "Acme",
      role: null,
    });
    const { DELETE } = await import("../route");
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(200);
    expect(prisma.users.updateMany).toHaveBeenCalledOnce();
  });

  it("returns 400 when the caller has no organization", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "caller-id",
      organization: null,
      role: "admin",
    });
    const { DELETE } = await import("../route");
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(400);
    expect(prisma.users.updateMany).not.toHaveBeenCalled();
  });

  it("rejects removing yourself here", async () => {
    (prisma.users.findUnique as any).mockResolvedValue({
      id: "target-id",
      organization: "Acme",
      role: "admin",
    });
    const { DELETE } = await import("../route");
    const res = await DELETE(deleteRequest(), ctx);
    expect(res.status).toBe(400);
    expect(prisma.users.updateMany).not.toHaveBeenCalled();
  });
});
