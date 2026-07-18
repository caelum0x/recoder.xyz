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
 * SECURITY — TENANT SUBJECT BINDING (mirrors {@link buildCloudWriteMcpTools}):
 * the subject is derived from the HOST-AUTHORIZED {@link McpToolCaller}
 * (`caller.userId`/`orgId`), NEVER from free-form `args`. A non-privileged caller
 * is bound to its OWN tenant, so a caller-supplied `userId`/`orgId`/`tenantId` can
 * never be used as a selector to read another tenant's tier/quota/placement,
 * sandbox inventory, or deployment health. An args-named subject is honoured ONLY
 * for a caller carrying an `admin`/`internal` scope; and even then the resolved
 * tenant is ownership-checked before any authz/quota/data seam. A missing caller
 * throws `AUTH_REQUIRED`; a cross-tenant subject throws
 * `AUTHZ_PROJECT_ACCESS_DENIED` — never a guessed identity or a victim's data.
 */
import type { McpToolRegistration, McpToolCaller } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { Result } from '../../../shared/result.js';
import type { AppError } from '../../../shared/errors.js';
import type { Tenant } from '../types.js';
import type { CloudModule } from '../index.js';
import type { TenantRef } from '../services/tenancy.service.js';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Scopes that let a caller act on a subject OTHER than themselves (ops / service). */
const PRIVILEGED_SCOPES: readonly string[] = ['admin', 'internal'];

/** True when the authorized caller may target an args-named (cross-tenant) subject. */
function isPrivileged(caller: McpToolCaller): boolean {
  return (caller.scopes ?? []).some((scope) => PRIVILEGED_SCOPES.includes(scope));
}

/** The tenant ref for the caller's OWN tenant (resolve by their identity). */
function callerRef(caller: McpToolCaller): TenantRef & { ownerUserId: string } {
  return {
    ownerUserId: caller.userId,
    ...(caller.orgId ? { orgId: caller.orgId } : {}),
  };
}

/**
 * A tenant ref an admin/internal caller named in args (`orgId`/`tenantId` win over
 * `userId`), or `null` when no subject was supplied. Only ever consulted for a
 * privileged caller — a non-privileged caller is always bound to {@link callerRef}.
 */
function subjectRefFromArgs(raw: unknown): (TenantRef & { ownerUserId: string }) | null {
  const args = (raw ?? {}) as Record<string, unknown>;
  const tenantId = str(args.tenantId);
  const orgId = str(args.orgId);
  const userId = str(args.userId);
  if (!userId && !orgId && !tenantId) return null;
  return {
    ownerUserId: userId ?? '',
    ...(orgId ? { orgId } : {}),
    ...(tenantId ? { tenantId } : {}),
  };
}

/** Does the authorized caller own / belong to the resolved tenant? */
function callerOwnsTenant(caller: McpToolCaller, tenant: Tenant): boolean {
  if (tenant.ownerUserId && tenant.ownerUserId === caller.userId) return true;
  return Boolean(tenant.orgId && caller.orgId && tenant.orgId === caller.orgId);
}

/**
 * Resolve the tenant SUBJECT for a read tool from the host-authorized `caller`,
 * NEVER from free-form args. A non-privileged caller is bound to its own tenant;
 * an args-named subject is honoured only for an `admin`/`internal` caller. Throws
 * `AUTH_REQUIRED` when unauthenticated and `AUTHZ_PROJECT_ACCESS_DENIED` when a
 * non-privileged caller does not own the resolved tenant (defence in depth).
 * Returns the tenancy `resolve` Result so callers keep their not-found envelope.
 */
async function resolveSubjectTenant(
  module: CloudModule,
  raw: unknown,
  caller: McpToolCaller | undefined,
): Promise<Result<Tenant, AppError>> {
  if (!caller || !str(caller.userId)) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'Cloud read requires an authenticated caller.');
  }
  const privileged = isPrivileged(caller);
  const ref: TenantRef & { ownerUserId: string } = privileged
    ? subjectRefFromArgs(raw) ?? callerRef(caller)
    : callerRef(caller);

  const resolved = await module.tenancy().resolve(ref);
  if (resolved.ok && !privileged && !callerOwnsTenant(caller, resolved.value)) {
    throw createError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'Cross-tenant cloud read refused: caller is not a member of the target tenant.',
    );
  }
  return resolved;
}

export function buildCloudMcpTools(module: CloudModule): readonly McpToolRegistration[] {
  return [
    {
      name: 'cloud_tenant_read',
      description: "Read the caller's cloud tenant: tier, isolation, region, effective quota + placement (read-only).",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const resolved = await resolveSubjectTenant(module, raw, caller);
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
      description: "List the caller's sandboxes (state-of-record; read-only).",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const resolved = await resolveSubjectTenant(module, raw, caller);
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
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const deploymentId = str((raw as { deploymentId?: unknown })?.deploymentId);
        if (!deploymentId) return { error: 'deploymentId is required' };
        const resolved = await resolveSubjectTenant(module, raw, caller);
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
