import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveNotaryCredentials } from '../../../../src/channels/packaging/desktop/notarize';
import {
  renderEntitlementsPlist,
  MAC_ENTITLEMENTS,
} from '../../../../src/channels/packaging/desktop/entitlements';
import {
  checkReleaseSecrets,
  requireReleaseSecrets,
  DESKTOP_RELEASE_SECRETS,
} from '../../../../src/channels/packaging/desktop/release-secrets';
import { createEnvSecretPort } from '../../../../src/ports/secret-port';
import { FailSafeError } from '../../../../src/errors/index';

test('resolveNotaryCredentials skips cleanly with no Apple credentials (degrade-safe)', () => {
  const res = resolveNotaryCredentials({});
  assert.equal(res.credentials, null);
  assert.match(res.skipReason ?? '', /no Apple credentials/);
});

test('resolveNotaryCredentials resolves a complete Apple ID strategy', () => {
  const res = resolveNotaryCredentials({
    APPLE_ID: 'dev@recoder.xyz',
    APPLE_APP_SPECIFIC_PASSWORD: 'pw',
    APPLE_TEAM_ID: 'TEAM123',
  });
  assert.equal(res.credentials?.__strategy, 'apple-id');
});

test('resolveNotaryCredentials treats a partial Apple ID set as not-configured', () => {
  const res = resolveNotaryCredentials({ APPLE_ID: 'dev@recoder.xyz' });
  assert.equal(res.credentials, null);
  assert.match(res.skipReason ?? '', /incomplete Apple ID/);
});

test('resolveNotaryCredentials resolves the API-key strategy only when the key file exists', () => {
  const env = {
    APPLE_API_KEY: '/keys/AuthKey.p8',
    APPLE_API_KEY_ID: 'KID',
    APPLE_API_ISSUER: 'ISS',
  };
  assert.equal(resolveNotaryCredentials(env, () => false).credentials, null);
  const ok = resolveNotaryCredentials(env, () => true);
  assert.equal(ok.credentials?.__strategy, 'api-key');
});

test('renderEntitlementsPlist emits every hardened-runtime entitlement', () => {
  const plist = renderEntitlementsPlist();
  for (const key of MAC_ENTITLEMENTS) {
    assert.ok(plist.includes(`<key>${key}</key>`), `missing ${key}`);
  }
  assert.ok(plist.startsWith('<?xml version="1.0"'));
  assert.ok(plist.includes('com.apple.security.cs.allow-jit'));
  assert.ok(plist.includes('com.apple.security.inherit'));
});

test('release-secrets gate is truthful and fails fast when incomplete', () => {
  const partial = createEnvSecretPort({ DESKTOP_CSC_LINK: 'x' });
  const status = checkReleaseSecrets(partial);
  assert.equal(status.ready, false);
  assert.ok(status.missing.length === DESKTOP_RELEASE_SECRETS.length - 1);
  assert.throws(() => requireReleaseSecrets(partial), (e) => e instanceof FailSafeError);

  const full: Record<string, string> = {};
  for (const k of DESKTOP_RELEASE_SECRETS) full[k] = 'present';
  const fullPort = createEnvSecretPort(full);
  assert.equal(checkReleaseSecrets(fullPort).ready, true);
  assert.doesNotThrow(() => requireReleaseSecrets(fullPort));
});
