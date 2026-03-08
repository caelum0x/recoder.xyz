import { prisma } from "@/lib/prisma";

const PLAN_LIMITS: Record<string, Record<string, number>> = {
  free: {
    notifications_per_day: 50,
    tags: 5,
    tag_items: 20,
  },
  pro: {
    notifications_per_day: -1,
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
