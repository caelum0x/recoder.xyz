// @vitest-environment node
/**
 * Signed one-click unsubscribe token tests.
 * The token is an HMAC of the recipient email — it must verify for the exact
 * email (case-insensitively) and reject anything else.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  generateUnsubscribeSignature,
  verifyUnsubscribeSignature,
  buildUnsubscribeUrl,
} from './unsubscribe-token';

const SECRET_KEYS = [
  'UNSUBSCRIBE_TOKEN_SECRET',
  'BETTER_AUTH_SECRET',
  'NEXTAUTH_SECRET',
  'JWT_SECRET',
] as const;

const savedEnv: Record<string, string | undefined> = {};
for (const key of SECRET_KEYS) savedEnv[key] = process.env[key];

afterAll(() => {
  for (const key of SECRET_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('unsubscribe token', () => {
  beforeEach(() => {
    for (const key of SECRET_KEYS) delete process.env[key];
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-secret-for-unsubscribe-tokens';
  });

  it('generates a signature that verifies for the same email', () => {
    const sig = generateUnsubscribeSignature('user@example.com');
    expect(sig).toBeTruthy();
    expect(verifyUnsubscribeSignature('user@example.com', sig)).toBe(true);
  });

  it('is case- and whitespace-insensitive on the email', () => {
    const sig = generateUnsubscribeSignature('User@Example.com');
    expect(verifyUnsubscribeSignature(' user@example.com ', sig)).toBe(true);
  });

  it('rejects a signature for a different email', () => {
    const sig = generateUnsubscribeSignature('user@example.com');
    expect(verifyUnsubscribeSignature('victim@example.com', sig)).toBe(false);
  });

  it('rejects tampered, empty, and missing signatures', () => {
    const sig = generateUnsubscribeSignature('user@example.com')!;
    const tampered = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(verifyUnsubscribeSignature('user@example.com', tampered)).toBe(false);
    expect(verifyUnsubscribeSignature('user@example.com', '')).toBe(false);
    expect(verifyUnsubscribeSignature('user@example.com', null)).toBe(false);
    expect(verifyUnsubscribeSignature('user@example.com', undefined)).toBe(false);
    expect(verifyUnsubscribeSignature('user@example.com', 'not-a-hex-hmac')).toBe(false);
  });

  it('fails closed when no signing secret is configured', () => {
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
    expect(generateUnsubscribeSignature('user@example.com')).toBeNull();
    expect(verifyUnsubscribeSignature('user@example.com', 'anything')).toBe(false);
  });

  it('buildUnsubscribeUrl embeds the normalized email and signature', () => {
    const url = buildUnsubscribeUrl('https://recoder.xyz', 'User@Example.com');
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/newsletter/unsubscribe');
    expect(parsed.searchParams.get('email')).toBe('user@example.com');
    const sig = parsed.searchParams.get('sig');
    expect(sig).toBeTruthy();
    expect(verifyUnsubscribeSignature('user@example.com', sig)).toBe(true);
  });

  it('buildUnsubscribeUrl falls back to a plain email link without a secret', () => {
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
    const url = buildUnsubscribeUrl('https://recoder.xyz', 'user@example.com');
    expect(new URL(url).searchParams.get('sig')).toBeNull();
  });
});
