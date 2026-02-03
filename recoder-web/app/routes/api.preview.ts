/**
 * Preview URL API
 * Manages preview URLs for project sandboxes
 *
 * GET /api/preview - Get preview URL for a project
 * POST /api/preview - Update container content and get new preview URL
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { ProjectsDB } from '~/lib/.server/db/projects-db';

interface PreviewRequest {
  projectId: string;
  planId?: string;
}

/**
 * Build preview URL with planId parameter
 */
function buildPreviewUrl(baseUrl: string, planId?: string): string {
  if (!planId) {
    return baseUrl;
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set('planId', planId);
    return url.toString();
  } catch {
    // Fallback: manually append planId
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}planId=${encodeURIComponent(planId)}`;
  }
}

/**
 * Normalize URL to ensure it has a protocol
 */
function normalizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid base URL');
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }

  return url;
}

/**
 * Extract session token from cookies
 */
function extractSessionToken(cookieHeader: string): string | undefined {
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'recoder.session_token' || name === 'session_token') {
      return decodeURIComponent(value);
    }
  }
  return undefined;
}

/**
 * GET /api/preview - Get preview URL
 * Query params:
 * - projectId: Project ID (required)
 * - planId: Optional plan ID to append
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const planId = url.searchParams.get('planId') || undefined;

    if (!projectId) {
      return json({ success: false, error: 'Project ID is required' }, { status: 400 });
    }

    const env = context?.cloudflare?.env || process.env || {};
    const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;
    const dockerBackendUrl = (env as any).DOCKER_BACKEND_URL || 'http://localhost:3100';

    if (!databaseUrl) {
      return json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    // Verify project access
    const projectsDB = new ProjectsDB(databaseUrl);
    const project = await projectsDB.getProject(projectId, session.user.id);

    if (!project) {
      return json({ success: false, error: 'Project not found or unauthorized' }, { status: 404 });
    }

    // Get preview URL from docker-backend
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionToken = extractSessionToken(cookieHeader);

    try {
      const response = await fetch(`${dockerBackendUrl}/preview/${projectId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken && { 'Authorization': `Bearer ${sessionToken}` }),
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get preview URL from backend');
      }

      const data = await response.json() as { url: string; token?: string };
      const normalizedUrl = normalizeUrl(data.url);
      const previewURL = buildPreviewUrl(normalizedUrl, planId);

      console.log(`[Preview] URL retrieved for project ${projectId}:`, previewURL);

      return json({
        success: true,
        previewURL,
        hasToken: !!data.token,
      });
    } catch (fetchError) {
      // Fallback: Return a mock preview URL for development
      console.warn('[Preview] Docker backend unavailable, returning mock URL');

      const mockUrl = `http://localhost:5173/?projectId=${projectId}`;
      const previewURL = buildPreviewUrl(mockUrl, planId);

      return json({
        success: true,
        previewURL,
        isMock: true,
      });
    }
  } catch (error) {
    console.error('[Preview] Get URL error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get preview URL',
    }, { status: 500 });
  }
}

/**
 * POST /api/preview - Update container content and get new preview URL
 * Body: { projectId, planId? }
 */
export async function action({ request, context }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json() as PreviewRequest;
    const { projectId, planId } = body;

    if (!projectId) {
      return json({ success: false, error: 'Project ID is required' }, { status: 400 });
    }

    const env = context?.cloudflare?.env || process.env || {};
    const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;
    const dockerBackendUrl = (env as any).DOCKER_BACKEND_URL || 'http://localhost:3100';

    if (!databaseUrl) {
      return json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    // Verify project access
    const projectsDB = new ProjectsDB(databaseUrl);
    const project = await projectsDB.getProject(projectId, session.user.id);

    if (!project) {
      return json({ success: false, error: 'Project not found or unauthorized' }, { status: 404 });
    }

    // Extract session token for backend auth
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionToken = extractSessionToken(cookieHeader);

    try {
      // Trigger container content update
      const updateResponse = await fetch(`${dockerBackendUrl}/preview/${projectId}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken && { 'Authorization': `Bearer ${sessionToken}` }),
        },
        body: JSON.stringify({ planId }),
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || 'Failed to update container');
      }

      // Get the new preview URL
      const previewResponse = await fetch(`${dockerBackendUrl}/preview/${projectId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken && { 'Authorization': `Bearer ${sessionToken}` }),
        },
      });

      if (!previewResponse.ok) {
        throw new Error('Failed to get preview URL');
      }

      const data = await previewResponse.json() as { url: string; token?: string };
      const normalizedUrl = normalizeUrl(data.url);
      const previewURL = buildPreviewUrl(normalizedUrl, planId);

      console.log(`[Preview] Container updated for project ${projectId}, URL:`, previewURL);

      return json({
        success: true,
        previewURL,
        planId,
      });
    } catch (fetchError) {
      console.error('[Preview] Container update error:', fetchError);

      // Return mock for development
      const mockUrl = `http://localhost:5173/?projectId=${projectId}`;
      const previewURL = buildPreviewUrl(mockUrl, planId);

      return json({
        success: true,
        previewURL,
        planId,
        isMock: true,
        warning: 'Container update skipped - development mode',
      });
    }
  } catch (error) {
    console.error('[Preview] Update error:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update preview',
    }, { status: 500 });
  }
}
