/**
 * Webhook replay defense: Standard-Webhooks (Polar/Dodo) and Paddle fold the
 * provider timestamp into the signed content but must ALSO reject a stale
 * timestamp before the HMAC compare, so a captured-but-valid webhook cannot be
 * replayed indefinitely. A timestamp within tolerance (default 5 min) passes.
 */
import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyPaddleSignature, verifyStandardWebhook } from '../adapters/shared.js';

const NOW_MS = 1_700_000_000_000;
const NOW_SEC = NOW_MS / 1000; // Standard-Webhooks + Paddle timestamps are Unix seconds.
const STALE_SEC = NOW_SEC - 3600; // 1 hour old → far beyond the 5-min tolerance.

const WHSEC = `whsec_${Buffer.from('supersecretkey0123456789').toString('base64')}`;
const PADDLE_SECRET = 'pdl_ntfset_secret';

function standardHeaders(id: string, ts: number, body: string): Record<string, string> {
  const key = Buffer.from(WHSEC.slice('whsec_'.length), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return {
    'webhook-id': id,
    'webhook-timestamp': String(ts),
    'webhook-signature': `v1,${sig}`,
  };
}

function paddleHeaders(ts: number, body: string): Record<string, string> {
  const h1 = createHmac('sha256', PADDLE_SECRET).update(`${ts}:${body}`).digest('hex');
  return { 'paddle-signature': `ts=${ts};h1=${h1}` };
}

describe('verifyStandardWebhook — timestamp freshness (replay defense)', () => {
  const body = JSON.stringify({ type: 'subscription.active', data: { id: 'sub_1' } });

  it('accepts a correctly-signed webhook within the freshness tolerance', () => {
    const headers = standardHeaders('evt_1', NOW_SEC, body);
    expect(verifyStandardWebhook(Buffer.from(body), headers, WHSEC, { nowMs: NOW_MS })).toBe(true);
  });

  it('rejects a correctly-signed webhook whose timestamp is stale', () => {
    const headers = standardHeaders('evt_1', STALE_SEC, body);
    expect(verifyStandardWebhook(Buffer.from(body), headers, WHSEC, { nowMs: NOW_MS })).toBe(false);
  });
});

describe('verifyPaddleSignature — timestamp freshness (replay defense)', () => {
  const body = JSON.stringify({ event_type: 'subscription.activated', data: { id: 'sub_p1' } });

  it('accepts a correctly-signed webhook within the freshness tolerance', () => {
    const headers = paddleHeaders(NOW_SEC, body);
    expect(verifyPaddleSignature(Buffer.from(body), headers, PADDLE_SECRET, { nowMs: NOW_MS })).toBe(true);
  });

  it('rejects a correctly-signed webhook whose timestamp is stale', () => {
    const headers = paddleHeaders(STALE_SEC, body);
    expect(verifyPaddleSignature(Buffer.from(body), headers, PADDLE_SECRET, { nowMs: NOW_MS })).toBe(false);
  });
});
