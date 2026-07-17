/**
 * `tensorzero-transport.adapter.ts` — the concrete `InferenceGatewayPort` as a
 * degrade-safe delivery LADDER over the engines TensorZero client:
 *
 *   napi (embedded in-process gateway, no HTTP hop; REAL in-proc chunk
 *         streaming via the `inferenceStream` napi binding)
 *     → loopback (supervised HTTP gateway; REAL per-token SSE for streaming)
 *       → router (reserved for the engines MCP router tier)
 *         → none (truthful degrade with a reason)
 *
 * CONFLICT #8 (do NOT load the .node twice): the napi tier is CONSUMED, not
 * re-loaded — the composer injects it over `getEmbeddedGateway()` from
 * `backend/src/engines/tensorzero-client.ts`, whose native module load is
 * process-memoized. This adapter never `require()`s a `.node` itself.
 *
 * The buffered `complete`/`embed`/`health` reuse the injected `LlmGatewayPort`
 * (the `backend/src/gateway/tensorzero-client.ts` skin); streaming uses the
 * `gateway-stream.ts` SSE seam. Every method is degrade-safe: it never throws and
 * never fabricates a completion.
 */
import type { Logger } from '../../../shared/logger.js';
import type { LlmGatewayPort } from '../llm-gateway-client.js';
import type { InferenceConfig } from '../config.js';
import type { InferenceGatewayPort, StreamSink } from '../ports/inference-gateway.port.js';
import type {
  EmbeddingRequest,
  EmbeddingResult,
  FeedbackRequest,
  FeedbackResult,
  InferenceHealth,
  InferenceRequest,
  InferenceResult,
  InferenceStreamResult,
} from '../types.js';
import { notRouted, tokenUsage } from '../types.js';
import { streamGatewayCompletion, type StreamFetchLike } from './gateway-stream.js';

/**
 * The napi tier: the in-process embedded gateway, normalized to the inference
 * request/result shape. `complete` returns `null` to DECLINE (fall through to
 * loopback); `available()` gates whether the tier is even attempted.
 */
export interface NapiTierPort {
  /** Whether the embedded in-process gateway is bound (drives health + ladder). */
  available(): boolean;
  /**
   * Route a completion through the embedded gateway. Resolves `null` when the
   * tier declines (not bound / native call failed) so the ladder continues.
   */
  complete(req: InferenceRequest): Promise<InferenceResult | null>;
  /**
   * Optional idempotent boot probe the composer awaits at `start()` so
   * `available()` reflects the real bind state before the first request. Never
   * throws (a failed boot leaves the tier unavailable, degrade-safe).
   */
  ensureBooted?(): Promise<void>;
  /**
   * OPTIONAL streaming seam (the embedded gateway's napi `inferenceStream`
   * binding — real per-chunk deltas, in-process, no HTTP hop). Emits deltas
   * through `onDelta` exactly like the loopback SSE tier (lazy `role` framing,
   * then per-chunk `content`). Resolves `null` to DECLINE (not bound / addon
   * lacks the binding / native call failed) so the ladder continues to the
   * loopback SSE tier; a tier without the seam simply omits the method.
   */
  completeStream?(req: InferenceRequest, onDelta: StreamSink): Promise<InferenceStreamResult | null>;
  /**
   * OPTIONAL feedback seam (the embedded gateway's `POST /feedback`
   * equivalent). Resolves `null` to DECLINE (not bound / native call failed);
   * a tier without the seam simply omits the method.
   */
  feedback?(req: FeedbackRequest): Promise<FeedbackResult | null>;
}

export interface TensorzeroTransportDeps {
  readonly logger: Logger;
  readonly config: InferenceConfig;
  /** Buffered complete/embed/health — reuses `backend/src/gateway/tensorzero-client.ts`. */
  readonly loopback: LlmGatewayPort;
  /** Injected streaming fetch for REAL SSE (absent → streaming degrades to buffered). */
  readonly streamFetch?: StreamFetchLike;
  /** The napi embedded-gateway tier (absent → the ladder starts at loopback). */
  readonly napi?: NapiTierPort;
}

export class TensorzeroTransportAdapter implements InferenceGatewayPort {
  private readonly log: Logger;
  private readonly cfg: InferenceConfig;
  private readonly loopback: LlmGatewayPort;
  private readonly streamFetch?: StreamFetchLike;
  private readonly napi?: NapiTierPort;

  constructor(deps: TensorzeroTransportDeps) {
    this.log = deps.logger;
    this.cfg = deps.config;
    this.loopback = deps.loopback;
    if (deps.streamFetch) this.streamFetch = deps.streamFetch;
    if (deps.napi) this.napi = deps.napi;
  }

  async complete(req: InferenceRequest): Promise<InferenceResult> {
    const model = req.model || this.cfg.defaultModel;
    const normalized: InferenceRequest = { ...req, model };

    // napi tier first (in-process, no HTTP hop) when preferred + bound.
    if (this.cfg.napiFirst && this.napi?.available()) {
      const napiResult = await this.safeNapi(normalized);
      if (napiResult?.routed) return napiResult;
    }

    // loopback HTTP gateway tier.
    const loop = await this.loopbackComplete(normalized);
    if (loop.routed) return loop;

    // napi as a fallback when it was not tried first.
    if (!this.cfg.napiFirst && this.napi?.available()) {
      const napiResult = await this.safeNapi(normalized);
      if (napiResult?.routed) return napiResult;
    }

    return notRouted(
      model,
      loop.reason ?? 'no inference tier available (napi embedded gateway unbound, loopback unconfigured)',
    );
  }

  async completeStream(req: InferenceRequest, onDelta: StreamSink): Promise<InferenceStreamResult> {
    const model = req.model || this.cfg.defaultModel;
    const normalized: InferenceRequest = { ...req, model };

    // napi tier first (real in-process chunk streaming, no HTTP hop) when
    // preferred + bound + built with the `inferenceStream` binding.
    if (this.cfg.streamingEnabled && this.cfg.napiFirst) {
      const viaNapi = await this.safeNapiStream(normalized, onDelta);
      if (viaNapi?.routed) return viaNapi;
    }

    // REAL token-granular streaming over HTTP: the loopback SSE tier.
    if (this.cfg.streamingEnabled && this.streamFetch && this.loopback.isConfigured()) {
      const endpoint = this.loopback.endpoint();
      if (endpoint) {
        // Emit the `role` delta LAZILY — only once real content arrives — so the
        // route can defer SSE headers until delivery is proven (a 0-delta decline
        // falls through to buffered without having sent a 200).
        let roleSent = false;
        const result = await streamGatewayCompletion(
          {
            endpoint,
            completePath: this.cfg.completePath,
            ...(this.cfg.gatewayApiKey ? { apiKey: this.cfg.gatewayApiKey } : {}),
            fetch: this.streamFetch,
            timeoutMs: this.cfg.requestTimeoutMs,
          },
          normalized,
          (token) => {
            if (!roleSent) {
              onDelta({ role: 'assistant' });
              roleSent = true;
            }
            onDelta({ content: token });
          },
        );
        if (result.ok && result.deltaCount > 0) {
          return {
            routed: true,
            tier: 'loopback',
            model: result.model ?? model,
            content: result.content,
            ...(result.usage ? { usage: result.usage } : {}),
            ...(result.inferenceId ? { inferenceId: result.inferenceId } : {}),
            streamed: true,
            tokenGranular: true,
          };
        }
        this.log.debug(
          { reason: result.reason, model },
          'real SSE streaming declined — degrading to buffered single-chunk emit',
        );
      }
    }

    // napi streaming as a fallback rung when it was not tried first.
    if (this.cfg.streamingEnabled && !this.cfg.napiFirst) {
      const viaNapi = await this.safeNapiStream(normalized, onDelta);
      if (viaNapi?.routed) return viaNapi;
    }

    // Degrade: buffered completion emitted as ONE delta (truthful: not granular).
    const buffered = await this.complete(normalized);
    if (!buffered.routed) {
      return { ...buffered, streamed: false, tokenGranular: false };
    }
    // For the buffered path the caller has not yet received a role delta unless
    // we streamed above; emit the framing here so the SSE shape stays valid.
    onDelta({ role: 'assistant' });
    if (buffered.content) onDelta({ content: buffered.content });
    return { ...buffered, streamed: true, tokenGranular: false };
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResult> {
    const model = req.model || this.cfg.defaultModel;
    const result = await this.loopback.embed({ model, input: req.input as string | string[] });
    if (result.routed && result.embeddings) {
      return {
        routed: true,
        tier: 'loopback',
        model,
        embeddings: result.embeddings,
        ...(result.usage?.inputTokens !== undefined ? { usage: { inputTokens: result.usage.inputTokens } } : {}),
      };
    }
    return {
      routed: false,
      tier: 'none',
      model,
      embeddings: null,
      reason: result.reason ?? 'no embedding tier available',
    };
  }

  async feedback(req: FeedbackRequest): Promise<FeedbackResult> {
    // Only the napi embedded gateway carries a feedback seam (the loopback
    // `LlmGatewayPort` skin has no feedback surface) — no ladder to descend.
    if (this.napi?.available() && this.napi.feedback) {
      try {
        const result = await this.napi.feedback(req);
        if (result?.routed) return result;
      } catch (err) {
        this.log.debug(
          { err: message(err), inferenceId: req.inferenceId, metricName: req.metricName },
          'napi feedback threw — degrading to truthful not-routed',
        );
      }
    }
    return {
      routed: false,
      tier: 'none',
      inferenceId: req.inferenceId,
      metricName: req.metricName,
      reason: 'no feedback-capable tier available (napi embedded gateway unbound; loopback has no feedback seam)',
    };
  }

  async health(): Promise<InferenceHealth> {
    const napiBound = this.napi?.available() ?? false;
    const loopbackConfigured = this.loopback.isConfigured();
    let loopbackReachable: boolean | undefined;
    let loopReason: string | undefined;
    if (loopbackConfigured) {
      const h = await this.loopback.health();
      loopbackReachable = h.reachable;
      loopReason = h.reason;
    }

    const tier = napiBound ? 'napi' : loopbackConfigured && loopbackReachable !== false ? 'loopback' : 'none';
    const available = napiBound || (loopbackConfigured && loopbackReachable !== false);

    return {
      tier,
      available,
      napiBound,
      loopbackConfigured,
      ...(loopbackReachable !== undefined ? { loopbackReachable } : {}),
      ...(available
        ? {}
        : {
            reason:
              !napiBound && !loopbackConfigured
                ? 'napi embedded gateway unbound and no loopback endpoint configured'
                : (loopReason ?? 'loopback gateway not reachable'),
          }),
    };
  }

  /**
   * napi STREAM tier call guarded like `safeNapi`: an unbound tier / absent
   * seam / native failure resolves `null` (the ladder continues to loopback
   * SSE, then buffered) — never a thrown error, never a faked stream.
   */
  private async safeNapiStream(req: InferenceRequest, onDelta: StreamSink): Promise<InferenceStreamResult | null> {
    if (!this.napi?.available() || !this.napi.completeStream) return null;
    try {
      return await this.napi.completeStream(req, onDelta);
    } catch (err) {
      this.log.debug({ err: message(err), model: req.model }, 'napi stream tier threw — degrading to loopback SSE');
      return null;
    }
  }

  /** napi tier call guarded so a native failure never throws across the seam. */
  private async safeNapi(req: InferenceRequest): Promise<InferenceResult | null> {
    try {
      return await this.napi!.complete(req);
    } catch (err) {
      this.log.debug({ err: message(err), model: req.model }, 'napi tier threw — degrading to loopback');
      return null;
    }
  }

  private async loopbackComplete(req: InferenceRequest): Promise<InferenceResult> {
    const result = await this.loopback.complete({
      model: req.model,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
    });
    if (result.routed && result.content !== null) {
      return {
        routed: true,
        tier: 'loopback',
        model: req.model,
        content: result.content,
        ...(result.usage ? { usage: tokenUsage(result.usage.inputTokens, result.usage.outputTokens) } : {}),
      };
    }
    return notRouted(req.model, result.reason ?? 'loopback gateway did not route');
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
