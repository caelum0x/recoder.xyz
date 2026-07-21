/**
 * `InferenceRoutingService` — the orchestration seam that fuses the delivery
 * ladder (`InferenceGatewayPort`) with cost accounting + the durable ledger +
 * the delivery-outcome audit trail. Every routed call:
 *   1. routes through the gateway ladder (napi → loopback → none),
 *   2. resolves truthful token usage (gateway-reported, else the char heuristic),
 *   3. costs it against the model catalog pricing (0 when unpriced),
 *   4. appends a usage-ledger row + a delivery-outcome audit row (best-effort).
 *
 * Accounting NEVER blocks or fails delivery: a ledger/outcome write error is
 * logged and swallowed (the completion still returns). Degrade-safe throughout.
 */
import type { Logger } from '../../../shared/logger.js';
import type { InferenceGatewayPort, StreamSink } from '../ports/inference-gateway.port.js';
import type { ModelCatalogRepository } from '../ports/model-catalog.port.js';
import type {
  DeliveryOutcomeRepository,
  UsageLedgerRepository,
} from '../ports/usage-ledger.port.js';
import type {
  DeliveryStatus,
  EmbeddingRequest,
  EmbeddingResult,
  FeedbackRequest,
  FeedbackResult,
  InferenceRequest,
  InferenceResult,
  InferenceStreamResult,
  TokenUsage,
} from '../types.js';
import { computeCostMicroUsd, resolveUsage } from '../adapters/token-accounting.js';
import type { EntitlementGate, BillingSubject } from '../ports/entitlement-gate.port.js';
import type { UsageMeterPort } from '../ports/usage-meter.port.js';
import type { PalRoutePlannerPort } from '../ports/pal-route.port.js';
import type { RunInferenceSinkPort } from '../ports/run-inference-sink.port.js';

export interface InferenceRoutingDeps {
  readonly logger: Logger;
  readonly gateway: InferenceGatewayPort;
  readonly catalog: ModelCatalogRepository;
  readonly ledger: UsageLedgerRepository;
  readonly outcomes: DeliveryOutcomeRepository;
  /** Injectable clock (ms) for deterministic latency accounting in tests. */
  readonly now?: () => number;
}

export class InferenceRoutingService {
  private readonly log: Logger;
  private readonly gateway: InferenceGatewayPort;
  private readonly catalog: ModelCatalogRepository;
  private readonly ledger: UsageLedgerRepository;
  private readonly outcomes: DeliveryOutcomeRepository;
  private readonly now: () => number;
  /** OPTIONAL BYOK-aware token-quota gate (set by the composer; absent ⇒ open). */
  private entitlementGate?: EntitlementGate;
  /** OPTIONAL usage meter (set by the composer; absent ⇒ no token metering). */
  private usageMeter?: UsageMeterPort;
  /** OPTIONAL pal routing brain (set by the composer; absent ⇒ route as supplied). */
  private palRouter?: PalRoutePlannerPort;
  /** OPTIONAL run-inference sink (set by the composer; absent ⇒ no correlation). */
  private runSink?: RunInferenceSinkPort;

  constructor(deps: InferenceRoutingDeps) {
    this.log = deps.logger;
    this.gateway = deps.gateway;
    this.catalog = deps.catalog;
    this.ledger = deps.ledger;
    this.outcomes = deps.outcomes;
    this.now = deps.now ?? (() => Date.now());
  }

  /** Inject the optional billing entitlement gate (pre-dispatch token quota). */
  setEntitlementGate(gate: EntitlementGate): void {
    this.entitlementGate = gate;
  }

  /** Inject the optional billing usage meter (per-completion `token` metering). */
  setUsageMeter(meter: UsageMeterPort): void {
    this.usageMeter = meter;
  }

  /**
   * Inject the optional pal routing brain. Once set, a request carrying a
   * `routingHint` has its provider/model/rung chosen by task INTENT before
   * dispatch; a request without a hint (or when this is unset) routes exactly as
   * supplied — the current default. NEVER blocks or changes delivery semantics.
   */
  setPalRouter(planner: PalRoutePlannerPort): void {
    this.palRouter = planner;
  }

  /**
   * Inject the optional run-inference sink. Once set, a routed completion served
   * by the `napi` tier that carries a `correlationWorkspaceId` correlates its
   * `inference_id` back to its conductor workspace (RLHF anchor) — fire-and-forget,
   * gated on `tier === 'napi'` (the ONLY feedback-resolvable tier). Absent ⇒ a
   * truthful no-op. A sink fault NEVER blocks or fails delivery.
   */
  setRunInferenceSink(sink: RunInferenceSinkPort): void {
    this.runSink = sink;
  }

  /**
   * Consult the pal routing brain when a `routingHint` is present, returning a
   * NEW request with the pal-chosen `model`/`preferDirect` applied (immutable —
   * the caller's request is never mutated). Degrades to the request UNCHANGED
   * when no pal router is wired, no hint is attached, pal keeps the requested
   * model, or the catalog read/planner throws. A pal consultation never blocks
   * delivery: any fault falls through to the request as supplied.
   */
  private async resolveRoute(req: InferenceRequest): Promise<InferenceRequest> {
    const planner = this.palRouter;
    if (!planner || !req.routingHint) return req;
    try {
      const models = await this.catalog.list({ enabledOnly: true });
      const decision = planner.plan(req.routingHint, models, req.model);
      if (decision.source !== 'pal') {
        this.log.debug({ reason: decision.reason }, 'pal routing brain kept the requested model');
        return req;
      }
      this.log.debug(
        { from: req.model, to: decision.model, intent: decision.intent, risk: decision.risk, reason: decision.reason },
        'pal routing brain selected the route',
      );
      return { ...req, model: decision.model, preferDirect: decision.preferDirect };
    } catch (err) {
      this.log.warn({ err: message(err) }, 'pal route resolution errored — routing the request as supplied');
      return req;
    }
  }

  /**
   * BYOK-aware pre-dispatch token-quota check. Returns a truthful deny reason when
   * the subject is over its `token` quota, else `null` (proceed). Degrades OPEN
   * (returns `null`) when no gate is wired, when the request has no attributable
   * `userId`, or when the gate throws (a metering hiccup must not block delivery —
   * the gate is itself fail-safe on `allowed`). A BYOK subject bypasses the token
   * quota inside the gate (`byokBypass`), so this stays correct for BYOK callers.
   */
  private async entitlementDeny(req: InferenceRequest): Promise<string | null> {
    const gate = this.entitlementGate;
    if (!gate || !req.userId) return null;
    try {
      const subject: BillingSubject = { subjectId: req.userId, kind: 'user' };
      const decision = await gate.checkQuota(subject, 'token');
      if (decision.allowed) return null;
      return decision.message ?? `token quota denied (${decision.reason ?? 'quota_exceeded'})`;
    } catch (err) {
      this.log.warn({ err: message(err) }, 'inference entitlement quota check errored — degrading open');
      return null;
    }
  }

  /** Route a buffered completion + account it. */
  async complete(request: InferenceRequest): Promise<InferenceResult> {
    // pal routing brain FIRST: pick provider/model/rung by intent (degrade-safe).
    const req = await this.resolveRoute(request);
    const denyReason = await this.entitlementDeny(req);
    if (denyReason) {
      return {
        routed: false,
        tier: 'none',
        model: req.model,
        content: null,
        reason: denyReason,
        denied: 'quota',
      };
    }
    const startedAt = this.now();
    const result = await this.gateway.complete(req);
    await this.account({
      req,
      routed: result.routed,
      tier: result.tier,
      content: result.content,
      usage: result.usage,
      inferenceId: result.inferenceId,
      streamed: false,
      tokenGranular: false,
      latencyMs: this.now() - startedAt,
      reason: result.reason ?? null,
    });
    return result;
  }

  /** Route a streamed completion (real SSE when available) + account it. */
  async completeStream(request: InferenceRequest, onDelta: StreamSink): Promise<InferenceStreamResult> {
    // pal routing brain FIRST: pick provider/model/rung by intent (degrade-safe).
    const req = await this.resolveRoute(request);
    const denyReason = await this.entitlementDeny(req);
    if (denyReason) {
      return {
        routed: false,
        tier: 'none',
        model: req.model,
        content: null,
        reason: denyReason,
        denied: 'quota',
        streamed: false,
        tokenGranular: false,
      };
    }
    const startedAt = this.now();
    const result = await this.gateway.completeStream(req, onDelta);
    await this.account({
      req,
      routed: result.routed,
      tier: result.tier,
      content: result.content,
      usage: result.usage,
      inferenceId: result.inferenceId,
      streamed: result.streamed,
      tokenGranular: result.tokenGranular,
      latencyMs: this.now() - startedAt,
      reason: result.reason ?? null,
    });
    return result;
  }

  /** Route an embedding call (accounted as input-only usage). */
  async embed(req: EmbeddingRequest): Promise<EmbeddingResult> {
    return this.gateway.embed(req);
  }

  /**
   * Attach a feedback signal to a prior `inference_id` (merge/approve =
   * positive) and best-effort append a delivery-outcome audit row so feedback
   * is wired to delivery outcomes. Mirrors the accounting law: the audit write
   * NEVER blocks or fails the submission; the result is always truthful
   * (`{ routed:false, reason }` when no feedback-capable tier is bound).
   */
  async feedback(req: FeedbackRequest): Promise<FeedbackResult> {
    const startedAt = this.now();
    const result = await this.gateway.feedback(req);
    try {
      await this.outcomes.append({
        userId: req.userId ?? null,
        model: `feedback:${req.metricName}`,
        tier: result.tier,
        routed: result.routed,
        streamed: false,
        tokenGranular: false,
        latencyMs: this.now() - startedAt,
        status: result.routed ? 'ok' : 'failed',
        reason: result.routed
          ? `feedback ${req.metricName} on ${req.inferenceId}${result.feedbackId ? ` (feedback_id ${result.feedbackId})` : ''}`
          : (result.reason ?? null),
      });
    } catch (err) {
      this.log.warn(
        { err: message(err), inferenceId: req.inferenceId, metricName: req.metricName },
        'feedback outcome accounting failed (ignored)',
      );
    }
    return result;
  }

  /** Record usage + delivery outcome. Never throws (accounting must not fail delivery). */
  private async account(params: {
    readonly req: InferenceRequest;
    readonly routed: boolean;
    readonly tier: InferenceResult['tier'];
    readonly content: string | null;
    readonly usage: TokenUsage | undefined;
    readonly inferenceId: string | undefined;
    readonly streamed: boolean;
    readonly tokenGranular: boolean;
    readonly latencyMs: number;
    readonly reason: string | null;
  }): Promise<void> {
    const model = params.req.model;
    const provider = model.includes('/') ? model.slice(0, model.indexOf('/')) : null;
    const status: DeliveryStatus = params.routed ? (params.tier === 'napi' || params.tier === 'loopback' ? 'ok' : 'degraded') : 'failed';

    try {
      await this.outcomes.append({
        userId: params.req.userId ?? null,
        model,
        tier: params.tier,
        routed: params.routed,
        streamed: params.streamed,
        tokenGranular: params.tokenGranular,
        latencyMs: params.latencyMs,
        status,
        reason: params.reason,
      });
    } catch (err) {
      this.log.warn({ err: message(err), model }, 'delivery outcome accounting failed (ignored)');
    }

    // Correlate the run's napi-tier inference_id back to its workspace (RLHF anchor).
    // Fired independent of the ledger below so a usage/catalog fault can't drop the
    // anchor. Self-gated on tier === 'napi' + inferenceId + correlationWorkspaceId.
    this.emitRunSink(params);

    if (!params.routed) return; // nothing to charge for a non-delivery

    try {
      const usage =
        params.usage ??
        resolveUsage({ messages: params.req.messages, completion: params.content });
      const entry = await this.catalog.get(model);
      const costMicroUsd = computeCostMicroUsd(usage, entry);
      // Meter tokens (prompt + completion) so the `token` quota decrements. Emitted
      // BEFORE the ledger await + fire-and-forget so it is decoupled from (and never
      // blocked by) the ledger write, and a metering fault never fails delivery.
      this.emitTokenMeter(params, usage, provider);
      await this.ledger.append({
        userId: params.req.userId ?? null,
        model,
        provider,
        usage,
        costMicroUsd,
        tier: params.tier,
        inferenceId: params.inferenceId ?? null,
      });
    } catch (err) {
      this.log.warn({ err: message(err), model }, 'usage ledger accounting failed (ignored)');
    }
  }

  /**
   * Emit one `token` usage meter for a routed completion (BYOK subjects are
   * skipped inside the billing gate/quota, so this stays correct for them). NO-OP
   * when: no meter wired, no attributable `userId`, or zero total tokens. Idempotent
   * by `inferenceId` when present (a retry with the same id is a durable no-op).
   * Fire-and-forget + self-logging — a metering hiccup NEVER blocks delivery.
   */
  private emitTokenMeter(
    params: { readonly req: InferenceRequest; readonly inferenceId: string | undefined },
    usage: TokenUsage,
    provider: string | null,
  ): void {
    const meter = this.usageMeter;
    const userId = params.req.userId;
    if (!meter || !userId || usage.totalTokens <= 0) return;
    void meter
      .record({
        subjectId: userId,
        kind: 'token',
        quantity: usage.totalTokens,
        engine: provider,
        ...(params.inferenceId ? { idempotencyKey: `token:${params.inferenceId}` } : {}),
      })
      .catch((err) =>
        this.log.warn({ err: message(err), model: params.req.model }, 'inference token meter emit failed (ignored)'),
      );
  }

  /**
   * Correlate a routed completion's gateway `inference_id` back to the conductor
   * workspace that spawned it, so a MERGED workspace can fire real `task_success`
   * feedback on a TensorZero-resolvable anchor.
   *
   * CORRECTNESS PRECONDITION (the napi-provenance gate): fires ONLY when the
   * result was served by the `napi` tier — `feedback()` dispatches ONLY through
   * napi, so a non-napi provider id (`chatcmpl-…`/`msg_…`) is an unresolvable
   * anchor and must NEVER be persisted. NO-OP when: no sink wired, the tier is
   * not `napi`, no `inferenceId`, or no `correlationWorkspaceId`. Fire-and-forget
   * + self-logging — identical policy to `emitTokenMeter`; a sink fault NEVER
   * blocks or fails delivery.
   */
  private emitRunSink(params: {
    readonly req: InferenceRequest;
    readonly tier: InferenceResult['tier'];
    readonly inferenceId: string | undefined;
  }): void {
    const sink = this.runSink;
    const workspaceId = params.req.correlationWorkspaceId;
    if (!sink || params.tier !== 'napi' || !params.inferenceId || !workspaceId) return;
    void sink
      .record({
        workspaceId,
        inferenceId: params.inferenceId,
        userId: params.req.userId ?? null,
      })
      .catch((err) =>
        this.log.warn({ err: message(err), workspaceId }, 'run-inference sink record failed (ignored)'),
      );
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
