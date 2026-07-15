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
 */
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { NapiTierPort } from './tensorzero-transport.adapter.js';
import type { InferenceRequest, InferenceResult, TokenUsage } from '../types.js';
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
  };
}
