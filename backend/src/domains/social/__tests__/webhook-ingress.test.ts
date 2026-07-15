/**
 * Webhook ingress trust boundary — LINE/Slack HMAC verify, replay reject,
 * Slack challenge, and the missing-secret ⇒ 401 refusal. Proves the boundary is
 * hostile-by-default: no byte is trusted before the signature verifies.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  processWebhookDelivery,
  verifyLineSignature,
  verifySlackSignature,
  isWebhookChannel,
} from '../adapters/webhook-ingress.adapter.js';

const LINE_SECRET = 'line-channel-secret';
const SLACK_SECRET = 'slack-signing-secret';

function lineSig(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64');
}
function slackSig(rawBody: Buffer, ts: string, secret: string): string {
  const base = `v0:${ts}:${rawBody.toString('utf8')}`;
  return `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;
}

describe('webhook-ingress trust boundary', () => {
  it('accepts a valid LINE signature and returns the verified body', () => {
    const raw = Buffer.from(JSON.stringify({ destination: 'd', events: [{ type: 'message' }] }));
    const outcome = processWebhookDelivery({
      channel: 'line',
      rawBody: raw,
      headers: { lineSignature: lineSig(raw, LINE_SECRET) },
      secret: LINE_SECRET,
    });
    expect(outcome.status).toBe(200);
    expect(outcome.verified).toBe(true);
    expect(outcome.parsed).toBeDefined();
  });

  it('rejects a tampered LINE body — 401, never trusts a byte', () => {
    const raw = Buffer.from(JSON.stringify({ events: [{ type: 'message' }] }));
    const sig = lineSig(raw, LINE_SECRET);
    const tampered = Buffer.from(JSON.stringify({ events: [{ type: 'message', evil: true }] }));
    const outcome = processWebhookDelivery({
      channel: 'line',
      rawBody: tampered,
      headers: { lineSignature: sig },
      secret: LINE_SECRET,
    });
    expect(outcome.status).toBe(401);
    expect(outcome.verified).toBe(false);
  });

  it('missing signing secret ⇒ 401 (cannot verify, never a faked 200)', () => {
    const raw = Buffer.from('{}');
    const outcome = processWebhookDelivery({
      channel: 'slack',
      rawBody: raw,
      headers: { slackSignature: 'v0=abc', slackTimestamp: '123' },
      secret: null,
    });
    expect(outcome.status).toBe(401);
    expect(outcome.code).toBe('webhook_secret_missing');
  });

  it('answers the Slack url_verification challenge AFTER verifying the signature', () => {
    const nowSec = 1_800_000_000;
    const ts = String(nowSec);
    const raw = Buffer.from(JSON.stringify({ type: 'url_verification', challenge: 'echo-me' }));
    const outcome = processWebhookDelivery({
      channel: 'slack',
      rawBody: raw,
      headers: { slackSignature: slackSig(raw, ts, SLACK_SECRET), slackTimestamp: ts },
      secret: SLACK_SECRET,
      nowSec,
    });
    expect(outcome.status).toBe(200);
    expect(outcome.body).toEqual({ challenge: 'echo-me' });
  });

  it('rejects a stale Slack timestamp (replay window)', () => {
    const nowSec = 1_800_000_000;
    const staleTs = String(nowSec - 10_000); // well beyond the 5-min window
    const raw = Buffer.from(JSON.stringify({ type: 'event_callback' }));
    const outcome = processWebhookDelivery({
      channel: 'slack',
      rawBody: raw,
      headers: { slackSignature: slackSig(raw, staleTs, SLACK_SECRET), slackTimestamp: staleTs },
      secret: SLACK_SECRET,
      nowSec,
    });
    expect(outcome.status).toBe(401);
  });

  it('pure verifiers never throw on missing headers', () => {
    expect(verifyLineSignature(Buffer.from('x'), undefined, LINE_SECRET)).toBe(false);
    expect(verifySlackSignature(Buffer.from('x'), undefined, undefined, SLACK_SECRET)).toBe(false);
    expect(isWebhookChannel('telegram')).toBe(false);
    expect(isWebhookChannel('line')).toBe(true);
  });
});
