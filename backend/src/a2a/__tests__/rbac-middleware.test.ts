/**
 * @module rbac-middleware.test
 *
 * Test suite for A2A RBAC middleware: identity extraction, authentication
 * enforcement, permission checking, and role gating.
 *
 * P18-002: A2A auth middleware (identity + enforcement)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractA2AIdentity,
  requireA2AAuth,
  requireA2APermission,
  requireA2ARole,
} from '../rbac.middleware';
import {
  getA2ARBACService,
  resetA2ARBACService,
} from '../rbac.service';
import { A2AErrorCodeEnum } from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeMockReq(overrides?: { headers?: Record<string, string> }): any {
  return { headers: overrides?.headers ?? {}, a2aPrincipal: undefined };
}

function makeMockRes(): any {
  const res: any = {
    _status: 200,
    _data: null as any,
    status(code: number) { res._status = code; return res; },
    json(data: any) { res._data = data; return res; },
  };
  return res;
}

function makeMockNext(): any {
  return vi.fn();
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

/**
 * Registers two test principals:
 * - 'admin-agent' with role 'admin', API key 'key-admin'
 * - 'viewer-agent' with role 'viewer', API key 'key-viewer'
 * - 'operator-agent' with role 'operator' (no API key, used via Bearer/x-agent-id)
 */
function seedRBAC(): void {
  const rbac = getA2ARBACService();
  rbac.assignRole('admin-agent', 'admin');
  rbac.registerApiKey('key-admin', 'admin-agent');
  rbac.assignRole('viewer-agent', 'viewer');
  rbac.registerApiKey('key-viewer', 'viewer-agent');
  rbac.assignRole('operator-agent', 'operator');
}

// ===========================================================================
// extractA2AIdentity
// ===========================================================================

describe('extractA2AIdentity', () => {
  beforeEach(() => {
    resetA2ARBACService();
    seedRBAC();
  });

  it('resolves identity from x-api-key header', () => {
    const req = makeMockReq({ headers: { 'x-api-key': 'key-admin' } });
    const res = makeMockRes();
    const next = makeMockNext();

    extractA2AIdentity(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.a2aPrincipal).toEqual({ id: 'admin-agent', role: 'admin' });
  });

  it('resolves identity from Bearer token', () => {
    const req = makeMockReq({ headers: { authorization: 'Bearer operator-agent' } });
    const res = makeMockRes();
    const next = makeMockNext();

    extractA2AIdentity(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.a2aPrincipal).toEqual({ id: 'operator-agent', role: 'operator' });
  });

  it('resolves identity from x-agent-id header', () => {
    const req = makeMockReq({ headers: { 'x-agent-id': 'viewer-agent' } });
    const res = makeMockRes();
    const next = makeMockNext();

    extractA2AIdentity(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.a2aPrincipal).toEqual({ id: 'viewer-agent', role: 'viewer' });
  });

  it('sets undefined for no auth headers and still calls next', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    extractA2AIdentity(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.a2aPrincipal).toBeUndefined();
  });

  it('prioritizes x-api-key over Bearer token and x-agent-id', () => {
    const req = makeMockReq({
      headers: {
        'x-api-key': 'key-admin',
        authorization: 'Bearer operator-agent',
        'x-agent-id': 'viewer-agent',
      },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    extractA2AIdentity(req, res, next);

    expect(next).toHaveBeenCalled();
    // Should resolve to admin-agent via x-api-key, not operator or viewer
    expect(req.a2aPrincipal).toEqual({ id: 'admin-agent', role: 'admin' });
  });

  it('falls back to Bearer when x-api-key is invalid', () => {
    const req = makeMockReq({
      headers: {
        'x-api-key': 'invalid-key',
        authorization: 'Bearer operator-agent',
      },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    extractA2AIdentity(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.a2aPrincipal).toEqual({ id: 'operator-agent', role: 'operator' });
  });

  it('falls back to x-agent-id when x-api-key and Bearer are invalid', () => {
    const req = makeMockReq({
      headers: {
        'x-api-key': 'invalid-key',
        authorization: 'Bearer unknown-agent',
        'x-agent-id': 'admin-agent',
      },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    extractA2AIdentity(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.a2aPrincipal).toEqual({ id: 'admin-agent', role: 'admin' });
  });

  it('sets undefined when all auth headers are invalid', () => {
    const req = makeMockReq({
      headers: {
        'x-api-key': 'bad-key',
        authorization: 'Bearer unknown-principal',
        'x-agent-id': 'nonexistent-agent',
      },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    extractA2AIdentity(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.a2aPrincipal).toBeUndefined();
  });
});

// ===========================================================================
// requireA2AAuth
// ===========================================================================

describe('requireA2AAuth', () => {
  it('passes when principal exists', () => {
    const req = makeMockReq();
    req.a2aPrincipal = { id: 'admin-agent', role: 'admin' };
    const res = makeMockRes();
    const next = makeMockNext();

    requireA2AAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(200);
  });

  it('returns 401 when no principal', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    requireA2AAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._data.success).toBe(false);
    expect(res._data.error.code).toBe(A2AErrorCodeEnum.AuthenticationFailed);
  });
});

// ===========================================================================
// requireA2APermission
// ===========================================================================

describe('requireA2APermission', () => {
  beforeEach(() => {
    resetA2ARBACService();
    seedRBAC();
  });

  it('passes for allowed action', () => {
    const req = makeMockReq();
    req.a2aPrincipal = { id: 'admin-agent', role: 'admin' };
    const res = makeMockRes();
    const next = makeMockNext();

    const middleware = requireA2APermission('tasks', 'create');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(200);
  });

  it('returns 403 for denied action', () => {
    const req = makeMockReq();
    req.a2aPrincipal = { id: 'viewer-agent', role: 'viewer' };
    const res = makeMockRes();
    const next = makeMockNext();

    // Viewers should not be able to create tasks
    const middleware = requireA2APermission('tasks', 'create');
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._data.success).toBe(false);
    expect(res._data.error.code).toBe(A2AErrorCodeEnum.AuthorizationDenied);
    expect(res._data.error.details.resource).toBe('tasks');
    expect(res._data.error.details.action).toBe('create');
  });

  it('returns 401 if no principal is set', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    const middleware = requireA2APermission('tasks', 'read');
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._data.error.code).toBe(A2AErrorCodeEnum.AuthenticationFailed);
  });
});

// ===========================================================================
// requireA2ARole
// ===========================================================================

describe('requireA2ARole', () => {
  it('passes when role matches', () => {
    const req = makeMockReq();
    req.a2aPrincipal = { id: 'admin-agent', role: 'admin' };
    const res = makeMockRes();
    const next = makeMockNext();

    const middleware = requireA2ARole('admin');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(200);
  });

  it('returns 403 when role does not match', () => {
    const req = makeMockReq();
    req.a2aPrincipal = { id: 'viewer-agent', role: 'viewer' };
    const res = makeMockRes();
    const next = makeMockNext();

    const middleware = requireA2ARole('admin');
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._data.success).toBe(false);
    expect(res._data.error.code).toBe(A2AErrorCodeEnum.AuthorizationDenied);
    expect(res._data.error.details.current_role).toBe('viewer');
    expect(res._data.error.details.required_roles).toEqual(['admin']);
  });

  it('accepts multiple allowed roles', () => {
    const req = makeMockReq();
    req.a2aPrincipal = { id: 'operator-agent', role: 'operator' };
    const res = makeMockRes();
    const next = makeMockNext();

    const middleware = requireA2ARole('admin', 'operator');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(200);
  });

  it('returns 403 when role is not in multiple-role list', () => {
    const req = makeMockReq();
    req.a2aPrincipal = { id: 'viewer-agent', role: 'viewer' };
    const res = makeMockRes();
    const next = makeMockNext();

    const middleware = requireA2ARole('admin', 'operator');
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._data.error.details.required_roles).toEqual(['admin', 'operator']);
  });

  it('returns 401 if no principal is set', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const next = makeMockNext();

    const middleware = requireA2ARole('admin');
    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._data.error.code).toBe(A2AErrorCodeEnum.AuthenticationFailed);
  });
});

// ===========================================================================
// Integration: full middleware chain
// ===========================================================================

describe('Integration: extract + requireAuth + requirePermission chain', () => {
  beforeEach(() => {
    resetA2ARBACService();
    seedRBAC();
  });

  it('end-to-end: authenticated admin passes all gates', () => {
    const req = makeMockReq({ headers: { 'x-api-key': 'key-admin' } });
    const res = makeMockRes();
    const nextExtract = makeMockNext();

    // Step 1: extract
    extractA2AIdentity(req, res, nextExtract);
    expect(nextExtract).toHaveBeenCalled();
    expect(req.a2aPrincipal).toEqual({ id: 'admin-agent', role: 'admin' });

    // Step 2: requireAuth
    const nextAuth = makeMockNext();
    requireA2AAuth(req, res, nextAuth);
    expect(nextAuth).toHaveBeenCalled();

    // Step 3: requirePermission
    const nextPerm = makeMockNext();
    const permMiddleware = requireA2APermission('tasks', 'create');
    permMiddleware(req, res, nextPerm);
    expect(nextPerm).toHaveBeenCalled();

    // Step 4: requireRole
    const nextRole = makeMockNext();
    const roleMiddleware = requireA2ARole('admin', 'operator');
    roleMiddleware(req, res, nextRole);
    expect(nextRole).toHaveBeenCalled();

    // Response should not have been touched
    expect(res._status).toBe(200);
  });

  it('end-to-end: unauthenticated request is stopped at requireAuth', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    const nextExtract = makeMockNext();

    // Step 1: extract (no headers)
    extractA2AIdentity(req, res, nextExtract);
    expect(nextExtract).toHaveBeenCalled();
    expect(req.a2aPrincipal).toBeUndefined();

    // Step 2: requireAuth -- should reject
    const nextAuth = makeMockNext();
    requireA2AAuth(req, res, nextAuth);
    expect(nextAuth).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._data.error.code).toBe(A2AErrorCodeEnum.AuthenticationFailed);
  });

  it('end-to-end: viewer is stopped at permission check for write action', () => {
    const req = makeMockReq({ headers: { 'x-api-key': 'key-viewer' } });
    const res = makeMockRes();
    const nextExtract = makeMockNext();

    // Step 1: extract
    extractA2AIdentity(req, res, nextExtract);
    expect(nextExtract).toHaveBeenCalled();
    expect(req.a2aPrincipal?.role).toBe('viewer');

    // Step 2: requireAuth -- passes
    const nextAuth = makeMockNext();
    requireA2AAuth(req, res, nextAuth);
    expect(nextAuth).toHaveBeenCalled();

    // Step 3: requirePermission -- viewer cannot create tasks
    const nextPerm = makeMockNext();
    const permMiddleware = requireA2APermission('tasks', 'create');
    permMiddleware(req, res, nextPerm);
    expect(nextPerm).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    expect(res._data.error.code).toBe(A2AErrorCodeEnum.AuthorizationDenied);
  });
});
