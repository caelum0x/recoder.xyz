/**
 * The composition root: `start()`.
 *
 * Boot sequence:
 *   1. load + validate config (once)                → AppConfig
 *   2. build the DI container, register foundations → Container
 *   3. build the express + express-ws app           → { app, server }
 *   4. register `/health` from the health registry  → truthful aggregate
 *   5. listen on the configured port                → BootHandle
 *   6. wire graceful drain into the lifecycle
 *
 * Phase 0 registers NO domain modules — this is a bootable empty host. Later
 * phases add `create<Domain>Module(deps)` registrations between steps 2 and 3
 * (before the route table is built) without changing this file's shape.
 */
import http from 'node:http';
import express from 'express';
import expressWs from 'express-ws';

import type { AppConfig } from '../shared/app-config.js';
import type { Logger } from '../shared/logger.js';
import { childLogger, rootLogger } from '../shared/logger.js';
import { TOKENS, createToken, DOMAIN_TOKENS } from '../shared/di-tokens.js';
import { errorEnvelope, notFound } from '../shared/errors.js';
import { DOMAIN_REGISTRY } from '../shared/domain-registry.js';

import { loadConfig, type EnvSource } from './config.js';
import { createContainer, Container } from './container.js';
import { createHealthRegistry, HealthRegistry } from './health-registry.js';
import { createEngineSupervisor, EngineSupervisor } from './engine-supervisor.js';
import { createLifecycle, Lifecycle } from './lifecycle.js';
import { createPersistenceModule } from '../domains/persistence/index.js';

/** Bootstrap-owned DI tokens (beyond the shared foundation tokens). */
export const BOOT_TOKENS = {
  HealthRegistry: createToken<HealthRegistry>('HealthRegistry'),
  EngineSupervisor: createToken<EngineSupervisor>('EngineSupervisor'),
  Lifecycle: createToken<Lifecycle>('Lifecycle'),
} as const;

/** The handle `start()` returns to the entrypoint. */
export interface BootHandle {
  readonly config: AppConfig;
  readonly container: Container;
  readonly healthRegistry: HealthRegistry;
  readonly lifecycle: Lifecycle;
  readonly app: express.Application;
  readonly server: http.Server;
  /** The concrete URL the server is listening on. */
  readonly url: string;
  /** Trigger a graceful shutdown (also runs on SIGTERM/SIGINT). */
  stop(): Promise<void>;
}

export interface StartOptions {
  /** Env override (tests inject a fake). Defaults to `process.env`. */
  readonly env?: EnvSource;
  /** Install SIGTERM/SIGINT handlers (default true; tests pass false). */
  readonly installSignalHandlers?: boolean;
}

/** Build the express + express-ws app with the minimal spine middleware. */
function buildApp(config: AppConfig, log: Logger): { app: express.Application; server: http.Server } {
  const baseApp = express();
  // HTTP server FIRST so express-ws can own the upgrade handler (v4/v5 cast dance).
  const server = http.createServer(baseApp);
  const { app } = expressWs(baseApp as unknown as express.Express, server) as unknown as {
    app: express.Application;
  };

  app.set('trust proxy', config.server.trustProxy);
  app.disable('x-powered-by');
  app.use(express.json({ limit: config.server.bodyLimit }));

  return { app, server };
}

/** Mount the truthful `/health` + `/health/full` routes over the registry. */
function mountHealth(app: express.Application, registry: HealthRegistry, config: AppConfig): void {
  app.get('/health', (_req, res) => {
    void registry.report().then((report) => {
      const httpStatus = report.status === 'down' ? 503 : 200;
      res.status(httpStatus).json({
        status: report.status,
        degraded: report.degraded,
        service: config.runtime.serviceName,
        instanceId: config.runtime.instanceId,
        sources: report.sources.length,
        checkedAt: report.checkedAt,
      });
    });
  });

  app.get('/health/full', (_req, res) => {
    void registry.report().then((report) => {
      const httpStatus = report.status === 'down' ? 503 : 200;
      res.status(httpStatus).json({ ...report, service: config.runtime.serviceName });
    });
  });
}

/** Listen and resolve once the socket is bound. */
function listen(server: http.Server, config: AppConfig): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(config.server.port, config.server.host);
  });
}

/** Boot the empty host and return a handle. */
export async function start(options: StartOptions = {}): Promise<BootHandle> {
  // 1. Config — the only env read.
  const config = loadConfig(options.env);
  const log = childLogger('bootstrap', { instanceId: config.runtime.instanceId });
  rootLogger.level = config.logging.level;
  log.info(
    { env: config.runtime.env, port: config.server.port, host: config.server.host },
    'booting recoder-backend',
  );

  // 2. Container + foundations.
  const container = createContainer();
  container.registerValue(TOKENS.AppConfig, config);
  container.registerValue(TOKENS.Logger, rootLogger);

  const healthRegistry = createHealthRegistry();
  const engineSupervisor = createEngineSupervisor({ logger: childLogger('engine-supervisor') });
  const lifecycle = createLifecycle({
    logger: childLogger('lifecycle'),
    shutdownTimeoutMs: config.server.shutdownDrainMs + 5_000,
  });
  container.registerValue(BOOT_TOKENS.HealthRegistry, healthRegistry);
  container.registerValue(BOOT_TOKENS.EngineSupervisor, engineSupervisor);
  container.registerValue(BOOT_TOKENS.Lifecycle, lifecycle);

  // The engine supervisor reports its own (Phase-0 truthful) health.
  healthRegistry.register({ name: 'engine-supervisor', health: () => engineSupervisor.health() });

  // --- Phase 1: Persistence — the data authority beneath every stateful
  //     domain. Registered into the container + health registry; its routes
  //     mount under /internal/persistence; boot-time migrate is degrade-safe. ---
  const persistence = createPersistenceModule({ config, logger: childLogger('persistence') });
  container.registerValue(DOMAIN_TOKENS.persistence, persistence);
  healthRegistry.register(persistence);

  // 3. App.
  const { app, server } = buildApp(config, log);

  // 4. Health.
  mountHealth(app, healthRegistry, config);

  // Mount the persistence internal edges (edge domain owns the auth chain later).
  app.use(DOMAIN_REGISTRY.persistence.mountBase, persistence.routes());

  // Terminal 404 + error envelope (domain routers mount before these in later phases).
  app.use(notFound());
  app.use(errorEnvelope({ error: (obj, msg) => log.error(obj, msg) }));

  // 5. Listen. Persistence boots first (degrade-safe migrate + KV hydrate) so
  //    the schema is ready before the server accepts traffic; a DB-less boot
  //    still starts (in-memory KV fallback), never blocking.
  await engineSupervisor.start();
  await persistence.start();
  await listen(server, config);
  const url = `http://${config.server.host}:${config.server.port}`;
  log.info({ url, healthSources: healthRegistry.count }, 'recoder-backend listening');

  // 6. Lifecycle wiring.
  lifecycle
    .onStop('http-server', () => closeServer(server))
    .onStop('persistence', () => persistence.stop())
    .onStop('engine-supervisor', () => engineSupervisor.stop());
  if (options.installSignalHandlers !== false) {
    lifecycle.installSignalHandlers();
  }

  const stop = async (): Promise<void> => {
    await lifecycle.shutdown('handle.stop');
  };

  return { config, container, healthRegistry, lifecycle, app, server, url, stop };
}

/** Stop accepting connections and close the server. */
function closeServer(server: http.Server): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}
