/**
 * Fail-closed webhook crypto + degrade-safe helper contract for the four MoR
 * adapters' shared layer (`adapters/shared.ts`). These are the security- and
 * revenue-critical primitives every provider adapter reuses:
 *
 *  - signature verifiers MUST reject on any missing header / wrong secret /
 *    tampered body (fail closed — an unsigned or mis-signed webhook is dropped),
 *    while a correct signature (incl. a rotated key in a multi-sig header) passes;
 *  - `buildProviderHealth` MUST report a truthful `down` when the key is absent
 *    (never a faked `up`) and never probe the network in that case;
 *  - `normalizeStatus` collapses unknown/lapsed provider states to the `canceled`
 *    floor (deny-bias) so an unrecognized status never grants a paid tier.
 *
 * The freshness/replay dimension is covered by `webhook-freshness.test.ts`; here
 * every timestamped case injects a fixed `nowMs` so only the signature logic is
 * under test.
 */
import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { AppError, ErrorCode } from '../../../shared/errors.js';
import { sliceBillingConfig, type ProviderCredential } from '../config.js';
import {
  buildProviderHealth,
  normalizeStatus,
  providerToComponentHealth,
  resolveBaseUrl,
  safeJson,
  timingEqual,
  unconfiguredCheckoutError,
  verifyHmacHex,
  verifyPaddleSignature,
  verifyStandardWebhook,
} from '../adapters/shared.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<
  typeof sliceBillingConfig
>[0];

/** Build a real `ProviderCredential` via the config slice (no hand-rolled shape). */
function credentialFor(overrides: {
  apiKey?: string | null;
  webhookSecret?: string | null;
  baseUrl?: string | null;
}): ProviderCredential {
  return sliceBillingConfig(appConfig, { polar: overrides }).polar;
}

const NOW_MS = 1_700_000_000_000;
const NOW_SEC = NOW_MS / 1000;
const FRESH = { nowMs: NOW_MS } as const;

const WHSEC = `whsec_${Buffer.from('supersecretkey0123456789').toString('base64')}`;

function standardSig(id: string, ts: number, body: string, secret = WHSEC): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  return createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
}

describe('verifyStandardWebhook — fail-closed signature gate (Polar/Dodo)', () => {
  const body = JSON.stringify({ type: 'subscription.active', data: { id: 'sub_1' } });
  const buf = Buffer.from(body);

  it('accepts a correctly-signed, fresh webhook', () => {
    const headers = {
      'webhook-id': 'evt_1',
      'webhook-timestamp': String(NOW_SEC),
      'webhook-signature': `v1,${standardSig('evt_1', NOW_SEC, body)}`,
    };
    expect(verifyStandardWebhook(buf, headers, WHSEC, FRESH)).toBe(true);
  });

  it('rejects when the webhook-id header is missing (fail closed)', () => {
    const headers = {
      'webhook-timestamp': String(NOW_SEC),
      'webhook-signature': `v1,${standardSig('evt_1', NOW_SEC, body)}`,
    };
    expect(verifyStandardWebhook(buf, headers, WHSEC, FRESH)).toBe(false);
  });

  it('rejects when the webhook-signature header is missing (fail closed)', () => {
    const headers = { 'webhook-id': 'evt_1', 'webhook-timestamp': String(NOW_SEC) };
    expect(verifyStandardWebhook(buf, headers, WHSEC, FRESH)).toBe(false);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const wrong = `whsec_${Buffer.from('attacker-guessed-secret-value').toString('base64')}`;
    const headers = {
      'webhook-id': 'evt_1',
      'webhook-timestamp': String(NOW_SEC),
      'webhook-signature': `v1,${standardSig('evt_1', NOW_SEC, body, wrong)}`,
    };
    expect(verifyStandardWebhook(buf, headers, WHSEC, FRESH)).toBe(false);
  });

  it('rejects when the body is tampered after signing', () => {
    const headers = {
      'webhook-id': 'evt_1',
      'webhook-timestamp': String(NOW_SEC),
      'webhook-signature': `v1,${standardSig('evt_1', NOW_SEC, body)}`,
    };
    const tampered = Buffer.from(JSON.stringify({ type: 'subscription.active', data: { id: 'sub_HIJACKED' } }));
    expect(verifyStandardWebhook(tampered, headers, WHSEC, FRESH)).toBe(false);
  });

  it('accepts when ANY entry in a space-delimited multi-sig header matches (key rotation)', () => {
    const good = standardSig('evt_1', NOW_SEC, body);
    const headers = {
      'webhook-id': 'evt_1',
      'webhook-timestamp': String(NOW_SEC),
      // old (stale-key) sig first, current sig second — a match on ANY entry passes.
      'webhook-signature': `v1,deadbeefwrongsig== v1,${good}`,
    };
    expect(verifyStandardWebhook(buf, headers, WHSEC, FRESH)).toBe(true);
  });
});

describe('verifyHmacHex — fail-closed Creem signature gate', () => {
  const body = JSON.stringify({ eventType: 'subscription.active', object: { id: 'sub_c1' } });
  const buf = Buffer.from(body);
  const SECRET = 'creem_whsec_value';
  const goodSig = createHmac('sha256', SECRET).update(buf).digest('hex');

  it('accepts a correct hex HMAC of the raw body', () => {
    expect(verifyHmacHex(buf, { 'creem-signature': goodSig }, SECRET, 'creem-signature')).toBe(true);
  });

  it('is case-insensitive and tolerates surrounding whitespace on the provided sig', () => {
    expect(
      verifyHmacHex(buf, { 'creem-signature': `  ${goodSig.toUpperCase()}  ` }, SECRET, 'creem-signature'),
    ).toBe(true);
  });

  it('rejects when the signature header is absent (fail closed)', () => {
    expect(verifyHmacHex(buf, {}, SECRET, 'creem-signature')).toBe(false);
  });

  it('rejects a wrong signature and a body tampered after signing', () => {
    expect(verifyHmacHex(buf, { 'creem-signature': 'not-the-real-signature' }, SECRET, 'creem-signature')).toBe(false);
    const tampered = Buffer.from(JSON.stringify({ eventType: 'subscription.active', object: { id: 'evil' } }));
    expect(verifyHmacHex(tampered, { 'creem-signature': goodSig }, SECRET, 'creem-signature')).toBe(false);
  });
});

describe('verifyPaddleSignature — fail-closed on malformed header', () => {
  const body = JSON.stringify({ event_type: 'subscription.activated' });
  const buf = Buffer.from(body);
  const SECRET = 'pdl_ntfset_secret';

  it('accepts a well-formed ts=..;h1=.. signature within tolerance', () => {
    const h1 = createHmac('sha256', SECRET).update(`${NOW_SEC}:${body}`).digest('hex');
    expect(verifyPaddleSignature(buf, { 'paddle-signature': `ts=${NOW_SEC};h1=${h1}` }, SECRET, FRESH)).toBe(true);
  });

  it('rejects a header missing the h1 component (fail closed)', () => {
    expect(verifyPaddleSignature(buf, { 'paddle-signature': `ts=${NOW_SEC}` }, SECRET, FRESH)).toBe(false);
  });

  it('rejects a header with no ts/h1 pairs at all', () => {
    expect(verifyPaddleSignature(buf, { 'paddle-signature': 'garbage' }, SECRET, FRESH)).toBe(false);
  });
});

describe('timingEqual — length-mismatch safe constant-time compare', () => {
  it('is true for equal strings and false for unequal / different-length strings', () => {
    expect(timingEqual('abc', 'abc')).toBe(true);
    expect(timingEqual('abc', 'abd')).toBe(false);
    expect(timingEqual('abc', 'abcd')).toBe(false); // never throws on length mismatch
    expect(timingEqual('', '')).toBe(true);
  });
});

describe('safeJson — never throws on malformed input', () => {
  it('parses a JSON object', () => {
    expect(safeJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns {} for malformed JSON and primitives (not an object)', () => {
    expect(safeJson('{not json')).toEqual({});
    expect(safeJson('42')).toEqual({});
    expect(safeJson('null')).toEqual({});
    expect(safeJson('"a string"')).toEqual({});
  });

  it('passes an array through unchanged (arrays are objects in JS — real behavior)', () => {
    expect(safeJson('[1,2,3]')).toEqual([1, 2, 3]);
  });
});

describe('normalizeStatus — deny-biased status floor', () => {
  it('maps active-family statuses to active', () => {
    for (const s of ['active', 'paid', 'succeeded', 'ACTIVE']) {
      expect(normalizeStatus(s)).toBe('active');
    }
  });

  it('maps trial-family statuses to trialing', () => {
    for (const s of ['trialing', 'trial', 'on_trial']) {
      expect(normalizeStatus(s)).toBe('trialing');
    }
  });

  it('maps failed-payment statuses to past_due', () => {
    for (const s of ['past_due', 'unpaid', 'payment_failed']) {
      expect(normalizeStatus(s)).toBe('past_due');
    }
  });

  it('collapses canceled/lapsed/unknown/nullish to the canceled floor (never grants a tier)', () => {
    for (const s of ['canceled', 'cancelled', 'expired', 'revoked', 'paused', 'incomplete_expired', 'weird', '', null, undefined]) {
      expect(normalizeStatus(s)).toBe('canceled');
    }
  });
});

describe('buildProviderHealth — truthful, degrade-safe (never a faked up)', () => {
  it('reports down with a truthful reason and does NOT probe when the key is absent', async () => {
    const probe = vi.fn(async () => {});
    const health = await buildProviderHealth('polar', credentialFor({ apiKey: null }), probe);
    expect(health).toEqual({
      name: 'polar',
      configured: false,
      status: 'down',
      reason: expect.stringContaining('not configured'),
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it('reports up when configured and the probe succeeds', async () => {
    const health = await buildProviderHealth('polar', credentialFor({ apiKey: 'sk_live' }), async () => {});
    expect(health).toEqual({ name: 'polar', configured: true, status: 'up' });
  });

  it('reports down with the probe error message when configured but the probe throws (never faked up)', async () => {
    const health = await buildProviderHealth('polar', credentialFor({ apiKey: 'sk_live' }), async () => {
      throw new Error('401 invalid api key');
    });
    expect(health).toEqual({
      name: 'polar',
      configured: true,
      status: 'down',
      reason: '401 invalid api key',
    });
  });
});

describe('providerToComponentHealth — maps provider health onto ComponentHealth', () => {
  it('unconfigured → degraded (serve free tier, deny paid)', () => {
    const c = providerToComponentHealth(
      { name: 'polar', configured: false, status: 'down', reason: 'polar: API key not configured' },
      'billing.provider',
    );
    expect(c.status).toBe('degraded');
    expect(c.degraded).toBe(true);
  });

  it('configured + up → healthy; configured + down → unhealthy (never degraded-masked)', () => {
    expect(providerToComponentHealth({ name: 'polar', configured: true, status: 'up' }, 'billing.provider').status).toBe('up');
    const down = providerToComponentHealth(
      { name: 'polar', configured: true, status: 'down', reason: 'unreachable' },
      'billing.provider',
    );
    expect(down.status).toBe('down');
    expect(down.degraded).toBe(false);
  });
});

describe('resolveBaseUrl / unconfiguredCheckoutError', () => {
  it('prefers the injected override, strips trailing slashes, and falls back when empty', () => {
    expect(resolveBaseUrl(credentialFor({ baseUrl: 'https://sandbox.polar.sh/' }), 'https://api.polar.sh')).toBe(
      'https://sandbox.polar.sh',
    );
    expect(resolveBaseUrl(credentialFor({ baseUrl: null }), 'https://api.polar.sh')).toBe('https://api.polar.sh');
  });

  it('unconfiguredCheckoutError is a truthful SERVICE_UNAVAILABLE AppError (never a faked success)', () => {
    const err = unconfiguredCheckoutError('dodo');
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(err.message).toContain('dodo');
  });
});
