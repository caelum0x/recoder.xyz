/**
 * The edge interop gate — a THIN wrapper over the Phase-3 interop chain
 * (`authorize → risk → policy → audit`). It CONSUMES interop's `interopGuard`
 * (which runs the ONE `InteropChain` over governance's gate + always records an
 * audit entry, on allow AND deny); the edge does NOT re-run the chain or touch
 * the governance gate directly. This wrapper only translates a mount's
 * {@link GuardPolicy} into the chain's per-request context (action / write
 * detection / target) so each mount is admitted under its declared policy.
 *
 * Deny → `AUTHZ_PROJECT_ACCESS_DENIED`, unauthenticated-at-authorize →
 * `AUTH_REQUIRED`, evaluator fault → `SERVICE_UNAVAILABLE` — all handled inside
 * the consumed `interopGuard` (fail-closed, truthful).
 */
import type { Request, RequestHandler } from 'express';
import type { Logger } from '../../shared/logger.js';
import { interopGuard } from '../../domains/interop/middleware/interop.middleware.js';
import type { InteropChain } from '../../domains/interop/ports/interop-chain.port.js';
import type { GateTarget } from '../../domains/governance/types.js';
import type { GuardPolicy } from '../../domains/edge/types.js';

export interface InteropGateDeps {
  /** The single interop chain (over the governance gate) — from `interop.chain()`. */
  readonly chain: InteropChain;
  readonly logger?: Logger;
}

/** Build the concrete governance target for a mount's guard. */
function targetOf(guard: GuardPolicy): (req: Request) => GateTarget {
  return (req) => ({
    path: `${req.baseUrl}${req.path}`,
    ...(guard.writeScope ? { environment: guard.writeScope } : {}),
  });
}

/**
 * Build a factory that turns a mount's {@link GuardPolicy} into an interop-gate
 * middleware. The composer calls the returned fn once per mount:
 * `interopGate(deps)(mount.guard)`.
 */
export function interopGate(deps: InteropGateDeps): (guard: GuardPolicy) => RequestHandler {
  return (guard: GuardPolicy): RequestHandler =>
    interopGuard(deps.chain, {
      ...(deps.logger ? { logger: deps.logger } : {}),
      ...(guard.action ? { actionOf: () => guard.action as string } : {}),
      // A declared write scope forces write-classification through the gate
      // `decide` even for a GET (e.g. a read that triggers a governed mutation).
      ...(guard.writeScope ? { isWriteOf: () => true } : {}),
      targetOf: targetOf(guard),
    });
}
