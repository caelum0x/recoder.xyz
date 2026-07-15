/**
 * `MeshDiagnostics` — the READ-ONLY networking mesh status contract.
 *
 * FROZEN CONTRACT — Phase 10. The mesh (ziti zero-trust overlay + recoder-xds
 * Envoy control plane) is REGISTERED AND OBSERVABLE, with NO LIVE DATA PLANE
 * until launch: this port exposes identity/cluster registration + health only,
 * and never routes traffic. `observability` (mesh health) and the frontend cloud
 * surface compile against it. Absent ziti/xds binary or endpoint ⇒ the adapter
 * reports `status:'down'` with the missing source named — never a faked `active`.
 */
import type { MeshEndpointStatus } from '../types.js';

/** A ziti identity as reported by the overlay engine (registration only). */
export interface ZitiIdentity {
  readonly id: string;
  readonly name: string;
  readonly status: MeshEndpointStatus;
}

/** An xds cluster/listener registration snapshot (no live traffic). */
export interface XdsCluster {
  readonly name: string;
  readonly type: string;
  readonly status: MeshEndpointStatus;
  readonly endpoints: number;
}

/** One mesh engine's truthful status (ziti or xds). */
export interface MeshEngineStatus {
  readonly engine: 'ziti' | 'xds';
  readonly status: 'up' | 'down' | 'degraded' | 'unknown';
  /** Why the engine is not `up` (missing binary, unreachable endpoint). */
  readonly reason?: string;
}

/** The merged read-only diagnostics view over both mesh engines. */
export interface MeshSnapshot {
  readonly status: 'up' | 'down' | 'degraded' | 'unknown';
  readonly engines: readonly MeshEngineStatus[];
  readonly zitiIdentities: readonly ZitiIdentity[];
  readonly xdsClusters: readonly XdsCluster[];
  readonly checkedAt: string;
}

export interface MeshDiagnostics {
  /** ziti identity registrations (empty + `down` engine when the overlay is absent). */
  zitiIdentities(): Promise<readonly ZitiIdentity[]>;
  /** xds cluster registrations (empty + `down` engine when xds is absent). */
  xdsClusters(): Promise<readonly XdsCluster[]>;
  /** The merged snapshot both frontend + observability read. Never throws. */
  status(): Promise<MeshSnapshot>;
}
