import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDeviceFlowConfig,
  createInMemoryDeviceGrantStore,
  deviceAuthorize,
  browserAuthorize,
  pollDeviceToken,
  issueCliToken,
  decodeCliToken,
  verifyCliToken,
  refreshCliToken,
  toRecoderAuthData,
  serializeAuthData,
  parseAuthData,
  authFilePath,
} from '../../../../src/channels/cli-dist/device-flow/index';
import type { AuthPort, RecoderUserProfile } from '../../../../src/ports/auth-port';

const RECODER = 'https://recoder.xyz';
const SIGNING_KEY = 'test-signing-key-please-rotate';

function fixedClock(iso: string) {
  return () => new Date(iso);
}

function profile(plan: RecoderUserProfile['plan'] = 'pro'): RecoderUserProfile {
  return {
    userId: 'user_123',
    email: 'dev@recoder.xyz',
    name: 'Dev',
    plan,
    hasOwnApiKey: false,
  };
}

/** A faux recoder.xyz auth authority — deterministic, offline. */
function fauxAuth(opts: {
  sessionUserId?: string | null;
  profile?: RecoderUserProfile | null;
  cliValid?: boolean;
}): AuthPort {
  return {
    async verifySession(token) {
      if (opts.sessionUserId == null || token === 'invalid') return null;
      return {
        sessionId: 'sess_1',
        userId: opts.sessionUserId,
        user: { id: opts.sessionUserId, email: 'dev@recoder.xyz', name: 'Dev', emailVerified: true },
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      };
    },
    async getUserProfile(userId) {
      if (opts.profile === null) return null;
      return opts.profile ?? profile();
    },
    async verifyCliAccessToken() {
      if (opts.cliValid === false) return null;
      return opts.profile ?? profile();
    },
  };
}

test('deviceAuthorize issues a grant with recoder.xyz verification URLs (no localhost)', () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const store = createInMemoryDeviceGrantStore();
  const grant = deviceAuthorize(config, store, {}, { now: fixedClock('2026-06-28T00:00:00Z') });

  assert.equal(grant.clientId, 'recoder-code');
  assert.equal(grant.status, 'pending');
  assert.match(grant.userCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.ok(grant.verificationUri.startsWith('https://recoder.xyz/auth/cli'));
  assert.ok(grant.verificationUriComplete.includes(`user_code=${grant.userCode}`));
  assert.ok(!grant.verificationUri.includes('localhost'));
  // Stored and retrievable by both codes.
  assert.equal(store.getByDeviceCode(grant.deviceCode)?.userCode, grant.userCode);
  assert.equal(store.getByUserCode(grant.userCode)?.deviceCode, grant.deviceCode);
});

test('browserAuthorize approves the grant only with a valid recoder.xyz session', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const store = createInMemoryDeviceGrantStore();
  const grant = deviceAuthorize(config, store);

  const auth = fauxAuth({ sessionUserId: 'user_123' });
  const result = await browserAuthorize(auth, store, {
    userCode: grant.userCode,
    sessionToken: 'good-cookie',
  });
  assert.equal(result.approvedUserId, 'user_123');
  assert.equal(store.getByDeviceCode(grant.deviceCode)?.status, 'approved');
});

test('browserAuthorize rejects an invalid recoder.xyz session (auth is source of truth)', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const store = createInMemoryDeviceGrantStore();
  const grant = deviceAuthorize(config, store);
  const auth = fauxAuth({ sessionUserId: null });

  await assert.rejects(
    () => browserAuthorize(auth, store, { userCode: grant.userCode, sessionToken: 'invalid' }),
    /invalid or expired recoder\.xyz session/,
  );
  assert.equal(store.getByDeviceCode(grant.deviceCode)?.status, 'pending');
});

test('user_code is single-use: a second browserAuthorize fails', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const store = createInMemoryDeviceGrantStore();
  const grant = deviceAuthorize(config, store);
  const auth = fauxAuth({ sessionUserId: 'user_123' });

  await browserAuthorize(auth, store, { userCode: grant.userCode, sessionToken: 'good' });
  await assert.rejects(
    () => browserAuthorize(auth, store, { userCode: grant.userCode, sessionToken: 'good' }),
    /already approved/,
  );
});

test('pollDeviceToken: pending → approved → completed → consumed (single-use)', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const store = createInMemoryDeviceGrantStore();
  const grant = deviceAuthorize(config, store);
  const auth = fauxAuth({ sessionUserId: 'user_123', profile: profile('enterprise') });

  // 1. pending before approval
  const pending = await pollDeviceToken(config, store, {
    deviceCode: grant.deviceCode,
    getProfile: (id) => auth.getUserProfile(id),
    signingKey: SIGNING_KEY,
  });
  assert.equal(pending.status, 'pending');

  // 2. browser approves
  await browserAuthorize(auth, store, { userCode: grant.userCode, sessionToken: 'good' });

  // 3. poll mints the token from the AUTHORITATIVE profile
  const done = await pollDeviceToken(config, store, {
    deviceCode: grant.deviceCode,
    getProfile: (id) => auth.getUserProfile(id),
    signingKey: SIGNING_KEY,
  });
  assert.equal(done.status, 'completed');
  if (done.status === 'completed') {
    assert.equal(done.token.userId, 'user_123');
    assert.equal(done.token.plan, 'enterprise');
    assert.equal(done.token.clientId, 'recoder-code');
  }

  // 4. consumed grant cannot mint a second token
  const replay = await pollDeviceToken(config, store, {
    deviceCode: grant.deviceCode,
    getProfile: (id) => auth.getUserProfile(id),
    signingKey: SIGNING_KEY,
  });
  assert.equal(replay.status, 'expired');
});

test('issueCliToken requires a signing key (fail safe)', () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  assert.throws(() => issueCliToken(config, profile(), ''), /CLI_TOKEN_SIGNING_KEY is required/);
});

test('decodeCliToken verifies HMAC + expiry and rejects forgeries', () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const token = issueCliToken(config, profile(), SIGNING_KEY, { now: fixedClock('2026-06-28T00:00:00Z') });

  // Valid within TTL.
  const decoded = decodeCliToken(token.accessToken, SIGNING_KEY, fixedClock('2026-06-28T00:10:00Z'));
  assert.ok(decoded);
  assert.equal(decoded?.sub, 'user_123');

  // Wrong key → reject.
  assert.equal(decodeCliToken(token.accessToken, 'other-key'), null);

  // Tampered body → reject.
  const tampered = `AAAA.${token.accessToken.split('.')[1]}`;
  assert.equal(decodeCliToken(tampered, SIGNING_KEY), null);

  // Expired → reject.
  assert.equal(
    decodeCliToken(token.accessToken, SIGNING_KEY, fixedClock('2026-06-28T02:00:00Z')),
    null,
  );
});

test('verifyCliToken defers to recoder.xyz even after a valid local check', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const token = issueCliToken(config, profile(), SIGNING_KEY);

  // Local-valid AND recoder.xyz-valid → valid.
  const okAuth = fauxAuth({ cliValid: true, profile: profile() });
  assert.equal((await verifyCliToken(okAuth, token.accessToken, SIGNING_KEY)).valid, true);

  // Local-valid BUT recoder.xyz rejects (revoked) → invalid (source of truth).
  const revokedAuth = fauxAuth({ cliValid: false });
  const res = await verifyCliToken(revokedAuth, token.accessToken, SIGNING_KEY);
  assert.equal(res.valid, false);
  assert.match(res.reason ?? '', /recoder\.xyz rejected/);
});

test('refreshCliToken re-mints from the authoritative profile; rejects when recoder.xyz has none', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const auth = fauxAuth({ profile: profile('pro') });
  const fresh = await refreshCliToken(
    config,
    auth,
    { refreshToken: 'r', userId: 'user_123' },
    SIGNING_KEY,
  );
  assert.equal(fresh.plan, 'pro');
  assert.equal(fresh.userId, 'user_123');

  const noProfile = fauxAuth({ profile: null });
  await assert.rejects(
    () =>
      refreshCliToken(config, noProfile, { refreshToken: 'r', userId: 'ghost' }, SIGNING_KEY),
    /recoder\.xyz rejected the refresh/,
  );
});

test('token-store round-trips the ~/.recoder/auth.json shape', () => {
  assert.ok(authFilePath('/home/dev').endsWith('/.recoder/auth.json'));
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER });
  const token = issueCliToken(config, profile('pro'), SIGNING_KEY);
  const data = toRecoderAuthData(token, {
    name: 'Dev',
    hasOwnApiKey: false,
    quota: { requestsRemaining: 100, requestsLimit: 100, resetDate: '2026-07-01T00:00:00Z' },
  });
  const serialized = serializeAuthData(data);
  const parsed = parseAuthData(serialized);
  assert.deepEqual(parsed, data);
  assert.equal(parsed?.user.subscription_plan, 'pro');
  assert.equal(parsed?.user.quota.requests_limit, 100);

  // Corrupt store → not authenticated (null), never a throw.
  assert.equal(parseAuthData('{ not json'), null);
});

test('expired grant cannot be approved or polled', async () => {
  const config = buildDeviceFlowConfig({ recoderBaseUrl: RECODER, grantTtlSeconds: 1 });
  const store = createInMemoryDeviceGrantStore(fixedClock('2026-06-28T00:00:10Z'));
  const grant = deviceAuthorize(config, store, {}, { now: fixedClock('2026-06-28T00:00:00Z') });

  const auth = fauxAuth({ sessionUserId: 'user_123' });
  await assert.rejects(
    () => browserAuthorize(auth, store, { userCode: grant.userCode, sessionToken: 'good' }, fixedClock('2026-06-28T00:00:10Z')),
    /expired/,
  );
});
