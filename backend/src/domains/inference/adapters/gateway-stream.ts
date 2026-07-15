/**
 * `gateway-stream.ts` — REAL per-token SSE streaming over the loopback TensorZero
 * gateway's OpenAI-compatible endpoint (`stream:true`). This is the seam that
 * replaces the buffered single-chunk v1 (`streamSingleChunkCompletion`) with
 * genuine token-granular delivery now that the gateway exposes SSE.
 *
 * It POSTs an OpenAI chat-completion with `stream:true`, reads the response body
 * as a byte/utf8 stream, parses `data: {chat.completion.chunk}` SSE events, and
 * forwards each `choices[0].delta.content` token through `onDelta` as it arrives.
 * A final `data: [DONE]` terminates; usage (when the gateway emits a usage chunk)
 * and the aggregated content are returned.
 *
 * DEGRADE-SAFE: never throws across the seam. A non-2xx status, a network error,
 * or a malformed stream resolves `{ ok:false, reason }` so the caller degrades
 * (e.g. to the napi embedded gateway's buffered path) — never a faked stream.
 *
 * INJECTABLE: the fetch is injected as {@link StreamFetchLike} so this unit-tests
 * with a fake async-iterable body and no network.
 */
import type { InferenceRequest, TokenUsage } from '../types.js';
import { tokenUsage } from '../types.js';

/** A streamable HTTP response (real `fetch` `Response.body` is async-iterable in Node ≥18). */
export interface StreamResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  /** Async-iterable chunk stream (Uint8Array from real fetch; string in fakes). */
  readonly body: AsyncIterable<Uint8Array | string> | null;
}

/** Minimal injectable streaming fetch. */
export type StreamFetchLike = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body: string;
    readonly signal?: AbortSignal;
  },
) => Promise<StreamResponse>;

export interface StreamGatewayOptions {
  readonly endpoint: string;
  readonly completePath: string;
  readonly apiKey?: string | null;
  readonly fetch: StreamFetchLike;
  readonly timeoutMs?: number;
}

export interface StreamGatewayResult {
  readonly ok: boolean;
  /** Full aggregated assistant content (concatenated deltas). */
  readonly content: string;
  readonly usage?: TokenUsage;
  readonly model?: string;
  readonly inferenceId?: string;
  /** Number of content deltas forwarded (proves token granularity in tests/audit). */
  readonly deltaCount: number;
  readonly reason?: string;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}

/** Extract the content delta + terminal usage from one parsed SSE JSON chunk. */
function parseChunk(json: unknown): {
  content?: string;
  usage?: { input?: number; output?: number };
  model?: string;
  id?: string;
} {
  if (!json || typeof json !== 'object') return {};
  const obj = json as {
    id?: unknown;
    model?: unknown;
    choices?: Array<{ delta?: { content?: unknown } }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; input_tokens?: unknown; output_tokens?: unknown };
  };
  const out: { content?: string; usage?: { input?: number; output?: number }; model?: string; id?: string } = {};
  const delta = obj.choices?.[0]?.delta?.content;
  if (typeof delta === 'string' && delta.length > 0) out.content = delta;
  if (typeof obj.model === 'string') out.model = obj.model;
  if (typeof obj.id === 'string') out.id = obj.id;
  if (obj.usage) {
    const input = obj.usage.prompt_tokens ?? obj.usage.input_tokens;
    const output = obj.usage.completion_tokens ?? obj.usage.output_tokens;
    if (typeof input === 'number' || typeof output === 'number') {
      out.usage = {
        ...(typeof input === 'number' ? { input } : {}),
        ...(typeof output === 'number' ? { output } : {}),
      };
    }
  }
  return out;
}

/**
 * Stream a completion. Calls `onDelta` for each content token as it arrives.
 * Resolves the aggregated result — never throws.
 */
export async function streamGatewayCompletion(
  options: StreamGatewayOptions,
  req: InferenceRequest,
  onDelta: (token: string) => void,
): Promise<StreamGatewayResult> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (typeof req.temperature === 'number') body.temperature = req.temperature;
  if (typeof req.maxTokens === 'number') body.max_tokens = req.maxTokens;

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;

  let resp: StreamResponse;
  try {
    resp = await options.fetch(joinUrl(options.endpoint, options.completePath), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      ...(timeoutSignal(options.timeoutMs ?? 60_000) ? { signal: timeoutSignal(options.timeoutMs ?? 60_000) } : {}),
    });
  } catch (err) {
    return failed(`gateway stream request failed: ${message(err)}`);
  }

  if (!resp.ok || !resp.body) {
    let detail = `HTTP ${resp.status}`;
    try {
      const text = await resp.text();
      if (text) detail = text.slice(0, 300);
    } catch {
      /* keep status */
    }
    return failed(`gateway stream not routed: ${detail}`);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let deltaCount = 0;
  let usage: TokenUsage | undefined;
  let model: string | undefined;
  let inferenceId: string | undefined;

  try {
    for await (const raw of resp.body) {
      buffer += typeof raw === 'string' ? raw : decoder.decode(raw, { stream: true });
      // SSE events are `\n\n`-separated; process complete lines, keep the tail.
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          return { ok: true, content, deltaCount, ...(usage ? { usage } : {}), ...(model ? { model } : {}), ...(inferenceId ? { inferenceId } : {}) };
        }
        let json: unknown;
        try {
          json = JSON.parse(payload);
        } catch {
          continue; // tolerate keep-alive / partial noise
        }
        const parsed = parseChunk(json);
        if (parsed.model && !model) model = parsed.model;
        if (parsed.id && !inferenceId) inferenceId = parsed.id;
        if (parsed.usage) usage = tokenUsage(parsed.usage.input, parsed.usage.output);
        if (parsed.content) {
          content += parsed.content;
          deltaCount += 1;
          onDelta(parsed.content);
        }
      }
    }
  } catch (err) {
    return failed(`gateway stream interrupted: ${message(err)}`);
  }

  // Stream ended without an explicit [DONE] — still a truthful success if we got content.
  return { ok: true, content, deltaCount, ...(usage ? { usage } : {}), ...(model ? { model } : {}), ...(inferenceId ? { inferenceId } : {}) };
}

function failed(reason: string): StreamGatewayResult {
  return { ok: false, content: '', deltaCount: 0, reason };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
