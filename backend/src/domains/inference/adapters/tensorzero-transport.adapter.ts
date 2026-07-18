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
  StreamDelta,
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

/**
 * The rung-3 tier: the direct BYOK multi-provider router
 * (`direct-provider.transport.ts`). Tried LAST — when napi + loopback both
 * decline — or FIRST when the request carries `preferDirect` (the caller's plan
 * routes direct). `complete` is ALWAYS truthful: `routed:false` carries the
 * decline reason (missing key, unsupported provider, provider error) so the
 * ladder's final `notRouted` reason stays honest.
 */
export interface RouterTierPort {
  /** Whether ANY key source (BYOK secrets seam or platform keys) is wired. */
  available(): boolean;
  /** Route a completion direct-to-provider. Never throws; never fakes. */
  complete(req: InferenceRequest): Promise<InferenceResult>;
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
  /** The rung-3 direct BYOK multi-provider tier (absent → the ladder ends at loopback). */
  readonly router?: RouterTierPort;
}

export class TensorzeroTransportAdapter implements InferenceGatewayPort {
  private readonly log: Logger;
  private readonly cfg: InferenceConfig;
  private readonly loopback: LlmGatewayPort;
  private readonly streamFetch?: StreamFetchLike;
  private readonly napi?: NapiTierPort;
  private readonly router?: RouterTierPort;

  constructor(deps: TensorzeroTransportDeps) {
    this.log = deps.logger;
    this.cfg = deps.config;
    this.loopback = deps.loopback;
    if (deps.streamFetch) this.streamFetch = deps.streamFetch;
    if (deps.napi) this.napi = deps.napi;
    if (deps.router) this.router = deps.router;
  }

  async complete(req: InferenceRequest): Promise<InferenceResult> {
    const model = req.model || this.cfg.defaultModel;
    const normalized: InferenceRequest = { ...req, model };
    let routerReason: string | undefined;

    // Plan-directed rung 3 FIRST (the caller's plan routes direct/BYOK). A
    // decline still falls through the TZ tiers — truthful degrade, never a stop.
    if (normalized.preferDirect && this.router) {
      const direct = await this.safeRouter(normalized);
      if (direct?.routed) return direct;
      routerReason = direct?.reason ?? 'direct provider router declined';
    }

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

    // Rung 3 LAST: the direct BYOK multi-provider router (when not tried first).
    if (!normalized.preferDirect && this.router) {
      const direct = await this.safeRouter(normalized);
      if (direct?.routed) return direct;
      routerReason = direct?.reason ?? 'direct provider router declined';
    }

    const base =
      loop.reason ?? 'no inference tier available (napi embedded gateway unbound, loopback unconfigured)';
    return notRouted(model, routerReason ? `${base}; direct: ${routerReason}` : base);
  }

  async completeStream(req: InferenceRequest, onDelta: StreamSink): Promise<InferenceStreamResult> {
    const model = req.model || this.cfg.defaultModel;
    const normalized: InferenceRequest = { ...req, model };

    // Count what actually reaches the caller's sink so a tier that partial-emits
    // then FAILS mid-stream can never be followed by another emitting tier — the
    // client must not receive duplicated/concatenated output (e.g. a napi
    // "Hello wor" then a loopback "Hello world"). The napi tiers buffer their
    // own deltas (see `safeNapiStream`) so a decline emits nothing here; this
    // guard covers the loopback→buffered transition where the loopback tier
    // streams live and cannot be buffered.
    let emitted = 0;
    const sink: StreamSink = (delta) => {
      emitted += 1;
      onDelta(delta);
    };

    // napi tier first (real in-process chunk streaming, no HTTP hop) when
    // preferred + bound + built with the `inferenceStream` binding.
    if (this.cfg.streamingEnabled && this.cfg.napiFirst) {
      const viaNapi = await this.safeNapiStream(normalized, sink);
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
              sink({ role: 'assistant' });
              roleSent = true;
            }
            sink({ content: token });
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
      const viaNapi = await this.safeNapiStream(normalized, sink);
      if (viaNapi?.routed) return viaNapi;
    }

    // Degrade: buffered completion emitted as ONE delta (truthful: not granular).
    const buffered = await this.complete(normalized);
    if (!buffered.routed) {
      return { ...buffered, streamed: false, tokenGranular: false };
    }
    // If a live streaming tier (loopback SSE) already pushed partial deltas to
    // the caller before failing, re-emitting the full buffered completion would
    // concatenate/duplicate the streamed output. Finalize truthfully instead of
    // corrupting the stream — the caller already holds the partial deltas.
    if (emitted > 0) {
      return {
        routed: false,
        tier: 'none',
        model,
        content: null,
        reason:
          'a streaming tier emitted partial deltas then failed; refusing to re-emit a buffered completion (would duplicate streamed output)',
        streamed: false,
        tokenGranular: false,
      };
    }
    // For the buffered path the caller has not yet received a role delta unless
    // we streamed above; emit the framing here so the SSE shape stays valid.
    sink({ role: 'assistant' });
    if (buffered.content) sink({ content: buffered.content });
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

    const routerConfigured = this.router ? this.router.available() : undefined;
    const loopbackUp = loopbackConfigured && loopbackReachable !== false;
    const tier = napiBound ? 'napi' : loopbackUp ? 'loopback' : routerConfigured ? 'router' : 'none';
    const available = napiBound || loopbackUp || routerConfigured === true;

    return {
      tier,
      available,
      napiBound,
      loopbackConfigured,
      ...(loopbackReachable !== undefined ? { loopbackReachable } : {}),
      ...(routerConfigured !== undefined ? { routerConfigured } : {}),
      ...(available
        ? {}
        : {
            reason:
              !napiBound && !loopbackConfigured
                ? `napi embedded gateway unbound and no loopback endpoint configured${
                    routerConfigured === false ? '; direct provider router has no key source' : ''
                  }`
                : (loopReason ?? 'loopback gateway not reachable'),
          }),
    };
  }

  /**
   * napi STREAM tier call guarded like `safeNapi`: an unbound tier / absent
   * seam / native failure resolves `null` (the ladder continues to loopback
   * SSE, then buffered) — never a thrown error, never a faked stream.
   *
   * CRITICAL: the tier may partial-emit deltas and THEN decline (the embedded
   * engine fails mid-stream so `completeStream` resolves `null`). If those
   * deltas had reached the caller's sink, the loopback SSE fallback would
   * re-stream the full completion through the same sink and the client would see
   * concatenated/duplicated output ("Hello wor" + "Hello world"). So we BUFFER
   * the tier's deltas locally and only replay them to the real sink once the
   * tier confirms a routed result; a decline (or throw) discards the buffer and
   * leaves the sink pristine for the loopback fallback.
   */
  private async safeNapiStream(req: InferenceRequest, onDelta: StreamSink): Promise<InferenceStreamResult | null> {
    if (!this.napi?.available() || !this.napi.completeStream) return null;
    const buffer: StreamDelta[] = [];
    try {
      const result = await this.napi.completeStream(req, (delta) => buffer.push(delta));
      if (result?.routed) {
        for (const delta of buffer) onDelta(delta);
        return result;
      }
      return null;
    } catch (err) {
      this.log.debug({ err: message(err), model: req.model }, 'napi stream tier threw — degrading to loopback SSE');
      return null;
    }
  }

  /**
   * Rung-3 router call guarded like the napi tiers: an unwired key source is a
   * truthful decline (with reason) and a thrown error resolves a decline —
   * never an exception across the seam, never a silent reroute.
   */
  private async safeRouter(req: InferenceRequest): Promise<InferenceResult | null> {
    if (!this.router) return null;
    if (!this.router.available()) {
      return notRouted(
        req.model,
        'direct provider router has no key source wired (no BYOK secrets seam, no platform keys)',
      );
    }
    try {
      return await this.router.complete(req);
    } catch (err) {
      this.log.debug({ err: message(err), model: req.model }, 'direct router tier threw — declining truthfully');
      return notRouted(req.model, 'direct provider router errored');
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
