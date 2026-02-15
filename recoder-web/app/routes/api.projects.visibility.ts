/**
 * Project Visibility API
 * PUT /api/projects/visibility - Update project visibility (public/private)
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { ProjectsDB } from '~/lib/.server/db/projects-db';
import { verifySession } from '~/lib/auth/session.server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ProjectVisibility');

interface UpdateVisibilityRequest {
  projectId: string;
  visibility: 'public' | 'private';
}

/**
 * Check if user has premium subscription for private projects
 */
function hasPremiumAccess(subscriptionPlan?: string): boolean {
  const premiumPlans = ['pro', 'premium', 'enterprise'];
  return premiumPlans.includes(subscriptionPlan?.toLowerCase() || '');
}

/**
 * PUT /api/projects/visibility - Update project visibility
 * Body: { projectId, visibility: 'public' | 'private' }
 */
export async function action({ request, context }: ActionFunctionArgs) {
  // Verify authentication
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  if (request.method !== 'PUT' && request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const env = context?.cloudflare?.env || process.env || {};
    const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json() as UpdateVisibilityRequest;
    const { projectId, visibility } = body;

    // Validate required fields
    if (!projectId) {
      return json({ success: false, error: 'Project ID is required' }, { status: 400 });
    }

    if (!visibility || !['public', 'private'].includes(visibility)) {
      return json({
        success: false,
        error: 'Visibility must be either public or private'
      }, { status: 400 });
    }

    // Check premium access for private projects
    if (visibility === 'private' && !hasPremiumAccess(session.user.subscriptionPlan)) {
      return json({
        success: false,
        error: 'Premium subscription required for private projects',
        code: 'PREMIUM_REQUIRED'
      }, { status: 403 });
    }

    const projectsDB = new ProjectsDB(databaseUrl);

    // Verify project ownership
    const existingProject = await projectsDB.getProject(projectId, session.user.id);
    if (!existingProject) {
      return json({ success: false, error: 'Project not found or unauthorized' }, { status: 404 });
    }

    // Update visibility
    const updatedProject = await projectsDB.updateProject(
      projectId,
      { isPrivate: visibility === 'private' },
      session.user.id
    );

    if (!updatedProject) {
      return json({ success: false, error: 'Failed to update project visibility' }, { status: 500 });
    }

    logger.info(`[Projects] Visibility updated for project ${projectId}: ${visibility}`);

    return json({
      success: true,
      project: updatedProject,
      visibility,
    });
  } catch (error) {
    logger.error('[Projects] Visibility update error:', error);
    return json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}
