/**
 * Proves the MoR provider group: BILLING_PROVIDER selection, degrade-safety when
 * a key is absent (checkout throws / reads null / webhook false / health down),
 * and the per-provider webhook signature round-trips (Standard-Webhooks for
 * Polar+Dodo, hex HMAC for Creem, `ts=;h1=` for Paddle) with bad-signature drop.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { AppError } from '../../../shared/errors.js';
import { sliceBillingConfig, type BillingConfigOverrides } from '../config.js';
import { createPlanCatalog } from '../services/plan-catalog.service.js';
import { createProviderRegistry } from '../provider-registry.js';
import type { BillingProviderName, CheckoutIntent } from '../types.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<typeof sliceBillingConfig>[0];

function registry(overrides: BillingConfigOverrides = {}) {
  const config = sliceBillingConfig(appConfig, overrides);
  const catalog = createPlanCatalog(config);
  return createProviderRegistry({ config, catalog });
}

const intent: CheckoutIntent = {
  subject: { subjectId: 'u1', kind: 'user' },
  plan: 'pro',
  productId: 'prod_pro',
  successUrl: 'https://recoder.xyz/ok',
};

const WHSEC = `whsec_${Buffer.from('supersecretkey0123456789').toString('base64')}`;

function signStandard(id: string, ts: string, body: string): string {
  const stripped = WHSEC.slice('whsec_'.length);
  const key = Buffer.from(stripped, 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return `v1,${sig}`;
}

describe('provider registry — selection + degrade-safety', () => {
  it('defaults to polar and can address every MoR provider (MoR-only, no card processor)', () => {
    const reg = registry();
    expect(reg.activeName).toBe('polar');
    expect(reg.active().name).toBe('polar');
    const names = reg.all().map((a) => a.name).sort();
    expect(names).toEqual(['creem', 'dodo', 'paddle', 'polar']);
  });

  it('honors BILLING_PROVIDER selection', () => {
    for (const p of ['creem', 'paddle', 'dodo'] as BillingProviderName[]) {
      const reg = registry({ provider: p });
      expect(reg.activeName).toBe(p);
      expect(reg.active().name).toBe(p);
    }
  });

  it('unconfigured active provider is degrade-safe across the port', async () => {
    for (const p of ['polar', 'creem', 'paddle', 'dodo'] as BillingProviderName[]) {
      const adapter = registry({ provider: p }).active();
      await expect(adapter.createCheckout(intent)).rejects.toBeInstanceOf(AppError);
      expect(await adapter.getSubscription('sub_x')).toBeNull();
      expect(await adapter.cancel('sub_x')).toBeNull();
      expect(adapter.verifyWebhook(Buffer.from('{}'), {})).toBe(false);
      expect(adapter.parseEvent(Buffer.from('{}'), {})).toBeNull();
      await expect(adapter.emitUsage([])).resolves.toBeUndefined();
      const h = await adapter.health();
      expect(h.configured).toBe(false);
      expect(h.status).toBe('down');
    }
  });

  it('module health degrades (never up) when the active provider is unconfigured', async () => {
    const h = await registry().health();
    expect(h.status).toBe('degraded');
    expect(h.degraded).toBe(true);
  });
});

describe('webhook signature verification', () => {
  it('Polar accepts a valid Standard-Webhooks signature and normalizes the event', () => {
    const adapter = registry({ polar: { webhookSecret: WHSEC } }).get('polar');
    const body = JSON.stringify({ type: 'subscription.active', data: { id: 'sub_1', status: 'active' } });
    const headers = {
      'webhook-id': 'evt_1',
      'webhook-timestamp': '1700000000',
      'webhook-signature': signStandard('evt_1', '1700000000', body),
    };
    expect(adapter.verifyWebhook(Buffer.from(body), headers)).toBe(true);
    const parsed = adapter.parseEvent(Buffer.from(body), headers);
    expect(parsed?.type).toBe('subscription.active');
    expect(parsed?.eventId).toBe('evt_1');
    expect(parsed?.subscription?.providerSubId).toBe('sub_1');
  });

  it('Polar drops a tampered body (bad signature → parseEvent null)', () => {
    const adapter = registry({ polar: { webhookSecret: WHSEC } }).get('polar');
    const body = JSON.stringify({ type: 'subscription.active', data: { id: 'sub_1' } });
    const headers = {
      'webhook-id': 'evt_1',
      'webhook-timestamp': '1700000000',
      'webhook-signature': signStandard('evt_1', '1700000000', body),
    };
    const tampered = Buffer.from(body.replace('sub_1', 'sub_HACK'));
    expect(adapter.verifyWebhook(tampered, headers)).toBe(false);
    expect(adapter.parseEvent(tampered, headers)).toBeNull();
  });

  it('Dodo verifies the same Standard-Webhooks scheme', () => {
    const adapter = registry({ provider: 'dodo', dodo: { webhookSecret: WHSEC } }).get('dodo');
    const body = JSON.stringify({ type: 'subscription.active', data: { subscription_id: 'sub_d1', status: 'active' } });
    const headers = {
      'webhook-id': 'evt_d',
      'webhook-timestamp': '1700000000',
      'webhook-signature': signStandard('evt_d', '1700000000', body),
    };
    const parsed = adapter.parseEvent(Buffer.from(body), headers);
    expect(parsed?.subscription?.providerSubId).toBe('sub_d1');
    expect(parsed?.type).toBe('subscription.active');
  });

  it('Creem verifies a hex HMAC in creem-signature', () => {
    const secret = 'creem_whsec_abc';
    const adapter = registry({ provider: 'creem', creem: { webhookSecret: secret } }).get('creem');
    const body = JSON.stringify({ eventType: 'subscription.active', object: { id: 'sub_c1', status: 'active' } });
    const sig = createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
    const parsed = adapter.parseEvent(Buffer.from(body), { 'creem-signature': sig });
    expect(parsed?.subscription?.providerSubId).toBe('sub_c1');
    expect(adapter.parseEvent(Buffer.from(body), { 'creem-signature': 'deadbeef' })).toBeNull();
  });

  it('Paddle verifies a ts=;h1= signature', () => {
    const secret = 'pdl_ntfset_secret';
    const adapter = registry({ provider: 'paddle', paddle: { webhookSecret: secret } }).get('paddle');
    const body = JSON.stringify({
      event_type: 'subscription.activated',
      event_id: 'ntf_1',
      data: { id: 'sub_p1', status: 'active' },
    });
    const ts = '1700000000';
    const h1 = createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex');
    const parsed = adapter.parseEvent(Buffer.from(body), { 'paddle-signature': `ts=${ts};h1=${h1}` });
    expect(parsed?.type).toBe('subscription.active');
    expect(parsed?.subscription?.providerSubId).toBe('sub_p1');
    expect(adapter.parseEvent(Buffer.from(body), { 'paddle-signature': `ts=${ts};h1=bad` })).toBeNull();
  });
});
