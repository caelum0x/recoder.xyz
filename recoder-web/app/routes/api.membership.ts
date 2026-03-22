/**
 * Membership Status API
 * GET /api/membership - Get user's membership/subscription status and limits
 */

import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { createSql } from '~/lib/.server/db/pg-pool';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Membership');

// Plan feature configuration
const PLAN_FEATURES = {
  free: {
    name: 'Free',
    projectLimit: 5,
    messagesPerDay: 50,
    enhancesPerDay: 10,
    customDomains: false,
    privateProjects: false,
    prioritySupport: false,
    advancedAnalytics: false,
    teamMembers: 1,
  },
  pro: {
    name: 'Pro',
    projectLimit: 25,
    messagesPerDay: 500,
    enhancesPerDay: 100,
    customDomains: true,
    privateProjects: true,
    prioritySupport: false,
    advancedAnalytics: true,
    teamMembers: 5,
  },
  premium: {
    name: 'Premium',
    projectLimit: 100,
    messagesPerDay: 2000,
    enhancesPerDay: 500,
    customDomains: true,
    privateProjects: true,
    prioritySupport: true,
    advancedAnalytics: true,
    teamMembers: 20,
  },
  enterprise: {
    name: 'Enterprise',
    projectLimit: Infinity,
    messagesPerDay: Infinity,
    enhancesPerDay: Infinity,
    customDomains: true,
    privateProjects: true,
    prioritySupport: true,
    advancedAnalytics: true,
    teamMembers: Infinity,
  },
} as const;

type PlanType = keyof typeof PLAN_FEATURES;

interface UsageStats {
  projectsUsed: number;
  projectsLimit: number;
  messagesUsedToday: number;
  messagesLimit: number;
  enhancesUsedToday: number;
  enhancesLimit: number;
  /** False when message/enhance tracking is not yet wired up */
  usageTrackingAvailable: boolean;
}

/**
 * GET /api/membership - Get membership status
 * Query params:
 * - includeUsage: Include current usage statistics (default: true)
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const includeUsage = url.searchParams.get('includeUsage') !== 'false';

    const userPlan = (session.user.subscriptionPlan?.toLowerCase() || 'free') as PlanType;
    const planFeatures = PLAN_FEATURES[userPlan] || PLAN_FEATURES.free;

    // Get current usage if requested
    let usage: UsageStats | null = null;

    if (includeUsage) {
      const env = context?.cloudflare?.env || process.env || {};
      const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;

      if (databaseUrl) {
        usage = await getUserUsage(databaseUrl, session.user.id, planFeatures);
      }
    }

    const response = {
      success: true,
      membership: {
        plan: userPlan,
        planName: planFeatures.name,
        status: session.user.subscriptionStatus || 'active',
        features: {
          customDomains: planFeatures.customDomains,
          privateProjects: planFeatures.privateProjects,
          prioritySupport: planFeatures.prioritySupport,
          advancedAnalytics: planFeatures.advancedAnalytics,
          teamMembers: planFeatures.teamMembers,
        },
        limits: {
          projectLimit: planFeatures.projectLimit,
          messagesPerDay: planFeatures.messagesPerDay,
          enhancesPerDay: planFeatures.enhancesPerDay,
        },
        // Billing info would come from Stripe in production
        billing: {
          periodEnd: getNextBillingDate(),
          cancelAtPeriodEnd: false,
        },
      },
      usage,
    };

    return json(response);
  } catch (error) {
    logger.error('[Membership] Status error:', error);
    return json({
      success: false,
      error: 'Failed to get membership status',
    }, { status: 500 });
  }
}

/**
 * Get user's current usage statistics
 */
async function getUserUsage(
  databaseUrl: string,
  userId: string,
  planFeatures: typeof PLAN_FEATURES[PlanType]
): Promise<UsageStats> {
  try {
    const sql = createSql(databaseUrl);

    // Get project count
    const projectsResult = await sql`
      SELECT COUNT(*) as count
      FROM projects
      WHERE "userId" = ${userId}
    ` as any[];

    const projectsUsed = parseInt(projectsResult[0]?.count || '0', 10);

    // Messages and enhances usage tracking is not yet implemented.
    // Return zeros with a flag so the UI can show an honest state
    // instead of fabricated numbers.
    return {
      projectsUsed,
      projectsLimit: planFeatures.projectLimit,
      messagesUsedToday: 0,
      messagesLimit: planFeatures.messagesPerDay,
      enhancesUsedToday: 0,
      enhancesLimit: planFeatures.enhancesPerDay,
      usageTrackingAvailable: false,
    };
  } catch (error) {
    logger.error('[Membership] Usage query error:', error);
    return {
      projectsUsed: 0,
      projectsLimit: planFeatures.projectLimit,
      messagesUsedToday: 0,
      messagesLimit: planFeatures.messagesPerDay,
      enhancesUsedToday: 0,
      enhancesLimit: planFeatures.enhancesPerDay,
      usageTrackingAvailable: false,
    };
  }
}

/**
 * Get the next billing cycle date
 */
function getNextBillingDate(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString();
}
