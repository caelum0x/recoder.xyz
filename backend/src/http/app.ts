/**
 * `createEdgeApp` — the ONE express application assembly. It builds the raw HTTP
 * server + express app, applies the canonical global middleware chain once, mounts
 * every resolved {@link RouteProvider} behind its per-mount guard, and closes with
 * the 404 + error tail. It owns NO domain state and reads NO `process.env`.
 *
 * Assembly order (mirrors the chain contract):
 *   trust-proxy / hardening
 *     → GLOBAL chain: request-context → cors → body → rate-limit(api)
 *       → for each mount (in build order):
 *            provider.health() → down ⇒ SKIP (recorded, never faked)
 *            up ⇒ app.use(base, ...guard, provider.routes())
 *       → notFound (404 tail)
 *       → errorEnvelope (terminal boundary)
 *
 * Degrade-safe: a provider whose `health()` reports `down` (or throws) is skipped
 * and surfaced in `mountStatuses` as `skipped-degraded`; the route table's
 * unresolved providers are surfaced as `missing`. The server is created but NOT
 * listening — `http/lifecycle.ts` owns bind/drain; the WS upgrade router
 * (`http/ws/upgrade-router.ts`) attaches to the returned `server`.
 */
import http from 'node:http';
import express, { type Application } from 'express';
import type { Server } from 'node:http';
import type { Logger } from '../shared/logger.js';
import type { EdgeChain } from './middleware/chain.js';
import { notFound, errorEnvelope } from './middleware/error.js';
import type { RouteTable } from '../domains/edge/route-table.js';
import type { MountStatus } from '../domains/edge/types.js';
import type { RouteProvider } from '../domains/edge/ports/route-provider.port.js';
import type { RouteProviderHealth } from '../domains/edge/ports/route-provider.port.js';

export interface EdgeAppDeps {
  /** The bound canonical chain (global links + per-mount guard compiler). */
  readonly chain: EdgeChain;
  /** The resolved route table (mounts + unresolved) from `buildRouteTable`. */
  readonly table: RouteTable;
  readonly logger: Logger;
  /** express `trust proxy` value from `AppConfig.server` (not an env read). */
  readonly trustProxy: boolean | number | string;
}

export interface EdgeApp {
  /** The composed express application (chain + mounted routers + error tail). */
  readonly app: Application;
  /** The raw HTTP server the upgrade router owns the upgrade handler on. */
  readonly server: Server;
  /** Per-mount outcome (mounted / skipped-degraded / missing) for edge health. */
  readonly mountStatuses: readonly MountStatus[];
}

/** Consult a provider's readiness without letting a thrown probe crash assembly. */
function safeHealth(provider: RouteProvider): RouteProviderHealth {
  try {
    return provider.health();
  } catch (err) {
    return { status: 'down', reason: `health() threw: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** express mounts `''` as the app root; normalise it to `'/'`. */
function mountPath(base: string): string {
  return base.length > 0 ? base : '/';
}

/** Build the express + HTTP server, apply the chain, mount providers, add the tail. */
export function createEdgeApp(deps: EdgeAppDeps): EdgeApp {
  const app = express();
  const server = http.createServer(app);

  // Hardening + proxy trust before any middleware runs.
  app.set('trust proxy', deps.trustProxy);
  app.disable('x-powered-by');

  // GLOBAL chain (once): request-context → cors → body → rate-limit(api).
  for (const link of deps.chain.buildGlobalChain()) {
    app.use(link);
  }

  const mountStatuses: MountStatus[] = [];

  for (const { spec, provider } of deps.table.mounts) {
    const health = safeHealth(provider);
    if (health.status === 'down') {
      mountStatuses.push({
        base: spec.base,
        providerKey: spec.providerKey,
        state: 'skipped-degraded',
        reason: health.reason ?? 'provider reported down',
      });
      deps.logger.warn(
        { provider: spec.providerKey, base: spec.base, reason: health.reason },
        'edge mount skipped — provider degraded',
      );
      continue;
    }

    const guard = deps.chain.buildGuard(spec.guard);
    const path = mountPath(spec.base);

    if (typeof provider.routes === 'function') {
      app.use(path, ...guard, provider.routes());
    } else if (typeof provider.mount === 'function') {
      // Escape hatch: guard the base prefix, then let the provider attach itself.
      if (guard.length > 0) app.use(path, ...guard);
      provider.mount(app);
    }

    mountStatuses.push({ base: spec.base, providerKey: spec.providerKey, state: 'mounted' });
    deps.logger.debug({ provider: spec.providerKey, base: spec.base }, 'edge mount attached');
  }

  // Providers the route table could not resolve are truthfully `missing`.
  for (const u of deps.table.unresolved) {
    mountStatuses.push({ base: '', providerKey: u.key, state: 'missing', reason: u.reason });
    deps.logger.warn({ provider: u.key, reason: u.reason }, 'edge mount missing — unresolved provider');
  }

  // Tail: 404 for unmatched routes, then the terminal error boundary. MUST be last.
  app.use(notFound());
  app.use(errorEnvelope({ logger: deps.logger }));

  return { app, server, mountStatuses };
}
