import { describe, it, expect, vi } from 'vitest';
import { PrincipalService, type OrgResolver } from '../principal.service.js';
import type { AuthSessionVerifier, ResolvedAuthSession } from '../adapters/better-auth.adapter.js';
import type { ApiKeyValidator } from '../ports/api-key.port.js';
import type { DeviceTokenValidator } from '../ports/device-flow.port.js';
import type { IdentityConfig } from '../config.js';
import type { Credential } from '../types.js';

const baseConfig: IdentityConfig = {
  betterAuthSecretPresent: true,
  authDatabaseUrl: 'postgres://x',
  cookieDomain: '.recoder.xyz',
  strictAuth: false,
  internalServiceKey: 'internal-service-key-abcdefghijklmnop',
  internalServiceKeyPresent: true,
  isProduction: false,
  deviceCodeTtlSeconds: 900,
  devicePollIntervalSeconds: 5,
  apiKeyDefaultTtlDays: null,
  apiKeyPrefixLength: 12,
};

const noopLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never;

function sessionAdapter(session: ResolvedAuthSession | null): AuthSessionVerifier {
  return {
    verifyToken: vi.fn(async () => session),
    extractToken: ({ cookieHeader, bearerToken }) =>
      bearerToken && !bearerToken.startsWith('sk_') ? bearerToken : cookieHeader ? 'cookie-token' : null,
  };
}

function build(overrides?: {
  session?: ResolvedAuthSession | null;
  apiKeyValidator?: ApiKeyValidator;
  deviceTokenValidator?: DeviceTokenValidator;
  orgResolver?: OrgResolver;
  config?: Partial<IdentityConfig>;
}): PrincipalService {
  return new PrincipalService({
    config: { ...baseConfig, ...(overrides?.config ?? {}) },
    logger: noopLogger,
    authSession: sessionAdapter(overrides?.session ?? null),
    ...(overrides?.apiKeyValidator ? { apiKeyValidator: overrides.apiKeyValidator } : {}),
    ...(overrides?.deviceTokenValidator ? { deviceTokenValidator: overrides.deviceTokenValidator } : {}),
    ...(overrides?.orgResolver ? { orgResolver: overrides.orgResolver } : {}),
  });
}

const aSession: ResolvedAuthSession = {
  sessionId: 'sid',
  userId: 'web-user',
  email: 'a@b.c',
  emailVerified: true,
  expiresAt: new Date(Date.now() + 1e6),
};

describe('PrincipalService — the SessionVerifier seam', () => {
  it('resolves the internal service key first (highest precedence), even with a session present', async () => {
    const svc = build({ session: { sessionId: 's', userId: 'u', email: 'e', emailVerified: true, expiresAt: new Date(Date.now() + 1e6) } });
    const cred: Credential = { internalKey: baseConfig.internalServiceKey, cookieHeader: 'recoder.session_token=abc' };
    const p = await svc.verify(cred);
    expect(p?.kind).toBe('internal');
    expect(p?.userId).toBe('internal-service');
    expect(p?.scopes).toContain('internal');
  });

  it('rejects a wrong internal key (constant-time miss) and falls through', async () => {
    const svc = build();
    const p = await svc.verify({ internalKey: 'wrong-key' });
    expect(p).toBeNull();
  });

  it('resolves an sk_ key into an apikey principal (over a session)', async () => {
    const apiKeyValidator: ApiKeyValidator = {
      validate: vi.fn(async (raw) => (raw === 'sk_live_abc' ? { keyId: 'k1', userId: 'owner', scopes: ['read'] } : null)),
    };
    const svc = build({ apiKeyValidator, session: { sessionId: 's', userId: 'sess', email: 'e', emailVerified: true, expiresAt: new Date(Date.now() + 1e6) } });
    const p = await svc.verify({ apiKey: 'sk_live_abc', cookieHeader: 'recoder.session_token=abc' });
    expect(p?.kind).toBe('apikey');
    expect(p?.userId).toBe('owner');
  });

  it('resolves a Better Auth session when only a cookie is present', async () => {
    const session: ResolvedAuthSession = { sessionId: 'sid', userId: 'user-1', email: 'a@b.c', emailVerified: true, expiresAt: new Date(Date.now() + 1e6) };
    const svc = build({ session });
    const p = await svc.verify({ cookieHeader: 'recoder.session_token=abc.def' });
    expect(p?.kind).toBe('session');
    expect(p?.userId).toBe('user-1');
    expect(p?.sessionId).toBe('sid');
    expect(p?.email).toBe('a@b.c');
  });

  it('returns null when nothing resolves (never throws, never mints anonymous)', async () => {
    const svc = build();
    expect(await svc.verify({})).toBeNull();
  });

  it('never throws for a failing validator — infra error degrades to null', async () => {
    const apiKeyValidator: ApiKeyValidator = { validate: vi.fn(async () => { throw new Error('db down'); }) };
    const svc = build({ apiKeyValidator });
    expect(await svc.verify({ apiKey: 'sk_live_x' })).toBeNull();
  });

  it('produces a distinct anonymous fallback identity (only via the explicit helper)', () => {
    const svc = build();
    const anon = svc.getAnonymousFallbackIdentity();
    expect(anon.isAnonymous).toBe(true);
    expect(anon.kind).toBe('anonymous');
    expect(anon.userId).toBe('anonymous');
    expect(anon.scopes).toEqual([]);
  });

  it('fails closed on internal-key resolution when no key is configured', () => {
    const svc = build({ config: { internalServiceKey: null, internalServiceKeyPresent: false } });
    expect(svc.resolveInternalServiceSession('anything')).toBeNull();
  });
});

describe('PrincipalService — orgId resolution on session principals (#9/#11)', () => {
  it('sets principal.orgId from the resolver for a web session (tenant scoping now functions)', async () => {
    const orgResolver: OrgResolver = { ensurePersonalOrg: vi.fn(async () => 'org-abc') };
    const svc = build({ session: aSession, orgResolver });
    const p = await svc.verify({ cookieHeader: 'recoder.session_token=abc' });
    expect(p?.kind).toBe('session');
    expect(p?.userId).toBe('web-user');
    expect(p?.orgId).toBe('org-abc');
    expect(orgResolver.ensurePersonalOrg).toHaveBeenCalledWith('web-user');
  });

  it('resolves orgId undefined (userId-ownership fallback) when no resolver is wired — no regression', async () => {
    const svc = build({ session: aSession });
    const p = await svc.verify({ cookieHeader: 'recoder.session_token=abc' });
    expect(p?.kind).toBe('session');
    expect(p?.orgId).toBeUndefined();
  });

  it('degrades safely when the resolver returns undefined (DB-less user with no org)', async () => {
    const orgResolver: OrgResolver = { ensurePersonalOrg: vi.fn(async () => undefined) };
    const svc = build({ session: aSession, orgResolver });
    const p = await svc.verify({ cookieHeader: 'recoder.session_token=abc' });
    expect(p?.orgId).toBeUndefined();
  });

  it('never throws when the resolver faults — session still resolves with orgId undefined', async () => {
    const orgResolver: OrgResolver = {
      ensurePersonalOrg: vi.fn(async () => {
        throw new Error('db down');
      }),
    };
    const svc = build({ session: aSession, orgResolver });
    const p = await svc.verify({ cookieHeader: 'recoder.session_token=abc' });
    expect(p?.kind).toBe('session');
    expect(p?.orgId).toBeUndefined();
  });

  it('does NOT run personal-org resolution for api-key principals (they carry their own org)', async () => {
    const orgResolver: OrgResolver = { ensurePersonalOrg: vi.fn(async () => 'org-should-not-apply') };
    const apiKeyValidator: ApiKeyValidator = {
      validate: vi.fn(async () => ({ keyId: 'k1', userId: 'key-owner', orgId: 'key-org', scopes: ['read'] })),
    };
    const svc = build({ apiKeyValidator, orgResolver });
    const p = await svc.verify({ apiKey: 'sk_live_abc' });
    expect(p?.kind).toBe('apikey');
    expect(p?.orgId).toBe('key-org');
    expect(orgResolver.ensurePersonalOrg).not.toHaveBeenCalled();
  });

  it('does NOT run personal-org resolution for the internal service key', async () => {
    const orgResolver: OrgResolver = { ensurePersonalOrg: vi.fn(async () => 'org-x') };
    const svc = build({ orgResolver });
    const p = await svc.verify({ internalKey: baseConfig.internalServiceKey });
    expect(p?.kind).toBe('internal');
    expect(p?.orgId).toBeUndefined();
    expect(orgResolver.ensurePersonalOrg).not.toHaveBeenCalled();
  });
});
