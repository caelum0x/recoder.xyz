/**
 * interop-wire truthful health. Reports the wire slice's readiness:
 *   - `up`     — signing is configured (or dev-insecure explicitly allowed) and
 *                the persistence executor is available.
 *   - `degraded` — module serves, but a dependency is impaired (no DB ⇒ registry/
 *                task projection is in-memory only; or signing required but no
 *                secret ⇒ ingress denies).
 *   - `down`   — the fail-closed posture would reject ALL ingress (production +
 *                signing required + no secret): truthful, never a faked `up`.
 */
import type { ComponentHealth, EngineStatus } from '../../shared/health-types.js';
import { degraded, healthy, unhealthy } from '../../shared/health-types.js';
import type { InteropWireConfig } from './config.js';

export interface InteropWireHealthState {
  readonly config: InteropWireConfig;
  /** True when the persistence executor is connectable (durable projection). */
  readonly persistenceAvailable: boolean;
}

const NAME = 'interop-wire';

/** Build the truthful interop-wire component health. */
export function interopWireHealth(state: InteropWireHealthState): ComponentHealth {
  const { config, persistenceAvailable } = state;
  const engines: EngineStatus[] = [
    {
      name: 'signed-ingress',
      status: config.hmacSecret ? 'up' : config.requireSignedIngress ? 'down' : 'degraded',
      reason: config.hmacSecret
        ? undefined
        : config.requireSignedIngress
          ? 'signing required but no HMAC secret configured'
          : 'unsigned ingress (dev): no HMAC secret',
    },
    {
      name: 'ed25519-ingress',
      status: config.ed25519Mode === 'enforce' ? 'up' : 'degraded',
      reason:
        config.ed25519Mode === 'enforce'
          ? undefined
          : 'permissive: invalid/unknown-key ed25519 envelopes are logged and allowed',
    },
    {
      name: 'task-projection',
      status: persistenceAvailable ? 'up' : 'degraded',
      reason: persistenceAvailable ? undefined : 'persistence executor unavailable — in-memory projection only',
    },
  ];

  // Fail-closed reality: production requiring signatures with no secret rejects
  // every inbound envelope — that is `down`, reported truthfully.
  if (config.requireSignedIngress && !config.hmacSecret) {
    return unhealthy(NAME, 'signing required but no HMAC secret — all A2A ingress rejected (fail-closed)', engines);
  }
  if (!persistenceAvailable) {
    return degraded(NAME, 'persistence executor unavailable — registry/task projection is in-memory only', engines);
  }
  return { ...healthy(NAME), engines };
}
