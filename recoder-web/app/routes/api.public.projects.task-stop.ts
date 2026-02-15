import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import * as z from 'zod/v4';
import { verifySession } from '~/lib/auth/session.server';
import { verifyMobileSession } from '~/lib/auth/mobile-session.server';
import { getDockerBackendUrl } from '~/lib/http/docker-server';
import { JsonResponse } from '~/lib/http/json-response';
import { copyRateLimitHeaders } from '~/lib/public-api/rate-limit-headers';
import { createScopedLogger } from '~/utils/logger';
import {
  authRequired,
  methodNotAllowed,
  parseJsonWithSchema,
  validationError,
} from '~/lib/http/request-validation';

const logger = createScopedLogger('api.public.projects.task-stop');

const StopTaskRequestSchema = z.object({
  projectId: z.string().trim().min(1, 'projectId is required'),
  taskId: z.string().trim().min(1, 'taskId is required'),
  apiKey: z.string().trim().optional(),
});

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed();
  }

  const session = await verifySession(request);
  if (!session?.user) {
    const mobileSession = await verifyMobileSession(request, context);
    if (!mobileSession) {
      return authRequired();
    }
  }

  try {
    const parsed = await parseJsonWithSchema(request, StopTaskRequestSchema);
    if (!parsed.ok) return parsed.response;

    const { projectId, taskId } = parsed.data;
    const bodyApiKey = parsed.data.apiKey || '';
    const authHeader = request.headers.get('Authorization') || '';
    const apiKeyHeader = request.headers.get('X-API-Key') || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const apiKey = (bearerMatch?.[1] || apiKeyHeader || bodyApiKey).trim();

    if (!apiKey) {
      return validationError('Authorization: Bearer <apiKey> is required (or provide apiKey in body)');
    }

    const response = await fetch(
      `${getDockerBackendUrl(context)}/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/stop`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const payload = await response.json().catch(() => ({ success: false, error: 'Invalid response from backend' }));
    const headers = new Headers();
    copyRateLimitHeaders(response.headers, headers);
    return JsonResponse.json(payload, { status: response.status, headers });
  } catch (error) {
    logger.error('Failed to stop project task', error);
    return JsonResponse.json({
      success: false,
      error: 'Failed to stop project task',
    }, { status: 500 });
  }
}
