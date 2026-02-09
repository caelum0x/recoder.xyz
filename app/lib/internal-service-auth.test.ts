import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyInternalServiceRequest } from './internal-service-auth';

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function sign(input: {
  timestamp: string;
  nonce: string;
  method: string;
  pathname: string;
  body: string;
  serviceKey: string;
}): string {
  const payload = [
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.pathname,
    sha256(input.body),
  ].join('.');
  return crypto.createHmac('sha256', input.serviceKey).update(payload).digest('hex');
}

function makeRequest(input: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
}): any {
  const map = new Map<string, string>();
  Object.entries(input.headers || {}).forEach(([k, v]) => map.set(k.toLowerCase(), v));

  return {
    method: input.method || 'PUT',
    url: input.url || 'https://app.test/api/user/ai-provider-keys',
    headers: {
      get(name: string) {
        return map.get(name.toLowerCase()) || null;
      },
    },
  };
}

describe('verifyInternalServiceRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.INTERNAL_SERVICE_KEY = 'internal-key-test';
  });

  it('accepts a correctly signed request', () => {
    const body = JSON.stringify({ userId: 'u1' });
    const timestamp = String(Date.now());
    const nonce = 'nonce_001';
    const signature = sign({
      timestamp,
      nonce,
      method: 'PUT',
      pathname: '/api/user/ai-provider-keys',
      body,
      serviceKey: 'internal-key-test',
    });

    const req = makeRequest({
      headers: {
        'x-internal-service-key': 'internal-key-test',
        'x-internal-timestamp': timestamp,
        'x-internal-nonce': nonce,
        'x-internal-signature': signature,
      },
    });

    expect(verifyInternalServiceRequest(req, { rawBody: body })).toEqual({ ok: true });
  });

  it('rejects invalid signature', () => {
    const body = JSON.stringify({ userId: 'u1' });
    const req = makeRequest({
      headers: {
        'x-internal-service-key': 'internal-key-test',
        'x-internal-timestamp': String(Date.now()),
        'x-internal-nonce': 'nonce_002',
        'x-internal-signature': 'deadbeef',
      },
    });

    const result = verifyInternalServiceRequest(req, { rawBody: body });
    expect(result.ok).toBe(false);
  });

  it('rejects replayed nonce within ttl window', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const body = JSON.stringify({ userId: 'u1' });
    const timestamp = String(now);
    const nonce = 'replay-nonce';
    const signature = sign({
      timestamp,
      nonce,
      method: 'PUT',
      pathname: '/api/user/ai-provider-keys',
      body,
      serviceKey: 'internal-key-test',
    });

    const req = makeRequest({
      headers: {
        'x-internal-service-key': 'internal-key-test',
        'x-internal-timestamp': timestamp,
        'x-internal-nonce': nonce,
        'x-internal-signature': signature,
      },
    });

    expect(verifyInternalServiceRequest(req, { rawBody: body })).toEqual({ ok: true });
    const replay = verifyInternalServiceRequest(req, { rawBody: body });
    expect(replay).toEqual({ ok: false, reason: 'replayed_nonce' });
  });

  it('rejects invalid nonce format and size', () => {
    const body = JSON.stringify({ userId: 'u1' });
    const timestamp = String(Date.now());
    const nonce = 'bad nonce';
    const signature = sign({
      timestamp,
      nonce,
      method: 'PUT',
      pathname: '/api/user/ai-provider-keys',
      body,
      serviceKey: 'internal-key-test',
    });

    const req = makeRequest({
      headers: {
        'x-internal-service-key': 'internal-key-test',
        'x-internal-timestamp': timestamp,
        'x-internal-nonce': nonce,
        'x-internal-signature': signature,
      },
    });

    expect(verifyInternalServiceRequest(req, { rawBody: body })).toEqual({
      ok: false,
      reason: 'invalid_nonce',
    });
  });

  it('rejects missing signed headers', () => {
    const req = makeRequest({ headers: {} });
    const result = verifyInternalServiceRequest(req, { rawBody: '{}' });
    expect(result).toEqual({ ok: false, reason: 'missing_internal_auth' });
  });

  it('rejects key shorter than 16 characters', () => {
    process.env.INTERNAL_SERVICE_KEY = 'short';
    const body = JSON.stringify({ userId: 'u1' });
    const timestamp = String(Date.now());
    const nonce = 'nonce_short_key';
    const signature = sign({
      timestamp,
      nonce,
      method: 'PUT',
      pathname: '/api/user/ai-provider-keys',
      body,
      serviceKey: 'short',
    });

    const req = makeRequest({
      headers: {
        'x-internal-service-key': 'short',
        'x-internal-timestamp': timestamp,
        'x-internal-nonce': nonce,
        'x-internal-signature': signature,
      },
    });

    expect(verifyInternalServiceRequest(req, { rawBody: body })).toEqual({
      ok: false,
      reason: 'internal_key_too_short',
    });
  });
});
