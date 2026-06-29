import { describe, expect, it } from 'vitest';

import { createSignedEnvelope } from '../schemas/signed-envelope';
import {
  canonicalJson,
  createHmacSha256Signature,
  createSignedEnvelopeSignature,
  verifyHmacSha256Signature,
} from './hmac';
import { validateSignedEnvelopeIngress } from './signed-ingress';

const SECRET = 'test-signing-secret';

function signedEnvelope(
  payload: unknown,
  overrides: { secret?: string; signedAt?: string; expiresAt?: string; keyId?: string } = {},
) {
  return createSignedEnvelope({
    id: 'sig-env-1',
    payload_type: 'task.envelope',
    payload,
    signature: createSignedEnvelopeSignature({
      payload,
      secret: overrides.secret ?? SECRET,
      keyId: overrides.keyId ?? 'key-1',
      signedAt: overrides.signedAt,
      expiresAt: overrides.expiresAt,
    }),
  });
}

describe('canonicalJson', () => {
  it('produces key-order-stable output for objects', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('preserves array order and nests deterministically', () => {
    const out = canonicalJson({ z: [{ y: 1, x: 2 }], a: null });
    expect(out).toBe('{"a":null,"z":[{"x":2,"y":1}]}');
  });
});

describe('hmac signature helpers', () => {
  it('round-trips a valid signature', () => {
    const payload = { task: 'do-thing', n: 3 };
    const sig = createHmacSha256Signature(payload, SECRET);
    expect(verifyHmacSha256Signature(payload, sig, SECRET)).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    const payload = { task: 'do-thing' };
    const sig = createHmacSha256Signature(payload, SECRET);
    expect(verifyHmacSha256Signature(payload, sig, 'wrong-secret')).toBe(false);
  });

  it('is insensitive to key order in the payload (canonical form)', () => {
    const sig = createHmacSha256Signature({ a: 1, b: 2 }, SECRET);
    expect(verifyHmacSha256Signature({ b: 2, a: 1 }, sig, SECRET)).toBe(true);
  });

  it('does not throw on a malformed hex signature', () => {
    expect(verifyHmacSha256Signature({ a: 1 }, 'zz-not-hex', SECRET)).toBe(false);
  });
});

describe('validateSignedEnvelopeIngress', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');

  it('accepts a correctly signed envelope and returns the payload', () => {
    const payload = { task: 'ship' };
    const env = signedEnvelope(payload, { signedAt: now.toISOString() });
    const result = validateSignedEnvelopeIngress(env, { secret: SECRET, now });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toEqual(payload);
  });

  it('rejects a tampered payload (bad signature)', () => {
    const env = signedEnvelope({ task: 'ship' }, { signedAt: now.toISOString() });
    const tampered = { ...env, payload: { task: 'pwn' } };
    const result = validateSignedEnvelopeIngress(tampered, { secret: SECRET, now });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('signed_envelope_bad_signature');
      expect(result.status).toBe(401);
    }
  });

  it('requires a signed envelope when a secret is configured', () => {
    const result = validateSignedEnvelopeIngress({ task: 'plain' }, { secret: SECRET, now });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('signed_envelope_required');
  });

  it('passes unsigned payloads through when no signature is required', () => {
    const result = validateSignedEnvelopeIngress({ task: 'plain' }, { now });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual({ task: 'plain' });
      expect(result.envelope.payload_type).toBe('unsigned');
    }
  });

  it('rejects an expired envelope', () => {
    const env = signedEnvelope(
      { task: 'ship' },
      { signedAt: '2026-05-31T00:00:00.000Z', expiresAt: '2026-05-31T12:00:00.000Z' },
    );
    const result = validateSignedEnvelopeIngress(env, { secret: SECRET, now });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('signed_envelope_expired');
  });

  it('rejects an envelope signed too far in the future', () => {
    const env = signedEnvelope({ task: 'ship' }, { signedAt: '2026-06-01T01:00:00.000Z' });
    const result = validateSignedEnvelopeIngress(env, { secret: SECRET, now });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('signed_envelope_not_yet_valid');
  });

  it('rejects a non-finite signed_at timestamp', () => {
    const env = signedEnvelope({ task: 'ship' }, { signedAt: 'not-a-date' });
    const result = validateSignedEnvelopeIngress(env, { secret: SECRET, now });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('signed_envelope_bad_timestamp');
  });

  it('rejects an unsupported signature algorithm', () => {
    const env = signedEnvelope({ task: 'ship' }, { signedAt: now.toISOString() });
    const ed = {
      ...env,
      signature: { ...env.signature, algorithm: 'ed25519' as const },
    };
    const result = validateSignedEnvelopeIngress(ed, { secret: SECRET, now });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('signed_envelope_unsupported_algorithm');
  });

  it('fails closed when a signature is required but no secret is configured', () => {
    const env = signedEnvelope({ task: 'ship' }, { signedAt: now.toISOString() });
    const result = validateSignedEnvelopeIngress(env, { requireSignature: true, now });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('signed_envelope_secret_missing');
      expect(result.status).toBe(500);
    }
  });

  it('passes a signed envelope through unverified when no secret and signature not required', () => {
    const payload = { task: 'ship' };
    const env = signedEnvelope(payload, { signedAt: now.toISOString() });
    const result = validateSignedEnvelopeIngress(env, { now });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toEqual(payload);
  });
});
