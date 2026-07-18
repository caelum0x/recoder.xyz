/**
 * `createInvoiceService` — the durable invoice/receipt projection over the
 * injected {@link MeteringRepository}.
 *
 * Invoices are a PROJECTION of webhook-confirmed provider billing events (never
 * guessed): the webhook route signature-verifies + normalizes to a
 * {@link ParsedWebhook}, and `recordFromWebhook` upserts an {@link Invoice} row
 * for the `invoice.paid` events. Reads (`list`) serve the billing UI from the
 * durable table. Upsert is idempotent at the DB level on `(provider,
 * providerInvoiceId)`, so a retried webhook is a safe no-op.
 *
 * Fail-safe: an event that does not carry a resolvable invoice id + amount
 * yields `null` (nothing is written) rather than a fabricated receipt. A
 * resolvable receipt that fails to persist, however, is NOT swallowed — the
 * upsert fault propagates so the webhook route returns 5xx and the provider
 * re-delivers, rather than losing the receipt for a collected payment.
 */
import { randomUUID } from 'node:crypto';
import type { MeteringRepository } from './ports/metering-repo.port.js';
import type { Logger } from '../../shared/logger.js';
import type {
  BillingProviderName,
  Invoice,
  InvoiceStatus,
  ParsedWebhook,
} from './types.js';
import { isoOrUndefined, str } from './adapters/shared.js';

export interface InvoiceService {
  /** Durable invoices for a subject, newest first (UI billing history). */
  list(subjectId: string, limit?: number): Promise<readonly Invoice[]>;
  /**
   * Upsert an invoice from a verified `invoice.paid` webhook.
   *
   * - Returns the row on success.
   * - Returns `null` when there is nothing to project — the event is not an
   *   invoice event, or it lacks the id/amount needed to build a receipt
   *   (fail-safe: never fabricates a receipt).
   * - THROWS (propagates) when a real `invoice.paid` receipt could not be
   *   persisted (e.g. a transient DB fault). A collected payment must never be
   *   silently dropped: the throw lets the webhook route return 5xx so the
   *   provider re-delivers, instead of ACKing 200 and losing the receipt.
   */
  recordFromWebhook(event: ParsedWebhook): Promise<Invoice | null>;
}

export interface InvoiceServiceDeps {
  readonly repo: MeteringRepository;
  readonly logger?: Logger;
}

/** Pull a numeric amount (minor units) from the common provider payload shapes. */
function extractAmountCents(data: Record<string, unknown>): number | undefined {
  const candidates: unknown[] = [
    data.amount,
    data.amount_cents,
    data.total_amount,
    data.total,
    (data.details as { totals?: { grand_total?: unknown } } | undefined)?.totals?.grand_total,
    (data.totals as { grand_total?: unknown } | undefined)?.grand_total,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const n = typeof c === 'number' ? c : Number(String(c));
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return undefined;
}

function extractCurrency(data: Record<string, unknown>): string {
  return (
    str(data.currency) ??
    str(data.currency_code) ??
    str((data.details as { totals?: { currency_code?: unknown } } | undefined)?.totals?.currency_code) ??
    'usd'
  ).toLowerCase();
}

function extractProviderInvoiceId(data: Record<string, unknown>): string | undefined {
  return (
    str(data.invoice_id) ??
    str(data.payment_id) ??
    str(data.order_id) ??
    str(data.transaction_id) ??
    str(data.id)
  );
}

function extractInvoiceStatus(data: Record<string, unknown>): InvoiceStatus {
  const s = String(data.status ?? 'paid').toLowerCase();
  if (s === 'open' || s === 'pending' || s === 'draft') return 'open';
  if (s === 'void' || s === 'canceled' || s === 'cancelled') return 'void';
  if (s === 'uncollectible' || s === 'failed') return 'uncollectible';
  return 'paid';
}

/** The event `type`s (normalized across adapters) that project an invoice. */
function isInvoiceEvent(type: string): boolean {
  return type === 'invoice.paid' || type.endsWith('.invoice.paid');
}

function projectInvoice(event: ParsedWebhook): Invoice | null {
  const data = (event.raw.data ?? event.raw.object ?? event.raw) as Record<string, unknown>;
  const subjectId = str(event.subjectId);
  const providerInvoiceId = extractProviderInvoiceId(data);
  const amountCents = extractAmountCents(data);
  if (!subjectId || !providerInvoiceId || amountCents == null) return null;

  return {
    id: randomUUID(),
    subjectId,
    provider: event.provider as BillingProviderName,
    providerInvoiceId,
    amountCents,
    currency: extractCurrency(data),
    status: extractInvoiceStatus(data),
    hostedUrl: str(data.hosted_invoice_url) ?? str(data.hosted_url) ?? str(data.invoice_url) ?? null,
    pdfUrl: str(data.invoice_pdf) ?? str(data.pdf_url) ?? null,
    issuedAt:
      isoOrUndefined(data.issued_at) ??
      isoOrUndefined(data.created_at) ??
      isoOrUndefined(data.paid_at) ??
      new Date().toISOString(),
  };
}

export function createInvoiceService(deps: InvoiceServiceDeps): InvoiceService {
  const { repo, logger } = deps;

  return {
    async list(subjectId: string, limit = 50): Promise<readonly Invoice[]> {
      try {
        return await repo.listInvoices(subjectId, limit);
      } catch (error) {
        logger?.warn?.({ error, subjectId }, 'invoice.list failed → empty (fail safe)');
        return [];
      }
    },

    async recordFromWebhook(event: ParsedWebhook): Promise<Invoice | null> {
      if (!isInvoiceEvent(event.type)) return null;
      const invoice = projectInvoice(event);
      if (!invoice) {
        logger?.warn?.(
          { provider: event.provider, eventId: event.eventId },
          'invoice webhook lacked id/amount → not projected (fail safe)',
        );
        return null;
      }
      // A projectable receipt exists: it MUST commit. Do not swallow the fault —
      // returning `null` here would let the webhook reconcile mark the event
      // processed + ACK 200, permanently losing the receipt for a collected
      // payment (the provider never re-delivers a 200). Propagate so the route
      // returns 5xx and the provider retries. `null` is reserved for
      // "nothing to project", never for "failed to persist".
      try {
        await repo.upsertInvoice(invoice);
        return invoice;
      } catch (error) {
        logger?.error?.(
          { error, eventId: event.eventId, provider: event.provider },
          'invoice.upsert failed → propagating so the provider retries (receipt not lost)',
        );
        throw error;
      }
    },
  };
}
