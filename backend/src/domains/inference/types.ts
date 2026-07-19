/**
 * Core shared types for the INFERENCE domain — the vocabulary the delivery
 * ladder (napi embedded gateway → loopback HTTP → engines router), the routes,
 * the repositories, and the cost accounting all speak.
 *
 * Kept deliberately small and immutable: a typed completion/embedding request,
 * a truthful discriminated delivery result (which tier served it, or a reason it
 * did not), token usage, and the four durable row shapes
 * (`ProviderKeyRecord`, `ModelCatalogEntry`, `DeliveryOutcomeRecord`,
 * `UsageLedgerRecord`) backing `migrations/inference_0001_gateway.sql`.
 */

/** The chat roles the gateway understands (mirrors the OpenAI subset we map). */
export type InferenceRole = 'system' | 'user' | 'assistant' | 'tool';

/** One chat message. `content` is always flattened to a string at the boundary. */
export interface InferenceMessage {
  readonly role: InferenceRole;
  readonly content: string;
}

/**
 * OPTIONAL task-intent context a caller (conductor / agent-os / an HTTP client)
 * attaches so the pal routing brain can pick the provider/model/rung by INTENT
 * instead of taking the caller's `model` verbatim. Deliberately pal-agnostic:
 * the planner (`pal-route-planner.ts`) coerces it into pal's `TaskSpec` shape.
 * Absent ⇒ the request routes exactly as supplied (the current default).
 */
export interface RoutingHint {
  /** Stable task id (pal requires a task identity; a synthetic id is used when absent). */
  readonly taskId?: string;
  /** A `TaskIntent` string (e.g. `bugfix`, `code_review`); unknown ⇒ classified from text. */
  readonly intent?: string;
  readonly title?: string;
  readonly goal?: string;
  /**
   * A full task spec passed straight to pal's `computePalPlanDecision` (preferred
   * when the caller already holds one). When present it wins over the loose fields.
   */
  readonly taskSpec?: unknown;
}

/** A typed chat-completion request the delivery ladder routes. */
export interface InferenceRequest {
  /** Recoder model id (e.g. `openai/gpt-4o-mini`) understood by the gateway. */
  readonly model: string;
  readonly messages: readonly InferenceMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  /** The authenticated caller (drives BYOK key selection + usage attribution). */
  readonly userId?: string;
  /**
   * Route the direct multi-provider rung (rung 3, BYOK) FIRST — set when the
   * caller's plan routes direct instead of through the TensorZero tiers. The
   * ladder still degrades truthfully when the direct rung declines.
   */
  readonly preferDirect?: boolean;
  /**
   * OPTIONAL task-intent context that lets the pal routing brain override the
   * `model`/`preferDirect` by intent (see `RoutingHint`). Absent ⇒ routed as-is.
   */
  readonly routingHint?: RoutingHint;
}

/** A typed embedding request. */
export interface EmbeddingRequest {
  readonly model: string;
  readonly input: string | readonly string[];
  readonly userId?: string;
}

/** Which rung of the delivery ladder served (or would serve) a call. */
export type DeliveryTier = 'napi' | 'loopback' | 'router' | 'none';

/** Token usage for one call. `total = input + output`. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

/**
 * The truthful result of a completion. `routed` is false (with a `reason`) when
 * no tier could serve — the caller degrades explicitly, never a faked value.
 */
export interface InferenceResult {
  readonly routed: boolean;
  readonly tier: DeliveryTier;
  readonly model: string;
  /** Assistant text, or null when not routed. */
  readonly content: string | null;
  readonly usage?: TokenUsage;
  /** The gateway's inference_id for observability linkage (when available). */
  readonly inferenceId?: string;
  /** Truthful reason when `routed` is false (never a fake success). */
  readonly reason?: string;
  /**
   * Refusal discriminator when `routed` is false because a PRE-DISPATCH gate
   * refused the call (not a delivery fault): `'quota'` = the billing entitlement
   * gate denied the `token` quota. Routes map it to a truthful 429 — never a
   * 5xx gateway error over an over-quota subject.
   */
  readonly denied?: 'quota';
}

/**
 * A feedback signal attached to a prior inference by `inference_id`
 * (merge/approve = positive). `value` mirrors TensorZero's `POST /feedback`:
 * a boolean/float metric value, or a comment/demonstration string.
 */
export interface FeedbackRequest {
  /** The gateway `inference_id` the signal targets (from a routed result). */
  readonly inferenceId: string;
  /** The TensorZero metric name (e.g. `task_success`, `comment`). */
  readonly metricName: string;
  /** The signal value (boolean/float metric, or a comment string). */
  readonly value: boolean | number | string;
  /** The authenticated caller (audit attribution). */
  readonly userId?: string;
}

/**
 * The truthful result of a feedback submission. `routed` is false (with a
 * `reason`) when no feedback-capable tier could accept the signal — never a
 * fabricated `feedbackId`.
 */
export interface FeedbackResult {
  readonly routed: boolean;
  readonly tier: DeliveryTier;
  readonly inferenceId: string;
  readonly metricName: string;
  /** The gateway's `feedback_id` (present only when actually routed + reported). */
  readonly feedbackId?: string;
  /** Truthful reason when `routed` is false. */
  readonly reason?: string;
}

/** One streamed delta emitted through the `onDelta` sink. */
export interface StreamDelta {
  /** Present on the first delta only. */
  readonly role?: InferenceRole;
  /** Incremental content token(s); absent on the role/finish framing deltas. */
  readonly content?: string;
}

/**
 * The result of a streamed completion. `tokenGranular` is TRUE only when the
 * active tier emitted real per-chunk deltas (the napi embedded gateway's
 * `inferenceStream` binding, or the loopback SSE gateway); it is FALSE when
 * the ladder degraded to a buffered single-chunk emit — truthful either way.
 */
export interface InferenceStreamResult extends InferenceResult {
  readonly streamed: boolean;
  readonly tokenGranular: boolean;
}

/** The truthful result of an embedding call. */
export interface EmbeddingResult {
  readonly routed: boolean;
  readonly tier: DeliveryTier;
  readonly model: string;
  readonly embeddings: number[][] | null;
  readonly usage?: { readonly inputTokens: number };
  readonly reason?: string;
}

/** Truthful health of the inference gateway seam. */
export interface InferenceHealth {
  /** The tier that would serve right now (`none` = degraded to nothing). */
  readonly tier: DeliveryTier;
  /** True when at least one tier can route. */
  readonly available: boolean;
  /** Whether the napi embedded in-process gateway is bound. */
  readonly napiBound: boolean;
  /** Whether a loopback HTTP gateway endpoint is configured. */
  readonly loopbackConfigured: boolean;
  /** Whether the loopback endpoint answered a bounded health probe. */
  readonly loopbackReachable?: boolean;
  /**
   * Whether the rung-3 direct multi-provider router could serve (a key source —
   * BYOK secrets seam or platform keys — is wired). Present only when the
   * router rung is composed. Never leaks which providers/keys exist.
   */
  readonly routerConfigured?: boolean;
  /** Truthful reason when not fully available (never leaks the key). */
  readonly reason?: string;
}

// --- Durable row shapes (backing inference_0001_gateway.sql) -----------------

/** BYOK provider-key metadata (the ciphertext is NOT held here). */
export interface ProviderKeyRecord {
  readonly userId: string;
  readonly provider: string;
  readonly keyVersion: number;
  /** Opaque ref into the vault/secret store — NEVER the key material. */
  readonly vaultRef: string | null;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
  readonly rotatedAt: string | null;
}

/** A routable model in the catalog (config generation + pricing + discovery). */
export interface ModelCatalogEntry {
  readonly modelId: string;
  readonly provider: string;
  readonly displayName: string;
  readonly contextWindow: number;
  /** Micro-USD per 1M input tokens (integer, currency-safe; 0 = unpriced). */
  readonly inputMicroUsdPerMTok: number;
  readonly outputMicroUsdPerMTok: number;
  readonly supportsStreaming: boolean;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

/** Truthful health/status of one routed delivery. */
export type DeliveryStatus = 'ok' | 'degraded' | 'failed';

/** A row in the delivery audit trail. */
export interface DeliveryOutcomeRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly model: string;
  readonly tier: DeliveryTier;
  readonly routed: boolean;
  readonly streamed: boolean;
  readonly tokenGranular: boolean;
  readonly latencyMs: number | null;
  readonly status: DeliveryStatus;
  readonly reason: string | null;
  readonly createdAt: string;
}

/** The input a routed call appends to the delivery audit trail. */
export interface DeliveryOutcomeInput {
  readonly userId?: string | null;
  readonly model: string;
  readonly tier: DeliveryTier;
  readonly routed: boolean;
  readonly streamed?: boolean;
  readonly tokenGranular?: boolean;
  readonly latencyMs?: number | null;
  readonly status: DeliveryStatus;
  readonly reason?: string | null;
}

/** A row in the token + cost ledger. */
export interface UsageLedgerRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly model: string;
  readonly provider: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly costMicroUsd: number;
  readonly tier: DeliveryTier;
  readonly inferenceId: string | null;
  readonly createdAt: string;
}

/** The input a routed call appends to the usage ledger. */
export interface UsageLedgerInput {
  readonly userId?: string | null;
  readonly model: string;
  readonly provider?: string | null;
  readonly usage: TokenUsage;
  readonly costMicroUsd: number;
  readonly tier: DeliveryTier;
  readonly inferenceId?: string | null;
}

/** Build a `TokenUsage` from optional parts (missing counts default to 0). */
export function tokenUsage(input?: number, output?: number): TokenUsage {
  const inputTokens = Math.max(0, Math.round(input ?? 0));
  const outputTokens = Math.max(0, Math.round(output ?? 0));
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

/** Build a truthful not-routed completion result. */
export function notRouted(model: string, reason: string): InferenceResult {
  return { routed: false, tier: 'none', model, content: null, reason };
}
