import { createHmac, timingSafeEqual } from 'node:crypto';

import type { SignedEnvelopeSignature } from '../schemas/signed-envelope';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`);
  return `{${entries.join(',')}}`;
}

export function createHmacSha256Signature(payload: unknown, secret: string): string {
  return createHmac('sha256', secret).update(canonicalJson(payload)).digest('hex');
}

export function verifyHmacSha256Signature(payload: unknown, signature: string, secret: string): boolean {
  const expected = Buffer.from(createHmacSha256Signature(payload, secret), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The exact object the envelope signature covers: the payload AND the
 * security-relevant signature metadata (algorithm, key_id, signed_at,
 * expires_at). Binding these into the MAC prevents an attacker from altering
 * signed_at/expires_at (freshness/expiry bypass) or presenting the payload under
 * different metadata — the signature no longer covers the payload alone.
 * Sign AND verify must build this identically. (recoder-i834)
 */
export function signedEnvelopeSigningObject(input: {
  payload: unknown;
  algorithm: string;
  keyId: string;
  signedAt: string;
  expiresAt?: string | undefined;
}): Record<string, unknown> {
  return {
    algorithm: input.algorithm,
    key_id: input.keyId,
    signed_at: input.signedAt,
    expires_at: input.expiresAt ?? null,
    payload: input.payload,
  };
}

export function createSignedEnvelopeSignature(input: {
  payload: unknown;
  secret: string;
  keyId: string;
  signedAt?: string;
  expiresAt?: string;
}): SignedEnvelopeSignature {
  const algorithm = 'hmac-sha256';
  const signedAt = input.signedAt ?? new Date().toISOString();
  const signature = createHmacSha256Signature(
    signedEnvelopeSigningObject({
      payload: input.payload,
      algorithm,
      keyId: input.keyId,
      signedAt,
      expiresAt: input.expiresAt,
    }),
    input.secret,
  );
  return {
    algorithm,
    key_id: input.keyId,
    signature,
    signed_at: signedAt,
    expires_at: input.expiresAt,
  };
}
