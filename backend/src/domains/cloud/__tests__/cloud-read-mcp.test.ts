/**
 * Cloud READ MCP tools — tenant SUBJECT binding (cross-tenant read defence).
 *
 * Proves the read introspection surface derives its subject from the
 * host-authorized {@link McpToolCaller}, NOT from free-form args:
 *  - a missing caller throws AUTH_REQUIRED (never guesses an identity);
 *  - a non-privileged caller passing an args-named subject (userId/orgId/tenantId)
 *    is BOUND to its own tenant — the spoofed victim id never reaches the tenancy
 *    resolve, the effectiveQuota/placement seam, the provisioner list, or the
 *    preview health probe;
 *  - a caller that does not own the resolved tenant is refused with
 *    AUTHZ_PROJECT_ACCESS_DENIED before any data seam (defence in depth);
 *  - an admin/internal caller MAY target an args-named subject.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCloudMcpTools } from '../mcp/cloud-engine.js';
import type { CloudModule } from '../index.js';
import type { McpToolRegistration, McpToolCaller } from '../../../shared/module-base.js';
import type { Tenant, Sandbox } from '../types.js';
import { ok } from '../../../shared/result.js';
import { ErrorCode } from '../../../shared/errors.js';

/** The host-authorized caller that owns the fixture tenant (`owner_1`). */
const owner: McpToolCaller = { userId: 'owner_1' };

const tenant: Tenant = {
  id: 'ten_1', orgId: null, ownerUserId: 'owner_1', tier: 'cloud', isolationLevel: 'shared', region: 'eu',
  quota: { maxSandboxes: 5, maxConcurrent: 2, maxPreview: 3, cpuMillis: 1000, memMb: 1024 },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const sandbox = {
  id: 'sbx_1', provider: 'e2b', status: 'running', region: 'eu', runId: 'run_1', externalId: 'ext_1',
  expiresAt: '2026-01-02T00:00:00.000Z',
} as unknown as Sandbox;

const resolve = vi.fn(async () => ok(tenant));
const effectiveQuota = vi.fn(async () => tenant.quota);
const placement = vi.fn(() => ({ target: 'cloud', providers: ['e2b'], isolation: 'shared' }));
const list = vi.fn(async () => [sandbox]);
const health = vi.fn(async () =>
  ok({ status: 'live', httpStatus: 200, checkedAt: '2026-01-01T00:00:00.000Z', reason: null }),
);

const tenancySvc = { resolve, effectiveQuota, placement };
const provisionerSvc = { list };
const previewSvc = { health };

const module = {
  tenancy: () => tenancySvc,
  provisioner: () => provisionerSvc,
  preview: () => previewSvc,
} as unknown as CloudModule;

function toolMap(tools: readonly McpToolRegistration[]): Map<string, McpToolRegistration> {
  return new Map(tools.map((t) => [t.name, t]));
}

const tools = () => toolMap(buildCloudMcpTools(module));

beforeEach(() => vi.clearAllMocks());

describe('cloud read MCP — authenticated caller required', () => {
  it.each(['cloud_tenant_read', 'cloud_sandboxes_list', 'cloud_preview_health'])(
    '%s throws AUTH_REQUIRED when no caller is authorized (never guesses identity)',
    async (name) => {
      await expect(tools().get(name)!.handler({ deploymentId: 'dep_1' })).rejects.toMatchObject({
        code: ErrorCode.AUTH_REQUIRED,
      });
      expect(resolve).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
      expect(health).not.toHaveBeenCalled();
    },
  );
});

describe('cloud read MCP — args subject spoof is dropped as a selector', () => {
  it('cloud_tenant_read: args.orgId/tenantId victim never reaches resolve/quota/placement', async () => {
    const res = (await tools().get('cloud_tenant_read')!.handler(
      { orgId: 'victim_org', tenantId: 'victim_tenant', userId: 'victim_user' },
      owner,
    )) as Record<string, unknown>;
    expect(res.found).toBe(true);
    // Subject bound to the caller — the spoofed victim ids were dropped.
    expect(resolve).toHaveBeenCalledWith({ ownerUserId: 'owner_1' });
    expect(resolve).not.toHaveBeenCalledWith(expect.objectContaining({ orgId: 'victim_org' }));
    expect(resolve).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'victim_tenant' }));
    // The quota/placement seam only ever saw the caller's own tenant.
    expect(effectiveQuota).toHaveBeenCalledWith(tenant);
    expect(placement).toHaveBeenCalledWith(tenant);
  });

  it('cloud_sandboxes_list: args.orgId victim never reaches provisioner.list', async () => {
    const res = (await tools().get('cloud_sandboxes_list')!.handler(
      { orgId: 'victim_org', tenantId: 'victim_tenant' },
      owner,
    )) as Record<string, unknown>;
    expect(res.count).toBe(1);
    expect(resolve).toHaveBeenCalledWith({ ownerUserId: 'owner_1' });
    // The inventory query used the CALLER's tenant id, never the victim's.
    expect(list).toHaveBeenCalledWith('ten_1');
    expect(list).not.toHaveBeenCalledWith('victim_tenant');
  });

  it('cloud_preview_health: args.orgId victim never reaches the preview probe', async () => {
    const res = (await tools().get('cloud_preview_health')!.handler(
      { deploymentId: 'dep_1', orgId: 'victim_org', tenantId: 'victim_tenant' },
      owner,
    )) as Record<string, unknown>;
    expect(res.httpStatus).toBe(200);
    expect(resolve).toHaveBeenCalledWith({ ownerUserId: 'owner_1' });
    // The probe ran against the caller's tenant id, never the victim's.
    expect(health).toHaveBeenCalledWith('dep_1', 'ten_1');
    expect(health).not.toHaveBeenCalledWith('dep_1', 'victim_tenant');
  });
});

describe('cloud read MCP — cross-tenant ownership guard (defence in depth)', () => {
  it('REFUSES a caller that does not own the resolved tenant — data seam never reached', async () => {
    // Even if tenancy resolves a tenant owned by someone else, the ownership guard
    // blocks a non-privileged caller before quota/list/health ever run.
    const attacker: McpToolCaller = { userId: 'attacker_1' };
    await expect(
      tools().get('cloud_sandboxes_list')!.handler({ tenantId: 'ten_1' }, attacker),
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    expect(list).not.toHaveBeenCalled();
  });

  it('REFUSES cross-tenant preview_health for a non-owner caller (no probe)', async () => {
    const attacker: McpToolCaller = { userId: 'attacker_1' };
    await expect(
      tools().get('cloud_preview_health')!.handler({ deploymentId: 'dep_1', orgId: 'ten_1' }, attacker),
    ).rejects.toMatchObject({ code: ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED });
    expect(health).not.toHaveBeenCalled();
  });
});

describe('cloud read MCP — privileged callers may target an args-named subject', () => {
  it('ALLOWS an admin/internal caller to read an args-named tenant', async () => {
    const ops: McpToolCaller = { userId: 'ops_1', scopes: ['internal'] };
    const res = (await tools().get('cloud_sandboxes_list')!.handler({ tenantId: 'ten_1' }, ops)) as Record<string, unknown>;
    expect(res.count).toBe(1);
    // Privileged caller resolved the args-named subject and read under it.
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'ten_1' }));
    expect(list).toHaveBeenCalledWith('ten_1');
  });
});
