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
import { TOKENS, createToken, DOMAIN_TOKENS, CAPABILITY_TOKENS } from '../shared/di-tokens.js';
import { errorEnvelope, notFound } from '../shared/errors.js';
import { DOMAIN_REGISTRY } from '../shared/domain-registry.js';

import { loadConfig, type EnvSource } from './config.js';
import { createContainer, Container } from './container.js';
import { createHealthRegistry, HealthRegistry } from './health-registry.js';
import { createEngineSupervisor, EngineSupervisor } from './engine-supervisor.js';
import { createLifecycle, Lifecycle } from './lifecycle.js';
import { createPersistenceModule } from '../domains/persistence/index.js';
import { createIdentityModule } from '../domains/identity/index.js';
import { createDeviceFlow } from '../domains/identity/device-flow.service.js';
import { buildDeviceRouter } from '../domains/identity/routes/device.routes.js';
import { sliceIdentityConfig } from '../domains/identity/config.js';
import { PgApiKeyStore } from '../domains/identity/repositories/api-key.repository.js';
import { createApiKeyService } from '../domains/identity/api-key.service.js';
import { buildApiKeysRouter } from '../domains/identity/routes/api-keys.routes.js';
import { createOrgsRbacFeature } from '../domains/identity/orgs-rbac.feature.js';
import { createGovernanceModule } from '../domains/governance/index.js';
import { createInteropModule } from '../domains/interop/index.js';

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

  // --- Phase 2: Identity & Auth — the credential seam. Hosts Better Auth
  //     in-process, resolves any credential → Principal via SessionVerifier, and
  //     exposes the auth middleware every later domain guards requests with.
  //     Degrade-safe: missing BETTER_AUTH_SECRET/AUTH_DATABASE_URL → truthful
  //     `down` + SERVICE_UNAVAILABLE, never a faked 200. ---
  // CLI device flow (RFC 8628): built before identity so its DeviceTokenValidator
  // feeds the credential seam (an approved device_code resolves to a device
  // principal). Backed by the persistence executor. `exchange` mints a real sk_
  // key once the api-key feature injects its issuer; until then it degrades to a
  // truthful SERVICE_UNAVAILABLE rather than a faked token.
  const deviceFlow = createDeviceFlow({
    config,
    logger: childLogger('identity-device'),
    executor: persistence.executor(),
  });

  // DB-backed sk_ platform API keys (replaces the legacy in-memory
  // validatePlatformApiKey). Hashed at rest with API_KEY_HASH_SALT and injected
  // as the credential seam's ApiKeyValidator, so an `Authorization: Bearer sk_…`
  // or `x-api-key` resolves to an `apikey` Principal. Truthful degrade: without
  // the pool, mint/list/revoke return SERVICE_UNAVAILABLE (never a faked key).
  const identityCfg = sliceIdentityConfig(config);
  const apiKeyLog = childLogger('identity-apikeys');
  const apiKeyStore = new PgApiKeyStore(persistence.executor(), apiKeyLog);
  const apiKeyService = createApiKeyService({
    store: apiKeyStore,
    logger: apiKeyLog,
    hashSalt: (options.env ?? process.env).API_KEY_HASH_SALT ?? null,
    isAvailable: () => persistence.executor().isAvailable(),
    prefixLength: identityCfg.apiKeyPrefixLength,
    defaultTtlDays: identityCfg.apiKeyDefaultTtlDays,
  });

  // Orgs + team + membership lifecycle and the RBAC PermissionEvaluator. Built
  // before identity so the evaluator feeds `requirePermission`; the orgs router is
  // mounted after identity (it needs the composed auth middleware). Degrade-safe:
  // all stores bind to the persistence executor and no-op truthfully without a DB.
  const orgsRbac = createOrgsRbacFeature({
    executor: persistence.executor(),
    logger: childLogger('identity-orgs'),
  });

  const identity = createIdentityModule({
    config,
    logger: childLogger('identity'),
    executor: persistence.executor(),
    deviceTokenValidator: deviceFlow,
    apiKeyValidator: apiKeyService,
    evaluator: orgsRbac.evaluator,
  });
  container.registerValue(DOMAIN_TOKENS.identity, identity);
  healthRegistry.register(identity);

  // --- Phase 3: Governance — THE moat / write seam. Composes the kernel ladder
  //     (napi→daemon→ts, fail-closed synthetic-deny floor), the tamper-evident
  //     Merkle audit chain, envelope-encrypted secrets, path work-locks, and the
  //     approval gate over the Phase-1 persistence executor. Degrade-safe: without
  //     Postgres the durable repos no-op truthfully and the ladder deny-biases on
  //     the pure-TS rung; without GOVERNANCE_VAULT_MASTER_KEY secrets refuse to
  //     store plaintext. The kernel ladder is probed async at assembly. ---
  const bootEnv = options.env ?? process.env;
  const governance = await createGovernanceModule({
    config,
    logger: childLogger('governance'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    overrides: {
      // The vault master key is not yet an AppConfig slice; bootstrap is the only
      // sanctioned env read. Absent → secrets report `down` (never a faked write).
      vaultMasterKey: bootEnv.GOVERNANCE_VAULT_MASTER_KEY ?? null,
      // napi in-proc kernel is on by default; explicitly disable via env for CI.
      napiEnabled: bootEnv.GOVERNANCE_NAPI_ENABLED !== 'false',
    },
  });
  container.registerValue(DOMAIN_TOKENS.governance, governance);
  // Cross-domain capability seams later phases resolve without the whole module.
  container.registerValue(CAPABILITY_TOKENS.governanceGate, governance.gate());
  container.registerValue(CAPABILITY_TOKENS.secrets, governance.secrets());
  container.registerValue(CAPABILITY_TOKENS.workLock, governance.workLocks());
  container.registerValue(CAPABILITY_TOKENS.approval, governance.approvals());
  healthRegistry.register(governance);

  // --- Phase 3: Interop — the A2A wire + the ONE edge chain
  //     (`authorize→risk→policy→audit`) over the governance gate (conflict #1: one
  //     chain impl, calling governance's gate — no duplicate gate composition) and
  //     the SINGLE set of edge middleware (interop guard, rate-limit, /internal/*
  //     key gate, ext-authz ingress — conflict #10). Fail-closed: no gate → every
  //     edge denies; no ingress verifier → hostile ingress is rejected. ---
  const interop = createInteropModule({
    config,
    logger: childLogger('interop'),
    gate: governance.gate(),
    localCard: {
      id: config.runtime.instanceId,
      name: config.runtime.serviceName,
      capabilities: [],
      version: '1',
    },
  });
  container.registerValue(DOMAIN_TOKENS.interop, interop);
  container.registerValue(CAPABILITY_TOKENS.interopChain, interop.chain());
  healthRegistry.register(interop);

  // 3. App.
  const { app, server } = buildApp(config, log);

  // 4. Health.
  mountHealth(app, healthRegistry, config);

  // Mount the persistence internal edges (edge domain owns the auth chain later).
  app.use(DOMAIN_REGISTRY.persistence.mountBase, persistence.routes());

  // Mount the identity edges: Better Auth host at /api/auth/* + /api/identity/*.
  // The edge domain (Phase 4) will fold these behind the canonical chain; for now
  // they mount directly so auth is reachable the moment identity is built.
  app.use('/api/auth', identity.authRoutes());
  app.use(DOMAIN_REGISTRY.identity.mountBase, identity.routes());
  // sk_ platform API key edges: GET/POST /keys + DELETE /keys/:id (session-gated).
  // Mounted under /api/identity; the raw key is returned exactly once at mint.
  app.use(
    DOMAIN_REGISTRY.identity.mountBase,
    buildApiKeysRouter({ service: apiKeyService, mw: identity.middleware(), logger: apiKeyLog }),
  );
  // CLI device-flow edges: POST /code (start), /token (poll/exchange), /approve
  // (session-gated). Mounted under /api/identity/device; the approve route reuses
  // the identity auth middleware so only a signed-in user can authorize a code.
  app.use('/api/identity/device', buildDeviceRouter({ service: deviceFlow, middleware: identity.middleware() }));
  // Orgs + RBAC edges: GET/POST /orgs, members, and role management (session-gated
  // via the composed auth middleware; writes flow through the RBAC evaluator).
  app.use(DOMAIN_REGISTRY.identity.mountBase, orgsRbac.buildRouter(identity.middleware()));
  // Internal identity resolution edges (INTERNAL_SERVICE_KEY-gated): the website
  // proxy + other services resolve credentials → Principal, validate sk_ keys, and
  // resolve/link the unified identity read model here.
  app.use('/internal/identity', identity.internalRoutes());

  // Governance edges: approvals + work-locks + secrets under /api/agent-os. The
  // routers guard mutations with the composed identity middleware; the edge
  // domain (Phase 4) folds these behind the canonical interop chain later.
  app.use(DOMAIN_REGISTRY.governance.mountBase, governance.routes());
  // Interop edges: A2A health + local agent-card + the ext-authz-guarded JSON-RPC
  // ingress under /api/a2a.
  app.use(DOMAIN_REGISTRY.interop.mountBase, interop.routes());

  // Terminal 404 + error envelope (domain routers mount before these in later phases).
  app.use(notFound());
  app.use(errorEnvelope({ error: (obj, msg) => log.error(obj, msg) }));

  // 5. Listen. Persistence boots first (degrade-safe migrate + KV hydrate) so
  //    the schema is ready before the server accepts traffic; a DB-less boot
  //    still starts (in-memory KV fallback), never blocking.
  await engineSupervisor.start();
  await persistence.start();
  await identity.start();
  await governance.start();
  await interop.start();
  await listen(server, config);
  const url = `http://${config.server.host}:${config.server.port}`;
  log.info({ url, healthSources: healthRegistry.count }, 'recoder-backend listening');

  // 6. Lifecycle wiring.
  lifecycle
    .onStop('http-server', () => closeServer(server))
    .onStop('interop', () => interop.stop())
    .onStop('governance', () => governance.stop())
    .onStop('identity', () => identity.stop())
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
