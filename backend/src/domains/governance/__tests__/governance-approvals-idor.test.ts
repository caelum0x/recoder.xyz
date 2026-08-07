/**
 * Cross-tenant IDOR guard for the governance HTTP edges (approvals + work locks).
 *
 * The vulns these close: the `/api/agent-os` approvals + locks surface
 * authenticated the caller but never scoped the ACTOR/OWNER to the principal, so
 * any authed tenant could:
 *  1. decide (approve/deny) ANOTHER tenant's approval (self-clear a gate / DoS);
 *  2. list EVERY tenant's approvals (unscoped);
 *  3. release ANOTHER tenant's work lock (holderAgentId read from the body);
 *  4. forge a work lock under a FOREIGN holder (holderAgentId from the body);
 *  5. enumerate EVERY tenant's work locks (unscoped).
 *
 * Mirrors the MCP twins (governance_approval_decide / governance_release_lock /
 * governance-write-tools resolveActor / governance-engine resolveLockHolderScope):
 * a non-privileged caller may only act as / see ITS OWN subject; admin/internal
 * may target any; RECODER_SOLO_MODE (single local user) fails OPEN.
 *
 * Proven at both the pure-predicate level and the ROUTE boundary.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { ApprovalService } from '../services/approval.service.js';
import type { WorkLockService } from '../services/work-lock.service.js';
import type { ApprovalRecord, WorkLock } from '../types.js';
import { buildGovernanceApprovalsRouter } from '../routes/governance-approvals.routes.js';
import {
  canDecideApproval,
  isPrivilegedPrincipal,
  resolveOwnerScope,
} from '../routes/governance-access.js';

function principal(userId: string, over: Partial<Principal> = {}): Principal {
  return {
    userId,
    scopes: ['read', 'write'],
    kind: 'session',
    isAnonymous: false,
    raw: null,
    ...over,
  };
}

const ADMIN = principal('op', { scopes: ['admin'] });
const SOLO = principal('recoder-solo-owner', { scopes: [] });

// --- pure predicates ---------------------------------------------------------

describe('governance-access predicates', () => {
  const cloud = { soloMode: false };

  it('isPrivilegedPrincipal: admin/internal scope or internal kind only', () => {
    expect(isPrivilegedPrincipal(principal('u', { scopes: ['admin'] }))).toBe(true);
    expect(isPrivilegedPrincipal(principal('u', { scopes: ['internal'] }))).toBe(true);
    expect(isPrivilegedPrincipal(principal('u', { kind: 'internal', scopes: [] }))).toBe(true);
    expect(isPrivilegedPrincipal(principal('u', { scopes: ['read', 'write'] }))).toBe(false);
  });

  it('canDecideApproval: owner (requestedBy) + admin + solo allowed; foreign denied', () => {
    const appr = { requestedBy: 'user_a' };
    expect(canDecideApproval(principal('user_a'), appr, cloud)).toBe(true); // owner
    expect(canDecideApproval(principal('user_b'), appr, cloud)).toBe(false); // foreign
    expect(canDecideApproval(ADMIN, appr, cloud)).toBe(true); // admin
    expect(canDecideApproval(principal('user_b'), appr, { soloMode: true })).toBe(true); // solo fail-open
    expect(canDecideApproval(principal('nobody', { isAnonymous: true }), appr, cloud)).toBe(false);
  });

  it('resolveOwnerScope: forces own id for non-priv; honours request for priv/solo', () => {
    expect(resolveOwnerScope(principal('user_b'), 'user_a', cloud)).toBe('user_b'); // forced
    expect(resolveOwnerScope(principal('user_b'), undefined, cloud)).toBe('user_b'); // forced
    expect(resolveOwnerScope(ADMIN, 'user_a', cloud)).toBe('user_a'); // honoured
    expect(resolveOwnerScope(ADMIN, undefined, cloud)).toBeUndefined(); // list all
    expect(resolveOwnerScope(principal('user_b'), 'user_a', { soloMode: true })).toBe('user_a'); // solo honours
    expect(resolveOwnerScope(SOLO, undefined, { soloMode: true })).toBeUndefined(); // solo list all
  });
});

// --- route boundary ----------------------------------------------------------

interface FakeState {
  approvals: ApprovalRecord[];
  locks: WorkLock[];
}

function makeApprovals(state: FakeState): ApprovalService {
  return {
    async get(id: string) {
      return state.approvals.find((a) => a.id === id) ?? null;
    },
    async decide(id: string, params: { decision: string; decidedBy: string }) {
      const rec = state.approvals.find((a) => a.id === id && a.status === 'pending');
      if (!rec) throw Object.assign(new Error('no pending approval with that id'), { statusCode: 404 });
      const next = { ...rec, status: params.decision, decidedBy: params.decidedBy };
      state.approvals = state.approvals.map((a) => (a.id === id ? next : a));
      return next;
    },
    async list(query: { requestedBy?: string } = {}) {
      return state.approvals.filter(
        (a) => query.requestedBy == null || a.requestedBy === query.requestedBy,
      );
    },
    async request(params: { requestedBy: string }) {
      const rec = {
        id: `appr_${state.approvals.length + 1}`,
        action: 'x',
        riskTier: 'low',
        status: 'pending',
        requestedBy: params.requestedBy,
        createdAt: new Date().toISOString(),
      } as unknown as ApprovalRecord;
      state.approvals = [...state.approvals, rec];
      return rec;
    },
  } as unknown as ApprovalService;
}

function makeWorkLocks(state: FakeState): WorkLockService {
  return {
    async acquire(params: { resourcePath: string; holderAgentId: string; mode: string }) {
      const lock = {
        id: `lock_${state.locks.length + 1}`,
        resourcePath: params.resourcePath,
        holderAgentId: params.holderAgentId,
        mode: params.mode,
        acquiredAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      } as unknown as WorkLock;
      state.locks = [...state.locks, lock];
      return { acquired: true, lock };
    },
    async release(id: string, holderAgentId: string) {
      const idx = state.locks.findIndex((l) => l.id === id && l.holderAgentId === holderAgentId);
      if (idx < 0) return false;
      state.locks = state.locks.filter((l) => l.id !== id);
      return true;
    },
    async listActive(query: { holderAgentId?: string } = {}) {
      return state.locks.filter(
        (l) => query.holderAgentId == null || l.holderAgentId === query.holderAgentId,
      );
    },
  } as unknown as WorkLockService;
}

interface Harness {
  base: string;
  close: () => Promise<void>;
  setPrincipal: (p: Principal) => void;
  state: FakeState;
}

function serve(initial: FakeState, opts: { soloMode: boolean }): Promise<Harness> {
  const state: FakeState = { approvals: [...initial.approvals], locks: [...initial.locks] };
  let current: Principal = principal('user_a');
  const inject: RequestHandler = (req, _res, next) => {
    (req as unknown as { principal: Principal }).principal = current;
    next();
  };
  const middleware = {
    authenticate: inject,
    authenticateMutating: inject,
    requireAdmin: inject,
    requireInternal: inject,
    requirePermission: () => inject,
    verifyOrgAccess: () => inject,
  } as unknown as AuthMiddleware;

  const app = express();
  app.use(express.json());
  app.use(
    '/api/agent-os',
    buildGovernanceApprovalsRouter({
      approvals: makeApprovals(state),
      workLocks: makeWorkLocks(state),
      middleware,
      soloMode: opts.soloMode,
    }),
  );
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        setPrincipal: (p) => {
          current = p;
        },
        state,
      });
    });
  });
}

function request(
  base: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${path}`);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'content-type': 'application/json',
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json: unknown = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = data;
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function appr(id: string, requestedBy: string): ApprovalRecord {
  return {
    id,
    action: 'branch.push',
    riskTier: 'high',
    status: 'pending',
    requestedBy,
    createdAt: new Date().toISOString(),
  } as unknown as ApprovalRecord;
}

function lock(id: string, holderAgentId: string): WorkLock {
  return {
    id,
    resourcePath: `/repo/${id}`,
    holderAgentId,
    mode: 'exclusive',
    acquiredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as WorkLock;
}

const A = () => principal('user_a');
const B = () => principal('user_b');

describe('POST /approvals/:id/decide — decider authorization (fix 1)', () => {
  const seed = () => ({ approvals: [appr('appr_a', 'user_a')], locks: [] });

  it('tenant B is denied on A\'s approval (404 no-oracle) and does NOT mutate it', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(B());
    const res = await request(h.base, 'POST', '/api/agent-os/approvals/appr_a/decide', { decision: 'approved' });
    expect(res.status).toBe(404);
    expect(h.state.approvals[0].status).toBe('pending'); // untouched
    await h.close();
  });

  it('owner A may decide their own approval', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(A());
    const res = await request(h.base, 'POST', '/api/agent-os/approvals/appr_a/decide', { decision: 'approved' });
    expect(res.status).toBe(200);
    expect(res.json.data.approval.status).toBe('approved');
    expect(res.json.data.approval.decidedBy).toBe('user_a');
    await h.close();
  });

  it('admin may decide any approval', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(ADMIN);
    const res = await request(h.base, 'POST', '/api/agent-os/approvals/appr_a/decide', { decision: 'denied' });
    expect(res.status).toBe(200);
    expect(res.json.data.approval.status).toBe('denied');
    await h.close();
  });

  it('solo mode fails open (any local caller may decide)', async () => {
    const h = await serve(seed(), { soloMode: true });
    h.setPrincipal(SOLO);
    const res = await request(h.base, 'POST', '/api/agent-os/approvals/appr_a/decide', { decision: 'approved' });
    expect(res.status).toBe(200);
    await h.close();
  });

  it('a genuinely absent approval is the SAME 404', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(A());
    const res = await request(h.base, 'POST', '/api/agent-os/approvals/nope/decide', { decision: 'approved' });
    expect(res.status).toBe(404);
    await h.close();
  });
});

describe('GET /approvals/:id — single-read owner scoping (fix 3)', () => {
  const seed = () => ({ approvals: [appr('appr_a', 'user_a')], locks: [] });

  it('tenant B is denied reading A\'s approval (404 no-oracle, no cross-tenant read)', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(B());
    const res = await request(h.base, 'GET', '/api/agent-os/approvals/appr_a');
    expect(res.status).toBe(404);
    await h.close();
  });

  it('owner A may read their own approval', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(A());
    const res = await request(h.base, 'GET', '/api/agent-os/approvals/appr_a');
    expect(res.status).toBe(200);
    expect(res.json.data.approval.id).toBe('appr_a');
    await h.close();
  });

  it('admin may read any approval', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(ADMIN);
    const res = await request(h.base, 'GET', '/api/agent-os/approvals/appr_a');
    expect(res.status).toBe(200);
    await h.close();
  });

  it('a genuinely absent approval is the SAME 404 (no existence oracle)', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(B());
    const res = await request(h.base, 'GET', '/api/agent-os/approvals/nope');
    expect(res.status).toBe(404);
    await h.close();
  });
});

describe('GET /approvals — list scoping (fix 2)', () => {
  const seed = () => ({
    approvals: [appr('appr_a', 'user_a'), appr('appr_b', 'user_b')],
    locks: [],
  });

  it('non-admin B sees ONLY its own approvals (forced requestedBy)', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(B());
    const res = await request(h.base, 'GET', '/api/agent-os/approvals');
    expect(res.status).toBe(200);
    expect(res.json.data.approvals.map((a: ApprovalRecord) => a.id)).toEqual(['appr_b']);
    await h.close();
  });

  it('non-admin B cannot widen scope via ?requestedBy=user_a', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(B());
    const res = await request(h.base, 'GET', '/api/agent-os/approvals?requestedBy=user_a');
    expect(res.json.data.approvals.map((a: ApprovalRecord) => a.id)).toEqual(['appr_b']);
    await h.close();
  });

  it('admin lists all tenants', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(ADMIN);
    const res = await request(h.base, 'GET', '/api/agent-os/approvals');
    expect(res.json.data.approvals.map((a: ApprovalRecord) => a.id).sort()).toEqual(['appr_a', 'appr_b']);
    await h.close();
  });

  it('solo mode lists all', async () => {
    const h = await serve(seed(), { soloMode: true });
    h.setPrincipal(SOLO);
    const res = await request(h.base, 'GET', '/api/agent-os/approvals');
    expect(res.json.data.approvals).toHaveLength(2);
    await h.close();
  });
});

describe('DELETE /locks/:id — release scoping (fix 3)', () => {
  const seed = () => ({ approvals: [], locks: [lock('lock_a', 'user_a')] });

  it('tenant B cannot release A\'s lock even by naming A in the body (404)', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(B());
    const res = await request(h.base, 'DELETE', '/api/agent-os/locks/lock_a', { holderAgentId: 'user_a' });
    expect(res.status).toBe(404);
    expect(h.state.locks).toHaveLength(1); // still held by A
    await h.close();
  });

  it('owner A releases its own lock', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(A());
    const res = await request(h.base, 'DELETE', '/api/agent-os/locks/lock_a');
    expect(res.status).toBe(200);
    expect(h.state.locks).toHaveLength(0);
    await h.close();
  });

  it('admin may release another holder\'s lock via explicit holderAgentId', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(ADMIN);
    const res = await request(h.base, 'DELETE', '/api/agent-os/locks/lock_a', { holderAgentId: 'user_a' });
    expect(res.status).toBe(200);
    expect(h.state.locks).toHaveLength(0);
    await h.close();
  });

  it('solo mode fails open (may release any holder\'s lock)', async () => {
    const h = await serve(seed(), { soloMode: true });
    h.setPrincipal(SOLO);
    const res = await request(h.base, 'DELETE', '/api/agent-os/locks/lock_a', { holderAgentId: 'user_a' });
    expect(res.status).toBe(200);
    await h.close();
  });
});

describe('POST /locks — holder binding (fix 4)', () => {
  const seed = () => ({ approvals: [], locks: [] });

  it('non-priv B cannot forge a lock under a foreign holder', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(B());
    const res = await request(h.base, 'POST', '/api/agent-os/locks', {
      resourcePath: '/repo/x',
      holderAgentId: 'user_a',
    });
    expect(res.status).toBe(201);
    expect(res.json.data.lock.holderAgentId).toBe('user_b'); // bound to caller, NOT forged
    await h.close();
  });

  it('admin may set an explicit foreign holder', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(ADMIN);
    const res = await request(h.base, 'POST', '/api/agent-os/locks', {
      resourcePath: '/repo/x',
      holderAgentId: 'user_a',
    });
    expect(res.json.data.lock.holderAgentId).toBe('user_a');
    await h.close();
  });

  it('solo mode fails open (explicit holder honoured)', async () => {
    const h = await serve(seed(), { soloMode: true });
    h.setPrincipal(SOLO);
    const res = await request(h.base, 'POST', '/api/agent-os/locks', {
      resourcePath: '/repo/x',
      holderAgentId: 'user_a',
    });
    expect(res.json.data.lock.holderAgentId).toBe('user_a');
    await h.close();
  });
});

describe('GET /locks — list scoping (fix 5)', () => {
  const seed = () => ({
    approvals: [],
    locks: [lock('lock_a', 'user_a'), lock('lock_b', 'user_b')],
  });

  it('non-admin B sees ONLY its own locks (forced holderAgentId)', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(B());
    const res = await request(h.base, 'GET', '/api/agent-os/locks');
    expect(res.json.data.locks.map((l: WorkLock) => l.id)).toEqual(['lock_b']);
    await h.close();
  });

  it('non-admin B cannot widen scope via ?holderAgentId=user_a', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(B());
    const res = await request(h.base, 'GET', '/api/agent-os/locks?holderAgentId=user_a');
    expect(res.json.data.locks.map((l: WorkLock) => l.id)).toEqual(['lock_b']);
    await h.close();
  });

  it('admin lists all holders', async () => {
    const h = await serve(seed(), { soloMode: false });
    h.setPrincipal(ADMIN);
    const res = await request(h.base, 'GET', '/api/agent-os/locks');
    expect(res.json.data.locks.map((l: WorkLock) => l.id).sort()).toEqual(['lock_a', 'lock_b']);
    await h.close();
  });

  it('solo mode lists all', async () => {
    const h = await serve(seed(), { soloMode: true });
    h.setPrincipal(SOLO);
    const res = await request(h.base, 'GET', '/api/agent-os/locks');
    expect(res.json.data.locks).toHaveLength(2);
    await h.close();
  });
});
