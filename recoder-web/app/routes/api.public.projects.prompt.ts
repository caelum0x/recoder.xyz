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
} from '~/lib/http/request-validation';

const logger = createScopedLogger('api.public.projects.prompt');

const PromptRequestSchema = z.object({
  projectId: z.string().trim().min(1, 'projectId is required'),
  prompt: z.string().trim().min(1, 'prompt is required'),
  apiKey: z.string().trim().min(1, 'apiKey is required'),
  model: z.string().trim().optional(),
});

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed();
  }

  const session = await verifySession(request);
  if (!session?.user) {
    // Try mobile session fallback (Bearer token)
    const mobileSession = await verifyMobileSession(request, context);
    if (!mobileSession) {
      return authRequired();
    }
    // Mobile session authenticated — continue with the request
  }

  try {
    const parsed = await parseJsonWithSchema(request, PromptRequestSchema);
    if (!parsed.ok) return parsed.response;
    const { projectId, prompt, apiKey, model } = parsed.data;

    const response = await fetch(`${getDockerBackendUrl(context)}/api/v1/projects/${encodeURIComponent(projectId)}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        ...(model ? { model } : {}),
      }),
    });

    const payload = await response.json().catch(() => ({ success: false, error: 'Invalid response from backend' }));
    const headers = new Headers();
    copyRateLimitHeaders(response.headers, headers);
    return JsonResponse.json(payload, { status: response.status, headers });
  } catch (error) {
    logger.error('Failed to start project prompt task', error);
    return JsonResponse.json({
      success: false,
      error: 'Failed to start project prompt task',
    }, { status: 500 });
  }
}
