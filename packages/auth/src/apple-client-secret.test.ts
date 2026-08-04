import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateKeyPair,
  exportPKCS8,
  decodeProtectedHeader,
  jwtVerify,
} from 'jose';
import {
  generateAppleClientSecret,
  resolveAppleClientSecret,
  hasAppleSecretParts,
  APPLE_ISSUER_URL,
  APPLE_CLIENT_SECRET_MAX_TTL_SECONDS,
} from './apple-client-secret';

// Never a real Apple .p8 in tests: mint an ephemeral P-256 key per run.
async function ephemeralKey() {
  const { publicKey, privateKey } = await generateKeyPair('ES256', {
    extractable: true,
  });
  const pem = await exportPKCS8(privateKey);
  return { pem, publicKey };
}

const CLIENT_ID = 'xyz.recoder.signin';
const TEAM_ID = 'TEAMID1234';
const KEY_ID = 'KEYID56789';

test('generateAppleClientSecret signs an ES256 JWT with kid + Apple claims', async () => {
  const { pem, publicKey } = await ephemeralKey();
  const now = 1_700_000_000;

  const secret = await generateAppleClientSecret({
    clientId: CLIENT_ID,
    teamId: TEAM_ID,
    keyId: KEY_ID,
    privateKey: pem,
    now,
  });

  const header = decodeProtectedHeader(secret);
  assert.equal(header.alg, 'ES256');
  assert.equal(header.kid, KEY_ID);

  const { payload } = await jwtVerify(secret, publicKey, {
    issuer: TEAM_ID,
    audience: APPLE_ISSUER_URL,
    subject: CLIENT_ID,
    currentDate: new Date(now * 1000),
  });
  assert.equal(payload.iss, TEAM_ID);
  assert.equal(payload.sub, CLIENT_ID);
  assert.equal(payload.aud, APPLE_ISSUER_URL);
  assert.equal(payload.iat, now);
  // Default lifetime is exactly the Apple-safe 180-day cap.
  assert.equal(payload.exp, now + APPLE_CLIENT_SECRET_MAX_TTL_SECONDS);
  assert.ok(
    (payload.exp as number) - (payload.iat as number) <=
      APPLE_CLIENT_SECRET_MAX_TTL_SECONDS,
    'exp-iat must stay within Apple 6-month ceiling',
  );
});

test('generateAppleClientSecret clamps an over-long lifetime to the 180-day cap', async () => {
  const { pem, publicKey } = await ephemeralKey();
  const now = 1_700_000_000;

  const secret = await generateAppleClientSecret({
    clientId: CLIENT_ID,
    teamId: TEAM_ID,
    keyId: KEY_ID,
    privateKey: pem,
    now,
    // Request a full year — must be clamped down to the Apple ceiling.
    expiresInSeconds: 365 * 24 * 60 * 60,
  });

  const { payload } = await jwtVerify(secret, publicKey, {
    currentDate: new Date(now * 1000),
  });
  assert.equal(
    (payload.exp as number) - (payload.iat as number),
    APPLE_CLIENT_SECRET_MAX_TTL_SECONDS,
  );
});

test('generateAppleClientSecret throws when a required signing part is missing', async () => {
  const { pem } = await ephemeralKey();
  await assert.rejects(
    () =>
      generateAppleClientSecret({
        clientId: '',
        teamId: TEAM_ID,
        keyId: KEY_ID,
        privateKey: pem,
      }),
    /clientId/,
  );
  await assert.rejects(
    () =>
      generateAppleClientSecret({
        clientId: CLIENT_ID,
        teamId: TEAM_ID,
        keyId: KEY_ID,
        privateKey: '   ',
      }),
    /privateKey/,
  );
});

test('hasAppleSecretParts requires all four signing parts', () => {
  assert.equal(
    hasAppleSecretParts({
      clientId: CLIENT_ID,
      teamId: TEAM_ID,
      keyId: KEY_ID,
      privateKey: 'pem',
    }),
    true,
  );
  assert.equal(
    hasAppleSecretParts({ clientId: CLIENT_ID, teamId: TEAM_ID, keyId: KEY_ID }),
    false,
  );
});

test('resolveAppleClientSecret prefers a direct secret over deriving', async () => {
  const resolved = await resolveAppleClientSecret({
    clientSecret: 'pre-minted-secret',
    clientId: CLIENT_ID,
    teamId: TEAM_ID,
    keyId: KEY_ID,
    privateKey: 'unused',
  });
  assert.equal(resolved, 'pre-minted-secret');
});

test('resolveAppleClientSecret derives from parts when no direct secret', async () => {
  const { pem, publicKey } = await ephemeralKey();
  const resolved = await resolveAppleClientSecret({
    clientId: CLIENT_ID,
    teamId: TEAM_ID,
    keyId: KEY_ID,
    privateKey: pem,
  });
  assert.ok(resolved, 'a secret must be derived from the parts');
  const { payload } = await jwtVerify(resolved!, publicKey, {
    issuer: TEAM_ID,
    audience: APPLE_ISSUER_URL,
    subject: CLIENT_ID,
  });
  assert.equal(payload.sub, CLIENT_ID);
});

test('resolveAppleClientSecret returns undefined when neither secret nor parts', async () => {
  const resolved = await resolveAppleClientSecret({ clientId: CLIENT_ID });
  assert.equal(resolved, undefined);
});
