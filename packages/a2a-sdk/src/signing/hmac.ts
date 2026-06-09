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

export function createSignedEnvelopeSignature(input: {
  payload: unknown;
  secret: string;
  keyId: string;
  signedAt?: string;
  expiresAt?: string;
}): SignedEnvelopeSignature {
  return {
    algorithm: 'hmac-sha256',
    key_id: input.keyId,
    signature: createHmacSha256Signature(input.payload, input.secret),
    signed_at: input.signedAt ?? new Date().toISOString(),
    expires_at: input.expiresAt,
  };
}
