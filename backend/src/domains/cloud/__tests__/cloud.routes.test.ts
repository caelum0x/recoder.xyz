/**
 * Cloud routes — governance WRITE-seam tests over the composed
 * `/api/agent-os/cloud` router (`buildCloudRouter`). Proves the decide→audit
 * seam every cloud write passes (the conductor/identity pattern):
 *
 *   - GATED DENY: a `deny` verdict blocks the write with a truthful 403
 *     (`AUTHZ_PROJECT_ACCESS_DENIED`), the mutation NEVER runs, nothing sealed.
 *   - HAPPY PATH: an `allow` verdict lets the write through (201/200) and the
 *     outcome is sealed via `recordAudit` AFTER the mutation (sanitized payload
 *     — never the signed URL/token value).
 *   - DEGRADE: no gate injected ⇒ auth-only write proceeds (warn-logged);
 *     an ERRORING gate fails CLOSED with 503 (`AUTHZ_SERVICE_ERROR`) and the
 *     mutation never runs; a failed audit seal never unwinds a durable write.
 *
 * Every write edge is exercised: sandbox provision + destroy, deployment
 * create, preview-URL mint, tenant auto-provision.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
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
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { Tenant, Sandbox, Deployment, SignedPreviewUrl } from '../types.js';
import { ok } from '../../../shared/result.js';

// --- Fixtures -----------------------------------------------------------------

const testPrincipal = { userId: 'tester', isAnonymous: false } as unknown as Principal;

const tenant: Tenant = {
  id: 'ten_1',
  orgId: null,
  ownerUserId: 'tester',
  tier: 'cloud',
  isolationLevel: 'shared',
  region: 'eu',
  quota: { maxSandboxes: 5, maxConcurrent: 2, maxPreview: 3, cpuMillis: 1000, memMb: 1024 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sandbox: Sandbox = {
  id: 'sbx_1',
  tenantId: tenant.id,
  userId: 'tester',
  runId: null,
  provider: 'e2b',
  externalId: 'ext_1',
  status: 'running',
  region: 'eu',
  image: null,
  resources: { cpuMillis: 500, memMb: 512 },
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  lastHeartbeat: null,
  metadata: {},
};

const deployment: Deployment = {
  id: 'dep_1',
  tenantId: tenant.id,
  sandboxId: null,
  runId: null,
  target: 'preview',
  status: 'building',
  commitSha: null,
  previewBaseUrl: null,
  healthStatus: 'unknown',
  lastHealthAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
};

const signedUrl: SignedPreviewUrl = {
  url: 'https://preview.example/dep_1?t=SECRET',
  token: 'SECRET',
  claims: { deploymentId: 'dep_1', tenantId: tenant.id, exp: 1_900_000_000 },
};

function verdict(effect: GateVerdict['effect'], overrides: Partial<GateVerdict> = {}): GateVerdict {
  return {
    verdictId: 'v_1',
    requestId: 'r_1',
    effect,
    tier: 'medium',
    reason: effect === 'allow' ? 'ok' : 'blocked by policy',
    degraded: false,
    engine: 'napi',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// --- Fakes --------------------------------------------------------------------

const passAuth: RequestHandler = (req, _res, next) => {
  req.principal = testPrincipal;
  next();
};
const fakeMiddleware = { authenticate: passAuth, authenticateMutating: passAuth } as unknown as AuthMiddleware;

const tenancy = {
  resolve: vi.fn(async () => ok(tenant)),
  ensure: vi.fn(async () => ok(tenant)),
  effectiveQuota: vi.fn(async () => tenant.quota),
  checkQuota: vi.fn(() => ({ allowed: true, kind: 'preview', limit: 3, used: 0, remaining: 3 })),
  placement: vi.fn(() => ({ target: 'cloud', providerCandidates: ['e2b'], region: 'eu', isolationLevel: 'shared' })),
} as unknown as TenancyService;

const provisioner = {
  provision: vi.fn(async () => ok(sandbox)),
  destroy: vi.fn(async () => ok(undefined)),
  get: vi.fn(async () => ok(sandbox)),
  list: vi.fn(async () => [sandbox]),
} as unknown as SandboxProvisionerService;

const preview = {
  deploy: vi.fn(async () => ok(deployment)),
  status: vi.fn(async () => ok(deployment)),
  getSignedUrl: vi.fn(async () => ok(signedUrl)),
  health: vi.fn(async () => ok({ status: 'healthy' })),
} as unknown as PreviewDeployService;

const mesh = { status: vi.fn(async () => ({ engines: [] })) } as unknown as MeshDiagnosticsService;
const fleet = { list: vi.fn(async () => []) } as unknown as FleetSupervisorService;

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as CloudRouterDeps['logger'];

function makeGate(overrides: Partial<CloudGovernanceGatePort> = {}): CloudGovernanceGatePort {
  return {
    decide: vi.fn(async () => verdict('allow')),
    enforceTool: vi.fn(async () => ({ allowed: true })),
    route: vi.fn(async () => ({ routable: true })),
    recordAudit: vi.fn(async () => ({ id: 'aud_1' })),
    verifyAudit: vi.fn(async () => ({ valid: true })),
    ...overrides,
  } as unknown as CloudGovernanceGatePort;
}

// --- Harness: one listening app per gate wiring -------------------------------

interface Harness {
  base: string;
  close: () => Promise<void>;
}

async function listen(gate: CloudGovernanceGatePort | undefined): Promise<Harness> {
  const app = express();
  app.use(express.json());
  app.use(
    '/cloud',
    buildCloudRouter({
      tenancy,
      provisioner,
      preview,
      mesh,
      fleet,
      mw: fakeMiddleware,
      logger,
      ...(gate ? { gate } : {}),
      activePreviewCount: async () => 0,
    }),
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function request(
  base: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const payload = init.body === undefined ? undefined : JSON.stringify(init.body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: init.method ?? 'GET',
        headers: payload === undefined ? {} : { 'content-type': 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : {} });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Gated deny ---------------------------------------------------------------

describe('cloud routes — governance gated deny', () => {
  let gate: CloudGovernanceGatePort;
  let h: Harness;

  beforeAll(async () => {
    gate = makeGate({ decide: vi.fn(async () => verdict('deny')) });
    h = await listen(gate);
  });
  afterAll(async () => h.close());

  it('blocks POST /sandboxes with 403 and never provisions or audits', async () => {
    const res = await request(h.base, '/cloud/sandboxes', { method: 'POST', body: {} });
    expect(res.status).toBe(403);
    expect((res.body.error as Record<string, unknown>).code).toBe('AUTHZ_PROJECT_ACCESS_DENIED');
    expect(gate.decide).toHaveBeenCalledWith('cloud.sandbox.provision', testPrincipal, expect.anything());
    expect(provisioner.provision).not.toHaveBeenCalled();
    expect(gate.recordAudit).not.toHaveBeenCalled();
  });

  it('blocks DELETE /sandboxes/:id with 403 and never destroys', async () => {
    const res = await request(h.base, '/cloud/sandboxes/sbx_1', { method: 'DELETE' });
    expect(res.status).toBe(403);
    expect(gate.decide).toHaveBeenCalledWith('cloud.sandbox.destroy', testPrincipal, expect.anything());
    expect(provisioner.destroy).not.toHaveBeenCalled();
  });

  it('blocks POST /deployments with 403 and never deploys', async () => {
    const res = await request(h.base, '/cloud/deployments', { method: 'POST', body: { target: 'preview' } });
    expect(res.status).toBe(403);
    expect(gate.decide).toHaveBeenCalledWith('cloud.deployment.create', testPrincipal, expect.anything());
    expect(preview.deploy).not.toHaveBeenCalled();
  });

  it('blocks the preview-URL mint with 403 and never mints', async () => {
    const res = await request(h.base, '/cloud/deployments/dep_1/url');
    expect(res.status).toBe(403);
    expect(gate.decide).toHaveBeenCalledWith('cloud.preview_url.mint', testPrincipal, expect.anything());
    expect(preview.getSignedUrl).not.toHaveBeenCalled();
  });

  it('surfaces needs_approval as a 403 carrying the approvalId', async () => {
    (gate.decide as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      verdict('needs_approval', { approvalId: 'appr_9' }),
    );
    const res = await request(h.base, '/cloud/sandboxes', { method: 'POST', body: {} });
    expect(res.status).toBe(403);
    const details = (res.body.error as { details?: Record<string, unknown> }).details;
    expect(details?.effect).toBe('needs_approval');
    expect(details?.approvalId).toBe('appr_9');
    expect(provisioner.provision).not.toHaveBeenCalled();
  });
});

// --- Happy path ---------------------------------------------------------------

describe('cloud routes — governance happy path (decide → write → audit)', () => {
  let gate: CloudGovernanceGatePort;
  let h: Harness;

  beforeAll(async () => {
    gate = makeGate();
    h = await listen(gate);
  });
  afterAll(async () => h.close());

  it('provisions a sandbox (201) and seals the audit AFTER the write', async () => {
    const res = await request(h.base, '/cloud/sandboxes', { method: 'POST', body: { image: 'node:22' } });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(provisioner.provision).toHaveBeenCalledTimes(1);
    expect(gate.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cloud.sandbox.provision',
        actorId: 'tester',
        resource: 'cloud',
        effect: 'allow',
        payload: expect.objectContaining({ sandboxId: 'sbx_1', tenantId: 'ten_1' }),
      }),
    );
  });

  it('destroys a sandbox and seals cloud.sandbox.destroy', async () => {
    const res = await request(h.base, '/cloud/sandboxes/sbx_1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(gate.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cloud.sandbox.destroy', payload: expect.objectContaining({ sandboxId: 'sbx_1' }) }),
    );
  });

  it('creates a deployment (201) and seals cloud.deployment.create', async () => {
    const res = await request(h.base, '/cloud/deployments', { method: 'POST', body: { target: 'preview' } });
    expect(res.status).toBe(201);
    expect(preview.deploy).toHaveBeenCalledTimes(1);
    expect(gate.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cloud.deployment.create',
        payload: expect.objectContaining({ deploymentId: 'dep_1', deployTarget: 'preview' }),
      }),
    );
  });

  it('mints a preview URL (200) and seals the mint WITHOUT the signed URL/token', async () => {
    const res = await request(h.base, '/cloud/deployments/dep_1/url');
    expect(res.status).toBe(200);
    expect(gate.recordAudit).toHaveBeenCalledTimes(1);
    const entry = (gate.recordAudit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      action: string;
      payload: Record<string, unknown>;
    };
    expect(entry.action).toBe('cloud.preview_url.mint');
    expect(entry.payload.deploymentId).toBe('dep_1');
    expect(JSON.stringify(entry.payload)).not.toContain('SECRET');
  });

  it('gates + audits tenant auto-provision only when no tenant exists yet', async () => {
    (tenancy.resolve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    const res = await request(h.base, '/cloud/tenant');
    expect(res.status).toBe(200);
    expect(gate.decide).toHaveBeenCalledWith('cloud.tenant.provision', testPrincipal, expect.anything());
    expect(gate.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cloud.tenant.provision', payload: expect.objectContaining({ tenantId: 'ten_1' }) }),
    );
  });

  it('leaves an existing-tenant read ungated (no decide, no audit)', async () => {
    const res = await request(h.base, '/cloud/tenant');
    expect(res.status).toBe(200);
    expect(gate.decide).not.toHaveBeenCalled();
    expect(gate.recordAudit).not.toHaveBeenCalled();
  });

  it('a failed audit seal never unwinds the durable write (best-effort)', async () => {
    (gate.recordAudit as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('chain sealed elsewhere'));
    const res = await request(h.base, '/cloud/sandboxes', { method: 'POST', body: {} });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

// --- Degrade postures ---------------------------------------------------------

describe('cloud routes — degrade postures', () => {
  it('an ERRORING gate fails CLOSED with 503 and the mutation never runs', async () => {
    const gate = makeGate({
      decide: vi.fn(async () => {
        throw new Error('kernel transport down');
      }),
    });
    const h = await listen(gate);
    try {
      const res = await request(h.base, '/cloud/sandboxes', { method: 'POST', body: {} });
      expect(res.status).toBe(503);
      expect((res.body.error as Record<string, unknown>).code).toBe('AUTHZ_SERVICE_ERROR');
      expect(provisioner.provision).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('an ABSENT gate degrades open: the auth-only write proceeds with a warn log', async () => {
    const h = await listen(undefined);
    try {
      const res = await request(h.base, '/cloud/sandboxes', { method: 'POST', body: {} });
      expect(res.status).toBe(201);
      expect(provisioner.provision).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'cloud.sandbox.provision' }),
        expect.stringContaining('without a governance gate'),
      );
    } finally {
      await h.close();
    }
  });
});
