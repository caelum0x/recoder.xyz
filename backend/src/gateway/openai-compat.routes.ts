/**
 * @module gateway/openai-compat.routes
 *
 * OpenAI wire-compatible surface over the BYOK LLM Gateway skin
 * (RECODER-ENGINES E15). This is the path that off-the-shelf OpenAI clients
 * (e.g. Wave AI's `ai:baseurl`) hit:
 *
 *   POST /v1/chat/completions — accepts an OpenAI chat-completion request
 *     ({ model, messages:[{role,content}], temperature?, max_tokens?, stream? }),
 *     maps it onto `LlmGatewayPort.complete(...)`, and returns an OpenAI-shaped
 *     `{ id, object:'chat.completion', choices:[{message:{role,content}}], usage }`.
 *
 * It is a SIBLING of `gateway.routes.ts`, which mounts it so every BYOK key +
 * completion still traverses the same governed gateway client + audit gate.
 * Mounted under `/api/gateway`, the effective path is
 * `/api/gateway/v1/chat/completions`, so an OpenAI base URL of
 * `http://127.0.0.1:3100/api/gateway/v1` resolves correctly.
 *
 * DEGRADE-SAFE BY CONSTRUCTION: when the gateway is not configured (or configured
 * but the upstream call fails) this returns a TRUTHFUL OpenAI-style error body
 * with an honest status code — never a fabricated completion.
 *
 * STREAMING: `stream:true` is served as valid OpenAI `chat.completion.chunk`
 * SSE. The underlying `LlmGatewayPort` is single-shot (no token seam), so v1
 * buffers the full completion and emits it as ONE content chunk framed by a
 * role chunk, a finish chunk (with usage when known), and `data: [DONE]`.
 * Wave's eventsource consumer checks status before reading the stream, so
 * pre-stream failures (validation, unconfigured, upstream error) stay plain
 * JSON with honest status codes.
 * TODO(gateway-stream-v2): real token-granular streaming needs a
 * `completeStream(req, onDelta)` seam on `LlmGatewayPort` backed by
 * TensorZero's OpenAI-compatible SSE upstream.
 *
 * INJECTABLE DEPS: the gateway `client`, the auth middleware, and the id/clock
 * factories are all injected, so the mapping unit-tests with a fake client and
 * no network.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

import type { LlmGatewayPort, GatewayMessage } from './tensorzero-client.js';

/** No-op middleware used when no auth is injected (keeps routes composable). */
const passthrough: RequestHandler = (_req: Request, _res: Response, next: NextFunction) => next();

export interface OpenAiCompatDeps {
  /** The governed gateway client every completion routes through. */
  client: LlmGatewayPort;
  /** Injected auth middleware for the route. Omit to leave it open. */
  authenticateRequest?: RequestHandler;
  /** Injectable id generator (default: `chatcmpl-<random>`) — for tests. */
  idFactory?: () => string;
  /** Injectable clock in epoch seconds (default: `Date.now()`-based). */
  now?: () => number;
}

/** OpenAI roles we accept, mapped onto the gateway's supported role set. */
const ROLE_MAP: Record<string, GatewayMessage['role']> = {
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

/**
 * Validate + map an OpenAI `messages` array onto `GatewayMessage[]`.
 * Returns null on any invalid shape (system boundary — never trust input).
 */
export function parseOpenAiMessages(value: unknown): GatewayMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: GatewayMessage[] = [];
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

/** Default OpenAI-style completion id. Uses crypto.randomUUID when available. */
function defaultId(): string {
  const uuid = (globalThis.crypto as { randomUUID?: () => string } | undefined)?.randomUUID?.();
  const rnd = (uuid ?? Math.random().toString(36).slice(2)).replace(/-/g, '');
  return `chatcmpl-${rnd}`;
}

/** Write an OpenAI-style error body with a truthful status + message. */
function sendOpenAiError(res: Response, status: number, message: string, type: string): void {
  res.status(status).json({ error: { message, type, code: null, param: null } });
}

/** Fields shared by every chunk of one streamed completion. */
interface SseEnvelope {
  id: string;
  created: number;
  model: string;
}

/** OpenAI usage block mapped from the gateway result (snake_case wire shape). */
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

/**
 * Emit a buffered completion as a valid OpenAI SSE stream:
 * role chunk → single content chunk → finish chunk (+usage) → [DONE].
 * Exported for direct unit testing with a fake `res`.
 */
export function streamSingleChunkCompletion(
  res: Response,
  envelope: SseEnvelope,
  content: string,
  usage?: OpenAiUsage,
): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // flushHeaders is present on real Express responses; guard for test fakes.
  (res as { flushHeaders?: () => void }).flushHeaders?.();

  res.write(formatSseChunk(envelope, { role: 'assistant' }, null));
  res.write(formatSseChunk(envelope, { content }, null));
  res.write(formatSseChunk(envelope, {}, 'stop', usage));
  res.write('data: [DONE]\n\n');
  res.end();
}

/**
 * Core handler: OpenAI chat-completion request → gateway.complete → OpenAI body.
 * Exported for direct unit testing with a fake `client` and fake `res`.
 */
export async function handleChatCompletion(deps: OpenAiCompatDeps, req: Request, res: Response): Promise<void> {
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
    return sendOpenAiError(
      res,
      400,
      'messages (non-empty array of {role,content}) is required',
      'invalid_request_error',
    );
  }

  const result = await deps.client.complete({
    model: body.model.trim(),
    messages,
    temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
    maxTokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
  });

  if (!result.routed) {
    // Truthful degrade: unconfigured => 503, upstream failure => 502. Never fake.
    // Headers are not sent yet, so this stays plain JSON even for stream:true —
    // wave's eventsource consumer checks the status before reading the stream.
    const status = result.configured ? 502 : 503;
    return sendOpenAiError(res, status, result.reason ?? 'gateway unavailable', 'gateway_error');
  }

  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const makeId = deps.idFactory ?? defaultId;

  const usage =
    result.usage &&
    (result.usage.inputTokens !== undefined || result.usage.outputTokens !== undefined)
      ? {
          prompt_tokens: result.usage.inputTokens ?? 0,
          completion_tokens: result.usage.outputTokens ?? 0,
          total_tokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
        }
      : undefined;

  if (body.stream === true) {
    // Buffered-then-emitted SSE: one content chunk, correct wire format.
    // TODO(gateway-stream-v2): token granularity needs a streaming port seam.
    return streamSingleChunkCompletion(
      res,
      { id: makeId(), created: now(), model: body.model.trim() },
      result.content ?? '',
      usage,
    );
  }

  res.status(200).json({
    id: makeId(),
    object: 'chat.completion',
    created: now(),
    model: body.model.trim(),
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: result.content ?? '' },
        finish_reason: 'stop',
      },
    ],
    ...(usage ? { usage } : {}),
  });
}

/**
 * Build the OpenAI-compatible sub-router. Mount it inside the gateway router so
 * `/v1/chat/completions` resolves under `/api/gateway`.
 */
export function createOpenAiCompatRouter(deps: OpenAiCompatDeps): Router {
  const router = Router();
  const auth = deps.authenticateRequest ?? passthrough;
  router.post('/v1/chat/completions', auth, (req, res) => handleChatCompletion(deps, req, res));
  return router;
}
