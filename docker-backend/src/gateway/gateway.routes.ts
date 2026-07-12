/**
 * @module gateway/gateway.routes
 *
 * HTTP surface for the BYOK LLM Gateway skin (RECODER-ENGINES E15). Intended to
 * be mounted at `/api/gateway`, giving:
 *
 *   GET  /health   — truthful { configured, endpoint } (NEVER the key). Public,
 *                    read-only, safe for orchestrators/load-balancers to poll.
 *   POST /embed    — proxy an embedding request through the gateway.
 *   POST /complete — proxy a completion request through the gateway.
 *
 * DEGRADE-SAFE: when no gateway endpoint is configured the write routes respond
 * 503 with a truthful reason — never a faked 200 — so callers fall back to a
 * direct provider. The read-only /health is always safe and never leaks the key.
 *
 * AUTH POSTURE: the write routes (/embed, /complete) are guarded by the injected
 * `authenticateRequest` middleware when provided. /health stays public.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

import { createLogger } from '../logger.js';
import {
  createTensorzeroGatewayClient,
  type LlmGatewayPort,
  type GatewayMessage,
} from './tensorzero-client.js';
import { createOpenAiCompatRouter } from './openai-compat.routes.js';

const logger = createLogger('gateway:routes');

export interface GatewayRouterDeps {
  /** Injected auth middleware for the write routes. Omit to leave them open. */
  authenticateRequest?: RequestHandler;
  /** Injected gateway client (defaults to an env-configured one). */
  client?: LlmGatewayPort;
}

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

function fail(res: Response, status: number, message: string, extra?: unknown): void {
  res.status(status).json({ success: false, error: message, ...(extra ? { data: extra } : {}) });
}

/** No-op middleware used when no auth is injected (keeps routes composable). */
const passthrough: RequestHandler = (_req: Request, _res: Response, next: NextFunction) => next();

/** Validate an incoming messages array (system boundary — never trust input). */
function parseMessages(value: unknown): GatewayMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const roles = new Set(['system', 'user', 'assistant', 'tool']);
  const out: GatewayMessage[] = [];
  for (const m of value) {
    if (!m || typeof m !== 'object') return null;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (typeof role !== 'string' || !roles.has(role)) return null;
    if (typeof content !== 'string') return null;
    out.push({ role: role as GatewayMessage['role'], content });
  }
  return out;
}

export function createGatewayRouter(deps: GatewayRouterDeps = {}): Router {
  const router = Router();
  const client = deps.client ?? createTensorzeroGatewayClient();
  const auth = deps.authenticateRequest ?? passthrough;

  /**
   * GET /health — truthful configuration + reachability. NEVER returns the key.
   */
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const health = await client.health();
      // Read-only health always 200s with a truthful body; callers inspect
      // `configured`/`reachable` rather than relying on the status code.
      ok(res, health);
    } catch (err) {
      logger.warn({ err }, 'gateway health check errored');
      fail(res, 500, err instanceof Error ? err.message : 'health check failed');
    }
  });

  /**
   * POST /embed — { model, input } → embedding vectors via the gateway.
   */
  router.post('/embed', auth, async (req: Request, res: Response) => {
    const { model, input } = (req.body ?? {}) as { model?: unknown; input?: unknown };
    if (typeof model !== 'string' || !model.trim()) {
      return fail(res, 400, 'model (string) is required');
    }
    const validInput =
      typeof input === 'string'
        ? input
        : Array.isArray(input) && input.every((s) => typeof s === 'string')
          ? (input as string[])
          : null;
    if (validInput === null) {
      return fail(res, 400, 'input (string or string[]) is required');
    }

    const result = await client.embed({ model: model.trim(), input: validInput });
    if (!result.routed) {
      return fail(res, 503, result.reason ?? 'gateway unavailable', result);
    }
    ok(res, result);
  });

  /**
   * POST /complete — { model, messages, temperature?, maxTokens? } → completion.
   */
  router.post('/complete', auth, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      model?: unknown;
      messages?: unknown;
      temperature?: unknown;
      maxTokens?: unknown;
    };
    if (typeof body.model !== 'string' || !body.model.trim()) {
      return fail(res, 400, 'model (string) is required');
    }
    const messages = parseMessages(body.messages);
    if (messages === null) {
      return fail(res, 400, 'messages (non-empty {role,content}[] ) is required');
    }

    const result = await client.complete({
      model: body.model.trim(),
      messages,
      temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
      maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
    });
    if (!result.routed) {
      return fail(res, 503, result.reason ?? 'gateway unavailable', result);
    }
    ok(res, result);
  });

  // ── OpenAI wire-compatible surface ─────────────────────────────────────────
  // Mounts POST /v1/chat/completions so off-the-shelf OpenAI clients (Wave AI's
  // `ai:baseurl`) route completions through this same governed gateway client.
  // Effective path under /api/gateway is /api/gateway/v1/chat/completions.
  router.use(createOpenAiCompatRouter({ client, authenticateRequest: auth }));

  return router;
}
