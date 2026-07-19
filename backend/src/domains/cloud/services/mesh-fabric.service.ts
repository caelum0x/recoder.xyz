/**
 * `MeshFabricService` — the GOVERNED WRITE half of the networking mesh, the twin
 * of the read-only `MeshDiagnosticsService`. It is the single collaborator the
 * product flows call to fuse a workload onto the mesh:
 *
 *   - {@link MeshFabricService.enrollSandbox}: on a SUCCESSFUL sandbox provision,
 *     enrol a per-sandbox ziti zero-trust identity AND upsert the durable
 *     `cloud_mesh_endpoints` registration — the sandbox joins the overlay.
 *   - {@link MeshFabricService.registerPreviewEdge}: on a preview DEPLOY, upsert
 *     the `cloud_mesh_endpoints` registration AND bump the recoder-xds snapshot so
 *     Envoy fronts the preview edge. The returned snapshot VERSION is the governed
 *     evidence sealed into the audit chain.
 *
 * Every write runs the injected {@link CloudGovernanceGatePort} `decide → audit`
 * seam (the SAME gate the HTTP + MCP edges use) — defence in depth, so a mesh
 * mutation is governed identically wherever it originates. A blocking verdict
 * refuses the write; an erroring gate fails CLOSED.
 *
 * Degrade-truthful law §37: this service NEVER throws and NEVER blocks the run.
 * An absent controller / xds endpoint, a governance block, a repo miss, or an
 * engine fault all resolve to a truthful `{ …:false, reason, degraded }` — the
 * provision / deploy still succeeds; the mesh edge is honestly recorded as skipped.
 */
import type { Logger } from '../../../shared/logger.js';
import type { Principal } from '../../identity/types.js';
import type { MeshRepository } from '../ports/cloud-repository.port.js';
import type {
  XdsControlPlaneWriter,
  ZitiMeshEnroller,
} from '../ports/mesh-write.port.js';
import type {
  CloudGovernanceGatePort,
  GateDecisionContext,
} from '../ports/governance-gate.port.js';
import { guardCloudWrite, recordCloudAudit } from './cloud-write-gate.js';
import type { Deployment, Sandbox, Tenant } from '../types.js';

export interface MeshFabricServiceDeps {
  /** ziti zero-trust enrollment transport (governed HERE, not inside it). */
  readonly enroller: ZitiMeshEnroller;
  /** recoder-xds control-plane write transport (snapshot bump). */
  readonly xds: XdsControlPlaneWriter;
  /** The durable `cloud_mesh_endpoints` registry. */
  readonly mesh: MeshRepository;
  readonly logger: Logger;
  /** The injected governance gate; absent ⇒ degrade-open (warn-logged auth-only). */
  readonly gate?: CloudGovernanceGatePort;
  readonly now?: () => Date;
}

/** The truthful outcome of a sandbox mesh enrollment. */
export type MeshEnrollOutcome =
  | {
      readonly enrolled: false;
      readonly reason: string;
      readonly degraded: boolean;
      readonly blocked?: boolean;
    }
  | {
      readonly enrolled: true;
      readonly identityId: string;
      readonly endpointId: string;
    };

/** One preview edge's upstream coordinates (where Envoy routes). */
export interface PreviewEdgeTarget {
  readonly host: string;
  readonly port: number;
  readonly tls?: boolean;
}

/** The truthful outcome of fronting a preview edge behind Envoy. */
export type MeshEdgeOutcome =
  | {
      readonly fronted: false;
      readonly reason: string;
      readonly degraded: boolean;
      readonly blocked?: boolean;
    }
  | {
      readonly fronted: true;
      readonly version: string;
      readonly endpointId: string;
      readonly cluster: string;
    };

export interface MeshFabricService {
  /** Enrol a per-sandbox ziti identity + register the mesh endpoint (governed). */
  enrollSandbox(tenant: Tenant, sandbox: Sandbox): Promise<MeshEnrollOutcome>;
  /** Front a preview deployment behind Envoy: mesh upsert + xds snapshot bump (governed). */
  registerPreviewEdge(
    tenant: Tenant,
    deployment: Deployment,
    target: PreviewEdgeTarget
  ): Promise<MeshEdgeOutcome>;
}

/** The governed actor for a mesh write: the tenant's owner (org scope wins). */
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

export function createMeshFabricService(
  deps: MeshFabricServiceDeps
): MeshFabricService {
  const { enroller, xds, mesh, logger, gate } = deps;
  const now = deps.now ?? (() => new Date());

  async function enrollSandbox(
    tenant: Tenant,
    sandbox: Sandbox
  ): Promise<MeshEnrollOutcome> {
    const identityName = `sandbox-${sandbox.id}`;
    const principal = principalOfTenant(tenant);
    const ctx: GateDecisionContext = {
      target: { environment: 'cloud' },
      metadata: {
        edge: 'mesh.enroll',
        engine: 'ziti',
        sandboxId: sandbox.id,
        tenantId: tenant.id,
      },
    };

    const guarded = await guardCloudWrite(
      gate,
      'cloud.mesh.enroll',
      principal,
      ctx,
      logger
    );
    if (!guarded.allowed) {
      logger.warn(
        { sandboxId: sandbox.id, reason: guarded.error.message },
        'sandbox mesh enrollment blocked by governance'
      );
      return {
        enrolled: false,
        reason: guarded.error.message,
        degraded: false,
        blocked: true,
      };
    }

    let outcome;
    try {
      outcome = await enroller.enroll({
        name: identityName,
        roleAttributes: [`tenant-${tenant.id}`, 'sandbox'],
      });
    } catch (cause) {
      logger.warn(
        { err: cause, sandboxId: sandbox.id },
        'ziti enroll threw — treating as degraded skip'
      );
      return {
        enrolled: false,
        reason: 'ziti enroll transport failed',
        degraded: true,
      };
    }
    if (!outcome.ok) {
      // Truthful skip: the overlay is absent / faulted. The sandbox still runs.
      return { enrolled: false, reason: outcome.reason, degraded: true };
    }

    const endpointId = sandbox.id;
    try {
      await mesh.upsert({
        id: endpointId,
        tenantId: tenant.id,
        service: identityName,
        zitiIdentity: outcome.identity.id,
        xdsCluster: null,
        status: 'registered',
        metadata: {
          kind: 'sandbox',
          sandboxId: sandbox.id,
          provider: sandbox.provider,
        },
      });
    } catch (cause) {
      // The identity enrolled but the registry write missed — surface truthfully.
      logger.warn(
        { err: cause, sandboxId: sandbox.id },
        'mesh endpoint upsert failed after enroll'
      );
      return {
        enrolled: false,
        reason: 'mesh endpoint registry write failed',
        degraded: true,
      };
    }

    await recordCloudAudit(
      gate,
      'cloud.mesh.enroll',
      principal,
      guarded.verdict,
      {
        edge: 'sandbox.enroll',
        tenantId: tenant.id,
        sandboxId: sandbox.id,
        identityId: outcome.identity.id,
      },
      logger
    );

    return { enrolled: true, identityId: outcome.identity.id, endpointId };
  }

  async function registerPreviewEdge(
    tenant: Tenant,
    deployment: Deployment,
    target: PreviewEdgeTarget
  ): Promise<MeshEdgeOutcome> {
    const cluster = `preview-${deployment.id}`;
    const principal = principalOfTenant(tenant);
    const ctx: GateDecisionContext = {
      target: { environment: 'cloud' },
      metadata: {
        edge: 'mesh.snapshot',
        engine: 'xds',
        deploymentId: deployment.id,
        tenantId: tenant.id,
      },
    };

    const guarded = await guardCloudWrite(
      gate,
      'cloud.mesh.snapshot',
      principal,
      ctx,
      logger
    );
    if (!guarded.allowed) {
      logger.warn(
        { deploymentId: deployment.id, reason: guarded.error.message },
        'preview mesh edge blocked by governance'
      );
      return {
        fronted: false,
        reason: guarded.error.message,
        degraded: false,
        blocked: true,
      };
    }

    // Record the edge registration FIRST (durable intent), then bump the snapshot.
    const endpointId = deployment.id;
    try {
      await mesh.upsert({
        id: endpointId,
        tenantId: tenant.id,
        service: cluster,
        zitiIdentity: null,
        xdsCluster: cluster,
        status: 'registered',
        metadata: {
          kind: 'preview',
          deploymentId: deployment.id,
          host: target.host,
          port: target.port,
        },
      });
    } catch (cause) {
      logger.warn(
        { err: cause, deploymentId: deployment.id },
        'mesh endpoint upsert failed for preview edge'
      );
      return {
        fronted: false,
        reason: 'mesh endpoint registry write failed',
        degraded: true,
      };
    }

    let bump;
    try {
      bump = await xds.registerUpstream({
        name: cluster,
        host: target.host,
        port: target.port,
        ...(target.tls ? { tlsUpstream: true } : {}),
      });
    } catch (cause) {
      logger.warn(
        { err: cause, deploymentId: deployment.id },
        'xds snapshot bump threw — treating as degraded skip'
      );
      return {
        fronted: false,
        reason: 'xds control-plane transport failed',
        degraded: true,
      };
    }
    if (!bump.ok) {
      // The registry recorded the intent; the control plane is absent / rejected.
      return { fronted: false, reason: bump.reason, degraded: true };
    }

    // Reflect the LIVE (fronted) status now that Envoy has been told about it.
    try {
      await mesh.upsert({
        id: endpointId,
        tenantId: tenant.id,
        service: cluster,
        zitiIdentity: null,
        xdsCluster: cluster,
        status: 'active',
        metadata: {
          kind: 'preview',
          deploymentId: deployment.id,
          host: target.host,
          port: target.port,
          snapshotVersion: bump.version,
        },
      });
    } catch (cause) {
      logger.warn(
        { err: cause, deploymentId: deployment.id },
        'mesh endpoint status refresh failed (edge is fronted)'
      );
    }

    await recordCloudAudit(
      gate,
      'cloud.mesh.snapshot',
      principal,
      guarded.verdict,
      {
        edge: 'preview.front',
        tenantId: tenant.id,
        deploymentId: deployment.id,
        cluster,
        // The served snapshot version — the governed evidence of the bump.
        snapshotVersion: bump.version,
      },
      logger
    );

    return { fronted: true, version: bump.version, endpointId, cluster };
  }

  return { enrollSandbox, registerPreviewEdge };
}

/** Derive a `{ host, port, tls }` upstream target from a preview base URL. */
export function previewEdgeTarget(
  previewBaseUrl: string | null
): PreviewEdgeTarget | null {
  if (!previewBaseUrl) return null;
  try {
    const u = new URL(previewBaseUrl);
    const tls = u.protocol === 'https:';
    const port = u.port ? Number(u.port) : tls ? 443 : 80;
    if (!u.hostname || !Number.isFinite(port) || port <= 0) return null;
    return { host: u.hostname, port, tls };
  } catch {
    return null;
  }
}
