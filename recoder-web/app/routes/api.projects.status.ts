/**
 * Project Status API
 * GET /api/projects/status - Get project status and quota information
 */

import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { ProjectsDB } from '~/lib/.server/db/projects-db';
import { verifySession } from '~/lib/auth/session.server';

// Quota limits by subscription plan
const PLAN_QUOTAS = {
  free: {
    projectLimit: 5,
    messagesPerDay: 50,
    enhancesPerDay: 10,
  },
  pro: {
    projectLimit: 25,
    messagesPerDay: 500,
    enhancesPerDay: 100,
  },
  premium: {
    projectLimit: 100,
    messagesPerDay: 2000,
    enhancesPerDay: 500,
  },
  enterprise: {
    projectLimit: Infinity,
    messagesPerDay: Infinity,
    enhancesPerDay: Infinity,
  },
} as const;

type PlanType = keyof typeof PLAN_QUOTAS;

/**
 * GET /api/projects/status
 * Query params:
 * - projectId: Get specific project status
 * - quotaOnly: Only return quota information (no projectId needed)
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  // Verify authentication
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const quotaOnly = url.searchParams.get('quotaOnly') === 'true';

    const env = context?.cloudflare?.env || process.env || {};
    const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const projectsDB = new ProjectsDB(databaseUrl);

    // Get user's subscription plan
    const userPlan = (session.user.subscriptionPlan?.toLowerCase() || 'free') as PlanType;
    const quotaConfig = PLAN_QUOTAS[userPlan] || PLAN_QUOTAS.free;

    // Get user's current project count
    const userProjects = await projectsDB.getUserProjects(session.user.id);
    const projectCount = userProjects.length;

    // Build quota status response
    const quotaStatus = {
      plan: userPlan,
      projectNums: projectCount,
      projectNumsLimit: quotaConfig.projectLimit,
      messagesPerDay: quotaConfig.messagesPerDay,
      enhancesPerDay: quotaConfig.enhancesPerDay,
      canCreateProject: projectCount < quotaConfig.projectLimit,
      periodEnd: getNextBillingDate(),
    };

    // If only quota requested, return early
    if (quotaOnly) {
      return json({
        success: true,
        quota: quotaStatus,
      });
    }

    // Get specific project status if projectId provided
    if (projectId) {
      const project = await projectsDB.getProject(projectId, session.user.id);

      if (!project) {
        return json({
          success: true,
          projectStatus: {
            isActive: false,
            hasAccess: false,
            projectId,
            name: null,
          },
          quota: quotaStatus,
        });
      }

      return json({
        success: true,
        projectStatus: {
          isActive: project.status === 'active',
          hasAccess: true,
          projectId: project.id,
          name: project.name,
          status: project.status,
          isPrivate: project.isPrivate,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        quota: quotaStatus,
      });
    }

    // No projectId - return just quota
    return json({
      success: true,
      quota: quotaStatus,
    });
  } catch (error) {
    console.error('[Projects] Status error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

/**
 * Get the next billing cycle date (end of current month for simplicity)
 */
function getNextBillingDate(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString();
}
