/**
 * Shared edge domain types — the declarative vocabulary the composer, the route
 * table, the middleware chain, and edge health speak.
 *
 * The edge is STATELESS request plumbing: these types describe HOW a domain's
 * router is mounted + guarded (`MountSpec` + `GuardPolicy`), the composer's deps
 * (`EdgeDeps`), the public module surface (`EdgeModule`), and truthful edge
 * health (`EdgeHealth`). None of them owns domain state.
 */
import type { Application, RequestHandler } from 'express';
import type { Server } from 'node:http';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { DomainModule } from '../../shared/module-base.js';
import type { RiskTier } from '../governance/types.js';
import type { SessionVerifier } from '../identity/ports/session-verifier.port.js';
import type { InteropChain } from '../interop/ports/interop-chain.port.js';
import type { RouteProvider } from './ports/route-provider.port.js';
import type { WsBackend } from './ports/ws-backend.port.js';
import type { EdgeConfig } from './config.js';

/**
 * How a mount authenticates. `public` runs no auth; `optional` attaches a
 * principal when one resolves but never rejects; `session`/`api-key` require a
 * resolved principal (401 on miss); `internal` requires the `INTERNAL_SERVICE_KEY`
 * gate (single source, from interop).
 */
export type AuthMode = 'public' | 'optional' | 'session' | 'api-key' | 'internal';

/** The three HTTP rate-limit tiers. `api` is the global default. */
export type RateTier = 'api' | 'heavy' | 'auth';

/**
 * The per-mount cross-cutting policy the chain compiles into an ordered guard.
 * Pure data — no express here; consumed by `chain.buildGuard` + the interop gate
 * + OpenAPI.
 */
export interface GuardPolicy {
  /** Credential requirement for the mount. */
  readonly auth: AuthMode;
  /** Run the interop chain (`authorize → risk → policy → audit`) for the mount. */
  readonly interop: boolean;
  /** Rate-limit tier; omitted ⇒ only the global `api` tier applies. */
  readonly rateLimit?: RateTier;
  /** Declared risk class (drives interop policy classification / audit detail). */
  readonly riskClass?: RiskTier;
  /** Governance write scope (path glob) for a writeful mount; presence ⇒ write. */
  readonly writeScope?: string;
  /** Explicit dotted `resource.verb` action override for the interop context. */
  readonly action?: string;
}

/**
 * One declarative row of the API surface: a domain's router mounted under `base`
 * with `guard`. `internal: true` marks an `INTERNAL_SERVICE_KEY`-gated mount.
 */
export interface MountSpec {
  /** The base path the provider's router mounts under (e.g. `/api/agent-os`). */
  readonly base: string;
  /** The `RouteProvider.key` this mount resolves to. */
  readonly providerKey: string;
  /** The cross-cutting guard applied around the provider's router. */
  readonly guard: GuardPolicy;
  /** True for `/internal/*` service-to-service mounts. */
  readonly internal?: boolean;
}

/** The mount outcome the composer records for truthful edge health. */
export interface MountStatus {
  readonly base: string;
  readonly providerKey: string;
  /** `mounted` when healthy; `skipped-degraded` when the provider reported down; `missing` when unresolved. */
  readonly state: 'mounted' | 'skipped-degraded' | 'missing';
  readonly reason?: string;
}

/** The WS backend registration outcome for health. */
export interface WsBackendStatus {
  readonly path: string;
  readonly status: 'up' | 'down';
  readonly reason?: string;
}

/** Truthful edge health: server state + per-mount + per-WS registration status. */
export interface EdgeHealth {
  readonly status: 'up' | 'down' | 'degraded';
  readonly degraded: boolean;
  readonly listening: boolean;
  readonly mounts: readonly MountStatus[];
  readonly wsBackends: readonly WsBackendStatus[];
}

/**
 * Dependencies the edge composer receives from bootstrap. The edge consumes the
 * frozen seams of the earlier phases (never re-implements them): the identity
 * {@link SessionVerifier}, the interop {@link InteropChain}, and the domains'
 * {@link RouteProvider}s + {@link WsBackend}s.
 */
export interface EdgeDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** Phase 2 identity seam — resolves any credential → Principal for auth. */
  readonly verifier: SessionVerifier;
  /** Phase 3 interop seam — the ONE `authorize → risk → policy → audit` chain. */
  readonly interopChain: InteropChain;
  /** The domain routers to mount (each behind the chain + its `MountSpec` guard). */
  readonly providers: readonly RouteProvider[];
  /** WS stream backends registered with the upgrade router. */
  readonly wsBackends?: readonly WsBackend[];
  /**
   * Optional global middleware APPENDED to the canonical global chain (after
   * request-context → cors → body → rate-limit, before any per-mount guard). This
   * is the seam Phase-11 observability injects its telemetry tap through so every
   * downstream mount is correlated + metered. The edge NEVER re-implements the tap;
   * it only threads it into the single global chain (conflict-free ordering).
   */
  readonly globalMiddleware?: readonly RequestHandler[];
  /** Optional pre-sliced edge config; derived from `config` when omitted. */
  readonly edgeConfig?: EdgeConfig;
}

/**
 * The public edge module surface returned to bootstrap. Extends the common
 * `DomainModule` (name + truthful `health()` + lifecycle) with the concrete app +
 * server handles the entrypoint listens on.
 */
export interface EdgeModule extends DomainModule {
  readonly name: 'edge';
  /** The composed express application (chain + mounted routers + error tail). */
  readonly app: Application;
  /** The raw HTTP server express-ws owns the upgrade handler on. */
  readonly server: Server;
  /** Begin accepting connections (idempotent). */
  listen(): Promise<void>;
  /** Graceful drain + close (idempotent, degrade-safe). */
  stop(): Promise<void>;
  /** Truthful component health (edge state folded into the aggregate). */
  health(): ComponentHealth;
}
