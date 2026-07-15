/**
 * Identity domain — public factory + the ONE public interface.
 *
 * `createIdentityModule(deps)` builds the composer that hosts Better Auth
 * in-process, resolves any credential to a canonical {@link Principal} via the
 * frozen {@link SessionVerifier} seam, and exposes the auth middleware every
 * other domain guards requests with.
 *
 * The seam surface (`verifier()`, `middleware()`) is what the other 13 domains
 * compile against. Feature services (`sk_` keys, device flow, orgs, RBAC,
 * identity unification) are OPTIONAL injected deps so parallel agents extend the
 * module without editing the composer; each missing service degrades safely.
 */
import type { Router } from 'express';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { SessionVerifier } from './ports/session-verifier.port.js';
import type { ApiKeyValidator } from './ports/api-key.port.js';
import type { DeviceTokenValidator } from './ports/device-flow.port.js';
import type { PermissionEvaluator } from './ports/rbac.port.js';
import type { AuthSenders, BetterAuthAdapter } from './adapters/better-auth.adapter.js';
import type { PrincipalService } from './principal.service.js';
import type { AuthMiddleware } from './middleware/authenticate.middleware.js';
import type { AuthUserReader, IdentityReadModel } from './repositories/identity.repository.js';
import type { McpToolRegistration } from '../../shared/module-base.js';

/** Dependencies injected by bootstrap. */
export interface IdentityModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor the sk_/device/org stores bind to (optional). */
  readonly executor?: QueryExecutor;
  /** Email/notify senders for Better Auth; a logging stub is used when omitted. */
  readonly senders?: AuthSenders;
  /** `sk_` key validator (from the api-key feature); absent → sk_ resolution off. */
  readonly apiKeyValidator?: ApiKeyValidator;
  /** Device-token validator (from the device-flow feature); absent → device off. */
  readonly deviceTokenValidator?: DeviceTokenValidator;
  /** RBAC evaluator (from the rbac feature); absent → requirePermission fails closed. */
  readonly evaluator?: PermissionEvaluator;
  /** Admin allowlist (userIds) for `requireAdmin`. */
  readonly adminUserIds?: readonly string[];
  /**
   * Reader over the Better Auth `user` table (separate auth DB) for the unified
   * identity read model. When omitted, the composer builds the default
   * `@recoder/auth`-backed reader IF the auth DB is configured; otherwise canonical
   * identity lookups degrade to `null` (truthful, never faked).
   */
  readonly authUserReader?: AuthUserReader;
}

/** The public surface every other domain consumes. */
export interface IdentityModule {
  readonly name: 'identity';
  /** THE load-bearing seam: resolve any credential → {@link Principal}. */
  verifier(): SessionVerifier;
  /** The concrete principal service (anonymous fallback + internal-key helpers). */
  principalService(): PrincipalService;
  /** Express auth middleware factories every domain guards routes with. */
  middleware(): AuthMiddleware;
  /** The Better Auth adapter (session read + Web-Fetch handler). */
  betterAuth(): BetterAuthAdapter;
  /** The Better Auth host router — mount at `/api/auth`. */
  authRoutes(): Router;
  /** The `/api/identity/*` router (health now; keys/device/orgs added later). */
  routes(): Router;
  /**
   * The unified identity read model over the separate `user`/`users` tables, or
   * `undefined` when persistence is not injected (no control-plane executor).
   */
  identityRepository(): IdentityReadModel | undefined;
  /** The `/internal/identity/*` router (INTERNAL_SERVICE_KEY-gated). */
  internalRoutes(): Router;
  /** MCP tools contributed by identity (whoami / resolve / link). */
  mcp(): readonly McpToolRegistration[];
  /** Truthful component health. */
  health(): ComponentHealth;
  /** Boot hook (idempotent). */
  start(): Promise<void>;
  /** Shutdown hook (idempotent, degrade-safe). */
  stop(): Promise<void>;
}

// Value import last so the type-only imports above form no runtime cycle.
import { IdentityModuleImpl } from './identity-module.js';

/** Build the identity module. */
export function createIdentityModule(deps: IdentityModuleDeps): IdentityModule {
  return new IdentityModuleImpl(deps);
}
