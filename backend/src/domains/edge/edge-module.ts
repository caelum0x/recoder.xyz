/**
 * `EdgeComposer` — the Phase-4 composer that assembles the stateless HTTP/WS
 * surface from the frozen seams of the earlier phases. It owns NO domain state; it
 * wires:
 *
 *   1. the edge config slice        (from `AppConfig`, no `process.env`),
 *   2. the ONE canonical chain      (`createChain` over the identity verifier +
 *                                     interop chain — never re-implemented here),
 *   3. the route table              (`buildRouteTable` over the collected providers),
 *   4. the express app + HTTP server (`createEdgeApp` — chain + mounts + tail),
 *   5. the single WS upgrade router  (`createUpgradeRouter` — conflict #6 owner),
 *
 * and exposes the `EdgeModule` surface bootstrap listens on: `app`, `server`,
 * `listen()`, `stop()`, and a truthful `health()` folded into the aggregate.
 *
 * Fail-fast: the boot-time `INTERNAL_SERVICE_KEY` strength check runs at
 * construction (a weak/placeholder key in production throws before the server
 * binds). Degrade-safe: a `down`/unresolved provider is skipped + surfaced, never
 * faked; an empty WS registry is valid (the terminal backend registers in Phase 5).
 */
import type { Application } from 'express';
import type { Server } from 'node:http';
import type { ComponentHealth } from '../../shared/health-types.js';
import { createChain, type EdgeChain } from '../../http/middleware/chain.js';
import { assertInternalKeyStrength } from '../../http/middleware/internal-key.js';
import { createEdgeApp } from '../../http/app.js';
import { listenServer, drainServer, isListening } from '../../http/lifecycle.js';
import { createUpgradeRouter, type UpgradeRouter } from '../../http/ws/upgrade-router.js';
import { sliceEdgeConfig, type EdgeConfig } from './config.js';
import { buildRouteTable, type RouteTable, type RouteTableOptions } from './route-table.js';
import { buildEdgeHealth, toComponentHealth } from './health.js';
import type { EdgeDeps, EdgeHealth, EdgeModule, MountStatus } from './types.js';
import type { WsBackend } from './ports/ws-backend.port.js';

/** Extra composer inputs beyond the frozen {@link EdgeDeps} (all optional). */
export interface EdgeComposerOptions {
  /** Per-mount guard overrides / default-guard replacement for the route table. */
  readonly routeTable?: RouteTableOptions;
}

export class EdgeComposer implements EdgeModule {
  readonly name = 'edge' as const;
  readonly app: Application;
  readonly server: Server;

  private readonly cfg: EdgeConfig;
  private readonly host: string;
  private readonly port: number;
  private readonly drainMs: number;
  private readonly chain: EdgeChain;
  private readonly table: RouteTable;
  private readonly mountStatuses: readonly MountStatus[];
  private readonly upgrade: UpgradeRouter;
  private readonly log: EdgeDeps['logger'];

  constructor(deps: EdgeDeps, options: EdgeComposerOptions = {}) {
    this.log = deps.logger;
    this.cfg = deps.edgeConfig ?? sliceEdgeConfig(deps.config);
    this.host = deps.config.server.host;
    this.port = deps.config.server.port;
    this.drainMs = this.cfg.shutdownDrainMs;

    // Fail-fast at boot: a weak/placeholder /internal key in production throws now.
    assertInternalKeyStrength(this.cfg.internalServiceKey, this.cfg.isProduction);

    // 2. The ONE chain — over the identity verifier + interop chain (not re-built).
    const baseChain = createChain({
      config: this.cfg,
      logger: deps.logger,
      verifier: deps.verifier,
      interopChain: deps.interopChain,
    });
    // Append any injected global middleware (Phase-11 observability telemetry) to
    // the END of the canonical global chain, so it runs after request-context →
    // cors → body → rate-limit but BEFORE any per-mount guard/router — wrapping
    // every downstream mount with correlation + RED metrics. The chain impl itself
    // is never re-implemented; only its global links are threaded through here.
    const extra = deps.globalMiddleware ?? [];
    this.chain =
      extra.length === 0
        ? baseChain
        : { ...baseChain, buildGlobalChain: () => [...baseChain.buildGlobalChain(), ...extra] };

    // 3. Route table from the collected providers.
    this.table = buildRouteTable(deps.providers, options.routeTable ?? {});

    // 4. App + HTTP server (chain applied once, providers mounted, 404/error tail).
    const built = createEdgeApp({
      chain: this.chain,
      table: this.table,
      logger: deps.logger,
      trustProxy: deps.config.server.trustProxy,
    });
    this.app = built.app;
    this.server = built.server;
    this.mountStatuses = built.mountStatuses;

    // 5. The single WS upgrade owner (conflict #6). Empty registry is valid.
    this.upgrade = createUpgradeRouter({
      server: this.server,
      verifier: deps.verifier,
      config: this.cfg,
      logger: deps.logger,
      backends: deps.wsBackends,
    });

    this.log.info(
      {
        mounts: this.mountStatuses.filter((m) => m.state === 'mounted').length,
        skipped: this.mountStatuses.filter((m) => m.state !== 'mounted').length,
        wsBackends: this.upgrade.backends.length,
      },
      'edge composed',
    );
  }

  /** Register an additional WS backend after construction (e.g. Phase-5 terminal). */
  registerWsBackend(backend: WsBackend): void {
    this.upgrade.register(backend);
  }

  /** Begin accepting connections (idempotent). */
  async listen(): Promise<void> {
    await listenServer(this.server, { host: this.host, port: this.port });
    this.log.info({ host: this.host, port: this.port }, 'edge listening');
  }

  /** Graceful drain + WS close (idempotent, degrade-safe). */
  async stop(): Promise<void> {
    await this.upgrade.close();
    await drainServer(this.server, this.drainMs);
    this.log.info('edge stopped');
  }

  /** The structured edge health (server + per-mount + per-WS). */
  edgeHealth(): EdgeHealth {
    return buildEdgeHealth({
      listening: isListening(this.server),
      mounts: this.mountStatuses,
      wsBackends: this.upgrade.statuses(),
    });
  }

  /** Truthful component health folded into the aggregate `/health`. */
  health(): ComponentHealth {
    return toComponentHealth(this.edgeHealth());
  }
}
