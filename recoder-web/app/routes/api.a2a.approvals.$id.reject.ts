/**
 * A2A Approval Reject Proxy Route
 *
 * POST /api/a2a/approvals/:id/reject - Proxy approval rejection to docker-backend
 *
 * The approval service lives in docker-backend at /api/a2a/approvals/:approvalId/reject.
 * This route proxies the request with auth forwarding.
 */

import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { getDockerBackendUrl, createDockerProxyHeaders } from '~/lib/http/docker-server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('A2A-Approval-Reject-Proxy');

export async function action({ request, params, context }: ActionFunctionArgs) {
  const approvalId = params.id;
  if (!approvalId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Approval ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const dockerUrl = getDockerBackendUrl(context);
  const headers = createDockerProxyHeaders(request);

  try {
    const body = await request.text();
    const upstream = await fetch(`${dockerUrl}/api/a2a/approvals/${encodeURIComponent(approvalId)}/reject`, {
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
    logger.error(`Failed to proxy POST /api/a2a/approvals/${approvalId}/reject:`, error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to reach approval service' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
