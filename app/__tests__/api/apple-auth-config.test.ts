// @vitest-environment node
/**
 * Apple ("Sign in with Apple") wiring guard for the main app auth config.
 *
 * Mirrors the GitHub/Google contract: env-gated, half-cred throws in prod,
 * absent creds => provider omitted (never faked). Also covers the Apple-only
 * bits: the client secret is a signed JWT (direct OR derived from the .p8
 * parts), the callback origin is trusted, and Apple's string `email_verified`
 * is coerced truthfully.
 *
 * Never puts a real Apple .p8 in the repo — the derive case mints an ephemeral
 * P-256 key in-test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeJwt, exportPKCS8, generateKeyPair } from 'jose';
import {
  appleMapProfileToUser,
  coerceAppleEmailVerified,
} from '../../lib/auth/apple-secret';

const BASE_ENV: Record<string, string> = {
  BETTER_AUTH_SECRET: 'test-only-secret',
  BETTER_AUTH_URL: 'http://localhost:3000',
  // Credential-free URLs keep the strict secret-scan quiet.
  AUTH_DATABASE_URL: 'postgresql://localhost:5432/test_auth',
  DATABASE_URL: 'postgresql://localhost:5432/test_main',
};

const MANAGED_KEYS = [
  ...Object.keys(BASE_ENV),
  'NODE_ENV',
  'SKIP_ENV_VALIDATION',
  'NEXT_PHASE',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'APPLE_CLIENT_ID',
  'APPLE_CLIENT_SECRET',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
  'APPLE_APP_BUNDLE_IDENTIFIER',
];

let snapshot: Record<string, string | undefined> = {};

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const key of MANAGED_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries({ ...BASE_ENV, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function loadConfig() {
  vi.resetModules();
  return import('../../lib/auth-config');
}

beforeEach(() => {
  snapshot = {};
  for (const key of MANAGED_KEYS) snapshot[key] = process.env[key];
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function ephemeralPrivateKeyPem(): Promise<string> {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  return exportPKCS8(privateKey);
}

describe('apple social provider (app auth config)', () => {
  it('is OMITTED when no Apple env is set', async () => {
    setEnv({ NODE_ENV: 'test' });
    const { buildAppAuthOptions } = await loadConfig();
    const providers = buildAppAuthOptions().socialProviders as Record<string, unknown>;
    expect(providers.apple).toBeUndefined();
  });

  it('is PRESENT with a directly supplied APPLE_CLIENT_SECRET', async () => {
    setEnv({
      NODE_ENV: 'test',
      APPLE_CLIENT_ID: 'xyz.recoder.signin',
      APPLE_CLIENT_SECRET: 'pre-minted-apple-jwt',
      APPLE_APP_BUNDLE_IDENTIFIER: 'xyz.recoder.app',
    });
    const { buildAppAuthOptions } = await loadConfig();
    const providers = buildAppAuthOptions().socialProviders as Record<
      string,
      { clientId: string; clientSecret: string; appBundleIdentifier?: string }
    >;
    expect(providers.apple).toBeDefined();
    expect(providers.apple.clientId).toBe('xyz.recoder.signin');
    expect(providers.apple.clientSecret).toBe('pre-minted-apple-jwt');
    expect(providers.apple.appBundleIdentifier).toBe('xyz.recoder.app');
  });

  it('DERIVES a signed JWT client secret from the .p8 parts', async () => {
    const pem = await ephemeralPrivateKeyPem();
    setEnv({
      NODE_ENV: 'test',
      APPLE_CLIENT_ID: 'xyz.recoder.signin',
      APPLE_TEAM_ID: 'TEAMID1234',
      APPLE_KEY_ID: 'KEYID56789',
      APPLE_PRIVATE_KEY: pem,
    });
    const { buildAppAuthOptions } = await loadConfig();
    const providers = buildAppAuthOptions().socialProviders as Record<
      string,
      { clientId: string; clientSecret: string }
    >;
    expect(providers.apple).toBeDefined();
    // The derived secret is a real JWT with Apple's issuer/subject claims.
    const claims = decodeJwt(providers.apple.clientSecret);
    expect(claims.iss).toBe('TEAMID1234');
    expect(claims.sub).toBe('xyz.recoder.signin');
    expect(claims.aud).toBe('https://appleid.apple.com');
  });

  it('THROWS in production when APPLE_CLIENT_ID is set but no secret material', async () => {
    setEnv({
      NODE_ENV: 'production',
      APPLE_CLIENT_ID: 'xyz.recoder.signin',
    });
    await expect(loadConfig()).rejects.toThrow(/no Apple client secret material/i);
  });

  it('THROWS in production when secret material is set but APPLE_CLIENT_ID is missing', async () => {
    setEnv({
      NODE_ENV: 'production',
      APPLE_CLIENT_SECRET: 'pre-minted-apple-jwt',
    });
    await expect(loadConfig()).rejects.toThrow(/APPLE_CLIENT_ID/);
  });

  it('adds the Apple callback origin to trustedOrigins', async () => {
    setEnv({ NODE_ENV: 'test' });
    const { buildAppAuthOptions } = await loadConfig();
    expect(buildAppAuthOptions().trustedOrigins).toContain(
      'https://appleid.apple.com',
    );
  });
});

describe('apple email_verified coercion + profile mapping', () => {
  it('coerces Apple string/boolean email_verified truthfully', () => {
    expect(coerceAppleEmailVerified('true')).toBe(true);
    expect(coerceAppleEmailVerified(true)).toBe(true);
    // The non-empty string "false" must NOT be truthy.
    expect(coerceAppleEmailVerified('false')).toBe(false);
    expect(coerceAppleEmailVerified(false)).toBe(false);
    expect(coerceAppleEmailVerified(undefined)).toBe(false);
  });

  it('persists the email Apple sends on first auth + coerces verification', () => {
    const mapped = appleMapProfileToUser({
      email: 'user@example.com',
      email_verified: 'true',
      name: 'Ada Lovelace',
    });
    expect(mapped.email).toBe('user@example.com');
    expect(mapped.emailVerified).toBe(true);
    expect(mapped.name).toBe('Ada Lovelace');
  });

  it('omits email on later sign-ins so the stored address is untouched', () => {
    const mapped = appleMapProfileToUser({ email_verified: 'false' });
    expect('email' in mapped).toBe(false);
    expect(mapped.emailVerified).toBe(false);
  });
});
