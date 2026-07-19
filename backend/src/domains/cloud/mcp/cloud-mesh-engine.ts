/**
 * Cloud MESH MCP tools — the ziti zero-trust overlay introspection surface an
 * agent uses to read mesh state, plus the ONE governed enrollment WRITE. These
 * register as part of the `cloud` server into the interop-gated MCP host (see the
 * engine-wiring checklist: the `cloud` engine is already in `IN_PROC_SERVERS` +
 * `ENGINE_SERVERS`, so these ride the same registration — no separate server).
 *
 * READ tools (`cloud_mesh_services_list`, `cloud_mesh_enrollment_status`,
 * `cloud_mesh_topology`) are ENGINE-STATUS reads — like the existing
 * `cloud_mesh_status`, they read the shared overlay's registration + health and
 * carry NO tenant-scoped data, so they take no subject and stay thin + truthful
 * (an absent controller yields empty lists + a `down` engine, never a fake).
 *
 * The WRITE tool (`cloud_mesh_enroll`) is a GOVERNED MUTATION. DEFENCE IN DEPTH:
 * every call already passed the host boundary's `authorize→risk→policy→audit`
 * chain, but the write ADDITIONALLY runs the injected {@link CloudGovernanceGatePort}
 * `decide → audit` seam — the SAME gate the `/api/agent-os/cloud` edges use — so an
 * MCP-initiated enrollment is governed identically to an HTTP one. A blocking
 * verdict returns a truthful `{ ok:false, effect, reason }` (never throws a policy
 * outcome); an ERRORING gate fails CLOSED; an ABSENT gate degrades open with a warn.
 *
 * SECURITY — TENANT SUBJECT BINDING (mirrors {@link buildCloudWriteMcpTools}, the
 * cross-tenant class stays CLOSED): the enrolling subject is the caller's OWN
 * tenant, resolved from the HOST-AUTHORIZED {@link McpToolCaller}
 * (`caller.userId`/`orgId`), NEVER from free-form `args`. There is no args-named
 * subject on this tool at all — enrollment is always bound to self. A missing
 * caller yields a truthful `AUTH_REQUIRED`, never a guessed identity.
 */
import type { McpToolRegistration, McpToolCaller } from '../../../shared/module-base.js';
import type { Logger } from '../../../shared/logger.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';
import type { Tenant } from '../types.js';
import type { TenancyService, TenantRef } from '../services/tenancy.service.js';
import type { MeshDiagnosticsService } from '../services/mesh-diagnostics.service.js';
import type { ZitiMeshEnroller } from '../adapters/ziti-mesh.adapter.js';
import type { CloudGovernanceGatePort, GateDecisionContext } from '../ports/governance-gate.port.js';
import { guardCloudWrite, recordCloudAudit } from '../services/cloud-write-gate.js';

export interface CloudMeshMcpDeps {
  /** The read-only mesh diagnostics (ziti services / enrollment / topology). */
  readonly mesh: MeshDiagnosticsService;
  /** Tenancy gate — the enrollment subject is bound to the caller's own tenant. */
  readonly tenancy: TenancyService;
  /** The ziti enrollment WRITE transport (gated at THIS boundary, not inside it). */
  readonly enroller: ZitiMeshEnroller;
  readonly logger: Logger;
  /** The injected governance gate; absent ⇒ degrade-open (warn-logged, auth-elsewhere). */
  readonly gate?: CloudGovernanceGatePort;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** The tenant ref for the caller's OWN tenant (resolve/ensure by their identity). */
function callerRef(caller: McpToolCaller): TenantRef & { ownerUserId: string } {
  return {
    ownerUserId: caller.userId,
    ...(caller.orgId ? { orgId: caller.orgId } : {}),
  };
}

/** The governed actor for an MCP mesh write: the resolved tenant's owner. */
function principalOfTenant(tenant: Tenant): Principal {
  return {
    userId: tenant.ownerUserId,
    ...(tenant.orgId ? { orgId: tenant.orgId } : {}),
    scopes: ['write'],
    kind: 'apikey',
    isAnonymous: false,
    raw: null,
  };
}

export function buildCloudMeshMcpTools(deps: CloudMeshMcpDeps): readonly McpToolRegistration[] {
  const { mesh, tenancy, enroller, logger, gate } = deps;

  return [
    {
      name: 'cloud_mesh_services_list',
      description:
        'List registered ziti mesh services with status + encryption/role attributes (read-only, no data plane).',
      handler: async () => {
        const [engine, services] = await Promise.all([mesh.status(), mesh.zitiServices()]);
        return {
          engine,
          count: services.length,
          services: services.map((s) => ({
            id: s.id,
            name: s.name,
            status: s.status,
            encryptionRequired: s.encryptionRequired,
            roleAttributes: s.roleAttributes,
          })),
        };
      },
    },
    {
      name: 'cloud_mesh_enrollment_status',
      description:
        'Report ziti identity/endpoint enrollment posture: enrolled vs outstanding token + expiry (read-only).',
      handler: async () => {
        const [engine, enrollments] = await Promise.all([mesh.status(), mesh.zitiEnrollments()]);
        return {
          engine,
          count: enrollments.length,
          enrolled: enrollments.filter((e) => e.enrolled).length,
          pending: enrollments.filter((e) => !e.enrolled).length,
          enrollments: enrollments.map((e) => ({
            identityId: e.identityId,
            identityName: e.identityName,
            method: e.method,
            enrolled: e.enrolled,
            expiresAt: e.expiresAt,
          })),
        };
      },
    },
    {
      name: 'cloud_mesh_topology',
      description:
        'Query the ziti mesh topology/health: engine status + identity/service/enrollment counts (read-only).',
      handler: async () => {
        const topo = await mesh.meshTopology();
        return {
          engine: topo.engine,
          identities: topo.identities.length,
          services: topo.services.length,
          enrollments: topo.enrollments.length,
          pendingEnrollments: topo.enrollments.filter((e) => !e.enrolled).length,
          checkedAt: topo.checkedAt,
        };
      },
    },
    {
      name: 'cloud_mesh_enroll',
      description:
        "Enrol a ziti identity/edge-router into the caller's mesh (mutating, governed; truthful when the controller is absent).",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const args = (raw ?? {}) as Record<string, unknown>;
        const name = str(args.name);
        if (!name) return { ok: false, error: 'name is required' };

        // 1. Require an authenticated caller — never guess an identity from args.
        if (!caller || !str(caller.userId)) {
          return {
            ok: false,
            error: 'Cloud mesh enrollment requires an authenticated caller.',
            code: ErrorCode.AUTH_REQUIRED,
          };
        }

        // 2. Bind the subject to the caller's OWN tenant (cross-tenant CLOSED —
        //    there is no args-named subject on this tool).
        const resolved = await tenancy.ensure(callerRef(caller));
        if (!resolved.ok) return { ok: false, error: resolved.error.message, code: resolved.error.code };
        const tenant = resolved.value;
        const principal = principalOfTenant(tenant);

        // 3. Governance decide BEFORE the write (fail-closed on a gate fault).
        const isRouter = args.isRouter === true;
        const ctx: GateDecisionContext = {
          target: { environment: 'cloud' },
          metadata: { via: 'mcp', engine: 'ziti', name, isRouter },
        };
        const guarded = await guardCloudWrite(gate, 'cloud.mesh.enroll', principal, ctx, logger);
        if (!guarded.allowed) {
          return { ok: false, error: guarded.error.message, code: guarded.error.code, effect: 'blocked' };
        }

        // 4. Transport the enrollment (degrade-safe: absent controller ⇒ ok:false).
        const outcome = await enroller.enroll({
          name,
          ...(str(args.method) ? { method: str(args.method) } : {}),
          ...(Array.isArray(args.roleAttributes)
            ? { roleAttributes: args.roleAttributes.filter((v): v is string => typeof v === 'string') }
            : {}),
          isRouter,
        });
        if (!outcome.ok) return { ok: false, error: outcome.reason, tenantId: tenant.id };

        // 5. Seal the audit AFTER the successful mutation (best-effort).
        await recordCloudAudit(gate, 'cloud.mesh.enroll', principal, guarded.verdict, {
          via: 'mcp',
          engine: 'ziti',
          tenantId: tenant.id,
          identityId: outcome.identity.id,
          isRouter,
        }, logger);

        return {
          ok: true,
          identity: { id: outcome.identity.id, name: outcome.identity.name, status: outcome.identity.status },
          // The one-time enrollment JWT the endpoint uses to join (may be null when
          // the controller streams it out-of-band).
          enrollmentJwt: outcome.enrollmentJwt,
          tenantId: tenant.id,
        };
      },
    },
  ];
}
