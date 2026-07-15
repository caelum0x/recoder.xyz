/**
 * Truthful interop health (ARCHITECTURE §10.1). The A2A/edge domain reports the
 * state of its admission engines, never a faked `up`:
 *
 *  - `interop-chain`  — the `authorize→risk→policy→audit` gate. `up` only when a
 *    real governance gate is wired; `down` when unwired (every edge fails closed,
 *    so the chain is truthfully non-serving rather than a silent open door).
 *  - `signed-ingress` — the hostile-ingress verifier. Until the wire group wires
 *    the real `@recoder/interop` verifier this is `degraded` (untrusted ingress
 *    is rejected fail-closed — safe, but not fully serving).
 *  - `internal-key`   — the `/internal/*` gate. `up` when the key is configured;
 *    `degraded` (not `down`) when absent — a valid "no internal callers" posture.
 *
 * Rollup: gate unwired → `down`. Otherwise `degraded` when ingress is unwired or
 * the internal-key gate is unconfigured; else `up`. In a solo boot with the
 * governance gate wired but no ingress verifier, interop is truthfully `degraded`.
 */
import type { ComponentHealth, EngineStatus, HealthStatus } from '../../shared/health-types.js';
import type { InteropConfig } from './config.js';

export interface InteropHealthDeps {
  /** Is a real governance gate wired behind the interop chain? */
  readonly gateWired: boolean;
  /** Is a real signed-ingress verifier wired (untrusted A2A ingress)? */
  readonly ingressVerifierWired: boolean;
  readonly config: InteropConfig;
}

/** Build the interop component health from the wired gate + ingress posture. */
export function buildInteropHealth(deps: InteropHealthDeps): ComponentHealth {
  const { gateWired, ingressVerifierWired, config } = deps;

  const chain: EngineStatus = gateWired
    ? { name: 'interop-chain', status: 'up' }
    : {
        name: 'interop-chain',
        status: 'down',
        reason: 'governance gate not wired — every edge fails closed',
      };

  const ingress: EngineStatus = ingressVerifierWired
    ? { name: 'signed-ingress', status: 'up' }
    : config.allowInsecureIngress && !config.requireSignedIngress
      ? {
          name: 'signed-ingress',
          status: 'degraded',
          reason: 'no verifier wired — insecure ingress allowed (local dev only)',
        }
      : {
          name: 'signed-ingress',
          status: 'degraded',
          reason: 'no signed-ingress verifier wired — untrusted ingress rejected (fail-closed)',
        };

  const internalKey: EngineStatus = config.internalServiceKeyPresent
    ? { name: 'internal-key', status: 'up' }
    : {
        name: 'internal-key',
        status: 'degraded',
        reason: 'INTERNAL_SERVICE_KEY not configured (no internal callers)',
      };

  const engines: readonly EngineStatus[] = [chain, ingress, internalKey];

  let status: HealthStatus;
  if (chain.status === 'down') {
    status = 'down';
  } else if (ingress.status !== 'up' || internalKey.status !== 'up') {
    status = 'degraded';
  } else {
    status = 'up';
  }

  const base = {
    name: 'interop',
    status,
    degraded: status !== 'up',
    engines,
    detail: {
      signingMode: config.signingMode,
      requireSignedIngress: config.requireSignedIngress,
    },
  };

  if (status === 'up') return base;
  const reason = engines
    .filter((e) => e.status !== 'up')
    .map((e) => `${e.name}: ${e.reason ?? e.status}`)
    .join('; ');
  return { ...base, reason };
}
