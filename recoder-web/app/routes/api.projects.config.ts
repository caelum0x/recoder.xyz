/**
 * Project Configuration API
 * PUT /api/projects/config - Update project configuration (name, knowledge)
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { ProjectsDB } from '~/lib/.server/db/projects-db';
import { verifySession } from '~/lib/auth/session.server';

// Validation constants matching libra schema
const PROJECT_LIMITS = {
  NAME_MAX_LENGTH: 100,
  KNOWLEDGE_MAX_LENGTH: 500,
} as const;

interface UpdateConfigRequest {
  projectId: string;
  name?: string;
  knowledge?: string;
}

/**
 * PUT /api/projects/config - Update project config
 * Body: { projectId, name?, knowledge? }
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

    const body = await request.json() as UpdateConfigRequest;
    const { projectId, name, knowledge } = body;

    // Validate required fields
    if (!projectId) {
      return json({ success: false, error: 'Project ID is required' }, { status: 400 });
    }

    // Validate name length
    if (name && name.length > PROJECT_LIMITS.NAME_MAX_LENGTH) {
      return json({
        success: false,
        error: `Project name cannot exceed ${PROJECT_LIMITS.NAME_MAX_LENGTH} characters`
      }, { status: 400 });
    }

    // Validate knowledge length
    if (knowledge && knowledge.length > PROJECT_LIMITS.KNOWLEDGE_MAX_LENGTH) {
      return json({
        success: false,
        error: `Knowledge content cannot exceed ${PROJECT_LIMITS.KNOWLEDGE_MAX_LENGTH} characters`
      }, { status: 400 });
    }

    const projectsDB = new ProjectsDB(databaseUrl);

    // Get existing project to verify ownership
    const existingProject = await projectsDB.getProject(projectId, session.user.id);
    if (!existingProject) {
      return json({ success: false, error: 'Project not found or unauthorized' }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (knowledge !== undefined) updateData.knowledge = knowledge;

    // Update project
    const updatedProject = await projectsDB.updateProject(projectId, updateData, session.user.id);

    if (!updatedProject) {
      return json({ success: false, error: 'Failed to update project' }, { status: 500 });
    }

    console.log(`[Projects] Config updated for project ${projectId}:`, {
      name: name ? 'updated' : 'unchanged',
      knowledge: knowledge !== undefined ? 'updated' : 'unchanged'
    });

    return json({
      success: true,
      project: updatedProject,
    });
  } catch (error) {
    console.error('[Projects] Config update error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
