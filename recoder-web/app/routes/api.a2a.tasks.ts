/**
 * A2A Tasks Proxy Route
 *
 * POST /api/a2a/tasks - Proxy task creation to docker-backend
 * GET  /api/a2a/tasks - Proxy task listing to docker-backend
 *
 * The actual task lifecycle service lives in docker-backend at /api/a2a/tasks.
 * This route proxies requests with auth forwarding.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getDockerBackendUrl, createDockerProxyHeaders } from '~/lib/http/docker-server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('A2A-Tasks-Proxy');

export async function action({ request, context }: ActionFunctionArgs) {
  const dockerUrl = getDockerBackendUrl(context);
  const headers = createDockerProxyHeaders(request);

  try {
    const body = await request.text();
    const upstream = await fetch(`${dockerUrl}/api/a2a/tasks`, {
      method: 'POST',
      headers,
      body,
    });

    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    logger.error('Failed to proxy POST /api/a2a/tasks:', error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to reach task service' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const dockerUrl = getDockerBackendUrl(context);
  const headers = createDockerProxyHeaders(request);
  const url = new URL(request.url);

  try {
    const upstream = await fetch(`${dockerUrl}/api/a2a/tasks${url.search}`, {
      method: 'GET',
      headers,
    });

    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    logger.error('Failed to proxy GET /api/a2a/tasks:', error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to reach task service' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
