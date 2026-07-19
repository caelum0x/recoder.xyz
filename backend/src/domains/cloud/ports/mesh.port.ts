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

/**
 * A ziti SERVICE registration as reported by the overlay engine (the policy
 * object clients dial, mapped from the OpenZiti edge-management `services`
 * resource). Registration + status only — dialing/binding is the live data
 * plane this observe surface never touches.
 */
export interface ZitiService {
  readonly id: string;
  readonly name: string;
  readonly status: MeshEndpointStatus;
  /** OpenZiti end-to-end encryption requirement for the service. */
  readonly encryptionRequired: boolean;
  /** Role attributes the service is tagged with (for policy binding). */
  readonly roleAttributes: readonly string[];
}

/**
 * The enrollment posture of a ziti identity/endpoint (mapped from the OpenZiti
 * identity `enrollment` sub-resource). `enrolled:false` with a live token means
 * the endpoint is registered but not yet joined; degrade-safe callers never fake
 * an `enrolled:true`.
 */
export interface ZitiEnrollment {
  readonly identityId: string;
  readonly identityName: string;
  /** The enrollment method (`ott` | `ottca` | `updb` | `unknown`). */
  readonly method: string;
  /** True once the identity has completed enrollment (holds credentials). */
  readonly enrolled: boolean;
  /** ISO expiry of an OUTSTANDING enrollment token; `null` when enrolled/none. */
  readonly expiresAt: string | null;
}

/** The spec for a governed ziti enrollment WRITE (create identity/endpoint). */
export interface ZitiEnrollSpec {
  readonly name: string;
  /** Enrollment method (defaults to `ott` — one-time-token). */
  readonly method?: string;
  /** Role attributes to tag the new identity with. */
  readonly roleAttributes?: readonly string[];
  /** Enrol an edge-router endpoint instead of a client identity. */
  readonly isRouter?: boolean;
}

/**
 * The truthful outcome of an enrollment WRITE. Degrade-safe: an absent controller
 * endpoint or a controller fault resolves to `{ ok:false, reason }`, NEVER a faked
 * success. On success the created identity + its one-time enrollment JWT (when the
 * controller minted one) come back.
 */
export type ZitiEnrollOutcome =
  | { readonly ok: false; readonly reason: string }
  | { readonly ok: true; readonly identity: ZitiIdentity; readonly enrollmentJwt: string | null };

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

/**
 * A read-only ziti mesh TOPOLOGY/health snapshot — engine status plus the
 * registration objects (identities + services + enrollment posture), counted and
 * listed. This is the observe side of a registered-but-no-live-data-plane mesh:
 * it reports what is enrolled/registered, never live traffic.
 */
export interface MeshTopology {
  readonly engine: MeshEngineStatus;
  readonly identities: readonly ZitiIdentity[];
  readonly services: readonly ZitiService[];
  readonly enrollments: readonly ZitiEnrollment[];
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
