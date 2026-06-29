/**
 * Vitest coverage for the conductor CLI config's pure logic.
 *
 * Network-free: exercises credential/URL resolution. Ported from the legacy
 * packages/cli conductor command set (was node:test) into recoder-code's vitest
 * harness.
 */

import { describe, it, expect } from 'vitest';
import { resolveBackendUrl, resolveCredential } from './conductor-config.js';

function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) {
    prev[k] = process.env[k];
    if (patch[k] === undefined) delete process.env[k];
    else process.env[k] = patch[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(patch)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

describe('conductor-config', () => {
  it('resolveBackendUrl honors precedence and strips trailing slash', () => {
    withEnv(
      {
        RECODER_BACKEND_URL: 'https://backend.example/',
        RECODER_API_URL: undefined,
        NEXTAUTH_URL: undefined,
      },
      () => {
        expect(resolveBackendUrl()).toBe('https://backend.example');
      },
    );
    expect(resolveBackendUrl('http://localhost:3001/')).toBe('http://localhost:3001');
  });

  it('resolveBackendUrl falls back to production default', () => {
    withEnv(
      { RECODER_BACKEND_URL: undefined, RECODER_API_URL: undefined, NEXTAUTH_URL: undefined },
      () => {
        expect(resolveBackendUrl()).toBe('https://recoder.xyz');
      },
    );
  });

  it('resolveCredential prefers x-api-key, then bearer token', () => {
    withEnv(
      { RECODER_API_KEY: 'sk_test_123', RECODER_TOKEN: 'tok', RECODER_ACCESS_TOKEN: undefined },
      () => {
        const cred = resolveCredential();
        expect(cred).toBeTruthy();
        expect(cred?.header).toBe('x-api-key');
        expect(cred?.value).toBe('sk_test_123');
        expect(cred?.source).toBe('env-api-key');
      },
    );

    withEnv(
      { RECODER_API_KEY: undefined, RECODER_TOKEN: 'tok_abc', RECODER_ACCESS_TOKEN: undefined },
      () => {
        const cred = resolveCredential();
        expect(cred).toBeTruthy();
        expect(cred?.header).toBe('Authorization');
        expect(cred?.value).toBe('Bearer tok_abc');
        expect(cred?.source).toBe('env-token');
      },
    );
  });

  it('resolveCredential with no env credential resolves to auth-store or null', () => {
    withEnv(
      { RECODER_API_KEY: undefined, RECODER_TOKEN: undefined, RECODER_ACCESS_TOKEN: undefined },
      () => {
        // With no env credential, resolution is either the on-disk device-flow
        // token (source 'auth-store') or null when no store exists. It must never
        // be an env-sourced credential.
        const cred = resolveCredential();
        if (cred !== null) {
          expect(cred.source).toBe('auth-store');
          expect(cred.header).toBe('Authorization');
          expect(cred.value).toMatch(/^Bearer /);
        } else {
          expect(cred).toBeNull();
        }
      },
    );
  });
});
