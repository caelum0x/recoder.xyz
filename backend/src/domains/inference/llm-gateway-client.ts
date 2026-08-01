/**
 * @module gateway/tensorzero-client
 *
 * BYOK LLM Gateway skin over `backend/engines/rust/tensorzero` (RECODER-ENGINES E15).
 *
 * This is the thin `LlmGatewayPort` the rest of the backend calls for model +
 * embedding work: `complete(req)` and `embed(req)`. It speaks the OpenAI-
 * compatible wire that TensorZero exposes (`/openai/v1/chat/completions` and
 * `/openai/v1/embeddings`), so the same client also works against a direct
 * BYOK provider or `pi-ai` fallback that speaks the same shape.
 *
 * DEGRADE-SAFE BY CONSTRUCTION (mandatory):
 *   - When no endpoint is configured (`TENSORZERO_URL` / `TENSORZERO_GATEWAY_URL`
 *     both unset) every method returns a truthful "gateway not configured"
 *     result — `{ configured: false, routed: false, content: null }` /
 *     `{ configured: false, routed: false, embeddings: null }`. It NEVER throws
 *     and NEVER fakes success, so callers can fall back to a direct provider.
 *   - When the endpoint IS configured but the call fails (network error,
 *     non-2xx, bad body) the method returns `{ configured: true, routed: false,
 *     ..., reason }` — again never throwing.
 *
 * AUTH POSTURE:
 *   - The optional bearer key (`TENSORZERO_GATEWAY_API_KEY`) is sent ONLY on the
 *     wire as an `Authorization` header. It is NEVER returned from `health()`,
 *     never logged, and never embedded in any result. `health()` reports only
 *     `{ configured, endpoint }`.
 *
 * INJECTABLE DEPS:
 *   - `fetch`, `endpoint`, `apiKey`, and the wire paths are all injectable so
 *     this unit-tests with a fake fetch and no network/subprocess.
 */

import { withRetry, type Random, type Sleep } from '../../shared/outbound-resilience.js';

/** Env var: base URL of a TensorZero (or compatible) gateway. Primary. */
export const TENSORZERO_URL_ENV = 'TENSORZERO_URL';

/** Env var: alternate base URL name (kept for parity with the daemon seam). */
export const TENSORZERO_GATEWAY_URL_ENV = 'TENSORZERO_GATEWAY_URL';

/** Env var: optional bearer token for the gateway's auth layer. Never surfaced. */
export const TENSORZERO_GATEWAY_API_KEY_ENV = 'TENSORZERO_GATEWAY_API_KEY';

/** Default OpenAI-compatible wire paths TensorZero exposes. */
const DEFAULT_COMPLETE_PATH = '/openai/v1/chat/completions';
const DEFAULT_EMBED_PATH = '/openai/v1/embeddings';

/** Default per-call timeouts (ms). Completions get a longer budget. */
const DEFAULT_COMPLETE_TIMEOUT_MS = 60_000;
const DEFAULT_EMBED_TIMEOUT_MS = 30_000;

/**
 * Bounded-retry defaults for the IDEMPOTENT `health()` GET probe ONLY. Kept
 * small so a failing health check stays fast (one retry, short backoff). The
 * non-idempotent `complete()`/`embed()` POSTs are NEVER retried (a re-send could
 * duplicate a completion), so they carry no retry.
 */
const DEFAULT_HEALTH_RETRY_ATTEMPTS = 2;
const DEFAULT_HEALTH_RETRY_BASE_DELAY_MS = 50;

/** Minimal fetch shape so the client is injectable without DOM lib coupling. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

// ---------------------------------------------------------------------------
// Request / result contracts (typed, immutable in — never mutated here)
// ---------------------------------------------------------------------------

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface GatewayCompletionRequest {
  /** Model / function name understood by the gateway (e.g. "gpt-4o-mini"). */
  model: string;
  messages: GatewayMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface GatewayCompletionResult {
  /** Whether an endpoint was configured at all. */
  configured: boolean;
  /** Whether the gateway actually served the call (false => caller falls back). */
  routed: boolean;
  /** Assistant text content, or null when not routed. */
  content: string | null;
  /** Token usage when the gateway reported it. */
  usage?: { inputTokens?: number; outputTokens?: number };
  /** Truthful reason when `routed` is false (never a fake success). */
  reason?: string;
}

export interface GatewayEmbeddingRequest {
  /** Embedding model name understood by the gateway. */
  model: string;
  /** One or more input strings to embed. */
  input: string | string[];
}

export interface GatewayEmbeddingResult {
  configured: boolean;
  routed: boolean;
  /** One vector per input, or null when not routed. */
  embeddings: number[][] | null;
  usage?: { inputTokens?: number };
  reason?: string;
}

export interface GatewayHealth {
  /** True when an endpoint is configured (env or explicit). */
  configured: boolean;
  /** The base URL, or null when unconfigured. NEVER includes the key. */
  endpoint: string | null;
  /** Reachability probe result when configured (undefined when unconfigured). */
  reachable?: boolean;
  /** Truthful reason (e.g. why not reachable / not configured). */
  reason?: string;
}

/**
 * The port every model + embedding caller depends on. Implementations degrade
 * safely: methods resolve with a truthful result rather than throwing.
 */
export interface LlmGatewayPort {
  complete(req: GatewayCompletionRequest): Promise<GatewayCompletionResult>;
  embed(req: GatewayEmbeddingRequest): Promise<GatewayEmbeddingResult>;
  health(): Promise<GatewayHealth>;
  /** True when a gateway endpoint is configured. Cheap, synchronous. */
  isConfigured(): boolean;
  /** The resolved endpoint (never includes the key), or null when unconfigured. */
  endpoint(): string | null;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export interface GatewayClientOptions {
  /** Explicit base URL. Falls back to env when omitted. */
  endpoint?: string;
  /** Explicit bearer token. Falls back to env when omitted. Never surfaced. */
  apiKey?: string;
  /** Injectable fetch (defaults to global fetch). */
  fetch?: FetchLike;
  /** Env source (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  /** Override the OpenAI-compatible completion path. */
  completePath?: string;
  /** Override the OpenAI-compatible embedding path. */
  embedPath?: string;
  /**
   * Bounded-retry tuning for the IDEMPOTENT `health()` GET probe ONLY. Never
   * applied to the `complete()`/`embed()` POSTs (non-idempotent — a re-send
   * could duplicate a completion). Injectable so tests drive the backoff
   * deterministically without a real timer. A failing probe still degrades
   * truthfully to `{ reachable:false, reason }` after the attempts are spent —
   * it NEVER throws and NEVER fabricates reachability.
   */
  healthRetry?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    sleep?: Sleep;
    random?: Random;
  };
}

/** Resolve the gateway base URL from options or env. Trailing slash trimmed. */
export function resolveGatewayEndpoint(
  env: NodeJS.ProcessEnv = process.env,
  explicit?: string,
): string | null {
  const raw =
    explicit?.trim() ||
    env[TENSORZERO_URL_ENV]?.trim() ||
    env[TENSORZERO_GATEWAY_URL_ENV]?.trim() ||
    '';
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function joinUrl(base: string, path: string): string {
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Parse an assistant message out of an OpenAI-compatible completion body. */
function parseCompletionContent(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  return typeof content === 'string' ? content : null;
}

function parseUsageTokens(json: unknown): { inputTokens?: number; outputTokens?: number } | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const usage = (json as { usage?: Record<string, unknown> }).usage;
  if (!usage || typeof usage !== 'object') return undefined;
  const input = usage.prompt_tokens ?? usage.input_tokens;
  const output = usage.completion_tokens ?? usage.output_tokens;
  const out: { inputTokens?: number; outputTokens?: number } = {};
  if (typeof input === 'number') out.inputTokens = input;
  if (typeof output === 'number') out.outputTokens = output;
  return out.inputTokens === undefined && out.outputTokens === undefined ? undefined : out;
}

/** Parse embedding vectors out of an OpenAI-compatible embeddings body. */
function parseEmbeddings(json: unknown): number[][] | null {
  if (!json || typeof json !== 'object') return null;
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const vectors: number[][] = [];
  for (const item of data) {
    const embedding = (item as { embedding?: unknown }).embedding;
    if (!Array.isArray(embedding) || !embedding.every((n) => typeof n === 'number')) {
      return null;
    }
    vectors.push(embedding as number[]);
  }
  return vectors;
}

/**
 * Create the degrade-safe LLM gateway client. All external seams are injected
 * so this constructs cleanly with no network, subprocess, or env dependency.
 */
export function createTensorzeroGatewayClient(
  options: GatewayClientOptions = {},
): LlmGatewayPort {
  const env = options.env ?? process.env;
  const endpoint = resolveGatewayEndpoint(env, options.endpoint);
  const apiKey = options.apiKey?.trim() || env[TENSORZERO_GATEWAY_API_KEY_ENV]?.trim() || undefined;
  const doFetch: FetchLike | undefined = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
  const completePath = options.completePath ?? DEFAULT_COMPLETE_PATH;
  const embedPath = options.embedPath ?? DEFAULT_EMBED_PATH;
  const healthRetry = options.healthRetry ?? {};

  function headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    // The key travels ONLY on the wire, never into a returned result or log.
    if (apiKey) h.Authorization = `Bearer ${apiKey}`;
    return h;
  }

  function timeoutSignal(ms: number): AbortSignal | undefined {
    // AbortSignal.timeout is Node 18+; guard so a missing impl never throws.
    try {
      return AbortSignal.timeout(ms);
    } catch {
      return undefined;
    }
  }

  async function post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
    if (!doFetch) throw new Error('no fetch implementation available');
    const resp = await doFetch(joinUrl(endpoint!, path), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: timeoutSignal(timeoutMs),
    });
    const text = await resp.text();
    const json = text ? JSON.parse(text) : {};
    if (!resp.ok) {
      const msg = (json as { error?: unknown }).error;
      const reason =
        typeof msg === 'string'
          ? msg
          : msg && typeof msg === 'object' && typeof (msg as { message?: unknown }).message === 'string'
            ? (msg as { message: string }).message
            : `HTTP ${resp.status}`;
      throw new Error(reason);
    }
    return json;
  }

  return {
    isConfigured(): boolean {
      return endpoint !== null;
    },

    endpoint(): string | null {
      return endpoint;
    },

    async complete(req: GatewayCompletionRequest): Promise<GatewayCompletionResult> {
      if (!endpoint) {
        return {
          configured: false,
          routed: false,
          content: null,
          reason: `LLM gateway not configured — set ${TENSORZERO_URL_ENV} to route completions (falling back to direct provider)`,
        };
      }
      try {
        const body: Record<string, unknown> = {
          model: req.model,
          messages: req.messages,
        };
        if (typeof req.temperature === 'number') body.temperature = req.temperature;
        if (typeof req.maxTokens === 'number') body.max_tokens = req.maxTokens;

        const json = await post(completePath, body, DEFAULT_COMPLETE_TIMEOUT_MS);
        const content = parseCompletionContent(json);
        if (content === null) {
          return {
            configured: true,
            routed: false,
            content: null,
            reason: 'gateway returned no completion content',
          };
        }
        return {
          configured: true,
          routed: true,
          content,
          usage: parseUsageTokens(json),
        };
      } catch (err) {
        return {
          configured: true,
          routed: false,
          content: null,
          reason: `gateway completion failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },

    async embed(req: GatewayEmbeddingRequest): Promise<GatewayEmbeddingResult> {
      if (!endpoint) {
        return {
          configured: false,
          routed: false,
          embeddings: null,
          reason: `LLM gateway not configured — set ${TENSORZERO_URL_ENV} to route embeddings (falling back to direct provider)`,
        };
      }
      try {
        const json = await post(embedPath, { model: req.model, input: req.input }, DEFAULT_EMBED_TIMEOUT_MS);
        const embeddings = parseEmbeddings(json);
        if (embeddings === null) {
          return {
            configured: true,
            routed: false,
            embeddings: null,
            reason: 'gateway returned no embedding data',
          };
        }
        const usage = parseUsageTokens(json);
        return {
          configured: true,
          routed: true,
          embeddings,
          usage: usage?.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : undefined,
        };
      } catch (err) {
        return {
          configured: true,
          routed: false,
          embeddings: null,
          reason: `gateway embedding failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },

    async health(): Promise<GatewayHealth> {
      if (!endpoint) {
        return {
          configured: false,
          endpoint: null,
          reason: `set ${TENSORZERO_URL_ENV} (or ${TENSORZERO_GATEWAY_URL_ENV}) to enable the LLM gateway`,
        };
      }
      if (!doFetch) {
        return { configured: true, endpoint, reachable: false, reason: 'no fetch implementation available' };
      }
      try {
        // Bounded retry on the IDEMPOTENT GET probe: a transient blip should not
        // read as a hard outage. A non-2xx throws so the retry can re-probe; the
        // op is re-runnable (idempotent GET), so re-sending is safe.
        await withRetry(
          async () => {
            const resp = await doFetch(joinUrl(endpoint, '/health'), {
              method: 'GET',
              headers: headers(),
              signal: timeoutSignal(3_000),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          },
          {
            idempotent: true,
            maxAttempts: healthRetry.maxAttempts ?? DEFAULT_HEALTH_RETRY_ATTEMPTS,
            baseDelayMs: healthRetry.baseDelayMs ?? DEFAULT_HEALTH_RETRY_BASE_DELAY_MS,
            ...(healthRetry.maxDelayMs !== undefined ? { maxDelayMs: healthRetry.maxDelayMs } : {}),
            ...(healthRetry.sleep ? { sleep: healthRetry.sleep } : {}),
            ...(healthRetry.random ? { random: healthRetry.random } : {}),
          },
        );
        return { configured: true, endpoint, reachable: true };
      } catch (err) {
        // Truthful degrade after the bounded attempts are spent — never throws.
        return {
          configured: true,
          endpoint,
          reachable: false,
          reason: err instanceof Error ? err.message : 'health check failed',
        };
      }
    },
  };
}
