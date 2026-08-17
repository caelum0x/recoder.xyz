/**
 * Regression suite for the single Express auth gate every domain guards its
 * routes with. The whole reason this middleware exists is fail-closed behavior,
 * so these tests lock in the security invariants directly:
 *
 *   - a verifier fault becomes a DENY, never a silent allow
 *   - an unconfigured internal gate 503s (fail-closed), it never opens
 *   - a missing RBAC evaluator denies non-privileged callers (deny-by-default)
 *   - the RECODER_SOLO_MODE fail-OPEN seam promotes the anonymous local caller
 *     ONLY under soloMode, never on a cloud deploy
 *
 * All collaborators are injected via createAuthMiddleware(deps), so this is a
 * pure unit test with fakes — no DB, no network.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  createAuthMiddleware,
  credentialFromRequest,
  type AuthMiddlewareDeps,
} from './authenticate.middleware.js';
import type { Principal } from '../types.js';
import type { IdentityConfig } from '../config.js';
import type { SessionVerifier } from '../ports/session-verifier.port.js';
import type { PermissionEvaluator } from '../ports/rbac.port.js';
import type { PrincipalService } from '../principal.service.js';

// --- fakes -----------------------------------------------------------------

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as AuthMiddlewareDeps['logger'];

function makeConfig(overrides: Partial<IdentityConfig> = {}): IdentityConfig {
  return {
    betterAuthSecretPresent: true,
    authDatabaseUrl: null,
    cookieDomain: null,
    strictAuth: false,
    internalServiceKey: null,
    internalServiceKeyPresent: false,
    soloMode: false,
    isProduction: false,
    deviceCodeTtlSeconds: 900,
    devicePollIntervalSeconds: 5,
    apiKeyDefaultTtlDays: null,
    apiKeyPrefixLength: 12,
    ...overrides,
  };
}

function makePrincipal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: 'u1',
    scopes: ['read', 'write'],
    kind: 'session',
    isAnonymous: false,
    raw: null,
    ...overrides,
  };
}

function anon(): Principal {
  return { userId: 'anonymous', scopes: [], kind: 'anonymous', isAnonymous: true, raw: null };
}

const SOLO_OWNER: Principal = {
  userId: 'solo-owner',
  scopes: [],
  kind: 'session',
  isAnonymous: false,
  raw: { kind: 'solo-owner' },
};

/** A SessionVerifier double: either resolves a value, or throws (infra fault). */
function makeVerifier(behavior: { resolves?: Principal | null; throws?: unknown }): SessionVerifier {
  return {
    verify: vi.fn(async () => {
      if (behavior.throws !== undefined) throw behavior.throws;
      return behavior.resolves ?? null;
    }),
  };
}

interface FakePrincipalOpts {
  readonly internalResolver?: (key: string | null) => Principal | null;
}

/** A PrincipalService double exposing only the methods the middleware calls. */
function makePrincipalService(opts: FakePrincipalOpts = {}): PrincipalService {
  const svc = {
    getAnonymousFallbackIdentity: () => anon(),
    getSoloOwnerIdentity: () => SOLO_OWNER,
    resolveInternalServiceSession: opts.internalResolver ?? (() => null),
  };
  return svc as unknown as PrincipalService;
}

function makeEvaluator(behavior: { allows?: boolean; rejects?: unknown }): PermissionEvaluator {
  return {
    can: vi.fn(async () => {
      if (behavior.rejects !== undefined) throw behavior.rejects;
      return behavior.allows ?? false;
    }),
    decide: vi.fn(async () => ({ allowed: behavior.allows ?? false, reason: 'test' })),
    permissionsForRole: () => [],
  };
}

// --- express test doubles --------------------------------------------------

interface ResState {
  statusCode?: number;
  body?: unknown;
}

function makeRes(): { res: Response; state: ResState } {
  const state: ResState = {};
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, params: {}, ip: '127.0.0.1', ...overrides } as unknown as Request;
}

/** Flush the microtask + immediate queue so async handlers settle. */
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function makeMw(overrides: Partial<AuthMiddlewareDeps> = {}) {
  return createAuthMiddleware({
    verifier: makeVerifier({ resolves: null }),
    principal: makePrincipalService(),
    config: makeConfig(),
    logger: silentLogger,
    ...overrides,
  });
}

/** Read the error code out of the uniform error envelope sent by sendError. */
function errorCodeOf(state: ResState): string | undefined {
  const body = state.body as { error?: { code?: string } } | undefined;
  return body?.error?.code;
}

// --- credentialFromRequest -------------------------------------------------

describe('credentialFromRequest', () => {
  it('returns the first element of an array-valued header', () => {
    const req = makeReq({ headers: { cookie: ['first-cookie', 'second-cookie'] } } as Partial<Request>);
    const cred = credentialFromRequest(req);
    expect(cred.cookieHeader).toBe('first-cookie');
  });

  it('returns null for a missing header', () => {
    const cred = credentialFromRequest(makeReq());
    expect(cred.authorizationHeader).toBeNull();
    expect(cred.apiKey).toBeNull();
    expect(cred.internalKey).toBeNull();
    expect(cred.deviceToken).toBeNull();
  });

  it('falls back to the x-request-id header when req.requestId is absent', () => {
    const req = makeReq({ headers: { 'x-request-id': 'rid-123' } } as Partial<Request>);
    const cred = credentialFromRequest(req);
    expect(cred.requestId).toBe('rid-123');
  });

  it('prefers req.requestId over the x-request-id header when present', () => {
    const req = makeReq({
      headers: { 'x-request-id': 'header-rid' },
      requestId: 'ambient-rid',
    } as unknown as Partial<Request>);
    const cred = credentialFromRequest(req);
    expect(cred.requestId).toBe('ambient-rid');
  });
});

// --- authenticate ----------------------------------------------------------

describe('authenticate', () => {
  it('attaches a resolved principal and calls next (no error sent)', async () => {
    const p = makePrincipal({ userId: 'user-42', sessionId: 'sess-9' });
    const mw = makeMw({ verifier: makeVerifier({ resolves: p }) });
    const req = makeReq();
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.authenticate(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.principal).toBe(p);
    expect(req.userId).toBe('user-42');
    expect(req.sessionId).toBe('sess-9');
    expect(state.statusCode).toBeUndefined(); // no error envelope sent
  });

  it('attaches the anonymous fallback and calls next when unauthenticated + strictAuth off', async () => {
    const mw = makeMw({ verifier: makeVerifier({ resolves: null }), config: makeConfig({ strictAuth: false }) });
    const req = makeReq();
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.authenticate(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.principal?.isAnonymous).toBe(true);
    expect(req.principal?.kind).toBe('anonymous');
    expect(state.statusCode).toBeUndefined();
  });

  it('FAIL-CLOSED: 401 AUTH_REQUIRED and no next() when unauthenticated + strictAuth on', async () => {
    const mw = makeMw({ verifier: makeVerifier({ resolves: null }), config: makeConfig({ strictAuth: true }) });
    const req = makeReq();
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.authenticate(req, res, next);
    await flush();

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
    expect(errorCodeOf(state)).toBe('AUTH_REQUIRED');
    expect(req.principal).toBeUndefined();
  });

  it('FAIL-CLOSED: a verifier fault becomes a 401 deny, never a silent allow (strictAuth on)', async () => {
    const mw = makeMw({
      verifier: makeVerifier({ throws: new Error('DB down') }),
      config: makeConfig({ strictAuth: true }),
    });
    const req = makeReq();
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.authenticate(req, res, next);
    await flush();

    // The fault is caught → treated as unauthenticated → strict deny.
    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
    expect(errorCodeOf(state)).toBe('AUTH_REQUIRED');
    // Critically: no real principal was ever attached from the fault.
    expect(req.principal).toBeUndefined();
  });
});

// --- authenticateMutating --------------------------------------------------

describe('authenticateMutating', () => {
  it('attaches a real non-anonymous principal and calls next', async () => {
    const p = makePrincipal({ userId: 'owner-1' });
    const mw = makeMw({ verifier: makeVerifier({ resolves: p }) });
    const req = makeReq();
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.authenticateMutating(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.principal).toBe(p);
    expect(req.userId).toBe('owner-1');
    expect(state.statusCode).toBeUndefined();
  });

  it('FAIL-CLOSED: 401 for an anonymous principal when soloMode is off', async () => {
    const mw = makeMw({
      verifier: makeVerifier({ resolves: anon() }),
      config: makeConfig({ soloMode: false }),
    });
    const req = makeReq();
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.authenticateMutating(req, res, next);
    await flush();

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
    expect(errorCodeOf(state)).toBe('AUTH_REQUIRED');
  });

  it('FAIL-CLOSED: 401 for a null principal when soloMode is off', async () => {
    const mw = makeMw({
      verifier: makeVerifier({ resolves: null }),
      config: makeConfig({ soloMode: false }),
    });
    const req = makeReq();
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.authenticateMutating(req, res, next);
    await flush();

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
  });

  it('FAIL-OPEN seam: promotes an anonymous caller to the solo owner ONLY under soloMode', async () => {
    const mw = makeMw({
      verifier: makeVerifier({ resolves: anon() }),
      config: makeConfig({ soloMode: true }),
    });
    const req = makeReq();
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.authenticateMutating(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.principal).toBe(SOLO_OWNER);
    expect(req.principal?.isAnonymous).toBe(false); // promoted to a real owner
    expect(req.userId).toBe('solo-owner');
    expect(state.statusCode).toBeUndefined();
  });

  it('BUILD-GUARD: soloMode NEVER promotes in production — fails closed (recoder-4d8i #7)', async () => {
    // If RECODER_SOLO_MODE leaks into a cloud deploy, an anonymous caller must
    // still 401 — never be handed the owner identity.
    const mw = makeMw({
      verifier: makeVerifier({ resolves: anon() }),
      config: makeConfig({ soloMode: true, isProduction: true }),
    });
    const req = makeReq();
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.authenticateMutating(req, res, next);
    await flush();

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
    expect(errorCodeOf(state)).toBe('AUTH_REQUIRED');
  });
});

// --- requireAdmin ----------------------------------------------------------

describe('requireAdmin', () => {
  it('401 when no principal is attached', () => {
    const mw = makeMw();
    const req = makeReq();
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
    expect(errorCodeOf(state)).toBe('AUTH_REQUIRED');
  });

  it('401 for an anonymous principal', () => {
    const mw = makeMw();
    const req = makeReq({ principal: anon() } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
  });

  it('passes an internal principal', () => {
    const mw = makeMw();
    const req = makeReq({ principal: makePrincipal({ kind: 'internal', userId: 'svc' }) } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBeUndefined();
  });

  it('passes a principal whose userId is in the admin allowlist', () => {
    const mw = makeMw({ adminUserIds: ['admin-user'] });
    const req = makeReq({ principal: makePrincipal({ userId: 'admin-user' }) } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBeUndefined();
  });

  it('passes a principal carrying the admin scope', () => {
    const mw = makeMw();
    const req = makeReq({ principal: makePrincipal({ scopes: ['read', 'admin'] }) } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBeUndefined();
  });

  it('FAIL-CLOSED: 403 for a plain authenticated principal', () => {
    const mw = makeMw();
    const req = makeReq({ principal: makePrincipal({ userId: 'nobody', scopes: ['read', 'write'] }) } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requireAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(403);
    expect(errorCodeOf(state)).toBe('AUTHZ_PROJECT_ACCESS_DENIED');
  });
});

// --- requireInternal -------------------------------------------------------

describe('requireInternal', () => {
  it('FAIL-CLOSED: 503 when the internal gate is unconfigured, WITHOUT consulting the presented key', () => {
    const resolver = vi.fn(() => makePrincipal({ kind: 'internal' }));
    const mw = makeMw({
      config: makeConfig({ internalServiceKeyPresent: false }),
      principal: makePrincipalService({ internalResolver: resolver }),
    });
    const req = makeReq({ headers: { 'x-internal-service-key': 'whatever' } } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requireInternal(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(503);
    expect(errorCodeOf(state)).toBe('SERVICE_UNAVAILABLE');
    // The key must never be consulted when the gate is unconfigured.
    expect(resolver).not.toHaveBeenCalled();
  });

  it('401 when a key is present but resolves to no session (bad key)', () => {
    const mw = makeMw({
      config: makeConfig({ internalServiceKeyPresent: true }),
      principal: makePrincipalService({ internalResolver: () => null }),
    });
    const req = makeReq({ headers: { 'x-internal-service-key': 'bad-key' } } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requireInternal(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
    expect(errorCodeOf(state)).toBe('AUTH_REQUIRED');
  });

  it('attaches the internal principal and calls next for a valid key', () => {
    const internalPrincipal = makePrincipal({ kind: 'internal', userId: 'internal-service' });
    const resolver = vi.fn((key: string | null) => (key === 'good-key' ? internalPrincipal : null));
    const mw = makeMw({
      config: makeConfig({ internalServiceKeyPresent: true }),
      principal: makePrincipalService({ internalResolver: resolver }),
    });
    const req = makeReq({ headers: { 'x-internal-service-key': 'good-key' } } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requireInternal(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.principal).toBe(internalPrincipal);
    expect(resolver).toHaveBeenCalledWith('good-key');
    expect(state.statusCode).toBeUndefined();
  });
});

// --- requirePermission -----------------------------------------------------

describe('requirePermission', () => {
  it('401 when no principal is attached', () => {
    const mw = makeMw({ evaluator: makeEvaluator({ allows: true }) });
    const req = makeReq();
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requirePermission('run:create')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
    expect(errorCodeOf(state)).toBe('AUTH_REQUIRED');
  });

  it('401 for an anonymous principal', () => {
    const mw = makeMw({ evaluator: makeEvaluator({ allows: true }) });
    const req = makeReq({ principal: anon() } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requirePermission('run:create')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
  });

  it('no evaluator + internal/admin principal → next (trusted bypass)', () => {
    const mw = makeMw({ evaluator: undefined });
    const req = makeReq({ principal: makePrincipal({ kind: 'internal' }) } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requirePermission('run:create')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBeUndefined();
  });

  it('FAIL-CLOSED: no evaluator + ordinary principal → 503 (deny-by-default when RBAC unwired)', () => {
    const mw = makeMw({ evaluator: undefined });
    const req = makeReq({ principal: makePrincipal({ scopes: ['read', 'write'] }) } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requirePermission('run:create')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(503);
    expect(errorCodeOf(state)).toBe('SERVICE_UNAVAILABLE');
  });

  it('evaluator allows → next', async () => {
    const mw = makeMw({ evaluator: makeEvaluator({ allows: true }) });
    const req = makeReq({ principal: makePrincipal() } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requirePermission('run:create')(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBeUndefined();
  });

  it('evaluator denies → 403 AUTHZ_PROJECT_ACCESS_DENIED', async () => {
    const mw = makeMw({ evaluator: makeEvaluator({ allows: false }) });
    const req = makeReq({ principal: makePrincipal() } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requirePermission('run:create')(req, res, next);
    await flush();

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(403);
    expect(errorCodeOf(state)).toBe('AUTHZ_PROJECT_ACCESS_DENIED');
  });

  it('FAIL-CLOSED: evaluator rejects → AUTHZ_SERVICE_ERROR, never an allow', async () => {
    const mw = makeMw({ evaluator: makeEvaluator({ rejects: new Error('rbac backend down') }) });
    const req = makeReq({ principal: makePrincipal() } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.requirePermission('run:create')(req, res, next);
    await flush();

    expect(next).not.toHaveBeenCalled();
    expect(errorCodeOf(state)).toBe('AUTHZ_SERVICE_ERROR');
    expect(state.statusCode).toBe(503);
  });
});

// --- verifyOrgAccess -------------------------------------------------------

describe('verifyOrgAccess', () => {
  it('401 when no principal is attached', () => {
    const mw = makeMw();
    const req = makeReq({ params: { orgId: 'org-1' } } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.verifyOrgAccess()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
  });

  it('401 for an anonymous principal', () => {
    const mw = makeMw();
    const req = makeReq({ principal: anon(), params: { orgId: 'org-1' } } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.verifyOrgAccess()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(401);
  });

  it('pass-through: next() when the route carries no target org', () => {
    const mw = makeMw();
    const req = makeReq({ principal: makePrincipal({ orgId: 'org-a' }), params: {} } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.verifyOrgAccess()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBeUndefined();
  });

  it('internal/admin bypass → next() even on an org mismatch', () => {
    const mw = makeMw();
    const req = makeReq({
      principal: makePrincipal({ kind: 'internal', orgId: 'other-org' }),
      params: { orgId: 'org-target' },
    } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.verifyOrgAccess()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBeUndefined();
  });

  it('next() when the principal org matches the target org', () => {
    const mw = makeMw();
    const req = makeReq({
      principal: makePrincipal({ orgId: 'org-match' }),
      params: { orgId: 'org-match' },
    } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.verifyOrgAccess()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBeUndefined();
  });

  it('FAIL-CLOSED: 403 when the principal org differs from the target org', () => {
    const mw = makeMw();
    const req = makeReq({
      principal: makePrincipal({ orgId: 'org-a' }),
      params: { orgId: 'org-b' },
    } as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.verifyOrgAccess()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(403);
    expect(errorCodeOf(state)).toBe('AUTHZ_PROJECT_ACCESS_DENIED');
  });

  it('target defaults to req.params.orgId, then falls back to req.params.id', () => {
    const mw = makeMw();
    // No orgId param → falls back to `id`, which matches → next().
    const okReq = makeReq({
      principal: makePrincipal({ orgId: 'org-x' }),
      params: { id: 'org-x' },
    } as Partial<Request>);
    const ok = makeRes();
    const okNext = vi.fn<NextFunction>();
    mw.verifyOrgAccess()(okReq, ok.res, okNext);
    expect(okNext).toHaveBeenCalledTimes(1);

    // `id` fallback that does NOT match → 403.
    const badReq = makeReq({
      principal: makePrincipal({ orgId: 'org-x' }),
      params: { id: 'org-y' },
    } as Partial<Request>);
    const bad = makeRes();
    const badNext = vi.fn<NextFunction>();
    mw.verifyOrgAccess()(badReq, bad.res, badNext);
    expect(badNext).not.toHaveBeenCalled();
    expect(bad.state.statusCode).toBe(403);
  });

  it('honors a custom orgIdOf extractor over req.params', () => {
    const mw = makeMw();
    const req = makeReq({
      principal: makePrincipal({ orgId: 'org-body' }),
      params: { orgId: 'org-param' },
      body: { organization: 'org-body' },
    } as unknown as Partial<Request>);
    const { res, state } = makeRes();
    const next = vi.fn<NextFunction>();

    mw.verifyOrgAccess((r) => (r as { body?: { organization?: string } }).body?.organization)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBeUndefined();
  });
});
