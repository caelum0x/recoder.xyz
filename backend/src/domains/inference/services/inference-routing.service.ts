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
  async complete(req: InferenceRequest): Promise<InferenceResult> {
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
  async completeStream(req: InferenceRequest, onDelta: StreamSink): Promise<InferenceStreamResult> {
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

    if (!params.routed) return; // nothing to charge for a non-delivery

    try {
      const usage =
        params.usage ??
        resolveUsage({ messages: params.req.messages, completion: params.content });
      const entry = await this.catalog.get(model);
      const costMicroUsd = computeCostMicroUsd(usage, entry);
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
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
