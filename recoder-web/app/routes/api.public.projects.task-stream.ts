import { type LoaderFunctionArgs } from '@remix-run/cloudflare';
import * as z from 'zod/v4';
import { verifySession } from '~/lib/auth/session.server';
import { verifyMobileSession } from '~/lib/auth/mobile-session.server';
import { getDockerBackendUrl } from '~/lib/http/docker-server';
import { JsonResponse } from '~/lib/http/json-response';
import { copyRateLimitHeaders } from '~/lib/public-api/rate-limit-headers';
import { createScopedLogger } from '~/utils/logger';
import {
  authRequired,
  parseQueryWithSchema,
  validationError,
} from '~/lib/http/request-validation';

const logger = createScopedLogger('api.public.projects.task-stream');

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    const mobileSession = await verifyMobileSession(request, context);
    if (!mobileSession) {
      return authRequired();
    }
  }

  try {
    const parsedQuery = parseQueryWithSchema(
      { request },
      z.object({
        projectId: z.string().trim().min(1, 'projectId is required'),
        taskId: z.string().trim().min(1, 'taskId is required'),
        apiKey: z.string().trim().optional(),
      }),
    );
    if (!parsedQuery.ok) return parsedQuery.response;
    const { projectId, taskId } = parsedQuery.data;
    const queryApiKey = parsedQuery.data.apiKey || '';
    const authHeader = request.headers.get('Authorization') || '';
    const apiKeyHeader = request.headers.get('X-API-Key') || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const apiKey = (bearerMatch?.[1] || apiKeyHeader || queryApiKey).trim();
    const usedDeprecatedQueryApiKey = !bearerMatch?.[1] && !apiKeyHeader && Boolean(queryApiKey);

    if (!apiKey) {
      return validationError('Authorization: Bearer <apiKey> is required (query apiKey is deprecated)');
    }
    if (usedDeprecatedQueryApiKey) {
      logger.warn('Deprecated query apiKey used; migrate to Authorization header');
    }

    const upstream = await fetch(
      `${getDockerBackendUrl(context)}/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/stream`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'text/event-stream',
          ...(request.headers.get('Last-Event-ID')
            ? { 'Last-Event-ID': request.headers.get('Last-Event-ID') as string }
            : {}),
        },
      }
    );

    if (!upstream.ok || !upstream.body) {
      const payload = await upstream.json().catch(() => ({ success: false, error: 'Invalid response from backend' }));
      const headers = new Headers();
      copyRateLimitHeaders(upstream.headers, headers);
      return JsonResponse.json(payload, { status: upstream.status, headers });
    }

    const headers = new Headers({
      'Content-Type': upstream.headers.get('Content-Type') || 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    });
    copyRateLimitHeaders(upstream.headers, headers);
    if (usedDeprecatedQueryApiKey) {
      headers.set('Deprecation', 'true');
      headers.set('Sunset', 'Wed, 01 Jul 2026 00:00:00 GMT');
      headers.set('Warning', '299 - "Query parameter apiKey is deprecated; use Authorization: Bearer <apiKey>"');
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    return JsonResponse.json({
      success: false,
      error: 'Failed to stream project task updates',
    }, { status: 500 });
  }
}
