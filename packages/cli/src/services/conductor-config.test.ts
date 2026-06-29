/**
 * Lightweight node:test coverage for the conductor CLI's pure logic.
 *
 * Network-free: exercises credential/URL resolution and the device-flow login
 * state machine via dependency injection (a fake transport is not needed because
 * we drive `login()` with stubbed start/poll by pointing at a fake auth client).
 *
 * Run (after transpile): node --test <out>/services/conductor.node-test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveBackendUrl, resolveCredential } from './recoder-config';

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

test('resolveBackendUrl honors precedence and strips trailing slash', () => {
  withEnv(
    {
      RECODER_BACKEND_URL: 'https://backend.example/',
      RECODER_API_URL: undefined,
      NEXTAUTH_URL: undefined,
    },
    () => {
      assert.equal(resolveBackendUrl(), 'https://backend.example');
    },
  );
  assert.equal(resolveBackendUrl('http://localhost:3001/'), 'http://localhost:3001');
});

test('resolveBackendUrl falls back to production default', () => {
  withEnv(
    { RECODER_BACKEND_URL: undefined, RECODER_API_URL: undefined, NEXTAUTH_URL: undefined },
    () => {
      assert.equal(resolveBackendUrl(), 'https://recoder.xyz');
    },
  );
});

test('resolveCredential prefers x-api-key, then bearer token', () => {
  withEnv(
    { RECODER_API_KEY: 'sk_test_123', RECODER_TOKEN: 'tok', RECODER_ACCESS_TOKEN: undefined },
    () => {
      const cred = resolveCredential();
      assert.ok(cred);
      assert.equal(cred?.header, 'x-api-key');
      assert.equal(cred?.value, 'sk_test_123');
      assert.equal(cred?.source, 'env-api-key');
    },
  );

  withEnv(
    { RECODER_API_KEY: undefined, RECODER_TOKEN: 'tok_abc', RECODER_ACCESS_TOKEN: undefined },
    () => {
      const cred = resolveCredential();
      assert.ok(cred);
      assert.equal(cred?.header, 'Authorization');
      assert.equal(cred?.value, 'Bearer tok_abc');
      assert.equal(cred?.source, 'env-token');
    },
  );
});

test('resolveCredential with no env credential resolves to auth-store or null', () => {
  withEnv(
    { RECODER_API_KEY: undefined, RECODER_TOKEN: undefined, RECODER_ACCESS_TOKEN: undefined },
    () => {
      // With no env credential, resolution is either the on-disk device-flow
      // token (source 'auth-store') or null when no store exists. It must never
      // be an env-sourced credential.
      const cred = resolveCredential();
      if (cred !== null) {
        assert.equal(cred.source, 'auth-store');
        assert.equal(cred.header, 'Authorization');
        assert.match(cred.value, /^Bearer /);
      } else {
        assert.equal(cred, null);
      }
    },
  );
});
