/**
 * Preview URL API Alias
 *
 * GET /api/preview/:projectId/url
 *
 * Proxies directly to docker-backend preview URL resolution so existing
 * frontend callers can use the path-style route.
 */

import { type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { verifySession } from '~/lib/auth/session.server';
import { JsonResponse } from '~/lib/http/json-response';
import { createDockerAuthHeaders, dockerFetchJson, getDockerBackendUrl } from '~/lib/http/docker-server';

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return JsonResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const projectId = params.projectId;
  if (!projectId) {
    return JsonResponse.json({ success: false, error: 'Project ID is required' }, { status: 400 });
  }

  const dockerBackendUrl = getDockerBackendUrl(context);
  const headers = createDockerAuthHeaders(request);

  try {
    const payload = await dockerFetchJson<unknown>(
      `${dockerBackendUrl}/api/preview/${projectId}/url`,
      { method: 'GET' },
      headers,
    );
    return JsonResponse.json(payload);
  } catch (error) {
    return JsonResponse.json(
      {
        success: false,
        error: 'Preview URL failed',
      },
      { status: 503 },
    );
  }
}
