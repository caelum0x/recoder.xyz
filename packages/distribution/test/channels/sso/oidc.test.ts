import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign, type KeyObject } from 'node:crypto';

import {
  createOidcVerifier,
  createJwksClient,
  createBlockedSamlPort,
  SAML_BLOCKED_REASON,
  type OidcConfig,
} from '../../../src/channels/sso/index';

const ISSUER = 'https://idp.example.com';
const AUDIENCE = 'recoder-enterprise-client';

/** Generate an RSA keypair and its public JWK (with a kid). */
function rsaKeyAndJwk(kid: string): { privateKey: KeyObject; jwk: Record<string, unknown> } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  return { privateKey, jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } };
}

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Mint a real RS256 JWS over the given claims with the given key + kid. */
function signRs256(
  claims: Record<string, unknown>,
  privateKey: KeyObject,
  kid: string,
  alg = 'RS256',
): string {
  const header = b64url({ alg, kid, typ: 'JWT' });
  const payload = b64url(claims);
  const signer = createSign('sha256');
  signer.update(`${header}.${payload}`);
  const sig = signer.sign(privateKey).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

/** A mock fetch serving a JWKS at the configured uri. */
function jwksFetch(keys: Record<string, unknown>[]): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ keys }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

const baseConfig: OidcConfig = {
  orgId: 'org_1',
  issuer: ISSUER,
  audience: AUDIENCE,
  jwksUri: 'https://idp.example.com/jwks',
  enabled: true,
};

const NOW = () => new Date('2026-06-28T00:00:00Z');
const NOW_SEC = Math.floor(NOW().getTime() / 1000);
const validClaims = () => ({
  iss: ISSUER,
  aud: AUDIENCE,
  sub: 'idp-user-789',
  email: 'alice@enterprise.com',
  email_verified: true,
  name: 'Alice',
  iat: NOW_SEC - 60,
  exp: NOW_SEC + 3600, // valid for one hour from NOW
});

test('verifies a real RS256 id-token and returns the asserted identity', async () => {
  const { privateKey, jwk } = rsaKeyAndJwk('k1');
  const verifier = createOidcVerifier({
    config: baseConfig,
    jwks: createJwksClient({ jwksUri: baseConfig.jwksUri!, fetchImpl: jwksFetch([jwk]) }),
    now: NOW,
  });
  const token = signRs256(validClaims(), privateKey, 'k1');

  const res = await verifier.verifyIdToken(token);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.subject, 'idp-user-789');
    assert.equal(res.value.issuer, ISSUER);
    assert.equal(res.value.email, 'alice@enterprise.com');
    assert.equal(res.value.emailVerified, true);
  }
});

test('rejects a token signed by the WRONG key (signature failure)', async () => {
  const { jwk } = rsaKeyAndJwk('k1'); // published key
  const { privateKey: attackerKey } = rsaKeyAndJwk('k1'); // different private key, same kid
  const verifier = createOidcVerifier({
    config: baseConfig,
    jwks: createJwksClient({ jwksUri: baseConfig.jwksUri!, fetchImpl: jwksFetch([jwk]) }),
    now: NOW,
  });
  const forged = signRs256(validClaims(), attackerKey, 'k1');

  const res = await verifier.verifyIdToken(forged);
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.error.message, /signature verification failed/);
});

test('rejects alg=none and HS256 (alg-confusion hardening)', async () => {
  const { privateKey, jwk } = rsaKeyAndJwk('k1');
  const verifier = createOidcVerifier({
    config: baseConfig,
    jwks: createJwksClient({ jwksUri: baseConfig.jwksUri!, fetchImpl: jwksFetch([jwk]) }),
    now: NOW,
  });

  // alg=none with an empty signature.
  const header = Buffer.from(JSON.stringify({ alg: 'none', kid: 'k1' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(validClaims())).toString('base64url');
  const noneToken = `${header}.${payload}.`;
  const r1 = await verifier.verifyIdToken(noneToken);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.match(r1.error.message, /not allowed/);

  // A token claiming HS256 is rejected on the alg allow-list (never imported as a secret).
  const hsToken = signRs256(validClaims(), privateKey, 'k1', 'HS256');
  const r2 = await verifier.verifyIdToken(hsToken);
  assert.equal(r2.ok, false);
});

test('rejects issuer and audience mismatches', async () => {
  const { privateKey, jwk } = rsaKeyAndJwk('k1');
  const verifier = createOidcVerifier({
    config: baseConfig,
    jwks: createJwksClient({ jwksUri: baseConfig.jwksUri!, fetchImpl: jwksFetch([jwk]) }),
    now: NOW,
  });

  const badIss = signRs256({ ...validClaims(), iss: 'https://evil.example.com' }, privateKey, 'k1');
  const r1 = await verifier.verifyIdToken(badIss);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.match(r1.error.message, /issuer mismatch/);

  const badAud = signRs256({ ...validClaims(), aud: 'someone-else' }, privateKey, 'k1');
  const r2 = await verifier.verifyIdToken(badAud);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.match(r2.error.message, /audience mismatch/);
});

test('rejects an expired token (with clock skew honored)', async () => {
  const { privateKey, jwk } = rsaKeyAndJwk('k1');
  const verifier = createOidcVerifier({
    config: baseConfig,
    jwks: createJwksClient({ jwksUri: baseConfig.jwksUri!, fetchImpl: jwksFetch([jwk]) }),
    now: () => new Date('2026-06-29T00:00:00Z'), // a day later
  });
  const token = signRs256(validClaims(), privateKey, 'k1');
  const res = await verifier.verifyIdToken(token);
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.error.message, /expired/);
});

test('rejects a disabled org config and a malformed token', async () => {
  const { privateKey, jwk } = rsaKeyAndJwk('k1');
  const disabled = createOidcVerifier({
    config: { ...baseConfig, enabled: false },
    jwks: createJwksClient({ jwksUri: baseConfig.jwksUri!, fetchImpl: jwksFetch([jwk]) }),
    now: NOW,
  });
  const token = signRs256(validClaims(), privateKey, 'k1');
  const r1 = await disabled.verifyIdToken(token);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.error.code, 'entitlement_denied');

  const enabled = createOidcVerifier({
    config: baseConfig,
    jwks: createJwksClient({ jwksUri: baseConfig.jwksUri!, fetchImpl: jwksFetch([jwk]) }),
    now: NOW,
  });
  const r2 = await enabled.verifyIdToken('not.a.jwt.at.all');
  assert.equal(r2.ok, false);
});

test('JWKS key rotation: a new kid triggers a refetch before denying', async () => {
  const k1 = rsaKeyAndJwk('k1');
  const k2 = rsaKeyAndJwk('k2');
  let served = [k1.jwk]; // initially only k1
  const rotatingFetch = (async () =>
    new Response(JSON.stringify({ keys: served }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

  const verifier = createOidcVerifier({
    config: baseConfig,
    jwks: createJwksClient({ jwksUri: baseConfig.jwksUri!, fetchImpl: rotatingFetch, cacheTtlMs: 10_000 }),
    now: NOW,
  });

  // Token signed with k2 — not yet in the JWKS → after the forced refetch (still
  // missing) it denies.
  const tokenK2 = signRs256(validClaims(), k2.privateKey, 'k2');
  assert.equal((await verifier.verifyIdToken(tokenK2)).ok, false);

  // IdP rotates: now k2 is published. The next verify refetches and succeeds.
  served = [k1.jwk, k2.jwk];
  assert.equal((await verifier.verifyIdToken(tokenK2)).ok, true);
});

test('SAML port is BLOCKED — it denies explicitly, never fakes success', async () => {
  const saml = createBlockedSamlPort({
    orgId: 'org_1',
    idpEntityId: 'https://idp.example.com/saml',
    spEntityId: 'https://recoder.xyz/saml',
    idpCertsPem: ['-----BEGIN CERTIFICATE-----...'],
    enabled: true,
  });
  const res = await saml.verifyAssertion('PHNhbWxwOlJlc3BvbnNlPg==');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'provider_unavailable');
    assert.equal(res.error.message, SAML_BLOCKED_REASON);
  }
});
