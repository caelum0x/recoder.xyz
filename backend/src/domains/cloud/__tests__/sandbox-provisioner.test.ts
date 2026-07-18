/**
 * Sandbox provisioner tests — the quota-gated provision path + reaper. Proves:
 * a successful provision persists BEFORE launch then flips to running + emits
 * lifecycle events; deny-first quota (sandbox ceiling) short-circuits before any
 * provider call; no available provider ⇒ SERVICE_UNAVAILABLE; a provider launch
 * failure marks the row `error`; and the TTL reaper destroys + reaps expired rows.
 */
import { describe, it, expect } from 'vitest';
import { createSandboxProvisionerService, type CloudRunEvent } from '../services/sandbox-provisioner.service.js';
import { createTenancyService } from '../services/tenancy.service.js';
import { sliceCloudConfig, type CloudConfigOverrides } from '../config.js';
import { ErrorCode } from '../../../shared/errors.js';
import { ok, err } from '../../../shared/result.js';
import { createError } from '../../../shared/errors.js';
import type { SandboxRepository, SandboxInsert } from '../ports/cloud-repository.port.js';
import type { SandboxProvider } from '../ports/sandbox-provider.port.js';
import type { Sandbox, SandboxStatus, Tenant } from '../types.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<typeof sliceCloudConfig>[0];

const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => silentLogger,
} as unknown as Parameters<typeof createSandboxProvisionerService>[0]['logger'];

function tenant(over: Partial<Tenant> = {}): Tenant {
  const cfg = sliceCloudConfig(appConfig, { daytona: { apiKey: 'dt_live' } });
  return {
    id: over.id ?? 'tnt_1',
    orgId: null,
    ownerUserId: 'user_1',
    tier: over.tier ?? 'cloud',
    isolationLevel: 'dedicated',
    region: 'us-east',
    quota: over.quota ?? cfg.tierQuotas.cloud,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}

/** In-memory sandbox repo with a settable count + availability toggle. */
function memSandboxRepo(opts: { available?: boolean; count?: number; expired?: Sandbox[] } = {}): SandboxRepository & {
  rows: Map<string, Sandbox>;
} {
  const rows = new Map<string, Sandbox>();
  for (const e of opts.expired ?? []) rows.set(e.id, e);
  return {
    rows,
    isAvailable: () => opts.available ?? true,
    async insert(input: SandboxInsert) {
      const row: Sandbox = {
        id: input.id,
        tenantId: input.tenantId,
        userId: input.userId,
        runId: input.runId ?? null,
        provider: input.provider,
        externalId: input.externalId ?? null,
        status: input.status,
        region: input.region,
        image: input.image ?? null,
        resources: input.resources,
        createdAt: '2026-07-15T00:00:00.000Z',
        expiresAt: input.expiresAt ?? null,
        lastHeartbeat: null,
        metadata: input.metadata ?? {},
      };
      rows.set(row.id, row);
      return row;
    },
    async getById(id, tenantId) {
      const r = rows.get(id);
      return r && r.tenantId === tenantId ? r : null;
    },
    async updateStatus(id, status, patch) {
      const r = rows.get(id);
      if (r) {
        rows.set(id, {
          ...r,
          status,
          externalId: patch?.externalId ?? r.externalId,
          lastHeartbeat: patch?.lastHeartbeat ?? r.lastHeartbeat,
        });
      }
    },
    async listByTenant(tenantId) {
      return [...rows.values()].filter((r) => r.tenantId === tenantId);
    },
    async countByTenant() {
      return opts.count ?? 0;
    },
    async listExpired() {
      return opts.expired ?? [];
    },
  };
}

function upProvider(overrides: Partial<SandboxProvider> = {}): SandboxProvider {
  return {
    id: 'daytona',
    availability: async () => ({ provider: 'daytona', status: 'up' }),
    provision: async () => ok({ provider: 'daytona', externalId: 'ext_1', status: 'running' as SandboxStatus }),
    get: async () => ok({ provider: 'daytona', externalId: 'ext_1', status: 'running' as SandboxStatus }),
    destroy: async () => ok(undefined),
    ...overrides,
  };
}

function config(overrides: CloudConfigOverrides = { daytona: { apiKey: 'dt_live' } }) {
  return sliceCloudConfig(appConfig, overrides);
}

function tenancyFor(overrides?: CloudConfigOverrides) {
  return createTenancyService({
    repo: { isAvailable: () => true } as unknown as Parameters<typeof createTenancyService>[0]['repo'],
    config: config(overrides),
    logger: silentLogger,
  });
}

describe('SandboxProvisioner — provision (happy path)', () => {
  it('persists pending BEFORE launch, flips to running, emits lifecycle events', async () => {
    const repo = memSandboxRepo();
    const events: CloudRunEvent[] = [];
    const svc = createSandboxProvisionerService({
      repo,
      tenancy: tenancyFor(),
      providers: { daytona: upProvider() },
      logger: silentLogger,
      runEvents: { emit: (e) => void events.push(e) },
      reaperIntervalMs: 0,
    });
    const r = await svc.provision({ tenant: tenant(), userId: 'user_1' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe('running');
      expect(r.value.externalId).toBe('ext_1');
    }
    expect(events.map((e) => e.type)).toEqual(['sandbox.provisioning', 'sandbox.running']);
    expect(repo.rows.size).toBe(1);
  });
});

describe('SandboxProvisioner — deny-first quota', () => {
  it('DENIES when the sandbox ceiling is already reached (no provider call)', async () => {
    let provisionCalls = 0;
    const provider = upProvider({
      provision: async () => {
        provisionCalls += 1;
        return ok({ provider: 'daytona', externalId: 'x', status: 'running' as SandboxStatus });
      },
    });
    const svc = createSandboxProvisionerService({
      repo: memSandboxRepo({ count: 20 }), // cloud maxSandboxes default = 20
      tenancy: tenancyFor(),
      providers: { daytona: provider },
      logger: silentLogger,
      reaperIntervalMs: 0,
    });
    const r = await svc.provision({ tenant: tenant(), userId: 'user_1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(provisionCalls).toBe(0);
  });
});

describe('SandboxProvisioner — no provider available', () => {
  it('returns SERVICE_UNAVAILABLE when no candidate adapter is up', async () => {
    const down = upProvider({ availability: async () => ({ provider: 'daytona', status: 'down', reason: 'no key' }) });
    const svc = createSandboxProvisionerService({
      repo: memSandboxRepo(),
      tenancy: tenancyFor(),
      providers: { daytona: down },
      logger: silentLogger,
      reaperIntervalMs: 0,
    });
    const r = await svc.provision({ tenant: tenant(), userId: 'user_1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });
});

describe('SandboxProvisioner — launch failure', () => {
  it('marks the persisted row error when the provider launch fails', async () => {
    const repo = memSandboxRepo();
    const failing = upProvider({
      provision: async () => err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'daytona 500')),
    });
    const svc = createSandboxProvisionerService({
      repo,
      tenancy: tenancyFor(),
      providers: { daytona: failing },
      logger: silentLogger,
      reaperIntervalMs: 0,
    });
    const r = await svc.provision({ tenant: tenant(), userId: 'user_1' });
    expect(r.ok).toBe(false);
    const persisted = [...repo.rows.values()][0];
    expect(persisted?.status).toBe('error');
  });
});

describe('SandboxProvisioner — execInSandbox (conductor remote exec seam)', () => {
  function runningRow(over: Partial<Sandbox> = {}): Sandbox {
    return {
      id: 'sb_run',
      tenantId: 'tnt_1',
      userId: 'user_1',
      runId: null,
      provider: 'daytona',
      externalId: 'ext_run',
      status: 'running',
      region: 'us-east',
      image: null,
      resources: { cpuMillis: 1000, memMb: 1024 },
      createdAt: '2026-07-15T00:00:00.000Z',
      expiresAt: null,
      lastHeartbeat: null,
      metadata: {},
      ...over,
    };
  }

  it('executes a command in a running, tenant-owned sandbox via the provider', async () => {
    const repo = memSandboxRepo({ expired: [runningRow()] });
    let seenExternalId = '';
    const provider = upProvider({
      exec: async (input) => {
        seenExternalId = input.externalId;
        return ok({ exitCode: 0, stdout: 'ok', stderr: '', timedOut: false });
      },
    });
    const svc = createSandboxProvisionerService({
      repo,
      tenancy: tenancyFor(),
      providers: { daytona: provider },
      logger: silentLogger,
      reaperIntervalMs: 0,
    });
    const r = await svc.execInSandbox('sb_run', 'tnt_1', { command: 'echo hi' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.stdout).toBe('ok');
    expect(seenExternalId).toBe('ext_run');
  });

  it('denies exec on a foreign tenant (NOT_FOUND, never leaks another tenant sandbox)', async () => {
    const repo = memSandboxRepo({ expired: [runningRow()] });
    const svc = createSandboxProvisionerService({
      repo,
      tenancy: tenancyFor(),
      providers: { daytona: upProvider({ exec: async () => ok({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) }) },
      logger: silentLogger,
      reaperIntervalMs: 0,
    });
    const r = await svc.execInSandbox('sb_run', 'other_tenant', { command: 'echo hi' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('refuses exec on a non-running sandbox (SERVICE_UNAVAILABLE, never fabricated)', async () => {
    const repo = memSandboxRepo({ expired: [runningRow({ status: 'stopped' })] });
    const svc = createSandboxProvisionerService({
      repo,
      tenancy: tenancyFor(),
      providers: { daytona: upProvider() },
      logger: silentLogger,
      reaperIntervalMs: 0,
    });
    const r = await svc.execInSandbox('sb_run', 'tnt_1', { command: 'echo hi' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });

  it('fails truthfully when the provider cannot exec', async () => {
    const repo = memSandboxRepo({ expired: [runningRow()] });
    const noExec = upProvider();
    delete (noExec as { exec?: unknown }).exec;
    const svc = createSandboxProvisionerService({
      repo,
      tenancy: tenancyFor(),
      providers: { daytona: noExec },
      logger: silentLogger,
      reaperIntervalMs: 0,
    });
    const r = await svc.execInSandbox('sb_run', 'tnt_1', { command: 'echo hi' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });
});

describe('SandboxProvisioner — TTL reaper', () => {
  it('destroys + reaps expired sandboxes', async () => {
    const expired: Sandbox = {
      id: 'sb_exp',
      tenantId: 'tnt_1',
      userId: 'user_1',
      runId: null,
      provider: 'daytona',
      externalId: 'ext_exp',
      status: 'running',
      region: 'us-east',
      image: null,
      resources: { cpuMillis: 1000, memMb: 1024 },
      createdAt: '2026-07-15T00:00:00.000Z',
      expiresAt: '2026-07-15T00:00:00.000Z',
      lastHeartbeat: null,
      metadata: {},
    };
    let destroyed = '';
    const provider = upProvider({
      destroy: async (id) => {
        destroyed = id;
        return ok(undefined);
      },
    });
    const repo = memSandboxRepo({ expired: [expired] });
    const svc = createSandboxProvisionerService({
      repo,
      tenancy: tenancyFor(),
      providers: { daytona: provider },
      logger: silentLogger,
      reaperIntervalMs: 0,
    });
    const reaped = await svc.reapExpired();
    expect(reaped).toBe(1);
    expect(destroyed).toBe('ext_exp');
    expect(repo.rows.get('sb_exp')?.status).toBe('reaped');
  });
});
