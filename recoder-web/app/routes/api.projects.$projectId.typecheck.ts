/**
 * Project Typecheck API
 *
 * POST /api/projects/:projectId/typecheck
 * Body: { paths?: string[] }
 *
 * Proxies to docker-backend /api/typecheck/:projectId
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';

function getDockerBackendUrl(): string {
  return process.env.VITE_DOCKER_BACKEND_URL || process.env.DOCKER_BACKEND_URL || 'http://localhost:3100';
}

function getSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  const cookieNames = [
    '__Secure-recoder.session_token',
    'recoder.session_token',
    '__Secure-session_token',
    'session_token',
    'recoder_session_token',
  ];

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    const value = valueParts.join('=');
    if (cookieNames.includes(name) && value) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

export async function action({ request, params }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const projectId = params.projectId;
  if (!projectId) {
    return json({ success: false, error: 'Project ID is required' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as { paths?: string[] };
  const dockerUrl = getDockerBackendUrl();
  const token = getSessionToken(request);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${dockerUrl}/api/typecheck/${projectId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ paths: body?.paths }),
    });

    const text = await response.text();
    if (!response.ok) {
      return json({ success: false, error: text || 'Typecheck failed' }, { status: response.status });
    }

    return json(JSON.parse(text));
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Typecheck failed',
      },
      { status: 500 }
    );
  }
}

