/**
 * The ONE canonical request pipeline — so all 14 domains share a single request
 * lifecycle instead of each hand-ordering middleware. Fixed order:
 *
 *   request-context → cors → body(limits) → rate-limit(api)          [GLOBAL]
 *     → rate-limit(tier?) → auth | internal-key → interop-gate       [PER-MOUNT GUARD]
 *       → route → notFound → error                                   [tail, added by composer]
 *
 * `createChain(deps)` binds every link from the injected seams (edge config +
 * identity verifier + interop chain) and returns `buildGlobalChain()` (applied
 * once to the app) and `buildGuard(policy)` (applied around each mounted router,
 * compiled from the mount's {@link GuardPolicy}). No link is re-implemented here —
 * auth consumes the identity verifier, the internal-key + interop + rate-limit
 * links consume the interop domain (conflict #10 / #1).
 */
import express, { type RequestHandler } from 'express';
import type { Logger } from '../../shared/logger.js';
import type { SessionVerifier } from '../../domains/identity/ports/session-verifier.port.js';
import type { InteropChain } from '../../domains/interop/ports/interop-chain.port.js';
import type { EdgeConfig } from '../../domains/edge/config.js';
import type { GuardPolicy } from '../../domains/edge/types.js';
import { requestContext } from './request-context.js';
import { corsMiddleware } from './cors.js';
import { httpRateLimiters, type HttpRateLimiters } from './rate-limit.js';
import { authenticateRequest, optionalAuth } from './auth.js';
import { internalKeyGate } from './internal-key.js';
import { interopGate } from './interop-gate.js';

export interface ChainDeps {
  readonly config: EdgeConfig;
  readonly logger: Logger;
  /** Phase 2 identity seam — resolves credentials → Principal for the auth link. */
  readonly verifier: SessionVerifier;
  /** Phase 3 interop seam — the ONE chain the interop-gate link runs. */
  readonly interopChain: InteropChain;
}

/** The bound chain: a global pipeline + a per-mount guard compiler. */
export interface EdgeChain {
  /** The links applied once to the app, in order, before any mount. */
  buildGlobalChain(): RequestHandler[];
  /** Compile a mount's guard into its ordered per-mount links. */
  buildGuard(policy: GuardPolicy): RequestHandler[];
  /** The bound HTTP rate-limit tiers (exposed for the composer / WS layer). */
  readonly rateLimiters: HttpRateLimiters;
}

/** Build the canonical edge chain from the injected seams. */
export function createChain(deps: ChainDeps): EdgeChain {
  const context = requestContext({ logger: deps.logger });
  const cors = corsMiddleware(deps.config.cors);
  // The global JSON parser also STASHES the exact received bytes on `req.rawBody`.
  // The billing webhook ingress (`/api/billing/webhooks/:provider`) verifies a
  // provider signature over the raw bytes; since this global parser runs before
  // every mount it would otherwise consume the stream and make signature
  // verification impossible. Capturing `rawBody` here (negligible overhead, read
  // only by the webhook route's `rawBodyOf`) preserves that trust boundary without
  // path-excluding the parser. See `billing/routes/billing-webhooks.routes.ts`.
  const body = express.json({
    limit: deps.config.bodyLimit,
    verify: (req, _res, buf) => {
      (req as { rawBody?: Buffer }).rawBody = buf;
    },
  });
  const rateLimiters = httpRateLimiters(deps.config.rateLimit, deps.logger);

  const authenticate = authenticateRequest({ verifier: deps.verifier, logger: deps.logger });
  const optional = optionalAuth({ verifier: deps.verifier, logger: deps.logger });
  const internalKey = internalKeyGate({ internalServiceKey: deps.config.internalServiceKey });
  const gateFor = interopGate({ chain: deps.interopChain, logger: deps.logger });

  const buildGlobalChain = (): RequestHandler[] => [context, cors, body, rateLimiters.api];

  const buildGuard = (policy: GuardPolicy): RequestHandler[] => {
    const links: RequestHandler[] = [];

    // 1. Per-mount rate tier (the global `api` tier already ran).
    if (policy.rateLimit && policy.rateLimit !== 'api') {
      links.push(rateLimiters[policy.rateLimit]);
    }

    // 2. Auth: internal-key gate for `/internal/*`, else session/api-key or optional.
    switch (policy.auth) {
      case 'internal':
        links.push(internalKey);
        break;
      case 'session':
      case 'api-key':
        links.push(authenticate);
        break;
      case 'optional':
        links.push(optional);
        break;
      case 'public':
        break;
    }

    // 3. Interop admission (authorize → risk → policy → audit) when enabled.
    if (policy.interop) {
      links.push(gateFor(policy));
    }

    return links;
  };

  return { buildGlobalChain, buildGuard, rateLimiters };
}
