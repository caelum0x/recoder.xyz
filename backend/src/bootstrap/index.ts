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
import type http from 'node:http';
import express, { type Router } from 'express';

import type { AppConfig } from '../shared/app-config.js';
import { childLogger, rootLogger } from '../shared/logger.js';
import { TOKENS, createToken, DOMAIN_TOKENS, CAPABILITY_TOKENS } from '../shared/di-tokens.js';
import { DOMAIN_REGISTRY } from '../shared/domain-registry.js';
import { createEdgeModule, type EdgeModule } from '../domains/edge/index.js';
import type { RouteProvider } from '../domains/edge/ports/route-provider.port.js';
import type { GuardPolicy } from '../domains/edge/types.js';

import { loadConfig, type EnvSource } from './config.js';
import { createContainer, Container } from './container.js';
import { createHealthRegistry, HealthRegistry } from './health-registry.js';
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
import { createAgentOsModule } from '../domains/agent-os/index.js';
import { createConductorModule } from '../domains/conductor/index.js';
import type { RunEventSinkPort } from '../domains/conductor/ports/run-event-sink.port.js';
import { createCliRuntimeSubstrate } from '../domains/conductor/adapters/cli-runtime.adapter.js';
import { createOpenfangRuntimeSubstrate } from '../domains/conductor/adapters/openfang-runtime.adapter.js';
import { createBrainMemoryAdapter } from '../domains/conductor/adapters/brain-memory.adapter.js';
import { createConductorCodeIntel } from '../domains/conductor/adapters/code-intel.adapter.js';
import { createGithubStatusAdapter } from '../domains/conductor/adapters/github-status.adapter.js';
import { createTmuxSteerTransport } from '../domains/conductor/adapters/steer-transport.adapter.js';
import { createEnginesModule } from '../domains/engines/index.js';
import { createInferenceModule } from '../domains/inference/index.js';
import { createBillingModule } from '../domains/billing/index.js';
import { createMemoryModule } from '../domains/memory/index.js';
import { createCloudModule } from '../domains/cloud/index.js';
import {
  createInteropWireComposer,
  type InteropWireComposite,
} from '../domains/interop-wire/interop-wire-module.js';
import { createSocialComposer } from '../domains/social/social-module.js';
import { createObservabilityModule } from '../domains/observability/index.js';
import type { McpToolRegistration } from '../shared/module-base.js';

/** Bootstrap-owned DI tokens (beyond the shared foundation tokens). */
export const BOOT_TOKENS = {
  HealthRegistry: createToken<HealthRegistry>('HealthRegistry'),
  Lifecycle: createToken<Lifecycle>('Lifecycle'),
  /** The interop-wire sub-slice (no distinct DomainKey — see the wiring note). */
  InteropWire: createToken<InteropWireComposite>('InteropWire'),
} as const;

/** The handle `start()` returns to the entrypoint. */
export interface BootHandle {
  readonly config: AppConfig;
  readonly container: Container;
  readonly healthRegistry: HealthRegistry;
  readonly lifecycle: Lifecycle;
  /** The Phase-4 edge module: the http app + server + WS upgrade owner. */
  readonly edge: EdgeModule;
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

/**
 * Wrap an already-composed express router as an edge {@link RouteProvider}. The
 * domain routers built above self-guard (each takes `identity.middleware()` /
 * validates the internal key internally); the edge mounts them once, behind the
 * shared GLOBAL chain (request-context → cors → body → rate-limit) but with a
 * `public` per-mount guard — so the edge adds NO second auth/interop layer over a
 * router that already guards itself (conflict-free: exactly one mount, one auth).
 */
function routerProvider(key: string, basePath: string, router: Router): RouteProvider {
  return {
    key,
    basePath,
    routes: () => router,
    // Always mountable — the router degrades its own behavior truthfully (a DB-less
    // boot still serves, returning SERVICE_UNAVAILABLE per-route, never a faked 200).
    health: () => ({ status: 'up' as const }),
  };
}

/** Every edge mount keeps its router's own guards — the edge adds no second layer. */
const PUBLIC_MOUNT: GuardPolicy = { auth: 'public', interop: false };

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
  const lifecycle = createLifecycle({
    logger: childLogger('lifecycle'),
    shutdownTimeoutMs: config.server.shutdownDrainMs + 5_000,
  });
  container.registerValue(BOOT_TOKENS.HealthRegistry, healthRegistry);
  container.registerValue(BOOT_TOKENS.Lifecycle, lifecycle);

  // NOTE: the Phase-0 `engine-supervisor` skeleton is RETIRED — the engines module
  // (built after governance below) now owns truthful per-engine health, so no faked
  // `engine-supervisor:up` source is registered.

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

  // --- Phase 6a: Engines — the multi-language engine seam + the ONE interop-gated
  //     MCP host. Built AFTER governance so the napi `governance` engine re-exposes
  //     the assembled kernel ladder (no second kernel). `host()` is the SINGLE
  //     InteropHostBundle agent-os/conductor/capability domains register tools into
  //     (retires the Phase-0 engine-supervisor skeleton). Degrade-safe: without a
  //     built `.node`/daemon/venv each engine reports truthful `down`, never a faked
  //     `up`. Config folded from the `engines` AppConfig override slice — no env read. ---
  const engines = await createEnginesModule({
    config,
    logger: childLogger('engines'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    kernel: governance.kernel(),
    overrides: config.engines,
  });
  container.registerValue(DOMAIN_TOKENS.engines, engines);
  healthRegistry.register(engines);

  // --- Phase 6b: Inference — the BYOK LLM gateway (TensorZero ladder). Built AFTER
  //     engines so its napi tier binds over the engines' SINGLE shared tensorzero
  //     `.node` (CONFLICT #8-safe: `napiEngine: engines.tensorzero()` — it never
  //     loads a second addon). Degrade-safe: no gateway endpoint + no napi tier ⇒
  //     truthful `down`. Config folded from the `inference` override slice. ---
  const tensorzeroEngine = engines.tensorzero();
  const inference = await createInferenceModule({
    config,
    logger: childLogger('inference'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    overrides: config.inference,
    ...(tensorzeroEngine ? { napiEngine: tensorzeroEngine } : {}),
  });
  container.registerValue(DOMAIN_TOKENS.inference, inference);
  healthRegistry.register(inference);

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

  // --- Phase 5a: Agent-OS — THE state-of-record. Hosts the task/run/approval/
  //     artifact/event aggregates, the RunEvent ingest bus (conductor + runtimes
  //     emit here), and the at-least-once CloudEvents outbox. Built AFTER
  //     governance so every write passes the gate; consumes the persistence
  //     executor (health-only — no pg repository adapter injected yet, so the
  //     state-of-record degrades truthfully to in-memory without a DB), the
  //     identity auth middleware, and the NATS/feature-flag slice via overrides.
  //     Degrade-safe: no DB → in-memory repo; no NATS → log-only outbox sink. ---
  const agentOs = await createAgentOsModule({
    config,
    logger: childLogger('agent-os'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    gate: governance.gate(),
    overrides: {
      natsUrl: config.agentOs.natsUrl,
      brainEnabled: config.agentOs.brainEnabled,
      codeGraphEnabled: config.agentOs.codeGraphEnabled,
      squadsEnabled: config.agentOs.squadsEnabled,
    },
  });
  container.registerValue(DOMAIN_TOKENS['agent-os'], agentOs);
  healthRegistry.register(agentOs);

  // --- Phase 6c: Memory & Retrieval — recall fusion + the GOVERNED candidate →
  //     durable-item promotion + RAG retrieval. Built BEFORE the conductor so the
  //     conductor run flow can recall on launch + harvest on completion through the
  //     memory module's PUBLIC seams (`recall()` / `harvest()` / `retrieval()`). It
  //     reaches `memory_items`/`memory_candidates` through the agent-os repository
  //     slice (conflict #3 — it never owns those tables) and every durable promotion
  //     passes the governance write seam (`gate.decide`). Degrade-safe: absent Qdrant/
  //     embedder/colbert/mem0 ⇒ truthful empty recall. Config folded from `memory`. ---
  const memory = createMemoryModule({
    config,
    logger: childLogger('memory'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    gate: governance.gate(),
    candidateStore: agentOs.repository(),
    overrides: config.memory,
  });
  container.registerValue(DOMAIN_TOKENS.memory, memory);
  healthRegistry.register(memory);

  // --- Phase 5b: Conductor — THE terminal product (worktree+tmux execution).
  //     Built AFTER agent-os so it emits every tailed RunEvent into the
  //     state-of-record. THE RUN-EVENT SEAM: the agent-os `RunEventBusPort`
  //     (`ingest(event, source)`) and the conductor `RunEventSinkPort`
  //     (`append(event)`) are structurally different; this thin adapter bridges
  //     them at the composition root, so NEITHER domain's public port changes.
  //     THE LOCAL SUBSTRATE: the `tmux_worktree` ConductorSubstrate (real tmux over
  //     isolated git worktrees) is built here from the INJECTED conductor config
  //     slice (`tmuxBin` + `worktreeRoot`) — the adapter reads NO `process.env` — and
  //     registered as the sole substrate. Degrade-safe + truthful: if git/tmux are
  //     absent on the box, `available()` reports `down` with the missing binary and
  //     `launch()` refuses rather than fabricate a session, while the module + its
  //     `/api/conductor` edges and the `/terminal` WS still boot. ---
  const conductorRunSink: RunEventSinkPort = {
    async append(event) {
      await agentOs.runEventBus().ingest(event, 'conductor');
    },
  };
  const conductorSubstrateConfig = {
    tmuxBin: config.conductor.tmuxBin,
    worktreeRoot: config.conductor.worktreeRoot,
  };
  // TWO execution-path substrates share the SAME engine capability seams (the
  // difference is only WHERE the agent runs):
  //  - PATH (a) CLI: the `tmux_worktree` substrate (external coding-agent CLI in an
  //    isolated tmux+git-worktree). It wraps the proven tmux mechanics and adds the
  //    optional last-mile inference-metering env hook (unwired here ⇒ BYOK, no
  //    metering — a truthful skip; the composer-level path (e) can inject env too).
  //  - PATH (b) openfang: the `in_process` substrate (native openfang `.node` agent
  //    turn against the worktree). Its kernel routes inference through the SAME
  //    shared tensorzero `.node`, so metering/BYOK apply without a loopback URL.
  // Both degrade-safe + truthful: git/tmux absent ⇒ CLI `available:false`; the
  // openfang addon absent/boot-failed ⇒ in_process `available:false` + `launch()`
  // refuses (never a fabricated session). The module + `/api/conductor` still boot.
  const cliSub = createCliRuntimeSubstrate({
    config: conductorSubstrateConfig,
    logger: childLogger('conductor-cli'),
  });
  const openfangSub = createOpenfangRuntimeSubstrate({
    config: conductorSubstrateConfig,
    logger: childLogger('conductor-openfang'),
  });
  // The memory-backed brain: recall on launch (mem0 ∪ beads ∪ candidates → rerank)
  // + harvest on completion. Built over the memory module's PUBLIC seams only.
  const conductorBrain = createBrainMemoryAdapter({
    recall: memory.recall(),
    harvest: memory.harvest(),
    retrieval: memory.retrieval(),
    logger: childLogger('conductor-brain'),
  });
  // Code-intel seam: recodergit repo index + beads issue-graph tracking, over the
  // engines domain's FROZEN typed clients (null ⇒ truthful logged skip).
  const conductorCodeIntel = createConductorCodeIntel({
    recodergit: engines.client('recodergit'),
    beads: engines.client('beads'),
    logger: childLogger('conductor-code-intel'),
  });
  // GitHub identity seam (zero-config onboarding): forwarded token env + `gh`
  // login + git identity. Env injected here — the adapter reads no globals.
  const conductorGithub = createGithubStatusAdapter({
    env: bootEnv,
    logger: childLogger('conductor-github'),
  });
  // Live steer transport: tmux send-keys into the workspace's session (the same
  // session addressing the tmux_worktree substrate launches with). This un-refuses
  // `steerWorkspace` for path (a); a gone session still refuses truthfully.
  const conductorSteer = createTmuxSteerTransport({
    config: conductorSubstrateConfig,
    logger: childLogger('conductor-steer'),
  });
  const conductor = createConductorModule({
    config,
    logger: childLogger('conductor'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    gate: governance.gate(),
    runEventSink: conductorRunSink,
    substrates: [cliSub, openfangSub],
    brain: conductorBrain,
    codeIntel: conductorCodeIntel,
    githubStatus: conductorGithub,
    steerTransport: conductorSteer,
    overrides: {
      tmuxBin: config.conductor.tmuxBin,
      worktreeRoot: config.conductor.worktreeRoot,
      tmuxControlMode: config.conductor.tmuxControlMode,
      caps: config.conductor.caps,
    },
  });
  container.registerValue(DOMAIN_TOKENS.conductor, conductor);
  healthRegistry.register(conductor);

  // --- Phase 9: Billing — THE EntitlementGate (plans/metering/quotas/webhooks).
  //     Built AFTER identity (it gates on the credential seam). Its `gate()` is the
  //     cross-domain entitlement seam registered as a capability token so conductor
  //     (pre-dispatch quota), inference (token metering), and engines (usage) can
  //     resolve it. The `/api/billing` router carries the raw-body webhook ingress;
  //     the edge's global JSON parser captures `req.rawBody` (see chain.ts) so the
  //     provider signature verifies. Degrade-safe: no provider key ⇒ adapters `down`
  //     and the gate deny-biases while free-tier entitlements still serve. Config
  //     folded from the `billing` override slice — no env read. ---
  const billing = createBillingModule({
    config,
    logger: childLogger('billing'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    overrides: config.billing,
  });
  container.registerValue(DOMAIN_TOKENS.billing, billing);
  container.registerValue(CAPABILITY_TOKENS.entitlementGate, billing.gate());
  healthRegistry.register(billing);

  // Inject the billing EntitlementGate as the OPTIONAL pre-dispatch quota seam into
  // the domains that meter against it (both were built before billing and degrade
  // OPEN until injected): conductor consults it before launching a run
  // (`workspace.create` quota), inference before each completion (token quota).
  conductor.setEntitlementGate(billing.gate());
  inference.setEntitlementGate(billing.gate());

  // --- Phase 10: Cloud — off-box substrate (sandboxes/previews/tenancy/mesh). Built
  //     AFTER billing. All cross-domain seams are OPTIONAL + degrade-safe and are
  //     intentionally left unwired here (see the integration report): `billingQuota`
  //     (billing→cloud-quota bridge — shapes differ: EntitlementGate vs
  //     TenantBillingQuotaPort), `runEvents` (CloudRunEvent→agent-os RunEvent bridge),
  //     and `localRuntime` (no docker/podman runtime on the box). Absent ⇒ tenant
  //     quota stands alone, sandbox events drop, local provider `down` — all truthful,
  //     never faked. Config folded from the `cloud` override slice — no env read. ---
  const cloud = createCloudModule({
    config,
    logger: childLogger('cloud'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    overrides: config.cloud,
  });
  container.registerValue(DOMAIN_TOKENS.cloud, cloud);
  healthRegistry.register(cloud);

  // --- Phase 7a: Interop-wire — the A2A WIRE slice (envelope build/seal/validate,
  //     agent-card, signed-ingress gate, registry/task projection) PLUS the dispatch/
  //     registry/bridge services + the six runtime connectors. The COMPOSER layers
  //     those over the frozen core and exposes `routes()` (`/api/interop`),
  //     `wireRoutes()` (`/api/a2a`), `mcp()`, and `start()/stop()`, so it is now
  //     mounted + registered + lifecycled (no longer accessor-only). Middleware is the
  //     composed identity auth; the OPTIONAL conductor `localRun` + remote-peer
  //     `remoteSender` seams are left unwired (no clean adapter available on this box),
  //     so runtime + remote dispatch legs fail truthfully rather than fabricate a run.
  //     Config folded from the `interopWire` override slice. Degrade-safe: no HMAC
  //     secret in prod ⇒ unsigned ingress rejected; no executor path ⇒ in-memory. ---
  const interopWire = createInteropWireComposer({
    config,
    logger: childLogger('interop-wire'),
    executor: persistence.executor(),
    overrides: config.interopWire,
    middleware: identity.middleware(),
  });
  // interop-wire is a SUB-SLICE of the interop domain (no distinct DomainKey), so it
  // registers under its own bootstrap token — NEVER `DOMAIN_TOKENS.interop` (that
  // slot belongs to the interop module above; clobbering it would drop the edge chain).
  container.registerValue(BOOT_TOKENS.InteropWire, interopWire);
  healthRegistry.register(interopWire);

  // --- Phase 7b: Social — the human-channel trust boundary (mention gate + webhook
  //     ingress verification) + the Recoder-owned connectors/bindings/inbound repo,
  //     now COMPOSED with the channel-adapter registry, connector secrets, the inbound
  //     pipeline, and the zrok tunnel. The composer exposes `routes()` (`/api/social`),
  //     `mcp()`, and `start()/stop()`, so it is mounted + registered + lifecycled.
  //     Middleware is the composed identity auth; the OPTIONAL conductor dispatch +
  //     inference reply + secret-vault seams are left unwired (no clean adapter on this
  //     box) so dispatch fails truthfully rather than fabricate a run/reply. The webhook
  //     ingress reads the exact raw bytes via the edge chain's global `req.rawBody`
  //     capture (chain.ts `verify`), the SAME trust boundary billing's webhooks use —
  //     so no separate raw-body mount is required. Hostile-by-default: an empty allowlist
  //     admits nothing; a missing webhook secret refuses. Config folded from `social`. ---
  const social = createSocialComposer({
    config,
    logger: childLogger('social'),
    executor: persistence.executor(),
    overrides: config.social,
    middleware: identity.middleware(),
  });
  container.registerValue(DOMAIN_TOKENS.social, social);
  healthRegistry.register(social);

  // --- Phase 11: Observability & Ops — THE capstone (conflict #7 owner of health
  //     aggregation across ALL prior domains). Built LAST among the domains (after
  //     every HealthSource is registered) so its aggregator fuses the WHOLE
  //     healthRegistry: `registry.report()` walks every domain's already-truthful
  //     `health()` (bounded per-source, a hang ⇒ `unknown`), and the aggregator only
  //     ROLLS UP — it never rewrites a domain's self-reported state (any `down` with
  //     ≥1 `up` ⇒ `degraded`, ALL `down` ⇒ `down`, never masked green). It also
  //     registers ITSELF as a HealthSource (its own 4-engine logging/metrics/tracing/
  //     signals breakdown), so `/health/full` aggregates every source truthfully.
  //     Degrade-safe: no OTLP ⇒ tracing no-ops (degraded); no ops-recorder sidecar ⇒
  //     signals `down` with NO fabricated data; no metrics token in prod ⇒ `/metrics`
  //     fails safe. Owns `/health` + `/health/full` + `/api/agent-os/health` (replaces
  //     the boot-time buildHealthRouter), `/metrics`, and the `/api/agent-os/
  //     observability` control edges; its telemetry tap is threaded into the ONE edge
  //     global chain below. Env-sourced ops values arrive via overrides (no env read
  //     in domain code). ---
  const observability = createObservabilityModule({
    config,
    logger: childLogger('observability'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    gate: governance.gate(),
    // The bootstrap HealthRegistry IS the HealthSourceRegistry (structural): every
    // domain above already registered its truthful HealthSource, so the aggregator
    // fuses all of them with zero per-domain change (conflict #7 seam).
    registry: healthRegistry,
    overrides: {
      otlpEndpoint: bootEnv.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
      opsRecorderUrl: bootEnv.OPS_RECORDER_URL ?? null,
      opsRecorderToken: bootEnv.OPS_RECORDER_TOKEN ?? null,
    },
  });
  container.registerValue(DOMAIN_TOKENS.observability, observability);
  // Register observability's OWN engine health as the 15th source — its aggregate
  // includes itself (logging/metrics/tracing/signals), never a blind spot.
  healthRegistry.register(observability);

  // --- MCP tool registration: bridge every domain's flat `mcp()` tools onto the ONE
  //     interop-gated host the engines module owns (`registerModuleTools` builds the
  //     server descriptor + binds a delegating, GATED in-proc handler per tool —
  //     `authorize → risk → execute → audit`; binding never bypasses the gate). The
  //     engines module itself is NOT registered here (it self-registers its napi
  //     engine tools at `start()`); a domain whose `mcp()` returns [] is a truthful
  //     skip (host-registrar returns `skipped`). Degrade-safe: an unready host is a
  //     no-op + warn, never a fabricated registration. ---
  const mcpDomains: readonly {
    readonly name: string;
    readonly tools: () => readonly McpToolRegistration[];
  }[] = [
    { name: 'agent-os', tools: () => agentOs.mcp() },
    { name: 'billing', tools: () => billing.mcp() },
    { name: 'cloud', tools: () => cloud.mcp() },
    { name: 'conductor', tools: () => conductor.mcp() },
    { name: 'governance', tools: () => governance.mcp() },
    { name: 'identity', tools: () => identity.mcp() },
    { name: 'inference', tools: () => inference.mcp() },
    { name: 'interop-wire', tools: () => interopWire.mcp() },
    { name: 'memory', tools: () => memory.mcp() },
    { name: 'observability', tools: () => observability.mcp() },
    { name: 'persistence', tools: () => persistence.mcp() },
    { name: 'social', tools: () => social.mcp() },
  ];
  const mcpRegistered: string[] = [];
  for (const domain of mcpDomains) {
    const tools = domain.tools();
    if (tools.length === 0) continue;
    // Collision-safe bridge: a duplicate serverId is skipped whole-source (first
    // wins, never clobbered) and duplicate tool names within a source are skipped
    // + reported — the older registerModuleTools silently overwrote on collision.
    const registration = engines.registerDomainTools(domain.name, tools);
    if (registration.collisions.length > 0) {
      log.warn(
        { serverId: domain.name, collisions: registration.collisions },
        'duplicate MCP tool names skipped during host registration (first wins)',
      );
    }
    if (!registration.skipped) {
      mcpRegistered.push(`${domain.name}(${registration.registered.length})`);
    }
  }
  log.info({ mcpRegistered }, 'registered domain MCP tools into the interop-gated host');

  // --- Phase 4: Edge & API Server — the STATELESS HTTP/WS surface. Built AFTER
  //     persistence/identity/governance/interop so it can consume their frozen
  //     seams (the identity SessionVerifier for the ONE auth link, the interop
  //     InteropChain for the ONE interop-gate — no duplicate composition) and mount
  //     every domain router as a RouteProvider through the single route table. The
  //     edge OWNS the express app + http server + the sole WS `upgrade` dispatcher.
  //
  //     Each domain router already self-guards (it takes `identity.middleware()` or
  //     validates the internal key internally), so the route table mounts them with
  //     a `public` per-mount guard: the edge wraps them in the shared GLOBAL chain
  //     (request-context → cors → body → rate-limit) but adds NO second auth/interop
  //     layer — exactly one mount, one auth per surface (conflicts #1/#6/#10). The
  //     canonical chain (identity verifier + interop chain) is still bound here and
  //     drives the WS upgrade auth + any convention-guarded Phase-5+ providers. ---
  const providers: readonly RouteProvider[] = [
    // Health — the Phase-11 observability aggregate (conflict #7), reachable through
    // the edge app. Owns GET /health (shallow liveness, down→503), /health/full
    // (per-domain verbatim + 4-engine + SLO rollup), and /api/agent-os/health.
    routerProvider('observability-health', '', observability.healthRoutes()),
    // Prometheus scrape at /metrics (INTERNAL_SERVICE_KEY-gated; fails safe in prod
    // when no token is configured — never an open, secret-leaking scrape).
    routerProvider('observability-metrics', '', observability.metricsRoutes()),
    // Observability control edges: /api/agent-os/observability/{slo,alerts,signals,
    // audit,logs} (self-gated by identity.middleware()).
    routerProvider(
      'observability',
      DOMAIN_REGISTRY.observability.mountBase,
      observability.routes(),
    ),
    // Persistence internal edges.
    routerProvider('persistence', DOMAIN_REGISTRY.persistence.mountBase, persistence.routes()),
    // Better Auth host at /api/auth/* (public: login/signup can't require a session).
    routerProvider('identity-auth', '/api/auth', identity.authRoutes()),
    // /api/identity/* health + read edges.
    routerProvider('identity', DOMAIN_REGISTRY.identity.mountBase, identity.routes()),
    // sk_ platform API key edges (self-gated by identity.middleware()).
    routerProvider(
      'identity-apikeys',
      DOMAIN_REGISTRY.identity.mountBase,
      buildApiKeysRouter({ service: apiKeyService, mw: identity.middleware(), logger: apiKeyLog }),
    ),
    // CLI device-flow edges (poll/exchange are public; approve self-gates).
    routerProvider(
      'identity-device',
      '/api/identity/device',
      buildDeviceRouter({ service: deviceFlow, middleware: identity.middleware() }),
    ),
    // Orgs + RBAC edges (self-gated by identity.middleware() + RBAC evaluator).
    routerProvider('identity-orgs', DOMAIN_REGISTRY.identity.mountBase, orgsRbac.buildRouter(identity.middleware())),
    // Internal identity resolution edges (INTERNAL_SERVICE_KEY-gated internally).
    routerProvider('identity-internal', '/internal/identity', identity.internalRoutes()),
    // Governance edges: approvals + work-locks + secrets (mutations self-gated).
    routerProvider('governance', DOMAIN_REGISTRY.governance.mountBase, governance.routes()),
    // Interop edges: A2A health + agent-card + ext-authz-guarded JSON-RPC ingress.
    routerProvider('interop', DOMAIN_REGISTRY.interop.mountBase, interop.routes()),
    // Agent-OS state-of-record edges: read models + INTERNAL_SERVICE_KEY ingest.
    routerProvider('agent-os', DOMAIN_REGISTRY['agent-os'].mountBase, agentOs.routes()),
    // Internal agent-os ingest edges (INTERNAL_SERVICE_KEY-gated internally).
    routerProvider('agent-os-internal', '/internal/agent-os', agentOs.internalRoutes()),
    // Conductor terminal-product edges: workspaces + substrates + reconcile (gated).
    routerProvider('conductor', DOMAIN_REGISTRY.conductor.mountBase, conductor.routes()),
    // Engines read-only edges: declared-engine list + per-engine live health.
    routerProvider('engines', DOMAIN_REGISTRY.engines.mountBase, engines.routes()),
    // Inference LLM-gateway edges: control + OpenAI-compatible surface (self-gated).
    routerProvider('inference', DOMAIN_REGISTRY.inference.mountBase, inference.routes()),
    // Billing edges: plan/checkout/portal/cancel + RAW-BODY provider webhooks. The
    // global JSON parser stashes `req.rawBody` (chain.ts) so webhook signatures verify.
    routerProvider('billing', DOMAIN_REGISTRY.billing.mountBase, billing.routes()),
    // Memory + retrieval edges (mount under /api/agent-os alongside agent-os).
    routerProvider('memory', DOMAIN_REGISTRY.memory.mountBase, memory.routes()),
    // Cloud edges: tenancy/sandboxes/preview/mesh (self-gated; degrade-safe).
    routerProvider('cloud', DOMAIN_REGISTRY.cloud.mountBase, cloud.routes()),
    // Social edges: connectors/bindings read models + the hostile-by-default webhook
    // ingress (`POST /api/social/webhooks/:channel`, RAW-body HMAC over req.rawBody).
    routerProvider('social', '/api/social', social.routes()),
    // Interop-wire edges: A2A registry (agents) + task lifecycle/scratchpad (self-gated).
    routerProvider('interop-wire', '/api/interop', interopWire.routes()),
    // Interop-wire A2A WIRE: agent-card + JSON-RPC + signed ingress (mounts alongside
    // the interop module at /api/a2a; both self-guard, no second auth layer).
    routerProvider('interop-wire-a2a', '/api/a2a', interopWire.wireRoutes()),
    // RFC 8615: peers probe the ORIGIN ROOT for /.well-known/agent.json — the
    // same local card /api/a2a/agent-card serves, at the standard location.
    routerProvider('interop-wire-wellknown', '/.well-known', interopWire.wellKnownRoutes()),
  ];

  const edge = createEdgeModule(
    {
      config,
      logger: childLogger('edge'),
      verifier: identity.verifier(),
      interopChain: interop.chain(),
      providers,
      // Phase-11 telemetry tap threaded into the ONE global chain: every request is
      // correlated (x-correlation-id + W3C traceparent), traced, and RED-metered
      // (http_requests_total / http_request_duration_seconds) before any per-mount
      // guard — so /metrics reflects real traffic. Degrade-safe: a telemetry fault
      // never blocks the response path.
      globalMiddleware: [observability.telemetry()],
      // The conductor WS surfaces register with the edge's single
      // `server.on('upgrade')` dispatcher (conflict #6 — the edge owns it):
      // `/terminal` (control-mode output + steer) and the run-screen live stream
      // `/api/conductor/workspaces/:id/stream` (full RunEvents — what the shared
      // conductor-ui client connects to). The bare `/sync` backend is intentionally
      // DROPPED (collaboration cut).
      wsBackends: conductor
        .terminal()
        .terminalBackends()
        .filter((b) => b.path === '/terminal' || b.path === '/api/conductor/workspaces'),
    },
    // Every mount keeps its own guard; the edge adds only the GLOBAL chain.
    { routeTable: { defaultGuard: () => PUBLIC_MOUNT } },
  );
  container.registerValue(DOMAIN_TOKENS.edge, edge);
  healthRegistry.register(edge);

  const { app, server } = edge;

  // 5. Listen. Persistence boots first (degrade-safe migrate + KV hydrate) so
  //    the schema is ready before the server accepts traffic; a DB-less boot
  //    still starts (in-memory KV fallback), never blocking. The edge binds the
  //    socket (it owns the http server + WS upgrade dispatcher).
  await persistence.start();
  await identity.start();
  await governance.start();
  await engines.start();
  await inference.start();
  await interop.start();
  await agentOs.start();
  await conductor.start();
  await billing.start();
  await memory.start();
  await cloud.start();
  // Interop-wire + social composers register runtime connectors / log channel posture.
  await interopWire.start();
  await social.start();
  // Observability starts LAST among domains (its alert-eval loop reads the fused
  // health of everything already started); the tap is already in the edge chain.
  await observability.start();
  await edge.listen();
  const url = `http://${config.server.host}:${config.server.port}`;
  log.info({ url, healthSources: healthRegistry.count }, 'recoder-backend listening');

  // 6. Lifecycle wiring. The edge drains its server + closes live WS sockets first.
  lifecycle
    .onStop('edge', () => edge.stop())
    .onStop('observability', () => observability.stop())
    .onStop('social', () => social.stop())
    .onStop('interop-wire', () => interopWire.stop())
    .onStop('cloud', () => cloud.stop())
    .onStop('memory', () => memory.stop())
    .onStop('billing', () => billing.stop())
    .onStop('conductor', () => conductor.stop())
    .onStop('agent-os', () => agentOs.stop())
    .onStop('interop', () => interop.stop())
    .onStop('inference', () => inference.stop())
    .onStop('engines', () => engines.stop())
    .onStop('governance', () => governance.stop())
    .onStop('identity', () => identity.stop())
    .onStop('persistence', () => persistence.stop());
  if (options.installSignalHandlers !== false) {
    lifecycle.installSignalHandlers();
  }

  const stop = async (): Promise<void> => {
    await lifecycle.shutdown('handle.stop');
  };

  return { config, container, healthRegistry, lifecycle, edge, app, server, url, stop };
}
