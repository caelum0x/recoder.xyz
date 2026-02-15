/**
 * Internal Service Auth Parity Test
 *
 * Validates that `buildInternalServiceHeaders` from docker-backend
 * produces headers that the `app` verifier (verifyInternalServiceRequest)
 * would accept. Both sides must use the same signing algorithm:
 *   payload = [timestamp, nonce, METHOD, pathname, sha256(body)].join(".")
 *   signature = HMAC-SHA256(serviceKey, payload)
 *
 * This test re-implements the app-side verification locally so it can run
 * without importing from the `app` package (which uses NextRequest).
 */

import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import { buildInternalServiceHeaders } from './byok-provider-keys';

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Mirrors app/lib/internal-service-auth.ts `createInternalSignature` */
function appSideVerify(headers: Headers, opts: {
  rawBody: string;
  method: string;
  pathname: string;
  serviceKey: string;
}): { ok: boolean; reason?: string } {
  const timestamp = headers.get('x-internal-timestamp') || '';
  const nonce = headers.get('x-internal-nonce') || '';
  const signature = headers.get('x-internal-signature') || '';
  const keyHeader = headers.get('x-internal-service-key') || '';

  if (!timestamp || !nonce || !signature || !keyHeader) {
    return { ok: false, reason: 'missing_headers' };
  }
  if (keyHeader !== opts.serviceKey) {
    return { ok: false, reason: 'key_mismatch' };
  }

  const payload = [
    timestamp,
    nonce,
    opts.method.toUpperCase(),
    opts.pathname,
    sha256(opts.rawBody),
  ].join('.');

  const expected = crypto.createHmac('sha256', opts.serviceKey).update(payload).digest('hex');
  if (signature !== expected) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  return { ok: true };
}

describe('Internal service auth parity', () => {
  const sharedKey = 'test-internal-key-abc123';

  it('docker-backend headers are accepted by app verifier for BYOK PUT', () => {
    const body = JSON.stringify({ userId: 'u1' });
    const pathname = '/api/user/ai-provider-keys';
    const headers = buildInternalServiceHeaders({
      method: 'PUT',
      pathname,
      body,
      serviceKey: sharedKey,
    });

    const result = appSideVerify(headers, {
      rawBody: body,
      method: 'PUT',
      pathname,
      serviceKey: sharedKey,
    });
    expect(result).toEqual({ ok: true });
  });

  it('docker-backend headers are accepted by app verifier for verify-token POST', () => {
    const body = JSON.stringify({ token: 'some-jwt' });
    const pathname = '/api/auth/verify-token';
    const headers = buildInternalServiceHeaders({
      method: 'POST',
      pathname,
      body,
      serviceKey: sharedKey,
    });

    const result = appSideVerify(headers, {
      rawBody: body,
      method: 'POST',
      pathname,
      serviceKey: sharedKey,
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects when service keys do not match', () => {
    const body = JSON.stringify({ userId: 'u1' });
    const pathname = '/api/user/ai-provider-keys';
    const headers = buildInternalServiceHeaders({
      method: 'PUT',
      pathname,
      body,
      serviceKey: sharedKey,
    });

    const result = appSideVerify(headers, {
      rawBody: body,
      method: 'PUT',
      pathname,
      serviceKey: 'different-key',
    });
    expect(result.ok).toBe(false);
    // App verifier checks x-internal-service-key header match before signature
    expect(result.reason).toBe('key_mismatch');
  });

  it('rejects when body has been tampered', () => {
    const body = JSON.stringify({ userId: 'u1' });
    const pathname = '/api/user/ai-provider-keys';
    const headers = buildInternalServiceHeaders({
      method: 'PUT',
      pathname,
      body,
      serviceKey: sharedKey,
    });

    const result = appSideVerify(headers, {
      rawBody: JSON.stringify({ userId: 'u2' }),
      method: 'PUT',
      pathname,
      serviceKey: sharedKey,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects when pathname has been changed', () => {
    const body = JSON.stringify({ userId: 'u1' });
    const pathname = '/api/user/ai-provider-keys';
    const headers = buildInternalServiceHeaders({
      method: 'PUT',
      pathname,
      body,
      serviceKey: sharedKey,
    });

    const result = appSideVerify(headers, {
      rawBody: body,
      method: 'PUT',
      pathname: '/api/user/something-else',
      serviceKey: sharedKey,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('produces unique nonces per call', () => {
    const body = '{}';
    const headers1 = buildInternalServiceHeaders({
      method: 'GET',
      pathname: '/test',
      body,
      serviceKey: sharedKey,
    });
    const headers2 = buildInternalServiceHeaders({
      method: 'GET',
      pathname: '/test',
      body,
      serviceKey: sharedKey,
    });

    expect(headers1.get('x-internal-nonce')).not.toBe(headers2.get('x-internal-nonce'));
    expect(headers1.get('x-internal-signature')).not.toBe(headers2.get('x-internal-signature'));
  });
});
