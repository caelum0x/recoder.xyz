/**
 * @module inference/routes/openai-embeddings
 *
 * OpenAI wire-compatible embeddings edge over the inference delivery ladder:
 *
 *   POST /v1/embeddings — OpenAI embedding request → `InferenceRoutingService.embed`
 *     (the same `InferenceGatewayPort.embed` seam every embedding caller rides)
 *     → an OpenAI `list`-of-`embedding` body with `usage`, or a truthful error.
 *
 * TRUTHFUL DEGRADE: when no tier can serve (`routed:false` or no vectors) the
 * edge returns an honest OpenAI-style error — 503 when the gateway is
 * unconfigured, 502 on an upstream fault — never a 200 over a failure, never
 * fabricated vectors, never fabricated usage numbers.
 *
 * INPUT VALIDATION (system boundary — never trust input): `model` must be a
 * non-empty string; `input` a non-empty string or non-empty array of non-empty
 * strings; only `encoding_format:"float"` is supported (a base64 request is
 * refused truthfully instead of silently returning floats).
 */
import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { InferenceRoutingService } from '../services/inference-routing.service.js';
import { sendOpenAiError } from './openai-compat.routes.js';

/** No-op middleware used when no auth is injected (keeps routes composable). */
const passthrough: RequestHandler = (_req: Request, _res: Response, next: NextFunction) => next();

export interface InferenceEmbeddingsDeps {
  /** The routing service the embedding call flows through (gateway seam). */
  readonly routing: Pick<InferenceRoutingService, 'embed'>;
  /** Injected auth middleware for the route. Omit to leave it open. */
  readonly authenticateRequest?: RequestHandler;
}

/**
 * Validate + normalize an OpenAI `input` value: a non-empty string, or a
 * non-empty array of non-empty strings. Returns null on any invalid shape
 * (token-integer arrays are not supported by the delivery ladder).
 */
export function parseEmbeddingInput(value: unknown): string | string[] | null {
  if (typeof value === 'string') return value.trim() ? value : null;
  if (Array.isArray(value) && value.length > 0) {
    const out: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string' || !item.trim()) return null;
      out.push(item);
    }
    return out;
  }
  return null;
}

/** Map a not-routed embed result onto a truthful HTTP status (503 vs 502). */
function degradeStatus(tier: string, reason: string | undefined): number {
  return tier === 'none' && /not configured|unconfigured/i.test(reason ?? '') ? 503 : 502;
}

/**
 * Core handler: OpenAI embedding request → routing service → OpenAI `list`
 * body or a truthful error. Exported for direct testing.
 */
export async function handleEmbeddings(deps: InferenceEmbeddingsDeps, req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as { model?: unknown; input?: unknown; encoding_format?: unknown };

  if (typeof body.model !== 'string' || !body.model.trim()) {
    return sendOpenAiError(res, 400, 'model (string) is required', 'invalid_request_error');
  }
  if (body.encoding_format !== undefined && body.encoding_format !== 'float') {
    return sendOpenAiError(res, 400, 'only encoding_format "float" is supported', 'invalid_request_error');
  }
  const input = parseEmbeddingInput(body.input);
  if (input === null) {
    return sendOpenAiError(
      res,
      400,
      'input (non-empty string or non-empty array of non-empty strings) is required',
      'invalid_request_error',
    );
  }

  const userId = req.principal?.userId;
  const result = await deps.routing.embed({
    model: body.model.trim(),
    input,
    ...(userId ? { userId } : {}),
  });

  if (!result.routed || !result.embeddings) {
    return sendOpenAiError(
      res,
      degradeStatus(result.tier, result.reason),
      result.reason ?? 'no embedding tier available',
      'gateway_error',
    );
  }

  const inputTokens = result.usage?.inputTokens;
  res.status(200).json({
    object: 'list',
    data: result.embeddings.map((embedding, index) => ({ object: 'embedding', index, embedding })),
    model: result.model,
    // Usage only when the gateway truthfully reported it — never fabricated zeros.
    ...(typeof inputTokens === 'number' ? { usage: { prompt_tokens: inputTokens, total_tokens: inputTokens } } : {}),
  });
}

/** Build the embeddings sub-router. Mount so `/v1/embeddings` resolves. */
export function createOpenAiEmbeddingsRouter(deps: InferenceEmbeddingsDeps): Router {
  const router = Router();
  const auth = deps.authenticateRequest ?? passthrough;
  router.post('/v1/embeddings', auth, (req, res) => void handleEmbeddings(deps, req, res));
  return router;
}
