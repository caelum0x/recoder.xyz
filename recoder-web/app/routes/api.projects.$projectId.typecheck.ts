/**
 * Project Typecheck API
 *
 * POST /api/projects/:projectId/typecheck
 * Body: { paths?: string[] }
 *
 * Proxies to docker-backend /api/typecheck/:projectId
 */

import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { JsonResponse } from '~/lib/http/json-response';
import { createDockerAuthHeaders, dockerFetchJson, getDockerBackendUrl } from '~/lib/http/docker-server';

export async function action({ request, params }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return JsonResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const projectId = params.projectId;
  if (!projectId) {
    return JsonResponse.json({ success: false, error: 'Project ID is required' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as { paths?: string[] };
  const dockerUrl = getDockerBackendUrl();
  const headers = createDockerAuthHeaders(request);

  try {
    const payload = await dockerFetchJson<unknown>(
      `${dockerUrl}/api/typecheck/${projectId}`,
      {
        method: 'POST',
        body: JSON.stringify({ paths: body?.paths }),
      },
      headers,
    );
    return JsonResponse.json(payload);
  } catch (error) {
    return JsonResponse.json(
      {
        success: false,
        error: 'Typecheck failed',
      },
      { status: 500 }
    );
  }
}
