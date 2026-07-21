/**
 * `RunInferenceSinkPort` — the inference domain's OUTBOUND seam for correlating a
 * routed completion's gateway `inference_id` back to the conductor workspace that
 * spawned it, so a MERGED workspace can fire real `task_success` RLHF feedback on
 * an id TensorZero can actually resolve.
 *
 * DECLARED here (the inference domain owns the shape); IMPLEMENTED by conductor
 * (over its single-writer `recordRunInferenceId`) and INJECTED post-construction
 * via `InferenceModule.setRunInferenceSink` — the same seam ordering as the
 * entitlement gate / usage meter, so no static `domains/conductor` edge crosses
 * into `domains/inference`.
 *
 * CORRECTNESS PRECONDITION (the napi-provenance gate): the routing service fires
 * this ONLY for a `tier === 'napi'` routed result that carries a
 * `correlationWorkspaceId`. `feedback()` dispatches ONLY through the napi tier, so
 * any non-napi provider id (`chatcmpl-…`/`msg_…`) is an unresolvable anchor and
 * must NEVER be persisted. Absent sink ⇒ a truthful no-op. Fire-and-forget: a
 * sink fault NEVER blocks or fails delivery.
 */

/** The correlation event a napi-tier routed completion emits exactly once per run. */
export interface RoutedRunInference {
  /** The conductor workspace, from `InferenceRequest.correlationWorkspaceId`. */
  readonly workspaceId: string;
  /** The gateway `inference_id` from the NAPI-tier result (feedback-resolvable). */
  readonly inferenceId: string;
  /** The metered subject (apikey principal), or `null` when unattributed. */
  readonly userId: string | null;
}

/** The narrow outbound seam the routing service emits napi-tier anchors through. */
export interface RunInferenceSinkPort {
  /** Persist the run's anchor inference_id. Idempotent, degrade-safe, never throws. */
  record(evt: RoutedRunInference): Promise<void>;
}
