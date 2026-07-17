/**
 * Cloud routes — fleet heartbeat ingest (INTERNAL) + custom-domains CRUD edges.
 *
 * Proves:
 *  - POST /fleet/heartbeat is INTERNAL-gated; a fresh beat upserts an `up` node,
 *    and a `null` from the supervisor (store down) surfaces as a truthful 503
 *    (never a faked persisted node).
 *  - POST /fleet/register upserts a node (201).
 *  - Domain CRUD passes the governance decide→audit seam: a `deny` blocks the
 *    write (403, no mutation, no audit); an `allow` writes + seals; verify + list
 *    + delete are wired.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type RequestHandler } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildCloudRouter, type CloudRouterDeps } from '../routes/cloud.routes.js';
import type { CloudGovernanceGatePort, GateVerdict } from '../ports/governance-gate.port.js';
import type { TenancyService } from '../services/tenancy.service.js';
import type { SandboxProvisionerService } from '../services/sandbox-provisioner.service.js';
import type { PreviewDeployService } from '../services/preview-deploy.service.js';
import type { MeshDiagnosticsService } from '../services/mesh-diagnostics.service.js';
import type { FleetSupervisorService } from '../services/fleet-supervisor.service.js';
import type { DomainsService } from '../services/domains.service.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { Tenant, FleetNode, DomainRecord } from '../types.js';
import { ok, err } from '../../../shared/result.js';
import { createError, ErrorCode } from '../../../shared/errors.js';

const principal = { userId: 'tester', isAnonymous: false } as unknown as Principal;
const internalPrincipal = { userId: 'svc', isAnonymous: false, kind: 'internal' } as unknown as Principal;

const tenant: Tenant = {
  id: 'ten_1', orgId: null, ownerUserId: 'tester', tier: 'cloud', isolationLevel: 'shared', region: 'eu',
  quota: { maxSandboxes: 5, maxConcurrent: 2, maxPreview: 3, cpuMillis: 1000, memMb: 1024 },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const node: FleetNode = {
  id: 'node_1', tenantId: null, kind: 'sandbox', status: 'up',
  capacity: { slotsTotal: 10, slotsUsed: 1, cpuMillis: 4000, memMb: 8192 },
  manifest: {}, lastSeen: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
};

const domainRecord: DomainRecord = {
  id: 'dom_1', tenantId: 'ten_1', hostname: 'app.example.com', verificationStatus: 'pending',
  dnsRecords: [{ type: 'TXT', name: '_recoder-challenge.app.example.com', value: 'recoder-verify=x' }],
  tlsStatus: 'none', createdAt: '2026-01-01T00:00:00.000Z',
};

function verdict(effect: GateVerdict['effect']): GateVerdict {
  return {
    verdictId: 'v', requestId: 'r', effect, tier: 'medium',
    reason: effect === 'allow' ? 'ok' : 'blocked', degraded: false, engine: 'napi',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const passAuth: RequestHandler = (req, _res, next) => { req.principal = principal; next(); };
const okInternal: RequestHandler = (req, _res, next) => { req.principal = internalPrincipal; next(); };

const tenancy = {
  resolve: vi.fn(async () => ok(tenant)),
  ensure: vi.fn(async () => ok(tenant)),
} as unknown as TenancyService;

const provisioner = {} as unknown as SandboxProvisionerService;
const preview = {} as unknown as PreviewDeployService;
const mesh = {} as unknown as MeshDiagnosticsService;

const fleet = {
  list: vi.fn(async () => []),
  heartbeat: vi.fn(async () => node),
  register: vi.fn(async () => node),
} as unknown as FleetSupervisorService;

const domains = {
  add: vi.fn(async () => ok(domainRecord)),
  list: vi.fn(async () => [domainRecord]),
  get: vi.fn(async () => ok(domainRecord)),
  verify: vi.fn(async () => ok({ ...domainRecord, verificationStatus: 'verified', tlsStatus: 'active' })),
  remove: vi.fn(async () => ok({ id: 'dom_1', removed: true })),
} as unknown as DomainsService;

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as CloudRouterDeps['logger'];

function makeGate(over: Partial<CloudGovernanceGatePort> = {}): CloudGovernanceGatePort {
  return {
    decide: vi.fn(async () => verdict('allow')),
    recordAudit: vi.fn(async () => ({ id: 'aud_1' })),
    ...over,
  } as unknown as CloudGovernanceGatePort;
}

interface Harness { base: string; close: () => Promise<void>; }

async function listen(gate: CloudGovernanceGatePort | undefined, internal: RequestHandler = okInternal): Promise<Harness> {
  const mw = { authenticate: passAuth, authenticateMutating: passAuth, requireInternal: internal } as unknown as AuthMiddleware;
  const app = express();
  app.use(express.json());
  app.use('/cloud', buildCloudRouter({
    tenancy, provisioner, preview, mesh, fleet, domains, mw, logger,
    ...(gate ? { gate } : {}),
    activePreviewCount: async () => 0,
  }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}

function request(base: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const payload = init.body === undefined ? undefined : JSON.stringify(init.body);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: init.method ?? 'GET', headers: payload === undefined ? {} : { 'content-type': 'application/json' } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => { const t = Buffer.concat(chunks).toString('utf8'); resolve({ status: res.statusCode ?? 0, body: t ? JSON.parse(t) : {} }); });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

beforeEach(() => vi.clearAllMocks());

describe('fleet heartbeat ingest (internal)', () => {
  const cap = { slotsTotal: 10, slotsUsed: 1, cpuMillis: 4000, memMb: 8192 };

  it('records a heartbeat and returns the up node', async () => {
    const h = await listen(makeGate());
    try {
      const res = await request(h.base, '/cloud/fleet/heartbeat', { method: 'POST', body: { id: 'node_1', kind: 'sandbox', capacity: cap } });
      expect(res.status).toBe(200);
      expect(fleet.heartbeat).toHaveBeenCalledWith('node_1', 'sandbox', cap, null);
      expect((res.body.data as FleetNode).status).toBe('up');
    } finally { await h.close(); }
  });

  it('surfaces a store-down heartbeat as a truthful 503 (never a fake node)', async () => {
    (fleet.heartbeat as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const h = await listen(makeGate());
    try {
      const res = await request(h.base, '/cloud/fleet/heartbeat', { method: 'POST', body: { id: 'node_1', kind: 'sandbox', capacity: cap } });
      expect(res.status).toBe(503);
      expect((res.body.error as Record<string, unknown>).code).toBe('SERVICE_UNAVAILABLE');
    } finally { await h.close(); }
  });

  it('rejects a malformed heartbeat body with 400', async () => {
    const h = await listen(makeGate());
    try {
      const res = await request(h.base, '/cloud/fleet/heartbeat', { method: 'POST', body: { id: 'node_1', kind: 'bogus', capacity: cap } });
      expect(res.status).toBe(400);
      expect(fleet.heartbeat).not.toHaveBeenCalled();
    } finally { await h.close(); }
  });

  it('is INTERNAL-gated — a rejecting internal guard blocks the beat (401)', async () => {
    const deny: RequestHandler = (_req, res) => res.status(401).json({ error: { code: 'AUTH_REQUIRED' } });
    const h = await listen(makeGate(), deny);
    try {
      const res = await request(h.base, '/cloud/fleet/heartbeat', { method: 'POST', body: { id: 'node_1', kind: 'sandbox', capacity: cap } });
      expect(res.status).toBe(401);
      expect(fleet.heartbeat).not.toHaveBeenCalled();
    } finally { await h.close(); }
  });

  it('registers a node (201)', async () => {
    const h = await listen(makeGate());
    try {
      const res = await request(h.base, '/cloud/fleet/register', { method: 'POST', body: { id: 'node_1', kind: 'preview', capacity: cap, status: 'draining' } });
      expect(res.status).toBe(201);
      expect(fleet.register).toHaveBeenCalledWith(expect.objectContaining({ id: 'node_1', kind: 'preview', status: 'draining' }));
    } finally { await h.close(); }
  });
});

describe('custom-domains CRUD (governed)', () => {
  it('DENY blocks POST /domains (403), never adds, never audits', async () => {
    const gate = makeGate({ decide: vi.fn(async () => verdict('deny')) });
    const h = await listen(gate);
    try {
      const res = await request(h.base, '/cloud/domains', { method: 'POST', body: { hostname: 'app.example.com' } });
      expect(res.status).toBe(403);
      expect(gate.decide).toHaveBeenCalledWith('cloud.domain.add', principal, expect.anything());
      expect(domains.add).not.toHaveBeenCalled();
      expect(gate.recordAudit).not.toHaveBeenCalled();
    } finally { await h.close(); }
  });

  it('ALLOW adds a domain (201) and seals the audit', async () => {
    const gate = makeGate();
    const h = await listen(gate);
    try {
      const res = await request(h.base, '/cloud/domains', { method: 'POST', body: { hostname: 'app.example.com' } });
      expect(res.status).toBe(201);
      expect(domains.add).toHaveBeenCalledWith({ tenantId: 'ten_1', hostname: 'app.example.com' });
      expect(gate.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'cloud.domain.add', payload: expect.objectContaining({ domainId: 'dom_1' }) }));
    } finally { await h.close(); }
  });

  it('lists a tenant domains', async () => {
    const h = await listen(makeGate());
    try {
      const res = await request(h.base, '/cloud/domains');
      expect(res.status).toBe(200);
      expect((res.body.data as { domains: DomainRecord[] }).domains).toHaveLength(1);
    } finally { await h.close(); }
  });

  it('verifies a domain (200) and seals the outcome', async () => {
    const gate = makeGate();
    const h = await listen(gate);
    try {
      const res = await request(h.base, '/cloud/domains/dom_1/verify', { method: 'POST' });
      expect(res.status).toBe(200);
      expect(domains.verify).toHaveBeenCalledWith('dom_1', 'ten_1');
      expect(gate.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'cloud.domain.verify', payload: expect.objectContaining({ verificationStatus: 'verified' }) }));
    } finally { await h.close(); }
  });

  it('deletes a domain (200) and seals the outcome', async () => {
    const gate = makeGate();
    const h = await listen(gate);
    try {
      const res = await request(h.base, '/cloud/domains/dom_1', { method: 'DELETE' });
      expect(res.status).toBe(200);
      expect(domains.remove).toHaveBeenCalledWith('dom_1', 'ten_1');
      expect(gate.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'cloud.domain.remove' }));
    } finally { await h.close(); }
  });

  it('propagates a domains-service error (verify with no verifier ⇒ 503)', async () => {
    (domains.verify as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'DNS verifier not configured — domain stays pending.')),
    );
    const h = await listen(makeGate());
    try {
      const res = await request(h.base, '/cloud/domains/dom_1/verify', { method: 'POST' });
      expect(res.status).toBe(503);
    } finally { await h.close(); }
  });
});
