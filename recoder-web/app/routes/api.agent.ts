/**
 * Agent Mode API Route
 *
 * POST /api/agent - Start an agent session
 *
 * Streams AgentEvent objects via SSE as the agent progresses through
 * analyze -> plan -> execute -> verify -> fix -> review phases.
 */

import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AgentRoute');

export async function action({ context, request }: ActionFunctionArgs) {
  // Dynamic imports for server-only modules
  const [
    { runAgent },
    { verifySession },
    { chatRateLimiter, applyRateLimit, createRateLimitResponse },
  ] = await Promise.all([
    import('~/lib/.server/llm/agent-orchestrator'),
    import('~/lib/auth/session.server'),
    import('~/lib/.server/middleware/rate-limiter'),
  ]);

  // Rate limiting
  const rateLimitResult = await applyRateLimit(request, chatRateLimiter);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult.headers, rateLimitResult.error);
  }

  // Auth check
  const session = await verifySession(request);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse request body
  let body: {
    action?: string;
    prompt?: string;
    projectId: string;
    model?: string;
    maxFixIterations?: number;
    path?: string;
    content?: string;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.projectId) {
    return new Response(JSON.stringify({ error: 'projectId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle revert-file action (called when user rejects specific files)
  if (body.action === 'revert-file') {
    if (!body.path) {
      return new Response(JSON.stringify({ error: 'path is required for revert-file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (body.content === undefined) {
      return new Response(JSON.stringify({ error: 'content is required for revert-file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const { dockerPost } = await import('~/lib/services/docker-api');
      await dockerPost(`/api/file/${body.projectId}`, {
        filePath: body.path,
        content: body.content,
      });

      logger.info(`[Agent] Reverted file: ${body.path} in project ${body.projectId}`);
      return new Response(JSON.stringify({ success: true, path: body.path }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      logger.error(`[Agent] Revert failed for ${body.path}:`, error.message);
      return new Response(JSON.stringify({ error: 'Failed to revert file' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Default action: start agent session
  if (!body.prompt) {
    return new Response(JSON.stringify({ error: 'prompt is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const env = (context as any)?.cloudflare?.env || process.env;

  logger.info(`[Agent] Starting session for project ${body.projectId}: "${body.prompt.slice(0, 80)}..."`);

  try {
    const stream = await runAgent({
      prompt: body.prompt,
      projectId: body.projectId,
      env: env as Record<string, string | undefined>,
      request,
      signal: request.signal,
      maxFixIterations: body.maxFixIterations ?? 5,
      model: body.model,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    };

    // Add rate limit headers
    Object.entries(rateLimitResult.headers).forEach(([key, value]) => {
      headers[key] = value;
    });

    return new Response(stream, { status: 200, headers });
  } catch (error: any) {
    logger.error('[Agent] Error:', error.message);

    const encoder = new TextEncoder();
    const errorEvent = JSON.stringify({
      type: 'error',
      data: { message: 'Internal server error' },
      timestamp: Date.now(),
    });

    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        controller.close();
      },
    });

    return new Response(errorStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  }
}
