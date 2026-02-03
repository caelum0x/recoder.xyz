/**
 * Project Deployment Status API
 * Provides detailed deployment status with workflow-style responses
 *
 * GET /api/deployments/:projectId - Get deployment status
 * PUT /api/deployments/:projectId - Update deployment status
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { neon } from '@neondatabase/serverless';

// Deployment status types matching libra schema
type DeploymentStatus = 'idle' | 'preparing' | 'deploying' | 'deployed' | 'failed';
type WorkflowStatus = 'unknown' | 'queued' | 'running' | 'complete' | 'errored';

interface UpdateDeploymentRequest {
  deploymentStatus?: DeploymentStatus;
  productionDeployUrl?: string;
}

/**
 * Map database deployment status to workflow-like status
 */
function mapDeploymentStatus(deploymentStatus: string | null): WorkflowStatus {
  switch (deploymentStatus) {
    case 'idle':
    case null:
      return 'unknown';
    case 'preparing':
      return 'queued';
    case 'deploying':
      return 'running';
    case 'deployed':
      return 'complete';
    case 'failed':
      return 'errored';
    default:
      return 'unknown';
  }
}

/**
 * Build deployment status response matching libra format
 */
function buildDeploymentStatusResponse(project: any, workflowStatus: WorkflowStatus) {
  return {
    status: {
      status: workflowStatus,
      error: project.deploymentStatus === 'failed' ? 'Deployment failed' : undefined,
      output: project.deploymentStatus === 'deployed' && project.productionDeployUrl
        ? {
            workerUrl: project.productionDeployUrl,
            message: 'Deployment completed successfully',
          }
        : undefined,
    },
    deploymentStatus: project.deploymentStatus,
    productionDeployUrl: project.productionDeployUrl,
    // Additional metadata
    projectId: project.id,
    projectName: project.name,
    lastDeployedAt: project.deployedAt || null,
    customDomain: project.customDomain || null,
  };
}

/**
 * GET /api/deployments/:projectId - Get deployment status
 */
export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const { projectId } = params;
  if (!projectId) {
    return json({ success: false, error: 'Project ID is required' }, { status: 400 });
  }

  try {
    const env = context?.cloudflare?.env || process.env || {};
    const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Get project with deployment info
    const projects = await sql`
      SELECT id, name, "userId", "deploymentStatus", "productionDeployUrl",
             "customDomain", "deployedAt"
      FROM projects
      WHERE id = ${projectId} AND "userId" = ${session.user.id}
    ` as any[];

    if (!projects || projects.length === 0) {
      return json({ success: false, error: 'Project not found or unauthorized' }, { status: 404 });
    }

    const project = projects[0];

    // Map to workflow-style status
    const workflowStatus = mapDeploymentStatus(project.deploymentStatus);

    console.log(`[Deployments] Status requested for project ${projectId}:`, {
      dbStatus: project.deploymentStatus,
      workflowStatus,
    });

    return json({
      success: true,
      ...buildDeploymentStatusResponse(project, workflowStatus),
    });
  } catch (error) {
    console.error('[Deployments] Get status error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get deployment status',
    }, { status: 500 });
  }
}

/**
 * PUT /api/deployments/:projectId - Update deployment status
 * Body: { deploymentStatus?, productionDeployUrl? }
 */
export async function action({ params, request, context }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  if (request.method !== 'PUT' && request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  const { projectId } = params;
  if (!projectId) {
    return json({ success: false, error: 'Project ID is required' }, { status: 400 });
  }

  try {
    const env = context?.cloudflare?.env || process.env || {};
    const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      return json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json() as UpdateDeploymentRequest;
    const { deploymentStatus, productionDeployUrl } = body;

    // Validate deployment status
    const validStatuses: DeploymentStatus[] = ['idle', 'preparing', 'deploying', 'deployed', 'failed'];
    if (deploymentStatus && !validStatuses.includes(deploymentStatus)) {
      return json({
        success: false,
        error: `Invalid deployment status. Must be one of: ${validStatuses.join(', ')}`,
      }, { status: 400 });
    }

    const sql = neon(databaseUrl);

    // Verify project ownership
    const projects = await sql`
      SELECT id, name, "userId"
      FROM projects
      WHERE id = ${projectId} AND "userId" = ${session.user.id}
    ` as any[];

    if (!projects || projects.length === 0) {
      return json({ success: false, error: 'Project not found or unauthorized' }, { status: 404 });
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];

    if (deploymentStatus !== undefined) {
      updates.push(`"deploymentStatus" = $${values.length + 1}`);
      values.push(deploymentStatus);

      // Set deployedAt when status becomes 'deployed'
      if (deploymentStatus === 'deployed') {
        updates.push(`"deployedAt" = NOW()`);
      }
    }

    if (productionDeployUrl !== undefined) {
      updates.push(`"productionDeployUrl" = $${values.length + 1}`);
      values.push(productionDeployUrl);
    }

    updates.push(`"updatedAt" = NOW()`);

    if (updates.length > 1) { // More than just updatedAt
      // Execute update
      await sql`
        UPDATE projects
        SET "deploymentStatus" = COALESCE(${deploymentStatus || null}, "deploymentStatus"),
            "productionDeployUrl" = COALESCE(${productionDeployUrl || null}, "productionDeployUrl"),
            "deployedAt" = CASE WHEN ${deploymentStatus} = 'deployed' THEN NOW() ELSE "deployedAt" END,
            "updatedAt" = NOW()
        WHERE id = ${projectId}
      `;
    }

    // Get updated project
    const updatedProjects = await sql`
      SELECT id, name, "deploymentStatus", "productionDeployUrl", "customDomain", "deployedAt"
      FROM projects
      WHERE id = ${projectId}
    ` as any[];

    const updatedProject = updatedProjects[0];
    const workflowStatus = mapDeploymentStatus(updatedProject.deploymentStatus);

    console.log(`[Deployments] Status updated for project ${projectId}:`, {
      deploymentStatus,
      productionDeployUrl,
      workflowStatus,
    });

    return json({
      success: true,
      ...buildDeploymentStatusResponse(updatedProject, workflowStatus),
    });
  } catch (error) {
    console.error('[Deployments] Update status error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update deployment status',
    }, { status: 500 });
  }
}
