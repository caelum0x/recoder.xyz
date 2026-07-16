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
      subscriptionPlan: "free",
    });
    const result = await checkPlanLimit("u1", "notifications_per_day", 10);
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
