/**
 * Cloud MESH MCP tools — cross-tenant defence.
 *
 * Proves two IDOR fixes on `buildCloudMeshMcpTools`:
 *
 *  1. cloud_mesh_enroll (WRITE): the ziti identity `name` + `roleAttributes` are
 *     DERIVED from the caller's resolved tenant, never forwarded from free-form
 *     args. A caller cannot mint an identity carrying ANOTHER tenant's
 *     `tenant-*` segmentation role — it is stripped and the caller's own tenant
 *     role is forced, exactly like the hardened `mesh-fabric.service` path.
 *
 *  2. cloud_mesh_services_list / _enrollment_status / _topology (READ): the whole
 *     cross-tenant ziti control-plane (identities, services with `tenant-<id>`
 *     role attributes, enrollment expiry) is gated to an admin/internal caller.
 *     A non-privileged caller gets the truthful engine status but the registration
 *     detail is withheld (`restricted: true`). Solo/desktop mode fails open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCloudMeshMcpTools, type CloudMeshMcpDeps } from '../mcp/cloud-mesh-engine.js';
import type { McpToolRegistration, McpToolCaller } from '../../../shared/module-base.js';
import type { TenancyService } from '../services/tenancy.service.js';
import type { MeshDiagnosticsService } from '../services/mesh-diagnostics.service.js';
import type { ZitiMeshEnroller } from '../adapters/ziti-mesh.adapter.js';
import type { Tenant } from '../types.js';
import type { ZitiService, ZitiEnrollment, MeshEngineStatus, MeshTopology } from '../ports/mesh.port.js';
import { ok } from '../../../shared/result.js';

const owner: McpToolCaller = { userId: 'owner_1' };
const opsCaller: McpToolCaller = { userId: 'ops_1', scopes: ['internal'] };

const tenant: Tenant = {
  id: 'ten_owner', orgId: null, ownerUserId: 'owner_1', tier: 'cloud', isolationLevel: 'shared', region: 'eu',
  quota: { maxSandboxes: 5, maxConcurrent: 2, maxPreview: 3, cpuMillis: 1000, memMb: 1024 },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const engine: MeshEngineStatus = { engine: 'ziti', status: 'up' };

const services: readonly ZitiService[] = [
  { id: 'svc_a', name: 'sandbox-a', status: 'registered', encryptionRequired: true, roleAttributes: ['tenant-ten_owner'] },
  { id: 'svc_b', name: 'sandbox-b', status: 'registered', encryptionRequired: true, roleAttributes: ['tenant-ten_victim'] },
];

const enrollments: readonly ZitiEnrollment[] = [
  { identityId: 'id_a', identityName: 'sandbox-a', method: 'ott', enrolled: false, expiresAt: '2026-02-01T00:00:00.000Z' },
];

const topology: MeshTopology = {
  engine, identities: [{ id: 'id_a', name: 'sandbox-a', status: 'registered' }],
  services, enrollments, checkedAt: '2026-01-01T00:00:00.000Z',
};

const enrollMock = vi.fn(async () => ({
  ok: true as const,
  identity: { id: 'id_new', name: 'x', status: 'registered' as const },
  enrollmentJwt: null,
}));
const enroller = { enroll: enrollMock } as unknown as ZitiMeshEnroller;

const mesh = {
  status: vi.fn(async (): Promise<MeshEngineStatus> => engine),
  zitiServices: vi.fn(async () => services),
  zitiEnrollments: vi.fn(async () => enrollments),
  meshTopology: vi.fn(async () => topology),
} as unknown as MeshDiagnosticsService;

const tenancy = { ensure: vi.fn(async () => ok(tenant)), resolve: vi.fn(async () => ok(tenant)) } as unknown as TenancyService;

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as CloudMeshMcpDeps['logger'];

function toolMap(tools: readonly McpToolRegistration[]): Map<string, McpToolRegistration> {
  return new Map(tools.map((t) => [t.name, t]));
}

function build(soloMode = false): Map<string, McpToolRegistration> {
  return toolMap(buildCloudMeshMcpTools({ mesh, tenancy, enroller, logger, soloMode }));
}

beforeEach(() => vi.clearAllMocks());

describe('cloud_mesh_enroll — role attributes derived from the tenant (segmentation)', () => {
  it("strips a caller-supplied foreign tenant-* role and forces the caller's own tenant role", async () => {
    const res = (await build().get('cloud_mesh_enroll')!.handler(
      { name: 'edge', roleAttributes: ['tenant-ten_victim', 'admin-fabric', 'custom'] },
      owner,
    )) as Record<string, unknown>;
    expect(res.ok).toBe(true);
    expect(enrollMock).toHaveBeenCalledTimes(1);
    const spec = enrollMock.mock.calls[0]![0] as { name: string; roleAttributes: readonly string[] };
    // Forced own-tenant role; the spoofed `tenant-ten_victim` is gone.
    expect(spec.roleAttributes).toContain('tenant-ten_owner');
    expect(spec.roleAttributes).not.toContain('tenant-ten_victim');
    // Non-tenant custom roles the caller supplied are preserved.
    expect(spec.roleAttributes).toContain('custom');
    // The identity name is namespaced with the tenant id.
    expect(spec.name).toContain('ten_owner');
  });

  it('forces the tenant role even when the caller supplies no roleAttributes', async () => {
    const res = (await build().get('cloud_mesh_enroll')!.handler({ name: 'edge' }, owner)) as Record<string, unknown>;
    expect(res.ok).toBe(true);
    const spec = enrollMock.mock.calls[0]![0] as { roleAttributes: readonly string[] };
    expect(spec.roleAttributes).toEqual(['tenant-ten_owner']);
  });
});

describe('cloud_mesh_services_list — cross-tenant detail gated', () => {
  it('WITHHOLDS the service list from a non-privileged caller (restricted)', async () => {
    const res = (await build().get('cloud_mesh_services_list')!.handler({}, owner)) as Record<string, unknown>;
    expect(res.restricted).toBe(true);
    expect(res.services).toEqual([]);
    // The engine status is still truthful.
    expect(res.engine).toEqual(engine);
    expect(mesh.zitiServices).not.toHaveBeenCalled();
  });

  it('RETURNS the full service list to an admin/internal caller', async () => {
    const res = (await build().get('cloud_mesh_services_list')!.handler({}, opsCaller)) as Record<string, unknown>;
    expect(res.restricted).toBeFalsy();
    expect((res.services as unknown[]).length).toBe(2);
  });

  it('FAILS OPEN in solo/desktop mode for the single local caller', async () => {
    const res = (await build(true).get('cloud_mesh_services_list')!.handler({}, owner)) as Record<string, unknown>;
    expect(res.restricted).toBeFalsy();
    expect((res.services as unknown[]).length).toBe(2);
  });
});

describe('cloud_mesh_enrollment_status + cloud_mesh_topology — cross-tenant detail gated', () => {
  it('withholds enrollment detail from a non-privileged caller', async () => {
    const res = (await build().get('cloud_mesh_enrollment_status')!.handler({}, owner)) as Record<string, unknown>;
    expect(res.restricted).toBe(true);
    expect(res.enrollments).toEqual([]);
    expect(mesh.zitiEnrollments).not.toHaveBeenCalled();
  });

  it('returns enrollment detail to an admin/internal caller', async () => {
    const res = (await build().get('cloud_mesh_enrollment_status')!.handler({}, opsCaller)) as Record<string, unknown>;
    expect(res.restricted).toBeFalsy();
    expect((res.enrollments as unknown[]).length).toBe(1);
  });

  it('withholds topology counts from a non-privileged caller but keeps engine status', async () => {
    const res = (await build().get('cloud_mesh_topology')!.handler({}, owner)) as Record<string, unknown>;
    expect(res.restricted).toBe(true);
    expect(res.services).toBe(0);
    expect(res.engine).toEqual(engine);
  });

  it('returns topology counts to an admin/internal caller', async () => {
    const res = (await build().get('cloud_mesh_topology')!.handler({}, opsCaller)) as Record<string, unknown>;
    expect(res.restricted).toBeFalsy();
    expect(res.services).toBe(2);
  });
});
