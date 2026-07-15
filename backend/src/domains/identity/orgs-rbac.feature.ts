/**
 * Orgs + RBAC feature wiring — the single call bootstrap uses to assemble the
 * org/team/membership lifecycle, the {@link PermissionEvaluator}, and the orgs
 * router from one persistence executor.
 *
 * Chicken-and-egg the factory resolves: the orgs router needs the auth
 * middleware, and the middleware needs the evaluator. So the factory yields the
 * `evaluator` FIRST (inject it into `createIdentityModule({ evaluator })`), then
 * `buildRouter(middleware)` builds the router against the composed middleware:
 *
 * ```ts
 * const orgsRbac = createOrgsRbacFeature({ executor: persistence.executor(), logger });
 * const identity = createIdentityModule({ ..., evaluator: orgsRbac.evaluator });
 * app.use(DOMAIN_REGISTRY.identity.mountBase, orgsRbac.buildRouter(identity.middleware()));
 * ```
 *
 * Degrade-safe: with no executor there is nothing to build; callers gate on
 * `persistence.executor()` presence before calling this.
 */
import type { Router } from 'express';
import type { Logger } from '../../shared/logger.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from './middleware/authenticate.middleware.js';
import type { PermissionEvaluator } from './ports/rbac.port.js';
import type { OrgService } from './ports/org.port.js';
import { createOrgStores } from './repositories/org.repository.js';
import { createPermissionOverrideStore } from './repositories/rbac.repository.js';
import { createRbacService } from './rbac.service.js';
import { createOrgService, type GovernanceGate } from './org.service.js';
import { buildOrgsRouter } from './routes/orgs.routes.js';

export interface OrgsRbacFeatureDeps {
  readonly executor: QueryExecutor;
  readonly logger: Logger;
  /** Optional Phase-3 governance gate for org writes. */
  readonly governance?: GovernanceGate;
}

export interface OrgsRbacFeature {
  /** The RBAC evaluator — inject into `createIdentityModule({ evaluator })`. */
  readonly evaluator: PermissionEvaluator;
  /** The org lifecycle service (also consumed by MCP tools / other domains). */
  readonly orgService: OrgService;
  /** Build the orgs router against the composed auth middleware. */
  buildRouter(middleware: AuthMiddleware): Router;
}

/** Assemble the orgs + RBAC feature from a persistence executor. */
export function createOrgsRbacFeature(deps: OrgsRbacFeatureDeps): OrgsRbacFeature {
  const stores = createOrgStores(deps.executor);
  const overrides = createPermissionOverrideStore(deps.executor);

  const evaluator = createRbacService({
    memberships: stores.memberships,
    overrides,
    logger: deps.logger,
  });

  const orgService = createOrgService({
    executor: deps.executor,
    logger: deps.logger,
    ...(deps.governance ? { governance: deps.governance } : {}),
  });

  return {
    evaluator,
    orgService,
    buildRouter: (middleware: AuthMiddleware): Router => buildOrgsRouter({ orgService, middleware }),
  };
}
