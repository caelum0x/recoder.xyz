/**
 * Cloud MCP tools — the READ-ONLY introspection surface an agent uses to read
 * the off-box substrate state (tenant + quota, sandboxes, preview health, mesh
 * registrations, fleet manifest) over the composed cloud module. Registered as
 * the `cloud` server into the interop-gated MCP host: per the engine-wiring
 * checklist the engine must be added to `IN_PROC_SERVERS` + `ENGINE_SERVERS` and
 * this builder invoked in `buildInProcEngineRouter`, else the tools 404.
 *
 * Every call already passed the `authorize→risk→policy→audit` chain at the host
 * boundary, so these handlers stay thin, READ-ONLY, and truthful (never fabricate
 * a sandbox, faked-live preview, or `active` mesh engine). Write-bearing
 * operations (provision / deploy / destroy) are governed mutations exposed only
 * through the `/api/agent-os/cloud` edges.
 *
 * The subject is resolved from explicit args (`orgId` wins over `userId`); a
 * missing subject yields a truthful error, never a guessed identity.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { CloudModule } from '../index.js';
import type { TenantRef } from '../services/tenancy.service.js';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Resolve a tenant ref from tool args (org scope wins). Throws when absent. */
function tenantRefFromArgs(raw: unknown): TenantRef & { ownerUserId: string } {
  const args = (raw ?? {}) as Record<string, unknown>;
  const tenantId = str(args.tenantId);
  const orgId = str(args.orgId);
  const userId = str(args.userId);
  if (!userId && !orgId && !tenantId) {
    throw new Error('no cloud subject: pass args.userId, args.orgId, or args.tenantId');
  }
  return {
    ownerUserId: userId ?? '',
    ...(orgId ? { orgId } : {}),
    ...(tenantId ? { tenantId } : {}),
  };
}

export function buildCloudMcpTools(module: CloudModule): readonly McpToolRegistration[] {
  return [
    {
      name: 'cloud_tenant_read',
      description: "Read a subject's cloud tenant: tier, isolation, region, effective quota + placement (read-only).",
      handler: async (raw: unknown) => {
        const ref = tenantRefFromArgs(raw);
        const resolved = await module.tenancy().resolve(ref);
        if (!resolved.ok) return { found: false, error: resolved.error.code };
        const tenant = resolved.value;
        const quota = await module.tenancy().effectiveQuota(tenant);
        return {
          found: true,
          tenant: {
            id: tenant.id,
            tier: tenant.tier,
            isolationLevel: tenant.isolationLevel,
            region: tenant.region,
          },
          effectiveQuota: quota,
          placement: module.tenancy().placement(tenant),
        };
      },
    },
    {
      name: 'cloud_sandboxes_list',
      description: "List a subject's sandboxes (state-of-record; read-only).",
      handler: async (raw: unknown) => {
        const ref = tenantRefFromArgs(raw);
        const resolved = await module.tenancy().resolve(ref);
        if (!resolved.ok) return { count: 0, sandboxes: [], error: resolved.error.code };
        const sandboxes = await module.provisioner().list(resolved.value.id);
        return {
          count: sandboxes.length,
          sandboxes: sandboxes.map((s) => ({
            id: s.id,
            provider: s.provider,
            status: s.status,
            region: s.region,
            runId: s.runId,
            externalId: s.externalId,
            expiresAt: s.expiresAt,
          })),
        };
      },
    },
    {
      name: 'cloud_preview_health',
      description: 'Run a REAL health probe for a deployment and return the truthful HTTP status (read-only).',
      handler: async (raw: unknown) => {
        const ref = tenantRefFromArgs(raw);
        const deploymentId = str((raw as { deploymentId?: unknown })?.deploymentId);
        if (!deploymentId) return { error: 'deploymentId is required' };
        const resolved = await module.tenancy().resolve(ref);
        if (!resolved.ok) return { error: resolved.error.code };
        const result = await module.preview().health(deploymentId, resolved.value.id);
        if (!result.ok) return { error: result.error.code };
        return {
          deploymentId,
          status: result.value.status,
          httpStatus: result.value.httpStatus,
          checkedAt: result.value.checkedAt,
          reason: result.value.reason ?? null,
        };
      },
    },
    {
      name: 'cloud_mesh_status',
      description: 'Truthful mesh diagnostics: ziti/xds engine status + registrations (read-only, no data plane).',
      handler: async () => {
        const snapshot = await module.mesh().status();
        return {
          status: snapshot.status,
          engines: snapshot.engines,
          zitiIdentities: snapshot.zitiIdentities.length,
          xdsClusters: snapshot.xdsClusters.length,
          checkedAt: snapshot.checkedAt,
        };
      },
    },
    {
      name: 'cloud_fleet_status',
      description: 'The cloud capacity manifest: fleet nodes + up/down from heartbeat freshness (read-only).',
      handler: async () => {
        const nodes = await module.fleet().list();
        return {
          count: nodes.length,
          nodes: nodes.map((n) => ({
            id: n.id,
            kind: n.kind,
            status: n.status,
            tenantId: n.tenantId,
            capacity: n.capacity,
            lastSeen: n.lastSeen,
          })),
        };
      },
    },
  ];
}
