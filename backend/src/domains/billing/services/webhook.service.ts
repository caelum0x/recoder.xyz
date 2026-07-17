/**
 * `createWebhookService` — the idempotent, signature-gated reconcile loop that
 * turns a provider webhook into a durable subscription projection.
 *
 * The flow is strictly fail-CLOSED and retry-safe:
 *   1. `verifyAndParse` runs the provider adapter's `parseEvent`, which
 *      signature-verifies the RAW body first — a `null` means a bad signature and
 *      the route drops the event (never trusts an unverified payload).
 *   2. `process` records the event id (`ON CONFLICT DO NOTHING`); a duplicate is a
 *      no-op so a provider retry never double-applies.
 *   3. It upserts the subscription projection (idempotent on
 *      `(provider, provider_sub_id)`), mapping the provider status + product →
 *      our `PlanTier`. An `active`/`trialing` grant is an upgrade; a
 *      `canceled`/`past_due` grant naturally downgrades because the
 *      {@link EntitlementGate} only honors active/trialing subscriptions.
 *   4. It marks the event processed for audit.
 *
 * The webhook route is the ONLY writer of these projections — they are never
 * written from an unauthenticated or unverified path.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { Logger } from '../../../shared/logger.js';
import type { MeteringRepository } from '../ports/metering-repo.port.js';
import type { PlanCatalog } from './plan-catalog.service.js';
import type { ProviderRegistry } from '../provider-registry.js';
import type { InvoiceService } from '../invoice.service.js';
import type {
  BillingProviderName,
  ParsedWebhook,
  PlanTier,
  SubscriptionStatus,
} from '../types.js';

export type WebhookAction = 'upserted' | 'invoiced' | 'duplicate' | 'ignored' | 'no_subject';

/** The truthful outcome of processing one webhook (surfaced to the route + audit). */
export interface WebhookProcessResult {
  readonly handled: boolean;
  readonly duplicate: boolean;
  readonly action: WebhookAction;
  readonly type: string;
  readonly eventId: string;
  readonly provider: BillingProviderName;
  readonly plan?: PlanTier;
  readonly status?: SubscriptionStatus;
}

export interface WebhookService {
  /** Verify + parse a raw webhook for a provider. `null` ⇒ bad signature (drop). */
  verifyAndParse(
    provider: BillingProviderName,
    rawBody: Buffer,
    headers: Readonly<Record<string, string>>,
  ): ParsedWebhook | null;
  /** Idempotently reconcile a parsed webhook into the durable projection. */
  process(parsed: ParsedWebhook, rawBody: Buffer): Promise<WebhookProcessResult>;
}

export interface WebhookServiceDeps {
  readonly repo: MeteringRepository;
  readonly catalog: PlanCatalog;
  readonly registry: ProviderRegistry;
  /**
   * The durable invoice/receipt projection. When wired, a verified
   * `invoice.paid` event upserts a receipt row (idempotent) instead of being
   * ignored. Optional: absent ⇒ invoice events fall through as `ignored`.
   */
  readonly invoices?: InvoiceService;
  readonly logger?: Logger;
  readonly now?: () => Date;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function createWebhookService(deps: WebhookServiceDeps): WebhookService {
  const { repo, catalog, registry, invoices, logger } = deps;
  const clock = deps.now ?? (() => new Date());

  function verifyAndParse(
    provider: BillingProviderName,
    rawBody: Buffer,
    headers: Readonly<Record<string, string>>,
  ): ParsedWebhook | null {
    return registry.get(provider).parseEvent(rawBody, headers);
  }

  async function process(parsed: ParsedWebhook, rawBody: Buffer): Promise<WebhookProcessResult> {
    const base = { type: parsed.type, eventId: parsed.eventId, provider: parsed.provider } as const;

    // 1. Idempotency: a repeated event id is a no-op (retry-safe).
    let inserted = true;
    try {
      const write = await repo.recordWebhookEvent({
        eventId: parsed.eventId,
        provider: parsed.provider,
        type: parsed.type,
        payloadHash: sha256(rawBody),
      });
      inserted = write.inserted;
    } catch (error) {
      // A repo fault must not ACK-and-lose the event: surface it so the route
      // returns 5xx and the provider retries.
      logger?.error?.({ error, ...base }, 'webhook idempotency write failed');
      throw error;
    }
    if (!inserted) {
      return { ...base, handled: true, duplicate: true, action: 'duplicate' };
    }

    // 2. Invoice projection: a verified `invoice.paid` event upserts a durable
    //    receipt row (idempotent on `(provider, providerInvoiceId)`). The
    //    service self-filters non-invoice events (returns null), so subscription
    //    events fall straight through to step 3 untouched. Never fabricated.
    if (invoices) {
      const invoice = await invoices.recordFromWebhook(parsed);
      if (invoice) {
        await markProcessed(parsed);
        return { ...base, handled: true, duplicate: false, action: 'invoiced' };
      }
    }

    // 3. Only reconcile events that carry a subscription snapshot.
    const snap = parsed.subscription;
    if (!snap) {
      await markProcessed(parsed);
      return { ...base, handled: true, duplicate: false, action: 'ignored' };
    }

    // 4. Resolve the owning subject (never guess — a missing subject can't be projected).
    const subjectId = parsed.subjectId;
    if (!subjectId) {
      logger?.warn?.({ ...base }, 'webhook has no resolvable subject → cannot project (marked processed)');
      await markProcessed(parsed);
      return { ...base, handled: true, duplicate: false, action: 'no_subject' };
    }

    // 5. Resolve the plan: adapter-mapped tier, else the current projection's plan,
    //    else the deny-safe `free` floor (a cancel with no product still projects).
    let plan: PlanTier | undefined = snap.plan ? catalog.normalize(snap.plan) : undefined;
    if (!plan) {
      try {
        const existing = await repo.getActiveSubscription(subjectId);
        plan = existing?.plan;
      } catch (error) {
        logger?.warn?.({ error, ...base }, 'webhook plan inheritance read failed');
      }
    }
    const resolvedPlan = plan ?? 'free';

    const subjectKind =
      (typeof (parsed.raw as { subject_kind?: unknown }).subject_kind === 'string'
        ? (parsed.raw as { subject_kind?: string }).subject_kind
        : undefined) === 'org'
        ? 'org'
        : 'user';

    try {
      await repo.upsertSubscription({
        id: randomUUID(),
        subjectId,
        subjectKind,
        plan: resolvedPlan,
        provider: parsed.provider,
        providerCustomerId: snap.providerCustomerId ?? null,
        providerSubId: snap.providerSubId,
        status: snap.status,
        currentPeriodEnd: snap.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: snap.cancelAtPeriodEnd,
      });
    } catch (error) {
      logger?.error?.({ error, ...base }, 'webhook subscription upsert failed');
      throw error;
    }

    await markProcessed(parsed);
    return {
      ...base,
      handled: true,
      duplicate: false,
      action: 'upserted',
      plan: resolvedPlan,
      status: snap.status,
    };
  }

  async function markProcessed(parsed: ParsedWebhook): Promise<void> {
    try {
      await repo.markWebhookProcessed(parsed.provider, parsed.eventId, clock().toISOString());
    } catch (error) {
      // Non-fatal: the projection already applied; the audit stamp is best-effort.
      logger?.warn?.({ error, eventId: parsed.eventId }, 'webhook markProcessed failed (non-fatal)');
    }
  }

  return { verifyAndParse, process };
}
