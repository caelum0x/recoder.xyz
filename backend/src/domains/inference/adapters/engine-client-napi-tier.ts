/**
 * `engine-client-napi-tier.ts` — bridges the frozen engines `EngineClientPort`
 * (the `TensorzeroNapiAdapter` in `domains/engines/adapters/napi`) into the
 * inference delivery ladder's `NapiTierPort`.
 *
 * CONFLICT #8 (do NOT load the `.node` twice): this is the CORRECT wired path.
 * The engines tensorzero adapter binds the addon through the SHARED
 * `NapiLoaderPort` (one process-wide load); consuming it here means the inference
 * napi tier reuses that single load rather than opening a second memoized loader.
 * Bootstrap injects `engines.tensorzero()` as the `EngineClientPort`; the composer
 * wraps it with this bridge. (The `default-transports.ts` embedded-gateway tier is
 * the fallback ONLY when the engines seam is not injected.)
 *
 * DEGRADE-SAFE: a `{ ok:false }` invoke or an unparsable body resolves `null`
 * (the tier declines → the ladder falls to loopback) — never throws, never fakes.
 *
 * STREAMING: `completeStream` consumes the napi `inferenceStream` binding (real
 * in-process per-chunk deltas via a ThreadsafeFunction — no HTTP hop). An addon
 * built without the binding declines truthfully (`null`) so the ladder falls to
 * the loopback SSE tier; buffered napi completions keep working either way.
 */
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { StreamSink } from '../ports/inference-gateway.port.js';
import type { NapiTierPort } from './tensorzero-transport.adapter.js';
import type {
  FeedbackRequest,
  FeedbackResult,
  InferenceRequest,
  InferenceResult,
  InferenceStreamResult,
  TokenUsage,
} from '../types.js';
import { tokenUsage } from '../types.js';
import { functionNameFor } from './tz-config-generator.js';

/** Extract flattened text from a TensorZero chat `content` (string or block array). */
function extractTzContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      const text = (block as { text?: unknown } | null)?.text;
      if (typeof text === 'string') parts.push(text);
    }
    return parts.length ? parts.join('') : null;
  }
  return null;
}

/**
 * Extract the incremental text from one streamed TZ `InferenceResponseChunk`:
 * chat chunks carry `content: [ContentBlockChunk]` (text blocks joined in
 * order), json chunks carry the incremental `raw` string. Empty/non-text
 * chunks (tool-call/thought framing, final usage-only chunk) yield `null`.
 */
function extractTzChunkText(chunk: unknown): string | null {
  if (!chunk || typeof chunk !== 'object') return null;
  const c = chunk as { content?: unknown; raw?: unknown };
  if (Array.isArray(c.content)) {
    const parts: string[] = [];
    for (const block of c.content) {
      const b = block as { type?: unknown; text?: unknown } | null;
      if (b?.type === 'text' && typeof b.text === 'string') parts.push(b.text);
    }
    const joined = parts.join('');
    return joined.length ? joined : null;
  }
  if (typeof c.raw === 'string' && c.raw.length) return c.raw;
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
 * Wrap an engines `EngineClientPort` (tensorzero napi adapter) as a `NapiTierPort`.
 * `ensureBooted()` starts the engine + probes health to prime `available()`.
 */
export function createEngineClientNapiTier(client: EngineClientPort, logger: Logger): NapiTierPort {
  let bound = false;

  return {
    available(): boolean {
      return bound;
    },

    async ensureBooted(): Promise<void> {
      try {
        await client.start();
        const health = await client.health();
        // `up` = embedded gateway bound + bootable; `degraded` = addon present but
        // no in-proc inference (version/config-validate only) → not a routing tier.
        bound = health.status === 'up';
        if (bound) {
          logger.info(
            { engineId: client.id, version: health.version },
            'inference napi tier bound via engines EngineClientPort (shared .node load)',
          );
        }
      } catch (err) {
        bound = false;
        logger.debug(
          { err: err instanceof Error ? err.message : String(err) },
          'engines tensorzero client boot probe failed',
        );
      }
    },

    async complete(req: InferenceRequest): Promise<InferenceResult | null> {
      const result = await client.invoke({
        op: 'inference',
        input: {
          function_name: functionNameFor(req.model),
          input: { messages: req.messages.map((m) => ({ role: m.role, content: m.content })) },
        },
        timeoutMs: 60_000,
      });
      if (!result.ok) {
        bound = false;
        return null; // decline → ladder continues to loopback
      }
      const value = result.value as { content?: unknown; usage?: unknown; inference_id?: unknown };
      const content = extractTzContent(value.content);
      if (content === null) return null;
      bound = true;
      const usage = parseTzUsage(value.usage);
      return {
        routed: true,
        tier: 'napi',
        model: req.model,
        content,
        ...(usage ? { usage } : {}),
        ...(typeof value.inference_id === 'string' ? { inferenceId: value.inference_id } : {}),
      };
    },

    async completeStream(req: InferenceRequest, onDelta: StreamSink): Promise<InferenceStreamResult | null> {
      let roleSent = false;
      let contentDeltas = 0;
      const result = await client.invoke({
        op: 'inferenceStream',
        input: {
          function_name: functionNameFor(req.model),
          input: { messages: req.messages.map((m) => ({ role: m.role, content: m.content })) },
          // Live per-chunk sink (extracted by the adapter, never serialized).
          // The `role` framing delta is emitted LAZILY — only once real content
          // arrives — so a 0-delta decline falls through without any emit.
          onChunk: (chunk: unknown) => {
            const text = extractTzChunkText(chunk);
            if (text === null) return;
            if (!roleSent) {
              onDelta({ role: 'assistant' });
              roleSent = true;
            }
            onDelta({ content: text });
            contentDeltas += 1;
          },
        },
        timeoutMs: 120_000,
      });
      if (!result.ok) {
        // Addon without the streaming binding stays bound for buffered calls;
        // only a broken engine (ENGINE_DOWN mid-flight) drops the bind.
        return null; // decline → the ladder continues to loopback SSE
      }
      const value = result.value as { content?: unknown; usage?: unknown; inference_id?: unknown };
      // Only a REAL delivered stream is claimed: at least one content delta
      // emitted AND a truthful aggregated content from the native summary.
      if (typeof value.content !== 'string' || contentDeltas === 0) return null;
      bound = true;
      const usage = parseTzUsage(value.usage);
      return {
        routed: true,
        tier: 'napi',
        model: req.model,
        content: value.content,
        ...(usage ? { usage } : {}),
        ...(typeof value.inference_id === 'string' ? { inferenceId: value.inference_id } : {}),
        streamed: true,
        tokenGranular: true,
      };
    },

    async feedback(req: FeedbackRequest): Promise<FeedbackResult | null> {
      const result = await client.invoke({
        op: 'feedback',
        input: { inference_id: req.inferenceId, metric_name: req.metricName, value: req.value },
        timeoutMs: 15_000,
      });
      if (!result.ok) return null; // decline → the ladder reports a truthful not-routed
      const value = result.value as { feedback_id?: unknown } | null;
      return {
        routed: true,
        tier: 'napi',
        inferenceId: req.inferenceId,
        metricName: req.metricName,
        // Only a REAL gateway-reported id is surfaced — never fabricated.
        ...(typeof value?.feedback_id === 'string' ? { feedbackId: value.feedback_id } : {}),
      };
    },
  };
}
