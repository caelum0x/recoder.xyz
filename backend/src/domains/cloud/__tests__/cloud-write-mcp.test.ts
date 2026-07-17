/**
 * Cloud WRITE MCP tools — governance-gated mutation surface.
 *
 * Proves the `decide → mutate → audit` seam runs on an MCP-initiated write
 * exactly like an HTTP one:
 *  - a missing subject yields a truthful error (never a guessed identity);
 *  - a `deny` verdict blocks the mutation (no provision/add, no audit);
 *  - an `allow` verdict lets it through and seals a sanitized audit;
 *  - the governed actor is the resolved tenant owner;
 *  - an ABSENT gate degrades open (mutation proceeds, warn-logged);
 *  - domain add / verify / remove + sandbox provision / destroy are all wired.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCloudWriteMcpTools } from '../mcp/cloud-write-engine.js';
import type { TenancyService } from '../services/tenancy.service.js';
import type { SandboxProvisionerService } from '../services/sandbox-provisioner.service.js';
import type { DomainsService } from '../services/domains.service.js';
import type { CloudGovernanceGatePort, GateVerdict } from '../ports/governance-gate.port.js';
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { Tenant, Sandbox, DomainRecord } from '../types.js';
import { ok, err } from '../../../shared/result.js';
import { createError, ErrorCode } from '../../../shared/errors.js';

const tenant: Tenant = {
  id: 'ten_1', orgId: null, ownerUserId: 'owner_1', tier: 'cloud', isolationLevel: 'shared', region: 'eu',
  quota: { maxSandboxes: 5, maxConcurrent: 2, maxPreview: 3, cpuMillis: 1000, memMb: 1024 },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const sandbox = { id: 'sbx_1', provider: 'e2b', status: 'running' } as unknown as Sandbox;
const domainRecord: DomainRecord = {
  id: 'dom_1', tenantId: 'ten_1', hostname: 'app.example.com', verificationStatus: 'pending',
  dnsRecords: [], tlsStatus: 'none', createdAt: '2026-01-01T00:00:00.000Z',
};

function verdict(effect: GateVerdict['effect']): GateVerdict {
  return { verdictId: 'v', requestId: 'r', effect, tier: 'medium', reason: 'ok', degraded: false, engine: 'napi', createdAt: '2026-01-01T00:00:00.000Z' };
}

const tenancy = {
  resolve: vi.fn(async () => ok(tenant)),
  ensure: vi.fn(async () => ok(tenant)),
} as unknown as TenancyService;

const provisioner = {
  provision: vi.fn(async () => ok(sandbox)),
  destroy: vi.fn(async () => ok(undefined)),
} as unknown as SandboxProvisionerService;

const domains = {
  add: vi.fn(async () => ok(domainRecord)),
  verify: vi.fn(async () => ok({ ...domainRecord, verificationStatus: 'verified' })),
  remove: vi.fn(async () => ok({ id: 'dom_1', removed: true })),
} as unknown as DomainsService;

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

function makeGate(over: Partial<CloudGovernanceGatePort> = {}): CloudGovernanceGatePort {
  return { decide: vi.fn(async () => verdict('allow')), recordAudit: vi.fn(async () => ({ id: 'aud_1' })), ...over } as unknown as CloudGovernanceGatePort;
}

function toolMap(tools: readonly McpToolRegistration[]): Map<string, McpToolRegistration> {
  return new Map(tools.map((t) => [t.name, t]));
}

beforeEach(() => vi.clearAllMocks());

describe('cloud write MCP — subject + gating', () => {
  it('errors truthfully when no subject is passed (never guesses identity)', async () => {
    const tools = toolMap(buildCloudWriteMcpTools({ tenancy, provisioner, domains, logger, gate: makeGate() }));
    const res = (await tools.get('cloud_domain_add')!.handler({ hostname: 'app.example.com' })) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain('no cloud subject');
    expect(domains.add).not.toHaveBeenCalled();
  });

  it('a DENY verdict blocks cloud_domain_add and never audits', async () => {
    const gate = makeGate({ decide: vi.fn(async () => verdict('deny')) });
    const tools = toolMap(buildCloudWriteMcpTools({ tenancy, provisioner, domains, logger, gate }));
    const res = (await tools.get('cloud_domain_add')!.handler({ userId: 'owner_1', hostname: 'app.example.com' })) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.effect).toBe('blocked');
    expect(domains.add).not.toHaveBeenCalled();
    expect(gate.recordAudit).not.toHaveBeenCalled();
  });

  it('an ALLOW verdict runs the add + seals the audit; actor is the tenant owner', async () => {
    const gate = makeGate();
    const tools = toolMap(buildCloudWriteMcpTools({ tenancy, provisioner, domains, logger, gate }));
    const res = (await tools.get('cloud_domain_add')!.handler({ tenantId: 'ten_1', hostname: 'app.example.com' })) as Record<string, unknown>;
    expect(res.ok).toBe(true);
    // Gate decided with a principal whose userId is the tenant owner.
    expect(gate.decide).toHaveBeenCalledWith('cloud.domain.add', expect.objectContaining({ userId: 'owner_1' }), expect.anything());
    expect(domains.add).toHaveBeenCalledWith({ tenantId: 'ten_1', hostname: 'app.example.com' });
    expect(gate.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'cloud.domain.add', actorId: 'owner_1' }));
  });

  it('an ABSENT gate degrades open (mutation proceeds, warn-logged)', async () => {
    const tools = toolMap(buildCloudWriteMcpTools({ tenancy, provisioner, domains, logger }));
    const res = (await tools.get('cloud_domain_add')!.handler({ userId: 'owner_1', hostname: 'app.example.com' })) as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(domains.add).toHaveBeenCalledTimes(1);
  });
});

describe('cloud write MCP — sandbox tools', () => {
  it('provisions a sandbox and audits', async () => {
    const gate = makeGate();
    const tools = toolMap(buildCloudWriteMcpTools({ tenancy, provisioner, domains, logger, gate }));
    const res = (await tools.get('cloud_sandbox_provision')!.handler({ userId: 'owner_1', image: 'node:22' })) as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(provisioner.provision).toHaveBeenCalledWith(expect.objectContaining({ tenant, userId: 'owner_1', image: 'node:22' }));
    expect(gate.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'cloud.sandbox.provision', payload: expect.objectContaining({ sandboxId: 'sbx_1' }) }));
  });

  it('requires sandboxId for destroy', async () => {
    const tools = toolMap(buildCloudWriteMcpTools({ tenancy, provisioner, domains, logger, gate: makeGate() }));
    const res = (await tools.get('cloud_sandbox_destroy')!.handler({ userId: 'owner_1' })) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain('sandboxId');
    expect(provisioner.destroy).not.toHaveBeenCalled();
  });

  it('destroys a sandbox and audits', async () => {
    const gate = makeGate();
    const tools = toolMap(buildCloudWriteMcpTools({ tenancy, provisioner, domains, logger, gate }));
    const res = (await tools.get('cloud_sandbox_destroy')!.handler({ userId: 'owner_1', sandboxId: 'sbx_1' })) as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(provisioner.destroy).toHaveBeenCalledWith('sbx_1', 'ten_1');
    expect(gate.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'cloud.sandbox.destroy' }));
  });
});

describe('cloud write MCP — domain verify/remove + error propagation', () => {
  it('verifies + removes a domain', async () => {
    const tools = toolMap(buildCloudWriteMcpTools({ tenancy, provisioner, domains, logger, gate: makeGate() }));
    const v = (await tools.get('cloud_domain_verify')!.handler({ userId: 'owner_1', domainId: 'dom_1' })) as Record<string, unknown>;
    expect(v.ok).toBe(true);
    const r = (await tools.get('cloud_domain_remove')!.handler({ userId: 'owner_1', domainId: 'dom_1' })) as Record<string, unknown>;
    expect(r.ok).toBe(true);
    expect(domains.verify).toHaveBeenCalledWith('dom_1', 'ten_1');
    expect(domains.remove).toHaveBeenCalledWith('dom_1', 'ten_1');
  });

  it('surfaces a service error truthfully (verify with no verifier ⇒ ok:false)', async () => {
    (domains.verify as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      err(createError(ErrorCode.SERVICE_UNAVAILABLE, 'DNS verifier not configured — domain stays pending.')),
    );
    const tools = toolMap(buildCloudWriteMcpTools({ tenancy, provisioner, domains, logger, gate: makeGate() }));
    const res = (await tools.get('cloud_domain_verify')!.handler({ userId: 'owner_1', domainId: 'dom_1' })) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });

  it('propagates an unresolvable tenant as a truthful error (no mutation)', async () => {
    (tenancy.resolve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(err(createError(ErrorCode.NOT_FOUND, 'no tenant')));
    const tools = toolMap(buildCloudWriteMcpTools({ tenancy, provisioner, domains, logger, gate: makeGate() }));
    const res = (await tools.get('cloud_domain_remove')!.handler({ tenantId: 'ten_x', domainId: 'dom_1' })) as Record<string, unknown>;
    expect(res.ok).toBe(false);
    expect(res.code).toBe(ErrorCode.NOT_FOUND);
    expect(domains.remove).not.toHaveBeenCalled();
  });
});
