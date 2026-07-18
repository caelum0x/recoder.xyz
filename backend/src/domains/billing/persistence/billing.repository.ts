/**
 * `createBillingRepository` — the concrete {@link MeteringRepository} over the
 * injected {@link QueryExecutor}.
 *
 * All access is parameterized `:param` SQL bound through the executor (never
 * string interpolation), app-layer scoped by `subject_id`. Idempotency is
 * enforced at the DB level: `ON CONFLICT DO NOTHING` on the UNIQUE
 * (`idempotency_key`, and `(provider, event_id)`) keys, and the affected-row
 * count tells the caller whether the write was new (`inserted`) or a duplicate
 * no-op — the retry-safety the metering + webhook loops depend on.
 */
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type {
  CounterUpsert,
  IdempotentWrite,
  MeteringRepository,
  SubscriptionUpsert,
  UsageEventInput,
} from '../ports/metering-repo.port.js';
import type {
  BillingProviderName,
  BillingSubscription,
  Invoice,
  PlanTier,
  SubscriptionStatus,
  UsageCounter,
  UsageKind,
  UsageRecord,
  WebhookEventRow,
} from '../types.js';

function isoOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function iso(v: unknown, fallback = new Date().toISOString()): string {
  return isoOrNull(v) ?? fallback;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapSubscription(row: QueryRow): BillingSubscription {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    subjectKind: (row.subject_kind === 'org' ? 'org' : 'user'),
    plan: String(row.plan) as PlanTier,
    provider: String(row.provider) as BillingProviderName,
    providerCustomerId: isoOrNull(row.provider_customer_id),
    providerSubId: isoOrNull(row.provider_sub_id),
    status: String(row.status) as SubscriptionStatus,
    currentPeriodEnd: isoOrNull(row.current_period_end),
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    updatedAt: iso(row.updated_at),
  };
}

function mapInvoice(row: QueryRow): Invoice {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    provider: String(row.provider) as BillingProviderName,
    providerInvoiceId: String(row.provider_invoice_id),
    amountCents: num(row.amount_cents),
    currency: String(row.currency ?? 'usd'),
    status: String(row.status) as Invoice['status'],
    hostedUrl: isoOrNull(row.hosted_url),
    pdfUrl: isoOrNull(row.pdf_url),
    issuedAt: iso(row.issued_at),
  };
}

function mapUsage(row: QueryRow): UsageRecord {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    kind: String(row.kind) as UsageKind,
    quantity: num(row.quantity, 1),
    runId: isoOrNull(row.run_id),
    engine: isoOrNull(row.engine),
    idempotencyKey: String(row.idempotency_key),
    occurredAt: iso(row.occurred_at),
    flushedAt: isoOrNull(row.flushed_at),
  };
}

function mapCounter(row: QueryRow): UsageCounter {
  return {
    subjectId: String(row.subject_id),
    kind: String(row.kind) as UsageKind,
    windowStart: iso(row.window_start),
    usageLimit: num(row.usage_limit),
    used: num(row.used),
    resetAt: iso(row.reset_at),
  };
}

export function createBillingRepository(executor: QueryExecutor): MeteringRepository {
  return {
    async getActiveSubscription(subjectId) {
      // Precedence: active > trialing > past_due > canceled; newest wins.
      const row = await executor.one<QueryRow>(
        `select * from billing_subscriptions
           where subject_id = :subjectId
           order by
             case status
               when 'active' then 0
               when 'trialing' then 1
               when 'past_due' then 2
               else 3
             end asc,
             updated_at desc
           limit 1`,
        { subjectId },
      );
      return row ? mapSubscription(row) : null;
    },

    async upsertSubscription(sub: SubscriptionUpsert) {
      await executor.mutate(
        `insert into billing_subscriptions
           (id, subject_id, subject_kind, plan, provider, provider_customer_id,
            provider_sub_id, status, current_period_end, cancel_at_period_end, updated_at)
         values
           (:id, :subjectId, :subjectKind, :plan, :provider, :providerCustomerId,
            :providerSubId, :status, :currentPeriodEnd, :cancelAtPeriodEnd, now())
         on conflict (provider, provider_sub_id) do update set
           subject_id = excluded.subject_id,
           subject_kind = excluded.subject_kind,
           plan = excluded.plan,
           provider_customer_id = excluded.provider_customer_id,
           status = excluded.status,
           current_period_end = excluded.current_period_end,
           cancel_at_period_end = excluded.cancel_at_period_end,
           updated_at = now()`,
        {
          id: sub.id,
          subjectId: sub.subjectId,
          subjectKind: sub.subjectKind,
          plan: sub.plan,
          provider: sub.provider,
          providerCustomerId: sub.providerCustomerId ?? null,
          providerSubId: sub.providerSubId ?? null,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        },
      );
    },

    async listInvoices(subjectId, limit = 50) {
      const rows = await executor.read<QueryRow>(
        `select * from billing_invoices
           where subject_id = :subjectId
           order by issued_at desc
           limit :limit`,
        { subjectId, limit },
      );
      return rows.map(mapInvoice);
    },

    async upsertInvoice(invoice: Invoice) {
      await executor.mutate(
        `insert into billing_invoices
           (id, subject_id, provider, provider_invoice_id, amount_cents, currency,
            status, hosted_url, pdf_url, issued_at)
         values
           (:id, :subjectId, :provider, :providerInvoiceId, :amountCents, :currency,
            :status, :hostedUrl, :pdfUrl, :issuedAt)
         on conflict (provider, provider_invoice_id) do update set
           amount_cents = excluded.amount_cents,
           currency = excluded.currency,
           status = excluded.status,
           hosted_url = excluded.hosted_url,
           pdf_url = excluded.pdf_url,
           issued_at = excluded.issued_at`,
        {
          id: invoice.id,
          subjectId: invoice.subjectId,
          provider: invoice.provider,
          providerInvoiceId: invoice.providerInvoiceId,
          amountCents: invoice.amountCents,
          currency: invoice.currency,
          status: invoice.status,
          hostedUrl: invoice.hostedUrl ?? null,
          pdfUrl: invoice.pdfUrl ?? null,
          issuedAt: invoice.issuedAt,
        },
      );
    },

    async recordUsage(event: UsageEventInput): Promise<IdempotentWrite> {
      // ON CONFLICT DO NOTHING on the UNIQUE idempotency_key: the affected-row
      // count is 1 for a fresh insert, 0 for a duplicate (retry-safe no-op).
      const count = await executor.mutate(
        `insert into billing_usage_events
           (id, subject_id, kind, quantity, run_id, engine, idempotency_key, occurred_at)
         values
           (:id, :subjectId, :kind, :quantity, :runId, :engine, :idempotencyKey,
            coalesce(:occurredAt::timestamptz, now()))
         on conflict (idempotency_key) do nothing`,
        {
          id: event.id,
          subjectId: event.subjectId,
          kind: event.kind,
          quantity: event.quantity,
          runId: event.runId ?? null,
          engine: event.engine ?? null,
          idempotencyKey: event.idempotencyKey,
          occurredAt: event.occurredAt ?? null,
        },
      );
      return { inserted: count > 0 };
    },

    async usageSince(subjectId, kind, since) {
      const row = await executor.one<QueryRow>(
        `select coalesce(sum(quantity), 0) as total
           from billing_usage_events
           where subject_id = :subjectId and kind = :kind and occurred_at >= :since::timestamptz`,
        { subjectId, kind, since },
      );
      return num(row?.total, 0);
    },

    async unflushedUsage(limit) {
      const rows = await executor.read<QueryRow>(
        `select * from billing_usage_events
           where flushed_at is null
           order by occurred_at asc
           limit :limit`,
        { limit },
      );
      return rows.map(mapUsage);
    },

    async markFlushed(ids, flushedAt) {
      if (ids.length === 0) return 0;
      return executor.mutate(
        `update billing_usage_events
           set flushed_at = :flushedAt::timestamptz
           where id = any(:ids)`,
        { flushedAt, ids: [...ids] },
      );
    },

    async getCounter(subjectId, kind, windowStart) {
      const row = await executor.one<QueryRow>(
        `select * from billing_usage_counters
           where subject_id = :subjectId and kind = :kind and window_start = :windowStart::timestamptz`,
        { subjectId, kind, windowStart },
      );
      return row ? mapCounter(row) : null;
    },

    async upsertCounter(counter: CounterUpsert) {
      await executor.mutate(
        `insert into billing_usage_counters
           (subject_id, kind, window_start, usage_limit, used, reset_at)
         values
           (:subjectId, :kind, :windowStart::timestamptz, :usageLimit, 0, :resetAt::timestamptz)
         on conflict (subject_id, kind, window_start) do update set
           usage_limit = excluded.usage_limit,
           reset_at = excluded.reset_at`,
        {
          subjectId: counter.subjectId,
          kind: counter.kind,
          windowStart: counter.windowStart,
          usageLimit: counter.usageLimit,
          resetAt: counter.resetAt,
        },
      );
    },

    async incrementCounter(subjectId, kind, windowStart, delta) {
      const row = await executor.one<QueryRow>(
        `update billing_usage_counters
           set used = used + :delta
           where subject_id = :subjectId and kind = :kind and window_start = :windowStart::timestamptz
           returning used`,
        { subjectId, kind, windowStart, delta },
      );
      return num(row?.used, 0);
    },

    async recordWebhookEvent(row: Omit<WebhookEventRow, 'receivedAt' | 'processedAt'>): Promise<IdempotentWrite> {
      const count = await executor.mutate(
        `insert into billing_webhook_events (event_id, provider, type, payload_hash)
         values (:eventId, :provider, :type, :payloadHash)
         on conflict (provider, event_id) do nothing`,
        {
          eventId: row.eventId,
          provider: row.provider,
          type: row.type,
          payloadHash: row.payloadHash,
        },
      );
      return { inserted: count > 0 };
    },

    async markWebhookProcessed(provider: BillingProviderName, eventId, processedAt) {
      await executor.mutate(
        `update billing_webhook_events
           set processed_at = :processedAt::timestamptz
           where provider = :provider and event_id = :eventId`,
        { provider, eventId, processedAt },
      );
    },

    async wasWebhookProcessed(provider: BillingProviderName, eventId) {
      // Dedup gate = fully processed (processed_at set), not mere receipt: a row
      // left by a prior faulted attempt (processed_at null) must NOT dedup.
      const row = await executor.one<QueryRow>(
        `select processed_at from billing_webhook_events
           where provider = :provider and event_id = :eventId`,
        { provider, eventId },
      );
      return row != null && row.processed_at != null;
    },

    isAvailable() {
      return executor.isAvailable();
    },
  };
}
