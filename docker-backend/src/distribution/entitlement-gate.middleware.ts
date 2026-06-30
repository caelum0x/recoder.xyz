/**
 * Entitlement-gating middleware.
 *
 * Gates premium capability by the authed user's authoritative plan (resolved
 * via recoder.xyz identity + the Polar entitlement port). Two gate shapes:
 *
 *  - `requireFeature(feature)` — deny unless the plan (or an explicit Polar
 *    feature grant) covers the capability (e.g. `cloud sync`).
 *  - `requireParallelWorkspaceHeadroom(count)` — deny when starting another
 *    conductor workspace would exceed the plan's parallel-workspace cap.
 *
 * FAIL SAFE: a resolver error, a missing identity, or being over-plan all
 * produce a 402/403 deny with an `upgrade_required` body — never a faked allow.
 */
import type { Request, Response, NextFunction } from 'express';
import {
  planHasFeature,
  type Feature,
  type Plan,
  type Subject,
} from '@recoder/distribution';
import type { DistributionModule } from './module.js';
import { createLogger } from './log.js';

const logger = createLogger('distribution-gate');

/** Per-plan parallel conductor-workspace cap. `enterprise` is unmetered (0). */
export const PARALLEL_WORKSPACE_LIMIT: Record<Plan, number> = {
  free: 1,
  pro: 5,
  team: 10,
  enterprise: 0,
};

interface GatedRequest extends Request {
  userId?: string;
  /** Populated by the gate so handlers can read the resolved plan. */
  distributionPlan?: Plan;
}

function denyUpgrade(
  res: Response,
  status: number,
  reason: string,
  detail: Record<string, unknown>,
): void {
  res.status(status).json({
    success: false,
    error: reason,
    code: 'upgrade_required',
    ...detail,
  });
}

/**
 * Resolve the authoritative plan for the authed user. On any error → `free`
 * floor is NOT returned as an allow; callers treat a thrown error as deny.
 */
async function resolvePlan(mod: DistributionModule, userId: string): Promise<Plan> {
  const profile = await mod.auth.getUserProfile(userId);
  if (!profile) {
    throw new Error('no authoritative profile for user');
  }
  return profile.plan;
}

/**
 * Gate a request on a plan feature. Channels/capabilities map to a `Feature`
 * (e.g. `usage_metering` for cloud sync, `publish_site`, `custom_domain`).
 */
export function requireFeature(mod: DistributionModule, feature: Feature) {
  return async (req: GatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      denyUpgrade(res, 403, 'authentication required for premium capability', { feature });
      return;
    }
    const subject: Subject = { subjectId: userId, kind: 'user' };
    let allowed = false;
    let plan: Plan = 'free';
    try {
      plan = await resolvePlan(mod, userId);
      // Plan floor OR an explicit Polar feature grant.
      allowed =
        planHasFeature(plan, feature) ||
        (await mod.resolver.hasFeature(subject, feature, plan));
    } catch (e) {
      logger.warn('feature gate resolution failed — denying (fail safe)', {
        feature,
        error: e instanceof Error ? e.message : String(e),
      });
      allowed = false;
    }
    if (!allowed) {
      denyUpgrade(res, 402, `your plan does not include '${feature}'`, {
        feature,
        plan,
      });
      return;
    }
    req.distributionPlan = plan;
    next();
  };
}

/**
 * Gate a request on parallel-workspace headroom. `currentCount(userId)` returns
 * the user's currently-active workspace count; the gate denies when starting
 * `cost` more would exceed the plan cap. An unmetered plan (limit 0) always
 * passes.
 */
export function requireParallelWorkspaceHeadroom(
  mod: DistributionModule,
  currentCount: (userId: string) => number | Promise<number>,
  cost = 1,
) {
  return async (req: GatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;
    if (!userId || userId === 'anonymous') {
      denyUpgrade(res, 403, 'authentication required to start a workspace', {});
      return;
    }
    let plan: Plan;
    try {
      plan = await resolvePlan(mod, userId);
    } catch (e) {
      logger.warn('workspace gate plan resolution failed — denying (fail safe)', {
        error: e instanceof Error ? e.message : String(e),
      });
      denyUpgrade(res, 402, 'could not verify your plan; workspace start denied', {});
      return;
    }
    const limit = PARALLEL_WORKSPACE_LIMIT[plan];
    if (limit === 0) {
      req.distributionPlan = plan;
      next();
      return;
    }
    let used: number;
    try {
      used = await currentCount(userId);
    } catch (e) {
      logger.warn('workspace count failed — denying (fail safe)', {
        error: e instanceof Error ? e.message : String(e),
      });
      denyUpgrade(res, 402, 'could not verify workspace usage; start denied', { plan });
      return;
    }
    if (used + cost > limit) {
      denyUpgrade(res, 402, `parallel workspace limit reached for '${plan}' plan`, {
        plan,
        limit,
        used,
      });
      return;
    }
    req.distributionPlan = plan;
    next();
  };
}
