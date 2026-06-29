/**
 * overlay.ts — the OPTIONAL zero-trust overlay seam for the network subsystem.
 *
 * The default Recoder data plane is Envoy (envoy-config.ts / xds-contract.ts):
 * mutual-TLS terminating in front of the backend, with the default-deny
 * ext_authz decision (ext-authz.ts) and the XDR pipeline (xdr/) behind it. That
 * covers same-cluster, in-mesh traffic.
 *
 * For CROSS-MACHINE traffic (remote teams, enterprise tenants, an operator's
 * terminal reaching the mesh from outside the cluster) there is an OPTIONAL
 * second layer: an identity-based zero-trust overlay (OpenZiti). The overlay's
 * heavy implementation is PARK-VENDOR and stays out of this package:
 *
 *   - `go/ziti`                                    — the OpenZiti controller /
 *                                                    router / SDK source tree
 *                                                    (vendored, built via the
 *                                                    repo Makefile, never a Go
 *                                                    dependency of this package).
 *   - `packages/agent-oss/src/openziti/*`          — the OSS run-event adapter
 *                                                    profile (`openZitiAdapterProfile`).
 *   - `packages/recoder-a2a/enroll.js`             — the per-terminal Ziti
 *                                                    identity enrollment CLI.
 *
 * This module owns only the PURE, IO-free CONTRACT for that seam — mirroring the
 * `ports.ts` pattern (PolicyAdvisorPort / AuditSinkPort) and the `xds-contract.ts`
 * cross-language pattern. It lets the pure network layer reason about whether the
 * overlay is enabled and how an overlay-terminated request maps onto the SAME
 * default-deny authz decision, WITHOUT importing any OpenZiti runtime, opening a
 * socket, or pulling in the park-vendor Go tree.
 *
 * Hostile-by-default carries through: the overlay does not bypass authz. An
 * overlay-terminated request still flows through `decideNetworkAuthz`; the
 * overlay identity is mapped to the authz request's actor so the SAME policy
 * engine decides allow/deny. The overlay narrows WHO can reach the mesh edge; it
 * never widens what they may do once inside.
 */

/**
 * Whether the optional zero-trust overlay is engaged for a given deployment.
 * `envoy_only` is the default, fully-supported posture (no overlay). The other
 * states describe how the OpenZiti overlay sits relative to the Envoy data plane
 * when it IS adopted — they are contract labels for the adopting service's thin
 * adapter, not behavior implemented in this package.
 */
export type OverlayMode =
  /** No overlay. Envoy mTLS + ext_authz only (default, always available). */
  | 'envoy_only'
  /** OpenZiti terminates the identity tunnel IN FRONT of Envoy; Envoy still authz's. */
  | 'ziti_ingress'
  /** Envoy ORIGINATES into the Ziti fabric for selected upstreams (egress overlay). */
  | 'ziti_egress';

/**
 * A resolved overlay identity, as seen by the adopting service AFTER the
 * park-vendor OpenZiti layer has terminated the tunnel and verified the X.509
 * identity. This is the only shape the pure layer needs: an opaque, already-
 * authenticated identity name plus the controller it enrolled against. The
 * package never performs the enrollment or the verification — it consumes the
 * result.
 */
export interface OverlayIdentity {
  /** The verified Ziti identity name (maps onto the authz actor). */
  readonly identity: string;
  /** The Ziti controller URL the identity enrolled against (provenance, safe to log). */
  readonly controller: string;
}

/**
 * OverlayPort — the seam the adopting service implements with a thin adapter over
 * the park-vendor OpenZiti layer. Like `PolicyAdvisorPort`/`AuditSinkPort`, the
 * package depends only on this contract, never on the OpenZiti runtime.
 *
 * `isEnabled` lets the pure network layer branch on overlay posture without any
 * IO. `resolveIdentity` is supplied an opaque, transport-provided token the
 * adapter has ALREADY verified out-of-band (e.g. the Ziti SDK's terminated
 * identity for the connection); it returns the mapped identity or `null` when no
 * verified overlay identity is present. It MUST be synchronous and MUST NOT throw
 * for the routine "no identity" case — return `null` so the caller fails closed
 * to the default-deny path.
 */
export interface OverlayPort {
  /** The overlay posture for this deployment. */
  mode(): OverlayMode;
  /** Convenience: true when any Ziti overlay mode is active. */
  isEnabled(): boolean;
  /**
   * Map an already-verified, transport-provided overlay token to its identity.
   * Returns `null` when there is no verified overlay identity for the connection.
   */
  resolveIdentity(verifiedToken: string): OverlayIdentity | null;
}

/**
 * A no-op overlay port for the default `envoy_only` posture. Pure and total:
 * the overlay is never enabled and never resolves an identity, so the network
 * layer's default-deny path is unchanged. The adopting service replaces this
 * with a thin OpenZiti-backed adapter only when it actually adopts the overlay.
 */
export const disabledOverlayPort: OverlayPort = {
  mode: () => 'envoy_only',
  isEnabled: () => false,
  resolveIdentity: () => null,
};

/**
 * Resolve the actor an overlay-terminated request should be authorized AS. When
 * the overlay is disabled or no verified identity is present, returns the
 * supplied `fallbackActor` unchanged, so an overlay-off deployment behaves
 * exactly as before this seam existed. When an overlay identity IS present, the
 * Ziti identity name becomes the actor — the request then flows through the SAME
 * `decideNetworkAuthz` default-deny decision, never bypassing it.
 *
 * Pure: no IO, no throw. This is the only behavioral helper the seam adds; the
 * heavy tunnel termination stays in the park-vendor OpenZiti layer behind
 * {@link OverlayPort}.
 */
export function overlayActorFor(
  port: OverlayPort,
  verifiedToken: string | undefined,
  fallbackActor: string,
): string {
  if (!port.isEnabled() || verifiedToken === undefined) {
    return fallbackActor;
  }
  const resolved = port.resolveIdentity(verifiedToken);
  return resolved === null ? fallbackActor : resolved.identity;
}
