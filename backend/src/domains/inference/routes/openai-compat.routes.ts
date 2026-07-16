/**
 * @module inference/routes/openai-compat
 *
 * OpenAI wire-compatible surface over the inference delivery ladder. This is the
 * path off-the-shelf OpenAI clients (e.g. Wave AI's `ai:baseurl`) hit:
 *
 *   POST /v1/chat/completions — OpenAI chat-completion request → the routing
 *     service → an OpenAI `chat.completion` (buffered) or `chat.completion.chunk`
 *     SSE stream.
 *
 * REUSES + DEEPENS `backend/src/gateway/openai-compat.routes.ts`. The v1 gateway
 * route buffered the whole completion and emitted it as ONE SSE content chunk
 * (`streamSingleChunkCompletion`) because the underlying port was single-shot.
 * This version wires `stream:true` to `InferenceRoutingService.completeStream`,
 * which delivers REAL per-token SSE deltas through the loopback gateway
 * (`tokenGranular:true`), degrading to a buffered single-chunk emit only when the
 * ladder falls to the napi embedded gateway (no stream seam) — truthful either way.
 *
 * TRUTHFUL DEGRADE: SSE headers are deferred until the FIRST delta proves the
 * call routed. A pre-stream failure (validation / unconfigured / upstream error)
 * that produced no deltas is returned as a plain OpenAI-style JSON error with an
 * honest status code — never a fabricated stream, never a 200 over a failure.
 *
 * INJECTABLE DEPS: the routing service, auth middleware, and id/clock factories
 * are all injected, so the mapping unit-tests with a fake service and fake `res`.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { InferenceRoutingService } from '../services/inference-routing.service.js';
import type { InferenceMessage, InferenceRole, StreamDelta } from '../types.js';

/** No-op middleware used when no auth is injected (keeps routes composable). */
const passthrough: RequestHandler = (_req: Request, _res: Response, next: NextFunction) => next();

export interface InferenceOpenAiCompatDeps {
  /** The routing service every completion + its accounting flows through. */
  readonly routing: Pick<InferenceRoutingService, 'complete' | 'completeStream'>;
  /** Injected auth middleware for the route. Omit to leave it open. */
  readonly authenticateRequest?: RequestHandler;
  /** Injectable id generator (default: `chatcmpl-<random>`). */
  readonly idFactory?: () => string;
  /** Injectable clock in epoch seconds (default: `Date.now()`-based). */
  readonly now?: () => number;
}

/** OpenAI roles we accept, mapped onto the inference role set. */
const ROLE_MAP: Record<string, InferenceRole> = {
  system: 'system',
  developer: 'system',
  user: 'user',
  assistant: 'assistant',
  tool: 'tool',
};

/** Extract text from an OpenAI message `content` (string or content-part array). */
function extractContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      const text = (part as { text?: unknown } | null)?.text;
      if (typeof text === 'string') parts.push(text);
    }
    return parts.join('\n');
  }
  return null;
}

/** Validate + map an OpenAI `messages` array. Returns null on any invalid shape. */
export function parseOpenAiMessages(value: unknown): InferenceMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: InferenceMessage[] = [];
  for (const m of value) {
    if (!m || typeof m !== 'object') return null;
    const rawRole = (m as { role?: unknown }).role;
    if (typeof rawRole !== 'string') return null;
    const role = ROLE_MAP[rawRole];
    if (!role) return null;
    const content = extractContent((m as { content?: unknown }).content);
    if (content === null) return null;
    out.push({ role, content });
  }
  return out;
}

/** Default OpenAI-style completion id. */
function defaultId(): string {
  const uuid = (globalThis.crypto as { randomUUID?: () => string } | undefined)?.randomUUID?.();
  const rnd = (uuid ?? Math.random().toString(36).slice(2)).replace(/-/g, '');
  return `chatcmpl-${rnd}`;
}

/** Write an OpenAI-style error body with a truthful status + message. */
function sendOpenAiError(res: Response, status: number, message: string, type: string): void {
  res.status(status).json({ error: { message, type, code: null, param: null } });
}

interface SseEnvelope {
  id: string;
  created: number;
  model: string;
}

interface OpenAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Frame one OpenAI `chat.completion.chunk` as an SSE `data:` event. */
export function formatSseChunk(
  envelope: SseEnvelope,
  delta: Record<string, unknown>,
  finishReason: string | null,
  usage?: OpenAiUsage,
): string {
  const payload = {
    id: envelope.id,
    object: 'chat.completion.chunk',
    created: envelope.created,
    model: envelope.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...(usage ? { usage } : {}),
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Map inference `TokenUsage` onto the OpenAI snake_case usage block. */
function toOpenAiUsage(usage?: { inputTokens: number; outputTokens: number; totalTokens: number }): OpenAiUsage | undefined {
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.inputTokens,
    completion_tokens: usage.outputTokens,
    total_tokens: usage.totalTokens,
  };
}

/**
 * Core handler: OpenAI chat-completion request → routing service → OpenAI body
 * (buffered) or SSE stream (real per-token deltas). Exported for direct testing.
 */
export async function handleChatCompletion(deps: InferenceOpenAiCompatDeps, req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as {
    model?: unknown;
    messages?: unknown;
    temperature?: unknown;
    max_tokens?: unknown;
    stream?: unknown;
  };

  if (typeof body.model !== 'string' || !body.model.trim()) {
    return sendOpenAiError(res, 400, 'model (string) is required', 'invalid_request_error');
  }
  const messages = parseOpenAiMessages(body.messages);
  if (messages === null) {
    return sendOpenAiError(res, 400, 'messages (non-empty array of {role,content}) is required', 'invalid_request_error');
  }

  const model = body.model.trim();
  const userId = req.principal?.userId;
  const request = {
    model,
    messages,
    ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
    ...(typeof body.max_tokens === 'number' ? { maxTokens: body.max_tokens } : {}),
    ...(userId ? { userId } : {}),
  };

  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const makeId = deps.idFactory ?? defaultId;
  const envelope: SseEnvelope = { id: makeId(), created: now(), model };

  if (body.stream === true) {
    return handleStream(deps, res, envelope, request);
  }

  const result = await deps.routing.complete(request);
  if (!result.routed) {
    // Pre-dispatch entitlement refusal: a truthful 429 (OpenAI `insufficient_quota`),
    // never a 5xx gateway error over an over-quota subject.
    if (result.denied === 'quota') {
      return sendOpenAiError(res, 429, result.reason ?? 'token quota exceeded', 'insufficient_quota');
    }
    const status = result.tier === 'none' && result.reason?.includes('unconfigured') ? 503 : 502;
    return sendOpenAiError(res, status, result.reason ?? 'gateway unavailable', 'gateway_error');
  }

  res.status(200).json({
    id: envelope.id,
    object: 'chat.completion',
    created: envelope.created,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: result.content ?? '' }, finish_reason: 'stop' }],
    ...(toOpenAiUsage(result.usage) ? { usage: toOpenAiUsage(result.usage) } : {}),
  });
}

/**
 * Stream handler: defers SSE headers until the first delta proves delivery, so a
 * no-delta failure is a plain JSON error (honest status), and a routed call emits
 * a valid `chat.completion.chunk` stream ending with a finish chunk + `[DONE]`.
 */
async function handleStream(
  deps: InferenceOpenAiCompatDeps,
  res: Response,
  envelope: SseEnvelope,
  request: Parameters<InferenceRoutingService['completeStream']>[0],
): Promise<void> {
  let headersSent = false;
  const ensureHeaders = (): void => {
    if (headersSent) return;
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    (res as { flushHeaders?: () => void }).flushHeaders?.();
    headersSent = true;
  };

  const onDelta = (delta: StreamDelta): void => {
    ensureHeaders();
    if (delta.role) {
      res.write(formatSseChunk(envelope, { role: delta.role }, null));
    }
    if (typeof delta.content === 'string') {
      res.write(formatSseChunk(envelope, { content: delta.content }, null));
    }
  };

  const result = await deps.routing.completeStream(request, onDelta);

  if (!headersSent) {
    // No deltas were emitted — the call did not route. Return a truthful error.
    if (result.denied === 'quota') {
      return sendOpenAiError(res, 429, result.reason ?? 'token quota exceeded', 'insufficient_quota');
    }
    const status = result.tier === 'none' && result.reason?.includes('unconfigured') ? 503 : 502;
    return sendOpenAiError(res, status, result.reason ?? 'gateway unavailable', 'gateway_error');
  }

  // Finish frame (usage when the gateway reported it) + terminal marker.
  res.write(formatSseChunk(envelope, {}, 'stop', toOpenAiUsage(result.usage)));
  res.write('data: [DONE]\n\n');
  res.end();
}

/** Build the OpenAI-compatible sub-router. Mount so `/v1/chat/completions` resolves. */
export function createOpenAiCompatRouter(deps: InferenceOpenAiCompatDeps): Router {
  const router = Router();
  const auth = deps.authenticateRequest ?? passthrough;
  router.post('/v1/chat/completions', auth, (req, res) => handleChatCompletion(deps, req, res));
  return router;
}
