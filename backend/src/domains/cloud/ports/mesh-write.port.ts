/**
 * `mesh-write.port` — the WRITE seam over the two networking engines, the twin of
 * the READ-ONLY {@link MeshDiagnostics} in `mesh.port.ts`. Where that port observes
 * registrations, THIS port MUTATES the live mesh: it enrolls a ziti zero-trust
 * identity and it bumps the recoder-xds control-plane snapshot so Envoy fronts a
 * new edge. Both writes are GOVERNED at the service that composes them
 * (`services/mesh-fabric.service.ts` runs the `GovernanceGate` `decide → audit`).
 *
 * Degrade-truthful law §37: an absent controller / xds write endpoint resolves to
 * `{ ok:false, reason }` — never a faked success, never a throw. The caller (the
 * provision / deploy flow) treats a mesh miss as a truthful skip, never a block.
 */
import type { ZitiMeshEnroller } from '../adapters/ziti-mesh.adapter.js';

export type { ZitiMeshEnroller } from '../adapters/ziti-mesh.adapter.js';

/** One preview / mesh edge to front behind Envoy (mapped to an xDS upstream). */
export interface XdsUpstreamSpec {
  /** The Envoy cluster name (also the route target); stable per edge. */
  readonly name: string;
  /** The upstream host the data plane routes to (sandbox / preview runner). */
  readonly host: string;
  readonly port: number;
  /** Optional host header / SNI to present (defaults to `host`). */
  readonly hostHeader?: string;
  /** When true, Envoy speaks TLS to the upstream. */
  readonly tlsUpstream?: boolean;
}

/**
 * The truthful outcome of an xDS snapshot bump. On success the NEW served
 * snapshot `version` (the governed evidence the caller seals into the audit
 * chain) + the cluster tally come back; any fault — absent endpoint, a validation
 * reject, a network error — resolves to `{ ok:false, reason }`, never a throw.
 */
export type XdsSnapshotBumpOutcome =
  | { readonly ok: false; readonly reason: string }
  | {
      readonly ok: true;
      readonly version: string;
      readonly clusters: number;
      readonly cluster: string;
    };

/**
 * The recoder-xds control-plane WRITE surface: register/refresh ONE upstream edge
 * and bump the served snapshot so a running Envoy fronts it WITHOUT a restart.
 * This is the no-restart control-plane write the preview deploy flow drives.
 */
export interface XdsControlPlaneWriter {
  /** True when a write endpoint is configured (else `registerUpstream` degrades). */
  isConfigured(): boolean;
  /**
   * Register/refresh a preview / mesh edge as an xDS upstream and bump the served
   * snapshot version. Degrade-safe: absent endpoint ⇒ `{ ok:false, reason }`.
   */
  registerUpstream(spec: XdsUpstreamSpec): Promise<XdsSnapshotBumpOutcome>;
}

/** The composed WRITE seam the mesh fabric service drives (both engines). */
export interface MeshWritePort {
  readonly enroller: ZitiMeshEnroller;
  readonly xds: XdsControlPlaneWriter;
}
