/**
 * Proves the durable invoice/receipt projection is WIRED and fail-safe:
 *   - `list` happy path serves the durable rows newest-first from the repo.
 *   - `list` degrade path returns an empty list (never throws) when the repo is
 *     down — a truthful "no receipts", never a fabricated one.
 *   - `recordFromWebhook` projects a receipt from a verified `invoice.paid`
 *     event, self-filters non-invoice events (returns null), and fails safe when
 *     the event lacks a resolvable id/amount (nothing written).
 *   - The webhook reconcile now drives that projection: an `invoice.paid` event
 *     yields the `invoiced` action + a durable upsert (recordFromWebhook is live,
 *     no longer dead code).
 */
import { describe, it, expect } from 'vitest';
import { createInvoiceService } from '../invoice.service.js';
import { createWebhookService } from '../services/webhook.service.js';
import { createPlanCatalog } from '../services/plan-catalog.service.js';
import { sliceBillingConfig } from '../config.js';
import type { ProviderRegistry } from '../provider-registry.js';
import type { BillingProviderPort } from '../ports/billing-provider.port.js';
import type { MeteringRepository } from '../ports/metering-repo.port.js';
import type { Invoice, ParsedWebhook } from '../types.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<typeof sliceBillingConfig>[0];
const catalog = createPlanCatalog(sliceBillingConfig(appConfig));

interface RepoState {
  invoices: Invoice[];
  upserts: Invoice[];
  seen: Set<string>;
  throwOnList?: boolean;
  throwOnUpsert?: boolean;
  markedProcessed: string[];
}

function fakeRepo(state: RepoState): MeteringRepository {
  const base = {
    async listInvoices(_subjectId: string, limit: number) {
      if (state.throwOnList) throw new Error('pool down');
      return state.invoices.slice(0, limit);
    },
    async upsertInvoice(inv: Invoice) {
      if (state.throwOnUpsert) throw new Error('transient DB error');
      state.upserts.push(inv);
    },
    async recordWebhookEvent(row: { eventId: string }) {
      if (state.seen.has(row.eventId)) return { inserted: false };
      state.seen.add(row.eventId);
      return { inserted: true };
    },
    async markWebhookProcessed(_provider: string, eventId: string) {
      state.markedProcessed.push(eventId);
    },
    async wasWebhookProcessed(_provider: string, eventId: string) {
      return state.markedProcessed.includes(eventId);
    },
    async getActiveSubscription() {
      return null;
    },
    isAvailable: () => true,
  };
  return new Proxy(base as unknown as MeteringRepository, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (v !== undefined) return v;
      return () => {
        throw new Error(`unexpected repo call: ${String(prop)}`);
      };
    },
  });
}

function fakeRegistry(): ProviderRegistry {
  const adapter = { name: 'polar' } as unknown as BillingProviderPort;
  return {
    activeName: 'polar',
    active: () => adapter,
    get: () => adapter,
    all: () => [adapter],
    health: async () => ({ name: 'billing.provider', status: 'up', degraded: false }),
  };
}

function invoiceRow(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-existing',
    subjectId: 'u1',
    provider: 'polar',
    providerInvoiceId: 'pi_1',
    amountCents: 2000,
    currency: 'usd',
    status: 'paid',
    hostedUrl: null,
    pdfUrl: null,
    issuedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

function invoiceEvent(data: Record<string, unknown>, over: Partial<ParsedWebhook> = {}): ParsedWebhook {
  return {
    provider: 'polar',
    eventId: 'evt_inv_1',
    type: 'invoice.paid',
    subjectId: 'u1',
    raw: { data },
    ...over,
  };
}

describe('invoice projection — list', () => {
  it('serves the durable rows on the happy path', async () => {
    const state: RepoState = { invoices: [invoiceRow(), invoiceRow({ id: 'inv-2' })], upserts: [], seen: new Set(), markedProcessed: [] };
    const svc = createInvoiceService({ repo: fakeRepo(state) });
    const rows = await svc.list('u1', 20);
    expect(rows).toHaveLength(2);
    expect(rows[0].providerInvoiceId).toBe('pi_1');
  });

  it('degrade-safe: a repo fault yields an empty list, never a throw', async () => {
    const state: RepoState = { invoices: [invoiceRow()], upserts: [], seen: new Set(), throwOnList: true, markedProcessed: [] };
    const svc = createInvoiceService({ repo: fakeRepo(state) });
    await expect(svc.list('u1')).resolves.toEqual([]);
  });
});

describe('invoice projection — recordFromWebhook', () => {
  it('projects a receipt from a verified invoice.paid event', async () => {
    const state: RepoState = { invoices: [], upserts: [], seen: new Set(), markedProcessed: [] };
    const svc = createInvoiceService({ repo: fakeRepo(state) });
    const inv = await svc.recordFromWebhook(
      invoiceEvent({ invoice_id: 'pi_42', amount: 4900, currency: 'usd', status: 'paid' }),
    );
    expect(inv).not.toBeNull();
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]).toMatchObject({ providerInvoiceId: 'pi_42', amountCents: 4900, status: 'paid', subjectId: 'u1' });
  });

  it('self-filters a non-invoice event (returns null, nothing written)', async () => {
    const state: RepoState = { invoices: [], upserts: [], seen: new Set(), markedProcessed: [] };
    const svc = createInvoiceService({ repo: fakeRepo(state) });
    const inv = await svc.recordFromWebhook(invoiceEvent({ invoice_id: 'x', amount: 1 }, { type: 'subscription.active' }));
    expect(inv).toBeNull();
    expect(state.upserts).toHaveLength(0);
  });

  it('fails safe when the event lacks a resolvable id/amount (never a fabricated receipt)', async () => {
    const state: RepoState = { invoices: [], upserts: [], seen: new Set(), markedProcessed: [] };
    const svc = createInvoiceService({ repo: fakeRepo(state) });
    const inv = await svc.recordFromWebhook(invoiceEvent({ currency: 'usd' /* no id, no amount */ }));
    expect(inv).toBeNull();
    expect(state.upserts).toHaveLength(0);
  });

  it('PROPAGATES a transient upsert fault (never returns null) so a collected receipt is not silently dropped', async () => {
    const state: RepoState = { invoices: [], upserts: [], seen: new Set(), throwOnUpsert: true, markedProcessed: [] };
    const svc = createInvoiceService({ repo: fakeRepo(state) });
    // A resolvable invoice.paid whose persist fails must throw, NOT resolve to
    // `null` — `null` would let the webhook route ACK 200 and lose the receipt.
    await expect(
      svc.recordFromWebhook(invoiceEvent({ invoice_id: 'pi_42', amount: 4900, currency: 'usd', status: 'paid' })),
    ).rejects.toThrow('transient DB error');
    expect(state.upserts).toHaveLength(0);
  });
});

describe('invoice projection — webhook reconcile wiring (recordFromWebhook is live)', () => {
  it('an invoice.paid event yields the `invoiced` action + a durable upsert', async () => {
    const state: RepoState = { invoices: [], upserts: [], seen: new Set(), markedProcessed: [] };
    const repo = fakeRepo(state);
    const invoices = createInvoiceService({ repo });
    const webhooks = createWebhookService({ repo, catalog, registry: fakeRegistry(), invoices });
    const parsed = invoiceEvent({ invoice_id: 'pi_99', amount: 999, currency: 'usd' });
    const res = await webhooks.process(parsed, Buffer.from('{}'));
    expect(res.action).toBe('invoiced');
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].providerInvoiceId).toBe('pi_99');
    expect(state.markedProcessed).toContain('evt_inv_1');
  });

  it('a transient invoice-upsert fault surfaces (route can 5xx) and does NOT mark the event processed', async () => {
    const state: RepoState = { invoices: [], upserts: [], seen: new Set(), throwOnUpsert: true, markedProcessed: [] };
    const repo = fakeRepo(state);
    const invoices = createInvoiceService({ repo });
    const webhooks = createWebhookService({ repo, catalog, registry: fakeRegistry(), invoices });
    const parsed = invoiceEvent({ invoice_id: 'pi_99', amount: 999, currency: 'usd' });
    // The upsert fault must propagate out of `process` so the webhook route
    // returns 5xx and the provider re-delivers — never a swallowed 200.
    await expect(webhooks.process(parsed, Buffer.from('{}'))).rejects.toThrow('transient DB error');
    // The audit stamp must NOT be written for an event whose receipt never
    // committed (otherwise the retry would look already-handled).
    expect(state.markedProcessed).not.toContain('evt_inv_1');
    expect(state.upserts).toHaveLength(0);
  });
});
