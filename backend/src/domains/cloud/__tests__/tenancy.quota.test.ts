/**
 * Tenancy tier + quota gate tests — the gate that fronts EVERY downstream cloud
 * write. Proves: tier→placement isolation, deny-first quota (exhaustion,
 * unreadable usage, unlimited), billing-tightening (lower only, degrade-safe),
 * resolve fail-safe (repo down ⇒ SERVICE_UNAVAILABLE, unknown ⇒ NOT_FOUND),
 * ensure auto-provisions a default self-host tenant, and the exhaustion→
 * SERVICE_UNAVAILABLE envelope.
 */
import { describe, it, expect } from 'vitest';
import { createTenancyService, quotaDeniedError, type TenantBillingQuotaPort } from '../services/tenancy.service.js';
import { sliceCloudConfig, type CloudConfig, type CloudConfigOverrides } from '../config.js';
import { ErrorCode } from '../../../shared/errors.js';
import type { TenantRepository, TenantUpsert } from '../ports/cloud-repository.port.js';
import type { Tenant, TenantQuota, TenantTier } from '../types.js';

const appConfig = { runtime: { isProduction: false } } as unknown as Parameters<typeof sliceCloudConfig>[0];

function config(overrides: CloudConfigOverrides = {}): CloudConfig {
  return sliceCloudConfig(appConfig, overrides);
}

const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  child: () => silentLogger,
} as unknown as Parameters<typeof createTenancyService>[0]['logger'];

function tenant(tier: TenantTier, quota: Partial<TenantQuota> = {}, over: Partial<Tenant> = {}): Tenant {
  const cfg = config();
  return {
    id: over.id ?? `tnt_${tier}`,
    orgId: over.orgId ?? null,
    ownerUserId: over.ownerUserId ?? 'user_1',
    tier,
    isolationLevel: over.isolationLevel ?? 'shared',
    region: over.region ?? cfg.defaultRegion,
    quota: { ...cfg.tierQuotas[tier], ...quota },
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}

/** An in-memory tenant repo keyed by id/owner/org, with an availability toggle. */
function memRepo(opts: { available?: boolean; throwOn?: boolean; seed?: Tenant[] } = {}): TenantRepository & {
  rows: Map<string, Tenant>;
} {
  const rows = new Map<string, Tenant>();
  for (const t of opts.seed ?? []) rows.set(t.id, t);
  const guard = () => {
    if (opts.throwOn) throw new Error('pool down');
  };
  return {
    rows,
    isAvailable: () => opts.available ?? true,
    async getById(id) {
      guard();
      return rows.get(id) ?? null;
    },
    async getByOwner(ownerUserId) {
      guard();
      return [...rows.values()].find((t) => t.ownerUserId === ownerUserId && t.orgId === null) ?? null;
    },
    async getByOrg(orgId) {
      guard();
      return [...rows.values()].find((t) => t.orgId === orgId) ?? null;
    },
    async upsert(input: TenantUpsert) {
      const row: Tenant = {
        id: input.id,
        orgId: input.orgId ?? null,
        ownerUserId: input.ownerUserId,
        tier: input.tier,
        isolationLevel: input.isolationLevel,
        region: input.region,
        quota: input.quota,
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      };
      rows.set(row.id, row);
      return row;
    },
    async list() {
      return [...rows.values()];
    },
  };
}

describe('TenancyService — placement (tier isolation)', () => {
  it('routes self-host to the local provider only', () => {
    const svc = createTenancyService({ repo: memRepo(), config: config(), logger: silentLogger });
    const p = svc.placement(tenant('self-host'));
    expect(p.target).toBe('local');
    expect(p.providerCandidates).toEqual(['local']);
  });

  it('routes cloud/teams off-box only when a provider key is present', () => {
    const withKey = config({ daytona: { apiKey: 'dt_live' }, e2b: { apiKey: 'e2b_live' } });
    const svc = createTenancyService({ repo: memRepo(), config: withKey, logger: silentLogger });
    const cloud = svc.placement(tenant('cloud'));
    expect(cloud.target).toBe('cloud');
    expect(cloud.providerCandidates).toEqual(['daytona', 'e2b', 'local']);
    const teams = svc.placement(tenant('teams'));
    expect(teams.providerCandidates).toEqual(['daytona', 'e2b']);
  });

  it('drops cloud providers when no key is configured (degrade-safe)', () => {
    const svc = createTenancyService({ repo: memRepo(), config: config(), logger: silentLogger });
    // cloud tier keeps only local (still enabled); teams has no local fallback → empty.
    expect(svc.placement(tenant('cloud')).providerCandidates).toEqual(['local']);
    expect(svc.placement(tenant('teams')).providerCandidates).toEqual([]);
  });
});

describe('TenancyService — checkQuota (deny-first)', () => {
  const svc = createTenancyService({ repo: memRepo(), config: config(), logger: silentLogger });

  it('allows when headroom remains', () => {
    const d = svc.checkQuota(tenant('cloud').quota, 'sandbox', 5);
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(tenant('cloud').quota.maxSandboxes - 5);
  });

  it('DENIES on exhaustion with reason quota_exceeded', () => {
    const q = tenant('cloud', { maxSandboxes: 3 }).quota;
    const d = svc.checkQuota(q, 'sandbox', 3);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('quota_exceeded');
    expect(d.remaining).toBe(0);
  });

  it('treats a limit of 0 as unlimited (self-host)', () => {
    const q = tenant('self-host').quota; // maxSandboxes: 0
    const d = svc.checkQuota(q, 'sandbox', 9999);
    expect(d.allowed).toBe(true);
    expect(d.limit).toBe(0);
  });

  it('DENIES when the usage count is unreadable (fail-safe)', () => {
    const q = tenant('cloud').quota;
    expect(svc.checkQuota(q, 'preview', Number.NaN).reason).toBe('usage_unknown');
    expect(svc.checkQuota(q, 'preview', -1).allowed).toBe(false);
  });

  it('maps an exhausted decision to a SERVICE_UNAVAILABLE envelope', () => {
    const d = svc.checkQuota(tenant('cloud', { maxPreview: 1 }).quota, 'preview', 1);
    const e = quotaDeniedError(d);
    expect(e.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(e.details?.kind).toBe('preview');
  });
});

describe('TenancyService — effectiveQuota (billing tightens, never widens)', () => {
  it('lowers a tenant ceiling to the billing entitlement', async () => {
    const billing: TenantBillingQuotaPort = { entitledLimit: (_t, kind) => (kind === 'sandbox' ? 5 : null) };
    const svc = createTenancyService({ repo: memRepo(), config: config(), logger: silentLogger, billingQuota: billing });
    const eff = await svc.effectiveQuota(tenant('cloud', { maxSandboxes: 20 }));
    expect(eff.maxSandboxes).toBe(5);
  });

  it('never raises a tenant ceiling above its own value', async () => {
    const billing: TenantBillingQuotaPort = { entitledLimit: () => 1000 };
    const svc = createTenancyService({ repo: memRepo(), config: config(), logger: silentLogger, billingQuota: billing });
    const eff = await svc.effectiveQuota(tenant('cloud', { maxSandboxes: 20 }));
    expect(eff.maxSandboxes).toBe(20);
  });

  it('degrades safe when billing throws — the tenant quota stands', async () => {
    const billing: TenantBillingQuotaPort = {
      entitledLimit: () => {
        throw new Error('billing down');
      },
    };
    const svc = createTenancyService({ repo: memRepo(), config: config(), logger: silentLogger, billingQuota: billing });
    const eff = await svc.effectiveQuota(tenant('cloud', { maxSandboxes: 20 }));
    expect(eff.maxSandboxes).toBe(20);
  });
});

describe('TenancyService — resolve / ensure (fail-safe)', () => {
  it('returns SERVICE_UNAVAILABLE when the repo is down', async () => {
    const svc = createTenancyService({ repo: memRepo({ available: false }), config: config(), logger: silentLogger });
    const r = await svc.resolve({ tenantId: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });

  it('returns SERVICE_UNAVAILABLE when a repo read throws', async () => {
    const svc = createTenancyService({ repo: memRepo({ throwOn: true }), config: config(), logger: silentLogger });
    const r = await svc.resolve({ ownerUserId: 'user_1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });

  it('returns NOT_FOUND for an unknown subject', async () => {
    const svc = createTenancyService({ repo: memRepo(), config: config(), logger: silentLogger });
    const r = await svc.resolve({ ownerUserId: 'nobody' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('resolves an existing tenant by id precedence', async () => {
    const seed = tenant('teams', {}, { id: 'tnt_seed', ownerUserId: 'user_9' });
    const svc = createTenancyService({ repo: memRepo({ seed: [seed] }), config: config(), logger: silentLogger });
    const r = await svc.resolve({ tenantId: 'tnt_seed' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.tier).toBe('teams');
  });

  it('ensure auto-provisions a default self-host tenant when none exists', async () => {
    const repo = memRepo();
    const svc = createTenancyService({ repo, config: config(), logger: silentLogger });
    const r = await svc.ensure({ ownerUserId: 'fresh_user' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.tier).toBe('self-host');
      expect(r.value.ownerUserId).toBe('fresh_user');
      expect(repo.rows.size).toBe(1);
    }
  });

  it('ensure does NOT paper over a repo-down (propagates SERVICE_UNAVAILABLE)', async () => {
    const svc = createTenancyService({ repo: memRepo({ available: false }), config: config(), logger: silentLogger });
    const r = await svc.ensure({ ownerUserId: 'user_1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });
});
