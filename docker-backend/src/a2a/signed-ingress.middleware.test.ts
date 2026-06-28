import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { createSignedEnvelope, type SignedEnvelope } from '@recoder/a2a-sdk';
// Import directly from the OWNED interop package so this test proves the package is
// the real verifier the middleware routes through (not a local re-implementation).
import { verifyEd25519Signature } from '@recoder/interop';

import { createSignedA2AIngressMiddleware } from './signed-ingress.middleware';

const HMAC_SECRET = 'test-a2a-shared-secret';
const PAYLOAD = { intent: 'task.dispatch', taskId: 't-123', privileged: true };

// Canonical JSON byte-for-byte identical to the a2a-sdk's HMAC/ed25519 signing input.
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}

function hmacSign(payload: unknown, secret: string): string {
  return crypto.createHmac('sha256', secret).update(canonicalJson(payload)).digest('hex');
}

function hmacEnvelope(payload: unknown, secret: string): SignedEnvelope {
  return createSignedEnvelope({
    id: 'env-hmac',
    payload_type: 'mcp.call',
    payload,
    signature: {
      algorithm: 'hmac-sha256',
      key_id: 'edge-hmac',
      signature: hmacSign(payload, secret),
      signed_at: new Date().toISOString(),
    },
  });
}

function ed25519Envelope(payload: unknown, keyId: string, privateKey: crypto.KeyObject): SignedEnvelope {
  const signature = crypto
    .sign(null, Buffer.from(canonicalJson(payload), 'utf8'), privateKey)
    .toString('hex');
  return createSignedEnvelope({
    id: 'env-ed25519',
    payload_type: 'mcp.call',
    payload,
    signature: {
      algorithm: 'ed25519',
      key_id: keyId,
      signature,
      signed_at: new Date().toISOString(),
    },
  });
}

interface MockResult {
  status: number;
  json: unknown;
  nextCalled: boolean;
  req: Request;
}

function runMiddleware(body: unknown, method = 'POST'): MockResult {
  const middleware = createSignedA2AIngressMiddleware();
  const result: MockResult = { status: 0, json: undefined, nextCalled: false, req: undefined as never };

  const req = {
    method,
    path: '/tasks',
    originalUrl: '/api/a2a/tasks',
    url: '/api/a2a/tasks',
    body,
    header: () => undefined,
  } as unknown as Request;
  result.req = req;

  const res = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(payload: unknown) {
      result.json = payload;
      return this;
    },
  } as unknown as Response;

  const next: NextFunction = () => {
    result.nextCalled = true;
  };

  middleware(req, res, next);
  return result;
}

describe('signed-ingress middleware backed by @recoder/interop gate', () => {
  const originalSecret = process.env.RECODER_A2A_SIGNING_SECRET;
  const originalKeys = process.env.RECODER_A2A_ED25519_KEYS;
  const originalStrict = process.env.RECODER_A2A_STRICT_INGRESS;

  beforeEach(() => {
    delete process.env.RECODER_A2A_SIGNING_SECRET;
    delete process.env.RECODER_A2A_ED25519_KEYS;
    delete process.env.RECODER_A2A_STRICT_INGRESS;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.RECODER_A2A_SIGNING_SECRET;
    else process.env.RECODER_A2A_SIGNING_SECRET = originalSecret;
    if (originalKeys === undefined) delete process.env.RECODER_A2A_ED25519_KEYS;
    else process.env.RECODER_A2A_ED25519_KEYS = originalKeys;
    if (originalStrict === undefined) delete process.env.RECODER_A2A_STRICT_INGRESS;
    else process.env.RECODER_A2A_STRICT_INGRESS = originalStrict;
  });

  // --- HMAC through the interop gate -----------------------------------------

  it('admits a validly HMAC-signed envelope through the interop gate', () => {
    process.env.RECODER_A2A_SIGNING_SECRET = HMAC_SECRET;
    const result = runMiddleware(hmacEnvelope(PAYLOAD, HMAC_SECRET));

    expect(result.nextCalled).toBe(true);
    expect(result.status).toBe(0); // never rejected
    expect((result.req as Request & { a2aVerifiedPayload?: unknown }).a2aVerifiedPayload).toEqual(
      PAYLOAD,
    );
  });

  it('rejects an HMAC envelope with a tampered signature through the interop gate', () => {
    process.env.RECODER_A2A_SIGNING_SECRET = HMAC_SECRET;
    const envelope = hmacEnvelope(PAYLOAD, HMAC_SECRET);
    const tampered: SignedEnvelope = {
      ...envelope,
      signature: { ...envelope.signature, signature: 'deadbeef'.repeat(8) },
    };

    const result = runMiddleware(tampered);

    expect(result.nextCalled).toBe(false);
    expect(result.status).toBe(401);
    expect(JSON.stringify(result.json)).toContain('interop gate');
  });

  it('rejects an HMAC envelope signed with the WRONG secret through the interop gate', () => {
    process.env.RECODER_A2A_SIGNING_SECRET = HMAC_SECRET;
    const result = runMiddleware(hmacEnvelope(PAYLOAD, 'attacker-secret'));

    expect(result.nextCalled).toBe(false);
    expect(result.status).toBe(401);
  });

  // --- ed25519 through the interop gate (the asymmetric path the SDK leaves open) ---

  it('admits a validly ed25519-signed envelope via the interop ed25519 verifier', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const keyId = 'peer-1';
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.RECODER_A2A_ED25519_KEYS = JSON.stringify({ [keyId]: pubPem });

    const envelope = ed25519Envelope(PAYLOAD, keyId, privateKey);

    // Sanity: the interop package itself accepts this signature (real verifier).
    expect(verifyEd25519Signature(PAYLOAD, envelope.signature.signature, pubPem)).toBe(true);

    const result = runMiddleware(envelope);
    expect(result.nextCalled).toBe(true);
    expect(result.status).toBe(0);
    expect((result.req as Request & { a2aVerifiedPayload?: unknown }).a2aVerifiedPayload).toEqual(
      PAYLOAD,
    );
  });

  it('rejects an ed25519 envelope signed by a DIFFERENT key through the interop gate', () => {
    const signer = crypto.generateKeyPairSync('ed25519');
    const impostor = crypto.generateKeyPairSync('ed25519');
    const keyId = 'peer-1';
    // Configure the resolver with the impostor key, sign with the real signer.
    const impostorPem = impostor.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.RECODER_A2A_ED25519_KEYS = JSON.stringify({ [keyId]: impostorPem });

    const envelope = ed25519Envelope(PAYLOAD, keyId, signer.privateKey);

    const result = runMiddleware(envelope);
    expect(result.nextCalled).toBe(false);
    expect(result.status).toBe(401);
    expect(JSON.stringify(result.json)).toContain('signature');
  });

  it('rejects an ed25519 envelope with an unknown key_id through the interop gate', () => {
    const known = crypto.generateKeyPairSync('ed25519');
    const knownPem = known.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    // A resolver IS configured, but for a different key_id → resolver returns null.
    process.env.RECODER_A2A_ED25519_KEYS = JSON.stringify({ 'known-key': knownPem });

    const envelope = ed25519Envelope(PAYLOAD, 'unknown-key', known.privateKey);

    const result = runMiddleware(envelope);
    expect(result.nextCalled).toBe(false);
    expect(result.status).toBe(401);
    expect(JSON.stringify(result.json)).toContain('signature');
  });

  // --- Backward compatibility (degrade-safe) ---------------------------------

  it('allows unsigned legacy traffic when no secret and not strict (backward compatible)', () => {
    const result = runMiddleware({ intent: 'legacy.ping' });
    expect(result.nextCalled).toBe(true);
    expect(result.status).toBe(0);
  });

  it('rejects unsigned privileged traffic only when strict mode is enabled', () => {
    process.env.RECODER_A2A_STRICT_INGRESS = 'true';
    const result = runMiddleware({ intent: 'legacy.ping' }, 'POST');
    expect(result.nextCalled).toBe(false);
    expect(result.status).toBe(401);
  });

  it('always passes OPTIONS and health through untouched', () => {
    const optionsResult = runMiddleware({}, 'OPTIONS');
    expect(optionsResult.nextCalled).toBe(true);
  });
});
