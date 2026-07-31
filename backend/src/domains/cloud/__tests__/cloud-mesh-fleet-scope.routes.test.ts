/**
 * Cloud routes — GET /mesh + GET /fleet cross-tenant READ scoping (IDOR defence).
 *
 * Proves:
 *  - GET /mesh withholds the cross-tenant ziti/xds registration detail from a
 *    non-privileged caller (returns the truthful engine health + `restricted`),
 *    and returns the full snapshot to an admin/internal caller (or in solo mode).
 *  - GET /fleet scopes tenant-pinned nodes to the caller (shared-pool nodes stay
 *    visible); an admin/internal caller (or solo mode) sees the whole fleet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type RequestHandler } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildCloudRouter, type CloudRouterDeps } from '../routes/cloud.routes.js';
import type { TenancyService } from '../services/tenancy.service.js';
import type { SandboxProvisionerService } from '../services/sandbox-provisioner.service.js';
import type { PreviewDeployService } from '../services/preview-deploy.service.js';
import type { MeshDiagnosticsService } from '../services/mesh-diagnostics.service.js';
import type { FleetSupervisorService } from '../services/fleet-supervisor.service.js';
import type { DomainsService } from '../services/domains.service.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { Tenant, FleetNode } from '../types.js';
import { ok } from '../../../shared/result.js';

const ownerPrincipal = { userId: 'owner_1', scopes: [], kind: 'session', isAnonymous: false } as unknown as Principal;
const adminPrincipal = { userId: 'ops_1', scopes: ['admin'], kind: 'session', isAnonymous: false } as unknown as Principal;

const tenant: Tenant = {
  id: 'ten_1', orgId: null, ownerUserId: 'owner_1', tier: 'cloud', isolationLevel: 'shared', region: 'eu',
  quota: { maxSandboxes: 5, maxConcurrent: 2, maxPreview: 3, cpuMillis: 1000, memMb: 1024 },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const snapshot = {
  status: 'up', engines: [{ engine: 'ziti', status: 'up' }],
  zitiIdentities: [{ id: 'id_a', name: 'sandbox-a', status: 'registered' }],
  xdsClusters: [{ name: 'preview-x', type: 'EDS', status: 'registered', endpoints: 1 }],
  checkedAt: '2026-01-01T00:00:00.000Z',
};

const nodes: FleetNode[] = [
  { id: 'node_own', tenantId: 'ten_1', kind: 'sandbox', status: 'up', capacity: { slotsTotal: 1, slotsUsed: 0, cpuMillis: 1, memMb: 1 }, manifest: {}, lastSeen: 'x', createdAt: 'x' },
  { id: 'node_victim', tenantId: 'ten_victim', kind: 'sandbox', status: 'up', capacity: { slotsTotal: 1, slotsUsed: 0, cpuMillis: 1, memMb: 1 }, manifest: {}, lastSeen: 'x', createdAt: 'x' },
  { id: 'node_shared', tenantId: null, kind: 'mesh', status: 'up', capacity: { slotsTotal: 1, slotsUsed: 0, cpuMillis: 1, memMb: 1 }, manifest: {}, lastSeen: 'x', createdAt: 'x' },
];

const tenancy = { resolve: vi.fn(async () => ok(tenant)), ensure: vi.fn(async () => ok(tenant)) } as unknown as TenancyService;
const provisioner = {} as unknown as SandboxProvisionerService;
const preview = {} as unknown as PreviewDeployService;
const mesh = { status: vi.fn(async () => snapshot) } as unknown as MeshDiagnosticsService;
const fleet = { list: vi.fn(async () => nodes) } as unknown as FleetSupervisorService;
const domains = {} as unknown as DomainsService;
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as CloudRouterDeps['logger'];

interface Harness { base: string; close: () => Promise<void>; }

async function listen(principal: Principal, soloMode = false): Promise<Harness> {
  const passAuth: RequestHandler = (req, _res, next) => { req.principal = principal; next(); };
  const mw = { authenticate: passAuth, authenticateMutating: passAuth, requireInternal: passAuth } as unknown as AuthMiddleware;
  const app = express();
  app.use(express.json());
  app.use('/cloud', buildCloudRouter({
    tenancy, provisioner, preview, mesh, fleet, domains, mw, logger,
    soloMode, activePreviewCount: async () => 0,
  }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}

function get(base: string, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => { const t = Buffer.concat(chunks).toString('utf8'); resolve({ status: res.statusCode ?? 0, body: t ? JSON.parse(t) : {} }); });
    });
    req.on('error', reject);
    req.end();
  });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /mesh — cross-tenant registration detail gated', () => {
  it('WITHHOLDS ziti/xds registrations from a non-privileged caller (restricted, health kept)', async () => {
    const h = await listen(ownerPrincipal);
    try {
      const res = await get(h.base, '/cloud/mesh');
      expect(res.status).toBe(200);
      const data = res.body.data as Record<string, unknown>;
      expect(data.restricted).toBe(true);
      expect(data.status).toBe('up');
      expect(data.zitiIdentities).toBeUndefined();
      expect(data.xdsClusters).toBeUndefined();
    } finally { await h.close(); }
  });

  it('RETURNS the full snapshot to an admin/internal caller', async () => {
    const h = await listen(adminPrincipal);
    try {
      const res = await get(h.base, '/cloud/mesh');
      const data = res.body.data as Record<string, unknown>;
      expect(data.restricted).toBeUndefined();
      expect((data.zitiIdentities as unknown[]).length).toBe(1);
    } finally { await h.close(); }
  });

  it('FAILS OPEN in solo/desktop mode', async () => {
    const h = await listen(ownerPrincipal, true);
    try {
      const res = await get(h.base, '/cloud/mesh');
      const data = res.body.data as Record<string, unknown>;
      expect((data.zitiIdentities as unknown[]).length).toBe(1);
    } finally { await h.close(); }
  });
});

describe('GET /fleet — cross-tenant node scoping', () => {
  it('SCOPES tenant-pinned nodes to the caller + shared pool (victim node dropped)', async () => {
    const h = await listen(ownerPrincipal);
    try {
      const res = await get(h.base, '/cloud/fleet');
      const ids = (res.body.data as { nodes: { id: string }[] }).nodes.map((n) => n.id);
      expect(ids).toContain('node_own');
      expect(ids).toContain('node_shared');
      expect(ids).not.toContain('node_victim');
    } finally { await h.close(); }
  });

  it('RETURNS every node to an admin/internal caller', async () => {
    const h = await listen(adminPrincipal);
    try {
      const res = await get(h.base, '/cloud/fleet');
      expect((res.body.data as { nodes: unknown[] }).nodes.length).toBe(3);
    } finally { await h.close(); }
  });

  it('FAILS OPEN in solo/desktop mode (all nodes visible)', async () => {
    const h = await listen(ownerPrincipal, true);
    try {
      const res = await get(h.base, '/cloud/fleet');
      expect((res.body.data as { nodes: unknown[] }).nodes.length).toBe(3);
    } finally { await h.close(); }
  });
});
