/**
 * `InferenceGatewayPort` — the ONE seam every completion/embedding caller depends
 * on. The concrete adapter (`tensorzero-transport.adapter.ts`) resolves it as a
 * degrade-safe ladder: napi embedded gateway (in-process, no HTTP hop) → loopback
 * HTTP gateway (real per-token SSE) → engines router → truthful `none`.
 *
 * Laws (mirror the engines seam): a method NEVER throws across the seam and NEVER
 * fabricates a value — an unroutable call resolves `{ routed:false, reason }`; a
 * missing endpoint/binding is a truthful degrade, not an error.
 */
import type {
  EmbeddingRequest,
  EmbeddingResult,
  InferenceHealth,
  InferenceRequest,
  InferenceResult,
  InferenceStreamResult,
  StreamDelta,
} from '../types.js';

/** The per-delta sink `completeStream` calls for each streamed token/framing event. */
export type StreamSink = (delta: StreamDelta) => void;

export interface InferenceGatewayPort {
  /**
   * Route one buffered completion down the ladder. Resolves a truthful
   * `InferenceResult` — never throws, never fakes.
   */
  complete(req: InferenceRequest): Promise<InferenceResult>;

  /**
   * Route one STREAMED completion. When the loopback tier is active this emits
   * REAL per-token SSE deltas through `onDelta` (`tokenGranular:true`). When the
   * ladder degrades to the napi embedded gateway (no stream seam) it emits the
   * full content as one delta (`tokenGranular:false`) — truthful either way.
   */
  completeStream(req: InferenceRequest, onDelta: StreamSink): Promise<InferenceStreamResult>;

  /** Route one embedding call down the ladder. */
  embed(req: EmbeddingRequest): Promise<EmbeddingResult>;

  /** Truthful current health: which tier is bound + reachable (never leaks the key). */
  health(): Promise<InferenceHealth>;
}
