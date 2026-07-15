/**
 * `default-transports.ts` — the SINGLE coupling point between the inference domain
 * and the engines TensorZero OSS clients. The composer builds its default
 * delivery tiers here; tests inject fakes and never load this file's imports.
 *
 *   loopback tier  → `backend/src/gateway/tensorzero-client.ts` (OpenAI-compatible
 *                     HTTP skin; buffered complete/embed/health).
 *   streaming      → the real global `fetch`, adapted to the SSE `StreamResponse`.
 *   napi tier      → `backend/src/engines/tensorzero-client.ts::getEmbeddedGateway`
 *                     (the in-process embedded gateway). CONFLICT #8: this CONSUMES
 *                     that module's PROCESS-MEMOIZED native load — it never
 *                     `require()`s a `.node` itself, so the addon loads once.
 *
 * Every tier is degrade-safe: a missing endpoint/binding yields a truthful
 * decline (loopback unconfigured / napi unavailable), never a fabricated result.
 */
import type { Logger } from '../../../shared/logger.js';
import {
  createTensorzeroGatewayClient,
  type LlmGatewayPort,
} from '../llm-gateway-client.js';
import { getEmbeddedGateway } from '../tensorzero-embedded-client.js';
import type { InferenceConfig } from '../config.js';
import type { InferenceRequest, InferenceResult, TokenUsage } from '../types.js';
import { tokenUsage } from '../types.js';
import type { NapiTierPort } from './tensorzero-transport.adapter.js';
import type { StreamFetchLike, StreamResponse } from './gateway-stream.js';
import { functionNameFor } from './tz-config-generator.js';

/** Build the default loopback HTTP gateway client from config (no env reads). */
export function createDefaultLoopbackClient(cfg: InferenceConfig): LlmGatewayPort {
  return createTensorzeroGatewayClient({
    ...(cfg.gatewayEndpoint ? { endpoint: cfg.gatewayEndpoint } : {}),
    ...(cfg.gatewayApiKey ? { apiKey: cfg.gatewayApiKey } : {}),
    completePath: cfg.completePath,
    embedPath: cfg.embedPath,
    // Pass an EMPTY env so the client never reads process.env in domain code —
    // the endpoint/key come only from the injected config slice.
    env: {},
  });
}

/** Adapt the global `fetch` into the streaming `StreamFetchLike` (Node ≥18). */
export function createRealStreamFetch(): StreamFetchLike | undefined {
  const doFetch = globalThis.fetch as typeof fetch | undefined;
  if (!doFetch) return undefined;
  return async (url, init): Promise<StreamResponse> => {
    const resp = await doFetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      ...(init.signal ? { signal: init.signal } : {}),
    });
    return {
      ok: resp.ok,
      status: resp.status,
      text: () => resp.text(),
      // `Response.body` is an async-iterable ReadableStream in Node ≥18.
      body: resp.body as unknown as AsyncIterable<Uint8Array> | null,
    };
  };
}

/** Extract flattened text from a TensorZero chat `content` (string or block array). */
function extractTzContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      const text = (block as { text?: unknown; type?: unknown } | null)?.text;
      if (typeof text === 'string') parts.push(text);
    }
    return parts.length ? parts.join('') : null;
  }
  return null;
}

function parseTzUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const u = usage as { input_tokens?: unknown; output_tokens?: unknown };
  if (typeof u.input_tokens !== 'number' && typeof u.output_tokens !== 'number') return undefined;
  return tokenUsage(
    typeof u.input_tokens === 'number' ? u.input_tokens : 0,
    typeof u.output_tokens === 'number' ? u.output_tokens : 0,
  );
}

/**
 * The default napi tier over the in-process embedded gateway. Boot is lazy +
 * memoized in the engines client; `ensureBooted()` primes `available()`.
 */
export function createEmbeddedNapiTier(logger: Logger): NapiTierPort {
  let bound = false;

  return {
    available(): boolean {
      return bound;
    },

    async ensureBooted(): Promise<void> {
      try {
        const gw = await getEmbeddedGateway();
        bound = gw !== undefined;
        if (bound) logger.info({}, 'inference napi tier bound — embedded TensorZero gateway active (in-process)');
      } catch (err) {
        bound = false;
        logger.debug({ err: err instanceof Error ? err.message : String(err) }, 'embedded gateway boot probe failed');
      }
    },

    async complete(req: InferenceRequest): Promise<InferenceResult | null> {
      let gw;
      try {
        gw = await getEmbeddedGateway();
      } catch {
        bound = false;
        return null;
      }
      if (!gw) {
        bound = false;
        return null;
      }
      bound = true;
      try {
        const params = {
          function_name: functionNameFor(req.model),
          input: { messages: req.messages.map((m) => ({ role: m.role, content: m.content })) },
        };
        const raw = await gw.inference(JSON.stringify(params));
        const parsed = JSON.parse(raw) as { content?: unknown; usage?: unknown; inference_id?: unknown };
        const content = extractTzContent(parsed.content);
        if (content === null) return null; // decline → ladder continues to loopback
        const usage = parseTzUsage(parsed.usage);
        return {
          routed: true,
          tier: 'napi',
          model: req.model,
          content,
          ...(usage ? { usage } : {}),
          ...(typeof parsed.inference_id === 'string' ? { inferenceId: parsed.inference_id } : {}),
        };
      } catch (err) {
        logger.debug(
          { err: err instanceof Error ? err.message : String(err), model: req.model },
          'embedded gateway inference declined — degrading to loopback',
        );
        return null;
      }
    },
  };
}
