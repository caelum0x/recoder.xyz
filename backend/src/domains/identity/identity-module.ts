/**
 * Identity composer — fuses the Better Auth adapter, the credential resolver
 * ({@link PrincipalService} = the frozen {@link SessionVerifier} seam), the auth
 * middleware, the `/api/auth/*` host, and truthful health behind one
 * {@link IdentityModule}.
 *
 * The seam is the point: `verifier()` + `middleware()` are what every other
 * domain builds against. The `sk_`-key / device-flow / orgs / RBAC feature
 * services are injected (optional) so parallel agents can wire them without
 * touching this composer — a missing service degrades that path safely rather
 * than breaking the seam.
 */
import { Router } from 'express';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import { sendSuccess } from '../../shared/errors.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { SessionVerifier } from './ports/session-verifier.port.js';
import type { ApiKeyValidator } from './ports/api-key.port.js';
import type { DeviceTokenValidator } from './ports/device-flow.port.js';
import type { PermissionEvaluator } from './ports/rbac.port.js';
import { sliceIdentityConfig, type IdentityConfig } from './config.js';
import {
  createBetterAuthAdapter,
  type AuthSenders,
  type BetterAuthAdapter,
} from './adapters/better-auth.adapter.js';
import { PrincipalService } from './principal.service.js';
import { createAuthMiddleware, type AuthMiddleware } from './middleware/authenticate.middleware.js';
import { buildAuthRouter } from './routes/auth.routes.js';
import { buildInternalIdentityRouter } from './routes/internal-identity.routes.js';
import { buildIdentityHealth } from './health.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import {
  createIdentityRepository,
  createBetterAuthUserReader,
  type IdentityReadModel,
  type IdentityRepositoryImpl,
} from './repositories/identity.repository.js';
import { buildIdentityMcpTools } from './mcp/identity-engine.js';
import type { IdentityModule, IdentityModuleDeps } from './index.js';

export class IdentityModuleImpl implements IdentityModule {
  readonly name = 'identity' as const;

  private readonly cfg: IdentityConfig;
  private readonly log: Logger;
  private readonly executor?: QueryExecutor;
  private readonly adapter: BetterAuthAdapter;
  private readonly principalSvc: PrincipalService;
  private readonly authMiddleware: AuthMiddleware;
  private readonly identityRepo?: IdentityRepositoryImpl;

  constructor(deps: IdentityModuleDeps) {
    this.cfg = sliceIdentityConfig(deps.config);
    this.log = deps.logger;
    this.executor = deps.executor;

    const senders: AuthSenders | undefined = deps.senders;
    this.adapter = createBetterAuthAdapter({
      config: this.cfg,
      logger: this.log,
      ...(senders ? { senders } : {}),
    });

    this.principalSvc = new PrincipalService({
      config: this.cfg,
      logger: this.log,
      authSession: this.adapter,
      ...(deps.apiKeyValidator ? { apiKeyValidator: deps.apiKeyValidator } : {}),
      ...(deps.deviceTokenValidator ? { deviceTokenValidator: deps.deviceTokenValidator } : {}),
    });

    this.authMiddleware = createAuthMiddleware({
      verifier: this.principalSvc,
      principal: this.principalSvc,
      config: this.cfg,
      logger: this.log,
      ...(deps.evaluator ? { evaluator: deps.evaluator } : {}),
      ...(deps.adminUserIds ? { adminUserIds: deps.adminUserIds } : {}),
    });

    // Unified identity read model. Requires the persistence executor (link table);
    // the auth-user reader is either injected (tests) or the default @recoder/auth
    // reader when the auth DB is configured — otherwise canonical lookups degrade.
    if (this.executor) {
      const authUserReader =
        deps.authUserReader ??
        (this.cfg.authDatabaseUrl ? createBetterAuthUserReader(this.log) : undefined);
      this.identityRepo = createIdentityRepository({
        executor: this.executor,
        logger: this.log,
        ...(authUserReader ? { authUserReader } : {}),
      });
    }
  }

  verifier(): SessionVerifier {
    return this.principalSvc;
  }

  principalService(): PrincipalService {
    return this.principalSvc;
  }

  middleware(): AuthMiddleware {
    return this.authMiddleware;
  }

  betterAuth(): BetterAuthAdapter {
    return this.adapter;
  }

  /** The Better Auth host router — mount at `/api/auth`. */
  authRoutes(): Router {
    return buildAuthRouter({ adapter: this.adapter, verifier: this.principalSvc });
  }

  /**
   * The `/api/identity/*` router. The seam ships a truthful `GET /health`; the
   * keys/device/orgs sub-routers are added by their feature agents.
   */
  routes(): Router {
    const router = Router();
    router.get('/health', (_req, res) => {
      sendSuccess(res, buildIdentityHealth({ adapter: this.adapter, config: this.cfg, ...(this.executor ? { executor: this.executor } : {}) }));
    });
    return router;
  }

  identityRepository(): IdentityReadModel | undefined {
    return this.identityRepo;
  }

  /** The `/internal/identity/*` router — INTERNAL_SERVICE_KEY-gated resolution edges. */
  internalRoutes(): Router {
    return buildInternalIdentityRouter(this);
  }

  /** MCP tools contributed by identity (whoami / resolve / link). */
  mcp(): readonly McpToolRegistration[] {
    return buildIdentityMcpTools(this);
  }

  health(): ComponentHealth {
    return buildIdentityHealth({
      adapter: this.adapter,
      config: this.cfg,
      ...(this.executor ? { executor: this.executor } : {}),
    });
  }

  async start(): Promise<void> {
    this.log.info(
      { betterAuth: this.adapter.isReady(), strictAuth: this.cfg.strictAuth },
      'identity module started',
    );
  }

  async stop(): Promise<void> {
    // No owned pools/supervisors in the seam; Better Auth's Prisma client is a
    // process-global singleton owned by @recoder/auth. Idempotent no-op.
  }
}
