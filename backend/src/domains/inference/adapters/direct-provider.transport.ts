/**
 * `direct-provider.transport.ts` — RUNG 3 of the delivery ladder: the direct
 * BYOK multi-provider router. Used when the napi embedded gateway and the
 * loopback daemon are both down, or when the caller's plan routes direct
 * (`preferDirect`). Providers: OpenAI, OpenRouter, Groq (OpenAI wire),
 * Anthropic (native `/v1/messages`), Google (Gemini `generateContent`).
 *
 * Key resolution order per call: the caller's BYOK key (via `ByokKeyResolver` —
 * cache → governance secrets) → the platform key table injected by bootstrap.
 * A missing key is a TRUTHFUL decline (`routed:false, reason`) — never a silent
 * reroute to another provider, never a faked completion.
 *
 * SECURITY: the plaintext key exists only in the outbound request headers.
 * Provider error bodies are dropped (they may echo credentials); every reason
 * string is passed through `redactSecret` so key material can never reach a
 * log, an error envelope, or the delivery-outcome audit trail.
 */
import type { Logger } from '../../../shared/logger.js';
import { CircuitBreaker, CircuitOpenError } from '../../../shared/outbound-resilience.js';
import type { ByokKeyResolver } from '../ports/byok-resolver.port.js';
import type { InferenceRequest, InferenceResult, TokenUsage } from '../types.js';
import { notRouted, tokenUsage } from '../types.js';
import type { RouterTierPort } from './tensorzero-transport.adapter.js';

/** Minimal injectable fetch (mirrors `StreamFetchLike`'s shape, buffered). */
export type ProviderFetchLike = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body: string;
    readonly signal?: AbortSignal;
  },
) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

/** Which wire dialect a provider speaks. */
type ProviderWire = 'openai' | 'anthropic' | 'google';

interface ProviderSpec {
  readonly wire: ProviderWire;
  readonly baseUrl: string;
}

/** The supported direct providers (id = the model-id prefix before the first `/`). */
export const DIRECT_PROVIDERS: Readonly<Record<string, ProviderSpec>> = {
  openai: { wire: 'openai', baseUrl: 'https://api.openai.com/v1' },
  openrouter: { wire: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  groq: { wire: 'openai', baseUrl: 'https://api.groq.com/openai/v1' },
  anthropic: { wire: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  google: { wire: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
};

/** Replace every occurrence of `secret` in `text` with a redaction marker. */
export function redactSecret(text: string, secret: string | null): string {
  if (!secret) return text;
  return text.split(secret).join('[redacted]');
}

export interface DirectProviderTransportDeps {
  readonly logger: Logger;
  /** BYOK per-caller key resolution (cache → governance secrets). */
  readonly resolver: ByokKeyResolver;
  /** Platform fallback keys by provider id (bootstrap-injected; may be empty). */
  readonly platformKeys?: Readonly<Record<string, string>>;
  /** Injectable fetch (default: global `fetch`). */
  readonly fetch?: ProviderFetchLike;
  /** Per-call deadline (ms). */
  readonly timeoutMs?: number;
  /** Per-provider base-URL overrides (tests / self-hosted proxies). */
  readonly endpoints?: Readonly<Partial<Record<string, string>>>;
  /**
   * Per-provider circuit breaker. After repeated failures to a given provider
   * its circuit trips OPEN and further calls FAST-FAIL with a truthful decline
   * (`routed:false`, reason names the open circuit) instead of hammering a
   * downstream that is already failing — never a fabricated completion. The
   * completion is a NON-idempotent POST, so it is guarded but NEVER retried.
   * Injectable so tests drive the clock/threshold; defaults to a fresh breaker
   * with the library defaults (5 consecutive failures, 30s cooldown).
   */
  readonly breaker?: CircuitBreaker;
}

/** Build the rung-3 direct multi-provider transport. */
export function createDirectProviderTransport(deps: DirectProviderTransportDeps): RouterTierPort {
  const log = deps.logger;
  const resolver = deps.resolver;
  const platformKeys = normalizeKeys(deps.platformKeys ?? {});
  const doFetch: ProviderFetchLike = deps.fetch ?? defaultFetch;
  const timeoutMs = deps.timeoutMs ?? 60_000;
  const breaker = deps.breaker ?? new CircuitBreaker();

  return {
    available(): boolean {
      return resolver.enabled() || Object.keys(platformKeys).length > 0;
    },

    async complete(req: InferenceRequest): Promise<InferenceResult> {
      const parsed = splitModelId(req.model);
      if (!parsed) {
        return notRouted(req.model, `model id '${req.model}' has no provider prefix — direct routing needs 'provider/model'`);
      }
      const spec = DIRECT_PROVIDERS[parsed.provider];
      if (!spec) {
        return notRouted(req.model, `provider '${parsed.provider}' is not supported by the direct router`);
      }

      // BYOK first (per-caller), then the platform key. Missing → truthful decline.
      let key: string | null = null;
      let source: 'byok' | 'platform' | null = null;
      if (req.userId) {
        key = await resolver.resolve(req.userId, parsed.provider);
        if (key) source = 'byok';
      }
      if (!key && platformKeys[parsed.provider]) {
        key = platformKeys[parsed.provider] ?? null;
        source = 'platform';
      }
      if (!key || !source) {
        return notRouted(
          req.model,
          `no ${parsed.provider} API key available (no BYOK key${req.userId ? '' : ' — request has no user attribution'}, no platform key)`,
        );
      }

      // Per-provider circuit breaker: fast-fail (truthfully) while this
      // provider's circuit is OPEN so a failing downstream is not hammered. The
      // completion POST is NON-idempotent — it is guarded but never retried.
      // Every guard that returns here MUST be paired with exactly one
      // recordSuccess/recordFailure on all exit paths below.
      try {
        breaker.guard(parsed.provider);
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          log.debug({ provider: parsed.provider, retryAfterMs: err.retryAfterMs }, 'direct provider circuit open — fast-failing');
          return notRouted(
            req.model,
            `direct ${parsed.provider} circuit open — recent failures are fast-failing to protect the provider (retry in ~${err.retryAfterMs}ms)`,
          );
        }
        throw err;
      }

      const base = (deps.endpoints?.[parsed.provider] ?? spec.baseUrl).replace(/\/+$/, '');
      const wire = buildWireCall(spec.wire, base, parsed.model, req, key);

      let status = 0;
      let bodyText = '';
      try {
        const res = await doFetch(wire.url, {
          method: 'POST',
          headers: wire.headers,
          body: wire.body,
          ...(supportsTimeout() ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
        });
        status = res.status;
        bodyText = await res.text();
        if (!res.ok) {
          // NEVER include the provider error body (it may echo credentials).
          breaker.recordFailure(parsed.provider);
          log.debug({ provider: parsed.provider, status }, 'direct provider call failed');
          return notRouted(req.model, `direct ${parsed.provider} call failed (status ${status})`);
        }
      } catch (err) {
        breaker.recordFailure(parsed.provider);
        const reason = redactSecret(message(err), key);
        log.debug({ provider: parsed.provider, err: reason }, 'direct provider call errored');
        return notRouted(req.model, `direct ${parsed.provider} call errored: ${reason}`);
      }

      const parsedResult = parseWireResponse(spec.wire, bodyText);
      if (!parsedResult) {
        // A 2xx with an unparseable body is still a failed delivery.
        breaker.recordFailure(parsed.provider);
        return notRouted(req.model, `direct ${parsed.provider} returned a malformed response`);
      }

      breaker.recordSuccess(parsed.provider);
      if (source === 'byok' && req.userId) resolver.markUsed(req.userId, parsed.provider);
      log.debug(
        { provider: parsed.provider, model: req.model, source, status },
        'direct provider completion routed',
      );
      return {
        routed: true,
        tier: 'router',
        model: req.model,
        content: parsedResult.content,
        ...(parsedResult.usage ? { usage: parsedResult.usage } : {}),
        ...(parsedResult.inferenceId ? { inferenceId: parsedResult.inferenceId } : {}),
      };
    },
  };
}

// --- model id + wire building ------------------------------------------------

function splitModelId(modelId: string): { provider: string; model: string } | null {
  const idx = modelId.indexOf('/');
  if (idx <= 0 || idx === modelId.length - 1) return null;
  return { provider: modelId.slice(0, idx).toLowerCase(), model: modelId.slice(idx + 1) };
}

interface WireCall {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

function buildWireCall(
  wire: ProviderWire,
  base: string,
  model: string,
  req: InferenceRequest,
  key: string,
): WireCall {
  if (wire === 'anthropic') {
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    return {
      url: `${base}/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens ?? 1024,
        messages,
        ...(system ? { system } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      }),
    };
  }
  if (wire === 'google') {
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    return {
      url: `${base}/models/${model}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        ...(req.temperature !== undefined || req.maxTokens !== undefined
          ? {
              generationConfig: {
                ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
                ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
              },
            }
          : {}),
      }),
    };
  }
  // OpenAI wire (openai / openrouter / groq).
  return {
    url: `${base}/chat/completions`,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
    }),
  };
}

// --- response parsing --------------------------------------------------------

interface ParsedWire {
  readonly content: string;
  readonly usage?: TokenUsage;
  readonly inferenceId?: string;
}

function parseWireResponse(wire: ProviderWire, bodyText: string): ParsedWire | null {
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;
  const j = json as Record<string, unknown>;

  if (wire === 'anthropic') {
    const blocks = Array.isArray(j.content) ? (j.content as Array<Record<string, unknown>>) : null;
    if (!blocks) return null;
    const content = blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('');
    const usage = j.usage as Record<string, unknown> | undefined;
    return {
      content,
      ...(usage ? { usage: tokenUsage(num(usage.input_tokens), num(usage.output_tokens)) } : {}),
      ...(typeof j.id === 'string' ? { inferenceId: j.id } : {}),
    };
  }

  if (wire === 'google') {
    const candidates = Array.isArray(j.candidates) ? (j.candidates as Array<Record<string, unknown>>) : null;
    const first = candidates?.[0];
    const parts = ((first?.content as Record<string, unknown> | undefined)?.parts ?? null) as
      | Array<Record<string, unknown>>
      | null;
    if (!parts) return null;
    const content = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
    const usage = j.usageMetadata as Record<string, unknown> | undefined;
    return {
      content,
      ...(usage
        ? { usage: tokenUsage(num(usage.promptTokenCount), num(usage.candidatesTokenCount)) }
        : {}),
    };
  }

  // OpenAI wire.
  const choices = Array.isArray(j.choices) ? (j.choices as Array<Record<string, unknown>>) : null;
  const msg = (choices?.[0]?.message ?? null) as Record<string, unknown> | null;
  if (!msg || typeof msg.content !== 'string') return null;
  const usage = j.usage as Record<string, unknown> | undefined;
  return {
    content: msg.content,
    ...(usage ? { usage: tokenUsage(num(usage.prompt_tokens), num(usage.completion_tokens)) } : {}),
    ...(typeof j.id === 'string' ? { inferenceId: j.id } : {}),
  };
}

// --- small helpers -----------------------------------------------------------

function normalizeKeys(keys: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [provider, key] of Object.entries(keys)) {
    if (typeof key === 'string' && key.trim().length > 0) out[provider.toLowerCase()] = key.trim();
  }
  return out;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function supportsTimeout(): boolean {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
}

const defaultFetch: ProviderFetchLike = async (url, init) => {
  const res = await fetch(url, init);
  return { ok: res.ok, status: res.status, text: () => res.text() };
};

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
