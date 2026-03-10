/**
 * A2A SSE Events Stream Proxy Route
 *
 * GET /api/a2a/events/stream - Proxy SSE stream from docker-backend
 *
 * The SSE stream lives in docker-backend at /api/a2a/events/stream.
 * This route proxies the stream with auth forwarding, preserving
 * the Server-Sent Events protocol end-to-end.
 */

import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getDockerBackendUrl, createDockerProxyHeaders } from '~/lib/http/docker-server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('A2A-SSE-Proxy');

export async function loader({ request, context }: LoaderFunctionArgs) {
  const dockerUrl = getDockerBackendUrl(context);
  const headers = createDockerProxyHeaders(request);
  // SSE requests should not send Content-Type: application/json
  delete headers['Content-Type'];
  headers['Accept'] = 'text/event-stream';

  const url = new URL(request.url);

  try {
    const upstream = await fetch(`${dockerUrl}/api/a2a/events/stream${url.search}`, {
      method: 'GET',
      headers,
      signal: request.signal,
    });

    if (!upstream.ok) {
      const errorBody = await upstream.text().catch(() => 'Unknown error');
      logger.error(`SSE upstream returned ${upstream.status}: ${errorBody}`);
      return new Response(
        JSON.stringify({ success: false, error: 'SSE stream connection failed' }),
        { status: upstream.status, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!upstream.body) {
      return new Response(
        JSON.stringify({ success: false, error: 'SSE stream body is empty' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Pass through the SSE stream directly
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    // Don't log abort errors (normal when client disconnects)
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new Response(null, { status: 499 });
    }

    logger.error('Failed to proxy SSE stream:', error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to reach event stream service' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
