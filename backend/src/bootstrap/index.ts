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
import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import express, { type Router } from 'express';

import type { AppConfig } from '../shared/app-config.js';
import { childLogger, rootLogger, type Logger } from '../shared/logger.js';
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
import { createIdentityModule, createBetterAuthPlanReader } from '../domains/identity/index.js';
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
import { createCliRuntimeSubstrate } from '../domains/conductor/adapters/cli-runtime.adapter.js';
import { createOpenfangRuntimeSubstrate } from '../domains/conductor/adapters/openfang-runtime.adapter.js';
import { createBrainMemoryAdapter } from '../domains/conductor/adapters/brain-memory.adapter.js';
import { createConductorCodeIntel } from '../domains/conductor/adapters/code-intel.adapter.js';
import { createBrowserPreviewVerifier } from '../domains/conductor/adapters/browser-preview-verify.adapter.js';
// Composition root: the ONE place allowed to value-import the engines browser
// verification executor. It is injected as the agent-os + conductor consumer-owned
// `BrowserVerifyRunner` port so neither domain holds a runtime value edge into engines.
import { executeBrowserVerification } from '../domains/engines/adapters/sidecar/browser-verification.executor.js';
import { createConductorPlanAdapter } from '../domains/conductor/adapters/plan.adapter.js';
import { createGithubStatusAdapter } from '../domains/conductor/adapters/github-status.adapter.js';
import { createTmuxSteerTransport } from '../domains/conductor/adapters/steer-transport.adapter.js';
import { createTmuxScanSource } from '../domains/conductor/adapters/tmux-scan-source.adapter.js';
import { createDmuxGridAdapter } from '../domains/conductor/adapters/dmux-grid.adapter.js';
import { createRecoderMcpInjector } from '../domains/conductor/adapters/mcp-inject.adapter.js';
import { createCloudSandboxSubstrate } from '../domains/conductor/adapters/cloud-sandbox-substrate.adapter.js';
import { createEnginesModule, createOpenfangWorkflowDriver } from '../domains/engines/index.js';
import { createInferenceModule } from '../domains/inference/index.js';
import { createInferenceRoutePalAdapter } from '../domains/inference/adapters/pal-route.adapter.js';
// The composition root owns the engines→inference config bridge: the concrete
// tensorzero config-generation module is injected into the engines tensorzero
// adapter (§7 V5), so the adapter never lazy-`import()`s the inference domain.
import {
  registryFromEnv as tzRegistryFromEnv,
  buildTensorzeroConfig as tzBuildTensorzeroConfig,
  tensorzeroFunctionName as tzTensorzeroFunctionName,
  TENSORZERO_DEFAULT_FUNCTION as TZ_DEFAULT_FUNCTION,
  generateTensorzeroConfig as tzGenerateTensorzeroConfig,
} from '../domains/inference/tensorzero-config.js';
import { createPalConsensusReview } from '../domains/governance/adapters/pal-consensus.adapter.js';
import {
  createBillingModule,
  type BillingSubject,
  type PlanTier,
} from '../domains/billing/index.js';
import {
  createPolarBillingAdapter,
  createPlanCatalog as createDistributionPlanCatalog,
} from '@recoder/distribution';
import { createByokResolver, polarCatalogEntries } from './billing-seams.js';
import {
  createLocalRunDispatch,
  createRemoteEnvelopeSender,
  type EnvelopeFetch,
} from './interop-wire-seams.js';
import { createCliInferenceEnvResolver } from './conductor-inference-seam.js';
import {
  createCloudSandboxGateway,
  createConductorRunSink,
  createCliMintClosure,
} from './conductor-seams.js';
import { createMemoryEmbedFallback, createSquadIssueAdapter } from './memory-seams.js';
import {
  createSocialTargetResolver,
  createSocialConductorDispatch,
  createSocialReplyInference,
} from './social-seams.js';
import { createObservabilityDelivery } from './observability-seams.js';
import { createSquadAutopilotDispatch, parseSquadSeedEnv } from './agent-os-seams.js';
import { createMemoryModule } from '../domains/memory/index.js';
import type { Mem0EnginePort } from '../domains/memory/ports/mem0-engine.port.js';
// Composition root: value-imports the engines mem0 client, injected as the memory
// consumer-owned `Mem0EnginePort` so the mem0 adapter holds no value edge into engines.
import { mem0Add, mem0Search, mem0Health } from '../domains/engines/mem0-client.js';
import {
  createCloudModule,
  createDnsTlsVerifier,
  type CloudModule,
} from '../domains/cloud/index.js';
import {
  createInteropWireComposer,
  type InteropWireComposite,
} from '../domains/interop-wire/interop-wire-module.js';
import { createSocialComposer, type SocialComposite } from '../domains/social/social-module.js';
import { createSealedIngressVouch } from '../domains/social/adapters/signed-vouch.adapter.js';
import { createObservabilityModule } from '../domains/observability/index.js';
import { createNotifyEngine, type NotifyFetch } from '@recoder/agent-notify';
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

/**
 * PUBLIC cockpit SPA provider — the Wave `web` widget loads the bundled cockpit
 * build at `/cockpit/` BEFORE any credential check, so the product UI (HTML/JS)
 * always loads. It is a RouteProvider mounted through the SAME route table as
 * every domain router, so it lands on the one edge express app AHEAD of the 404
 * tail, and carries the default `PUBLIC_MOUNT` guard (no identity.middleware).
 * `express.static` serves real assets; a regex catch-all falls back to the SPA
 * shell so client-side routes resolve. Degrade-safe + truthful: a missing dist
 * (no `index.html`) logs a warn and returns `null` so the mount is skipped —
 * every other surface still boots (never a crash).
 */
function buildCockpitProvider(cockpitDir: string, logger: Logger): RouteProvider | null {
  const indexHtml = resolvePath(cockpitDir, 'index.html');
  if (!existsSync(indexHtml)) {
    logger.warn({ cockpitDir }, 'cockpit dist not found (no index.html) — UI mount skipped');
    return null;
  }
  const router = express.Router();
  router.use(express.static(cockpitDir));
  // SPA fallback: any unmatched cockpit GET resolves to the app shell (real
  // assets above win); the router is mounted at `/cockpit`, so it sees paths
  // relative to that base.
  router.get(/.*/, (_req, res) => {
    res.sendFile(indexHtml);
  });
  return routerProvider('cockpit-ui', '/cockpit', router);
}

// The OPT-IN squad-seed env parser is re-homed in `agent-os-seams.ts` (bootstrap
// is the sole sanctioned env read; agent-os owns the seed shape). Re-exported here
// (over the imported binding) for the prior public surface.
export { parseSquadSeedEnv };

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
  // The per-tool teeth (bound from `gate.enforceTool`): injected below into the
  // engines' interop MCP host so every authorized recoder-MCP tool call is
  // kernel-enforced + Merkle-sealed before dispatch. Coverage boundary: this
  // gates the recoder-MCP tool stream ONLY (incl. `sandbox_exec`/`workspace_merge`),
  // NOT the launched agent's native in-worktree bash/file/secret ops — those never
  // cross this executor and stay under conductor's coarse `guardConductorWrite→decide`.
  // Absent enforcer ⇒ pass-through (truthful, never a fake-allow).
  container.registerValue(CAPABILITY_TOKENS.toolExecGate, governance.toolExecGate());
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
  // The human-notification delivery seam (webhook-backed, degrade-safe): a missing
  // RECODER_NOTIFY_URL/SLACK_WEBHOOK_URL yields truthful `not_configured` results,
  // never a fabricated send. Built HERE (bootstrap is the sanctioned env read) so
  // the SAME instance backs BOTH the agent-callable `recoder.notify` MCP tool (via
  // the engines module below) and observability's alert + needs-you board seams
  // (Phase 11) — one notify engine, one webhook config.
  const notifyEngine = createNotifyEngine({
    fetch: globalThis.fetch as unknown as NotifyFetch,
    env: {
      ...(bootEnv.RECODER_NOTIFY_URL ? { RECODER_NOTIFY_URL: bootEnv.RECODER_NOTIFY_URL } : {}),
      ...(bootEnv.SLACK_WEBHOOK_URL ? { SLACK_WEBHOOK_URL: bootEnv.SLACK_WEBHOOK_URL } : {}),
    },
  });
  const engines = await createEnginesModule({
    config,
    logger: childLogger('engines'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    kernel: governance.kernel(),
    // The per-tool teeth → `InteropHostBundle.toolEnforcer` → the executor
    // chokepoint. Every authorized recoder-MCP tool call is kernel-enforced +
    // Merkle-sealed before dispatch; an infra fault deny-biases (fail-closed).
    toolExecGate: governance.toolExecGate(),
    notifyEngine,
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
    // BYOK delivery-path wiring (rung 3 + governed key writes): the durable
    // envelope-encrypted key store (`governance_secrets`) + the governance gate
    // over PUT /inference/keys/:provider ('inference.key.write'). Vault-down ⇒
    // resolution declines truthfully (never plaintext, never a faked write).
    secrets: governance.secrets(),
    gate: governance.gate(),
    // OPTIONAL platform fallback keys for the rung-3 direct router. Env is
    // folded HERE (bootstrap is the sanctioned env read), never in domain code.
    platformProviderKeys: {
      ...(bootEnv.OPENAI_API_KEY ? { openai: bootEnv.OPENAI_API_KEY } : {}),
      ...(bootEnv.ANTHROPIC_API_KEY ? { anthropic: bootEnv.ANTHROPIC_API_KEY } : {}),
      ...(bootEnv.OPENROUTER_API_KEY ? { openrouter: bootEnv.OPENROUTER_API_KEY } : {}),
      ...(bootEnv.GROQ_API_KEY ? { groq: bootEnv.GROQ_API_KEY } : {}),
      ...(bootEnv.GOOGLE_API_KEY ? { google: bootEnv.GOOGLE_API_KEY } : {}),
    },
  });
  container.registerValue(DOMAIN_TOKENS.inference, inference);
  healthRegistry.register(inference);

  // --- Consumer (a): the pal routing brain, injected over the engines-owned
  //     `PalBrainService` facet (NOT `@recoder/pal` — the inference domain takes no
  //     such import). A request carrying a `routingHint` now has its provider/model/
  //     rung chosen by task INTENT via `engines.pal().routeModel()`; requests without
  //     a hint route exactly as supplied. The facet's pure verbs stay live even with
  //     the `pal-mcp` sidecar absent, so this injection is always safe. ---
  const palBrain = engines.pal();
  if (palBrain) {
    inference.setPalRouter(createInferenceRoutePalAdapter(palBrain));
  }

  // --- Consumer (c): the governance high-risk gate consults pal's adversarial
  //     multi-model CONSENSUS over the SAME engines-owned facet. Governance was
  //     composed BEFORE engines, so this is a LATE setter (now that `engines.pal()`
  //     exists). On a HIGH/critical `allow` the kernel is about to grant, the gate
  //     runs a cross-model review; a credible `block` downgrades it to
  //     `needs_approval`. Degrade-safe: with the `pal-mcp` sidecar absent the facet
  //     abstains, so the kernel allow always stands — the check never blocks on
  //     its own fault. ---
  if (palBrain) {
    governance.setConsensusReview(
      createPalConsensusReview({ pal: palBrain, logger: childLogger('governance') }),
    );
  }

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
  //     executor (binds the durable PostgresAgentOsRepository over the
  //     agentos_0004_state_of_record tables; without it the state-of-record
  //     degrades truthfully to in-memory), the
  //     identity auth middleware, and the NATS/feature-flag slice via overrides.
  //     Degrade-safe: no DB → in-memory repo; no NATS → log-only outbox sink.
  //     BOTH autopilot seams are late-bound below (their owners build after
  //     agent-os): the issue-graph read seam via `attachIssueGraph` (memory owns
  //     the beads facet) and the conductor dispatch seam. ---
  const agentOs = await createAgentOsModule({
    config,
    logger: childLogger('agent-os'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    gate: governance.gate(),
    // browser-use EngineClientPort (a supervised sidecar): the workflow
    // `browser-check` node handler auto-resolves its `.ext()` deep-op port and
    // runs `run_task` against the LIVE sidecar. Absent/down ⇒ the node degrades
    // to a truthful `skipped` (never a fake pass, never a blocked run).
    browserEngine: engines.client('browser-use'),
    // The browser-verification runner (the engines `executeBrowserVerification`),
    // injected as agent-os's consumer-owned `BrowserVerifyRunner` port. The default
    // workflow driver wires the `browser-check` node handler over it + `browserEngine`.
    browserVerifyRunner: executeBrowserVerification,
    // Native openfang workflow engine (§4e): the FIRST real consumer of
    // `createOpenfangWorkflowDriver` — a `tool` node marked `config.workflow`
    // dispatches register_workflow/run_workflow inside the kernel `.node` via the
    // native-workflow `executeTool` handler the default driver wires. Degrade-safe:
    // the driver resolves the engine lazily and reports `available:false` (⇒ the
    // node is a truthful `skipped`) when the `.node` is unbuilt / boot fails.
    nativeWorkflowEngine: createOpenfangWorkflowDriver(),
    overrides: {
      natsUrl: config.agentOs.natsUrl,
      brainEnabled: config.agentOs.brainEnabled,
      codeGraphEnabled: config.agentOs.codeGraphEnabled,
      squadsEnabled: config.agentOs.squadsEnabled,
      squadAutopilotEnabled:
        config.agentOs.squadsEnabled && bootEnv.RECODER_SQUAD_AUTOPILOT === '1',
      // The squad the autopilot routes every dispatch through (leader-first /
      // weighted via multica's SquadService). Unset ⇒ null ⇒ flat default
      // dispatch (degrade-truthful; the loop still runs, just un-routed).
      squadId: bootEnv.RECODER_SQUAD_ID ?? null,
      // Opt-in squad seed: agent-os seeds its in-memory store at start() so
      // SquadService.route() finds a real squad instead of failing closed with
      // "squad not found" (which would make the autopilot skip EVERY dispatch).
      // Absent / malformed env ⇒ null ⇒ pass-through, byte-identical to today.
      squadSeed: parseSquadSeedEnv(bootEnv),
    },
  });
  container.registerValue(DOMAIN_TOKENS['agent-os'], agentOs);
  healthRegistry.register(agentOs);

  // --- Phase 5a: policy-update hook → (c) reloadPolicies. When a forbidden/secret-
  //     path or approval policy artifact changes on the control plane (a space
  //     upsert / policy PUT), agent-os emits `policy.updated`; this hook hot-swaps
  //     the governance kernel's live policy bundle so the edit takes effect for
  //     subsequent `decide()`/`enforceTool` WITHOUT a restart. Fail-closed inside
  //     the kernel: a rejected config leaves the OLD policy live (`reloaded:false`);
  //     static rungs (no napi addon) report `reloaded:false` truthfully. The hook
  //     logs the truthful `{reloaded, reason}` — it never blocks or fails the write
  //     that triggered it (the emitter fans out fire-and-forget). ---
  const governanceReloadLog = childLogger('governance');
  agentOs.onPolicyUpdated(async ({ configJson, source }) => {
    try {
      const result = await governance.reloadPolicies(configJson);
      governanceReloadLog.info(
        { reloaded: result.reloaded, ...(result.reason ? { reason: result.reason } : {}), source },
        'policy hot-swap',
      );
    } catch (err) {
      // Deny-bias: a reload fault leaves the OLD policy live and is logged truthfully.
      governanceReloadLog.warn(
        { err: err instanceof Error ? err.message : String(err), reloaded: false, source },
        'policy hot-swap failed',
      );
    }
  });

  // --- Phase 6c: Memory & Retrieval — recall fusion + the GOVERNED candidate →
  //     durable-item promotion + RAG retrieval. Built BEFORE the conductor so the
  //     conductor run flow can recall on launch + harvest on completion through the
  //     memory module's PUBLIC seams (`recall()` / `harvest()` / `retrieval()`). It
  //     reaches `memory_items`/`memory_candidates` through the agent-os repository
  //     slice (conflict #3 — it never owns those tables) and every durable promotion
  //     passes the governance write seam (`gate.decide`). Degrade-safe: absent Qdrant/
  //     embedder/colbert/mem0 ⇒ truthful empty recall. Config folded from `memory`. ---
  // Memory embeddings fallback: the inference delivery ladder (napi embedded
  // gateway → loopback), shaped as the memory domain's `EmbeddingPort` — memory
  // takes NO cross-domain import; the seam is injected here. Truthful: an
  // unrouted/failed call yields null so memory degrades to keyword search.
  const memoryEmbedFallback = createMemoryEmbedFallback(inference.gateway());
  // The engines mem0 client bound to the memory consumer-owned `Mem0EnginePort`.
  // Same runtime behavior as the direct value import, now injected at the root.
  const mem0Engine: Mem0EnginePort = {
    add: mem0Add,
    search: mem0Search,
    health: mem0Health,
  };
  const memory = createMemoryModule({
    config,
    logger: childLogger('memory'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    gate: governance.gate(),
    candidateStore: agentOs.repository(),
    // The beads raw transport (frozen EngineClientPort). MEMORY owns the
    // cohesive IssueGraphService facet over it (docs/modules/memory.md).
    beadsEngine: engines.client('beads'),
    // The engines mem0 client, shaped as the memory consumer-owned `Mem0EnginePort`
    // — memory takes NO cross-domain value import; the seam is injected here. The
    // client self-resolves its provider and degrades to `available:false` truthfully.
    mem0Engine,
    overrides: config.memory,
    embedFallback: memoryEmbedFallback,
  });
  container.registerValue(DOMAIN_TOKENS.memory, memory);
  healthRegistry.register(memory);
  // Late-bind the squad-autopilot issue-graph seam (agent-os builds before
  // memory; mirrors attachSquadAutopilotConductor). Unattached ⇒ degraded tick.
  agentOs.attachIssueGraph(createSquadIssueAdapter(memory.issueGraph()));

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
  const conductorRunSink = createConductorRunSink(agentOs.runEventBus());
  const conductorSubstrateConfig = {
    tmuxBin: config.conductor.tmuxBin,
    worktreeRoot: config.conductor.worktreeRoot,
  };
  // TWO execution-path substrates share the SAME engine capability seams (the
  // difference is only WHERE the agent runs):
  //  - PATH (a) CLI: the `tmux_worktree` substrate (external coding-agent CLI in an
  //    isolated tmux+git-worktree). It wraps the proven tmux mechanics and NOW
  //    carries the last-mile inference-metering env hook: `cliInferenceEnvResolver`
  //    points the launched CLI's OpenAI-compatible client at THIS backend's gateway
  //    edge (napi → loopback → BYOK) with a Recoder-minted `sk_` credential, so the
  //    BULK of real agent LLM spend flows through the usage ledger + entitlement
  //    token-quota + delivery-outcome audit — the gateway is the UNIVERSAL inference
  //    spine, not just backend calls. Degrade-truthful: gateway down / key unmintable
  //    ⇒ the resolver returns `{}` and the CLI runs on its own BYOK keys, honestly
  //    UNMETERED — never blocked. The composer-level path (e) can still inject
  //    principal/runtimeId-aware env OVER this base (caller wins on any collision).
  //  - PATH (b) openfang: the `in_process` substrate (native openfang `.node` agent
  //    turn against the worktree). Its kernel routes inference through the SAME
  //    shared tensorzero `.node`, so metering/BYOK apply without a loopback URL.
  // Both degrade-safe + truthful: git/tmux absent ⇒ CLI `available:false`; the
  // openfang addon absent/boot-failed ⇒ in_process `available:false` + `launch()`
  // refuses (never a fabricated session). The module + `/api/conductor` still boot.
  //
  // The CLI inference-metering seam: probe the gateway health per launch + mint ONE
  // memoized conductor `sk_` gateway credential (attempted lazily on first metered
  // launch). The base URL is the loopback OpenAI-compatible gateway edge
  // (`<inference mountBase>/gateway/v1`). The mint owner is a stable conductor
  // service subject (substrate-level metering is subject-attributed; per-principal
  // attribution is the composer path (e)'s job). Key store / DB down ⇒ mint yields
  // null ⇒ truthful unmetered skip.
  const cliGatewayBaseUrl = `http://127.0.0.1:${config.server.port}${DOMAIN_REGISTRY.inference.mountBase}/gateway/v1`;
  const cliInferenceEnvResolver = createCliInferenceEnvResolver({
    gateway: inference.gateway(),
    baseUrl: cliGatewayBaseUrl,
    logger: childLogger('conductor-cli-inference'),
    mintGatewayKey: createCliMintClosure(apiKeyService),
  });
  const cliSub = createCliRuntimeSubstrate({
    config: conductorSubstrateConfig,
    logger: childLogger('conductor-cli'),
    resolveInferenceEnv: cliInferenceEnvResolver,
  });
  // The cohesive openfang agent-engine facet (docs/modules/agent-engine.md): its
  // provenance gate is already pre-wired from the injected kernel inside the engines
  // module (shared into BOTH the napi adapter's launch_run option AND the facet's
  // direct run() path). We hand it to the in_process substrate as the narrow
  // AgentTurnPort so the native turn runs over `run`/`continueRun` (each carrying a
  // PER-CALL bufferSink for capture() + token metering). Null when the openfang
  // engine is undeclared / its `.node` is unbuilt ⇒ the substrate reports
  // `available:false` truthfully rather than fabricating a session.
  const agentEngine = engines.agentEngine();
  const openfangSub = createOpenfangRuntimeSubstrate({
    config: conductorSubstrateConfig,
    logger: childLogger('conductor-openfang'),
    agentTurn: agentEngine ?? undefined,
  });
  // PATH (c) off-box: the `daytona` remote-sandbox substrate over the Phase-10
  // cloud provisioner. The cloud module is built LATER (Phase-10, below), so the
  // gateway resolves it LAZILY through `cloudRef` — set right after Phase-10
  // builds `cloud`, mirroring the `socialRef` late-bind. Degrade-truthful: until
  // `cloudRef` is set (and a provider key is present) the gateway reports
  // unavailable and the selector falls back to the local substrates.
  //
  // Only `daytona` is wired. A true `ssh` host provider is NOT yet in the cloud
  // PROVIDER_IDS, so an `ssh` substrate would silently ride the daytona/e2b
  // provider and MIS-LABEL the run — that would fake success, so it stays unwired
  // until a real ssh SandboxProvider lands.
  let cloudRef: CloudModule | null = null;
  // The off-box sandbox gateway (tenant-caching + provision/exec/destroy) lives in
  // `conductor-seams.ts`. `cloudRef` is resolved LAZILY through a getter so the
  // Phase-10 late-bind (`cloudRef = cloud`) is observed; the tenant is CACHED so
  // provision/exec/destroy all scope to the SAME auto-provisioned tenant id.
  const cloudDaytonaSub = createCloudSandboxSubstrate({
    gateway: createCloudSandboxGateway({
      cloudRef: () => cloudRef,
      tenantOwner: 'conductor',
      substrateId: 'daytona',
    }),
    logger: childLogger('conductor-daytona'),
  });
  // The memory-backed brain: recall on launch (mem0 ∪ beads ∪ candidates → rerank)
  // + harvest on completion. Built over the memory module's PUBLIC seams only.
  const conductorBrain = createBrainMemoryAdapter({
    recall: memory.recall(),
    harvest: memory.harvest(),
    retrieval: memory.retrieval(),
    logger: childLogger('conductor-brain'),
  });
  // Code-intel seam: recodergit repo index over the engines domain's FROZEN
  // typed client + beads issue-graph tracking over the MEMORY-owned module
  // facet (`memory.issueGraph()`, not the raw engine seam) — null/down ⇒
  // truthful logged skip either way.
  const conductorCodeIntel = createConductorCodeIntel({
    recodergit: engines.client('recodergit'),
    beads: memory.issueGraph(), // the module facet, not the raw engine seam
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
  // Reconcile-GC substrate scan source: feed the engines-domain DEEP tmux
  // introspection (`list-sessions` over the pinned binary the Conductor drives)
  // into reconcile so it sees the REAL live `recoder-*` sessions on the box and
  // can flag orphaned/leaked sessions + correct record-vs-session drift after a
  // restart. Degrade-truthful: tmux adapter undeclared ⇒ `tmuxIntrospect()` is
  // null and no source is passed, so `createSubstrateScan()` keeps its truthful
  // "cannot see the substrate" default (never fabricated live work).
  const conductorTmuxIntrospect = engines.tmuxIntrospect();
  const conductorSubstrateScan = conductorTmuxIntrospect
    ? createTmuxScanSource({
        introspect: conductorTmuxIntrospect,
        logger: childLogger('conductor-substrate-scan'),
      })
    : undefined;
  // F3 dmux LAYOUT-brain grid source: the compare/parallel path arranges one
  // operator pane per sibling worktree + surfaces a read-only attach hint.
  // Degrade-truthful: dmux adapter undeclared ⇒ `dmuxLayout()` is null and no
  // source is passed, so the compare read stays hint-less and `arrangeCompareGrid`
  // returns a truthful null (never a fabricated grid). `singleTenant` (desktop
  // composition) gates the box-wide `attachCommand`; shared/prod withholds it.
  const conductorDmuxLayout = engines.dmuxLayout();
  const conductorDmuxClient = engines.client('dmux');
  const conductorWorkspaceGrid =
    conductorDmuxLayout && conductorDmuxClient
      ? createDmuxGridAdapter({
          layout: conductorDmuxLayout,
          client: conductorDmuxClient,
          logger: childLogger('conductor-dmux-grid'),
          singleTenant: config.conductor.desktopSingleTenant,
        })
      : undefined;
  // Per-worktree `.mcp.json` injection: on workspace launch the composer writes a
  // secret-free `.mcp.json` that points the launched agent at THIS backend's
  // governed MCP host via the vendored stdio bridge (`mcp/recoder-a2a-server.js`).
  // The bridge path is env-overridable (RECODER_MCP_BRIDGE_PATH) with a repo-root
  // relative default so it resolves in dev, packaged desktop, and prod; bootstrap
  // is the sanctioned env read (the adapter reads no globals). The written env is
  // filtered secret-free — INTERNAL_SERVICE_KEY reaches the bridge only from the
  // agent's substrate-injected process env, never this file. Degrade-safe: a blank
  // worktree / write fault is a truthful skip that NEVER fails an otherwise-good
  // launch. `internalUrl` is the non-secret loopback backend URL.
  const bridgeServerAbsPath =
    bootEnv.RECODER_MCP_BRIDGE_PATH ??
    resolvePath(bootEnv.CONDUCTOR_REPO_ROOT ?? process.cwd(), 'mcp/recoder-a2a-server.js');
  const conductorMcpInject = createRecoderMcpInjector({
    config: {
      args: [bridgeServerAbsPath],
      internalUrl: `http://127.0.0.1:${config.server.port}`,
    },
    logger: childLogger('conductor-mcp-inject'),
  });
  const conductor = createConductorModule({
    config,
    logger: childLogger('conductor'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    gate: governance.gate(),
    runEventSink: conductorRunSink,
    substrates: [cliSub, openfangSub, cloudDaytonaSub],
    brain: conductorBrain,
    codeIntel: conductorCodeIntel,
    // Browsing facet (item 21): the conductor verifies a stored preview URL
    // through the browser-use EngineClientPort. Mirrors the code-intel injection
    // (constructor dep, not a late setter — engines is built before the conductor).
    // Constructed here so setPreviewUrl fires it fire-and-forget and
    // POST /workspaces/:id/preview-verify is served. Degrade-truthful: browser-use
    // unwired/down ⇒ the adapter yields a `skipped(degraded)` verification with the
    // real reason (never a faked pass), and every fire is deadline-bounded so a
    // hung preview can never stall the caller or the completion hook.
    previewVerify: createBrowserPreviewVerifier(
      engines.client('browser-use'),
      executeBrowserVerification,
    ),
    // Double-assignment admission over the Multica coordination fabric, consulted
    // in createWorkspace on the axis resource-governor → coordination-admission →
    // work-lock → launch (keyed on input.taskId). FAIL-OPEN: no MULTICA_URL /
    // engine down / any fault ⇒ admit:true,gated:false ⇒ the launch is untouched
    // (a coordination engine being down NEVER blocks a launch). Only a LIVE,
    // engine-confirmed double-assignment defers the launch (truthful ok:false).
    coordinationAdmission: agentOs.coordinationAdmission(),
    // --- Consumer (b): the pal LAUNCH-PLANNING advisory over the engines-owned
    //     `PalBrainService` facet (NOT `@recoder/pal` — the conductor domain takes
    //     no such import). On a workspace create the launch path consults
    //     `planLaunch()` (a pure in-proc verb) for runtime/skill/tool-grant/sandbox
    //     + governed risk; the caller's explicit choices always win and the
    //     risk/approval advice is sealed onto the launch audit. Absent ⇒ launch is
    //     byte-identical to today (the pure verb needs no sidecar). ---
    ...(palBrain ? { plan: createConductorPlanAdapter(palBrain) } : {}),
    // Per-repo ColBERT PLAID index build on workspace create (late-interaction
    // retrieval): degrade-truthful — the daemon unconfigured ⇒ a truthful skip.
    colbertIndex: memory.colbertSearch(),
    githubStatus: conductorGithub,
    steerTransport: conductorSteer,
    mcpInject: conductorMcpInject,
    ...(conductorSubstrateScan ? { substrateScan: conductorSubstrateScan } : {}),
    ...(conductorWorkspaceGrid ? { workspaceGrid: conductorWorkspaceGrid } : {}),
    // Read-only `/sessions` attach bridge (durable-shell unify §A2): inject the
    // SAME engines-owned tmux introspect the substrate scan uses so the conductor
    // surfaces its live `recoder-*` sessions WITHOUT value-importing the engines
    // domain. Absent ⇒ the lister degrades truthfully to an empty list.
    ...(conductorTmuxIntrospect ? { tmuxIntrospect: conductorTmuxIntrospect } : {}),
    // Delivery-feedback seam: a MERGED workspace fires the inference routing
    // feedback sink (`task_success` on the run's persisted inference_id) so the
    // BYOK LLM gateway learns from real deliveries. Degrade-truthful: the merge
    // flow only fires when an inference_id was persisted onto the workspace
    // record — until that persistence lands the sink is a silent no-op and
    // feedback still reaches the gateway via the `/inference/feedback` route.
    onDeliveryFeedback: (inferenceId, userId, success) => {
      void inference
        .routing()
        .feedback({
          inferenceId,
          metricName: 'task_success',
          value: success,
          ...(userId ? { userId } : {}),
        })
        .catch(() => {
          /* accounting must never throw into the merge path */
        });
    },
    overrides: {
      tmuxBin: config.conductor.tmuxBin,
      worktreeRoot: config.conductor.worktreeRoot,
      // Control-mode flag plumbed through; the conductor module now DRIVES its own
      // degrade-safe live tailer (`startRunTail` + `selectControlModeTail`) from its
      // internal registry+config when this is true — no bootstrap seam is required
      // (the module owns the tailer; the poll tailer stays the sole exit-code
      // authority and falls back to the attach marker for unregistered substrates).
      tmuxControlMode: config.conductor.tmuxControlMode,
      caps: config.conductor.caps,
    },
  });
  container.registerValue(DOMAIN_TOKENS.conductor, conductor);
  healthRegistry.register(conductor);

  // Late-bind the squad-autopilot → conductor dispatch seam (agent-os is built
  // BEFORE the conductor, so the port attaches here). The autopilot pulls ready
  // bd issues through the beads engine seam and launches each through the real
  // governed `createWorkspace` path; a refused/faulted launch surfaces as a
  // truthful `ok:false` — never a fabricated workspace/run. The dispatch closure
  // (fixed internal principal + launch shape) lives in `agent-os-seams.ts`;
  // bootstrap owns only the env-derived repo root.
  agentOs.attachSquadAutopilotConductor(
    createSquadAutopilotDispatch({
      conductor,
      repoRoot: bootEnv.CONDUCTOR_REPO_ROOT ?? process.cwd(),
    }),
  );

  // --- Phase 9: Billing — THE EntitlementGate (plans/metering/quotas/webhooks).
  //     Built AFTER identity (it gates on the credential seam). Its `gate()` is the
  //     cross-domain entitlement seam registered as a capability token so conductor
  //     (pre-dispatch quota), inference (token metering), and engines (usage) can
  //     resolve it. The `/api/billing` router carries the raw-body webhook ingress;
  //     the edge's global JSON parser captures `req.rawBody` (see chain.ts) so the
  //     provider signature verifies. Degrade-safe: no provider key ⇒ adapters `down`
  //     and the gate deny-biases while free-tier entitlements still serve. Config
  //     folded from the `billing` override slice — no env read. ---
  // BYOK resolver over the SAME durable store the inference key-write route
  // persists into (governance secrets, `inference/byok/<provider>` refs): a
  // subject with at least one stored provider key is BYOK and skips
  // token-metered quota. FAIL SAFE: a vault/DB fault resolves `false` (quota
  // stays enforced), never a guessed BYOK.
  const billingResolveByok = createByokResolver(governance.secrets());
  // Distribution grant source: the REAL Polar Merchant-of-Record adapter from
  // @recoder/distribution, wired ONLY when a Polar access token is configured
  // (fail-safe: absent token ⇒ no port ⇒ deny-on-miss grants + free tier still
  // serves; the adapter itself raises FailSafeError + unhealthy on any drift).
  const polarAccessToken = config.billing.polar?.apiKey ?? null;
  const polarPlanEntries = polarCatalogEntries(config.billing.planProducts?.polar);
  const billingDistributionPort = polarAccessToken
    ? createPolarBillingAdapter({
        secrets: {
          get: (name) => (name === 'POLAR_ACCESS_TOKEN' ? polarAccessToken : undefined),
          has: (name) => name === 'POLAR_ACCESS_TOKEN',
          require: (name) => {
            if (name === 'POLAR_ACCESS_TOKEN') return polarAccessToken;
            throw new Error(`required secret missing: ${name}`);
          },
        },
        planCatalog: createDistributionPlanCatalog(polarPlanEntries),
      })
    : undefined;
  // `resolveAuthPlan` — the recoder.xyz auth-DB plan (the other half of the
  // entitlement `max(authPlan, webhookPlan, distributionGrant)`). The website plan
  // is per-USER (Better Auth `users.subscriptionPlan`), so an ORG subject resolves
  // null (website plans never apply to orgs). The reader lazily binds @recoder/auth
  // and reads with a parameterized query; a missing client / DB fault ⇒ null (the
  // webhook projection + distribution grants alone decide — never a guessed plan).
  // The catalog `normalize()` coerces any unknown plan string to `free`.
  // CAVEAT: `subjectId` is the principal userId (web Better Auth `user.id`). If a
  // subject's web id diverges from the legacy `users.id` in prod the lookup misses
  // and returns null — truthful non-elevation (never over-grants).
  const authPlanReader = createBetterAuthPlanReader(childLogger('identity-authplan'));
  const resolveAuthPlan = async (subject: BillingSubject): Promise<PlanTier | null> => {
    if (subject.kind !== 'user') return null;
    return (await authPlanReader.readPlan(subject.subjectId)) as PlanTier | null;
  };
  const billing = createBillingModule({
    config,
    logger: childLogger('billing'),
    executor: persistence.executor(),
    middleware: identity.middleware(),
    overrides: config.billing,
    resolveByok: billingResolveByok,
    resolveAuthPlan,
    ...(billingDistributionPort ? { billingPort: billingDistributionPort } : {}),
  });
  // Wire the governance write gate into billing so checkout/cancel MUTATIONS pass
  // through `decide → policy → durable audit` (governance is composed before billing,
  // so `governance.gate()` is available). Until this line ran, billing mutations
  // proceeded UNGATED (degrade-safe: still authenticated + own-subject only, never a
  // fabricated audit record). `BillingWriteGate` is a `Pick<GovernanceGate,'decide'>`
  // view, so the concrete gate is structurally assignable with no runtime coupling.
  billing.setGovernanceGate(governance.gate());
  container.registerValue(DOMAIN_TOKENS.billing, billing);
  container.registerValue(CAPABILITY_TOKENS.entitlementGate, billing.gate());
  healthRegistry.register(billing);

  // Inject the billing EntitlementGate as the OPTIONAL pre-dispatch quota seam into
  // the domains that meter against it (both were built before billing and degrade
  // OPEN until injected): conductor consults it before launching a run
  // (`workspace.create` quota), inference before each completion (token quota).
  conductor.setEntitlementGate(billing.gate());
  inference.setEntitlementGate(billing.gate());

  // Wire the usage-meter EMITTER next to the gate: the gate only READS headroom
  // pre-dispatch, so nothing decrements until a completion meters usage. The
  // conductor meters one `agent_run` per completed/failed run; inference meters
  // `token` (prompt + completion) per routed completion — both through the SAME
  // durable ledger. Degrade-safe: the metering service no-ops truthfully without a
  // DB, and every emit is fire-and-forget so a metering hiccup never blocks delivery.
  conductor.setUsageMeter(billing.metering());
  inference.setUsageMeter(billing.metering());

  // Close the merge → task_success RLHF loop (the run-inference sink). A routed
  // completion the inference routing service serves through the `napi` embedded-
  // TensorZero tier — AND ONLY that tier — with a `correlationWorkspaceId` emits its
  // gateway `inference_id` here, so conductor (the single writer of the workspace
  // record) can anchor the run on an id TensorZero can actually resolve. The routing
  // service enforces the `tier === 'napi'` provenance gate upstream: a non-napi
  // provider id (`chatcmpl-…`/`msg_…` from loopback / rung-3 BYOK) has no feedback
  // seam and is NEVER emitted, so it can never be persisted as an unresolvable anchor.
  // Fire-and-forget + degrade-truthful: `recordRunInferenceId` write-once-patches the
  // workspace metadata and never throws; the `.catch` guarantees a sink fault can
  // never block or fail a completion's delivery. Absent this injection the routing
  // service's emission is a truthful no-op (see docs/modules/inference.md).
  inference.setRunInferenceSink({
    record: async ({ workspaceId, inferenceId }) => {
      // Reached ONLY for napi-tier ids (the routing service gates on tier === 'napi').
      await conductor.recordRunInferenceId(workspaceId, inferenceId).catch(() => {
        /* never throws into delivery */
      });
    },
  });

  // Activate the DB-catalog → gateway boot-config loop (`generateConfig()` — dark
  // until now). Late-bound over the TYPED, tz-scoped engines accessor (NOT the
  // generic `engines.tensorzero()` port handle), so the embedded TensorZero gateway
  // boots on `registry ∪ DB-catalog` (model-table merge + single re-materialize)
  // instead of env `TENSORZERO_MODELS` alone. Degrade-safe: no napi tensorzero
  // adapter ⇒ the accessor no-ops; the provider throwing / returning an empty model
  // set ⇒ the adapter falls back to the byte-identical env-only boot file. inference
  // + engines are both built above (Phase 6a/6b), so the closure is safe here.
  engines.setTensorzeroCatalogProvider(() => inference.generateConfig());

  // Inject the engines→inference config-generation bridge (§7 V5): the tensorzero
  // napi adapter's model-catalog + gateway boot-config paths call this injected
  // provider instead of two lazy `await import(...)` edges into the inference
  // domain. The five members mirror the inference `tensorzero-config` module 1:1.
  engines.setTensorzeroConfigProvider({
    registryFromEnv: tzRegistryFromEnv,
    buildTensorzeroConfig: tzBuildTensorzeroConfig,
    tensorzeroFunctionName: tzTensorzeroFunctionName,
    TENSORZERO_DEFAULT_FUNCTION: TZ_DEFAULT_FUNCTION,
    generateTensorzeroConfig: tzGenerateTensorzeroConfig,
  });

  // --- Phase 10: Cloud — off-box substrate (sandboxes/previews/tenancy/mesh). Built
  //     AFTER billing. The Phase-3 governance decide→audit seam guards EVERY cloud
  //     write (sandbox provision/destroy, deployment create, preview-URL mint,
  //     tenant auto-provision); an erroring gate fails CLOSED at the cloud edge.
  //     The remaining cross-domain seams are OPTIONAL + degrade-safe and are
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
    governanceGate: governance.gate(),
    // The REAL DNS TXT + TLS-cert ownership prober, so custom domains can actually
    // be ACTIVATED (node:dns + node:tls). Absent it, `verify` stays truthfully
    // pending; the prober itself degrades truthfully on a resolve/probe fault.
    domainVerifier: createDnsTlsVerifier({ logger: childLogger('cloud-domain-verify') }),
  });
  container.registerValue(DOMAIN_TOKENS.cloud, cloud);
  healthRegistry.register(cloud);
  // Late-bind the conductor's off-box sandbox gateway to the now-built cloud module
  // (Phase-5b conductor was constructed BEFORE Phase-10 cloud; the gateway resolved
  // it lazily). From here the `daytona` remote substrate can provision + exec.
  cloudRef = cloud;

  // --- Phase 7a: Interop-wire — the A2A WIRE slice (envelope build/seal/validate,
  //     agent-card, signed-ingress gate, registry/task projection) PLUS the dispatch/
  //     registry/bridge services + the six runtime connectors. The COMPOSER layers
  //     those over the frozen core and exposes `routes()` (`/api/interop`),
  //     `wireRoutes()` (`/api/a2a`), `mcp()`, and `start()/stop()`, so it is now
  //     mounted + registered + lifecycled (no longer accessor-only). Middleware is the
  //     composed identity auth. The OPTIONAL conductor `localRun` (Phase-5b
  //     `createWorkspace`) + remote-peer `remoteSender` (outbound A2A over the peer's
  //     advertised `card.url`) seams are NOW wired here from the composition-root
  //     seams (`interop-wire-seams.ts`): an admitted `message/send` to a `runtime`
  //     target launches a real governed run, and a `remote_a2a`/connector target
  //     delivers the sealed envelope to its peer. Both degrade TRUTHFULLY — a refused
  //     launch / a peer with no url / a non-2xx or network fault surfaces as `ok:false`
  //     with the real reason, never a fabricated run or faked send. Conductor is built
  //     above (Phase-5b), so both seams are available at this point.
  //     Config folded from the `interopWire` override slice. Degrade-safe: no HMAC
  //     secret in prod ⇒ unsigned ingress rejected; no executor path ⇒ in-memory. ---
  const interopLocalRun = createLocalRunDispatch({
    conductor,
    repoRoot: bootEnv.CONDUCTOR_REPO_ROOT ?? process.cwd(),
  });
  const interopRemoteSender = createRemoteEnvelopeSender({
    fetch: globalThis.fetch as unknown as EnvelopeFetch,
  });
  const interopWire = createInteropWireComposer({
    config,
    logger: childLogger('interop-wire'),
    executor: persistence.executor(),
    overrides: config.interopWire,
    middleware: identity.middleware(),
    localRun: interopLocalRun,
    remoteSender: interopRemoteSender,
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
  //     Middleware is the composed identity auth. The conductor dispatch, reply
  //     inference, signed-vouch, and secret-vault seams are wired HERE over the
  //     real modules built above (Phase-5b conductor, Phase-6b inference gateway,
  //     Phase-3 governance secrets); each degrades truthfully when its backing
  //     dependency is down — never a fabricated run/reply/secret. The webhook
  //     ingress reads the exact raw bytes via the edge chain's global `req.rawBody`
  //     capture (chain.ts `verify`), the SAME trust boundary billing's webhooks use —
  //     so no separate raw-body mount is required. Hostile-by-default: an empty allowlist
  //     admits nothing; a missing webhook secret refuses. Config folded from `social`. ---
  // Conductor launch target resolver: an ADMITTED chat resolves through its
  // explicit channel binding (hostile-by-default: no binding / `allow:false` ⇒
  // null ⇒ truthful "unbound chat" error). The binding's owner is the launch
  // principal; the repo root mirrors the squad-autopilot convention.
  let socialRef: SocialComposite | null = null;
  const socialTargetResolver = createSocialTargetResolver({
    socialRef: () => socialRef,
    repoRoot: bootEnv.CONDUCTOR_REPO_ROOT ?? process.cwd(),
  });
  // The conductor `/run` seam: the REAL governed `createWorkspace` path (gate +
  // quota + substrate launch). A refused/faulted launch surfaces as `ok:false`.
  const socialConductorDispatch = createSocialConductorDispatch(conductor);
  // The reply seam: one bounded completion through the inference delivery
  // ladder. An unrouted ladder yields a truthful `ok:false` (never a fake).
  const socialReplyInference = createSocialReplyInference({
    gateway: inference.gateway(),
    defaultModel: config.inference.defaultModel ?? 'openai/gpt-4o-mini',
  });
  // Signed connector-ingress vouch over SOCIAL_INGRESS_SECRET (null ⇒ inert,
  // the gate skips the step) + the governance secret vault for connector creds
  // (vault down ⇒ null secrets, channels stay down truthfully).
  const socialVouch = createSealedIngressVouch({ secret: config.social.ingressSecret ?? null });
  const SOCIAL_SECRET_OWNER = 'service:social';
  const social = createSocialComposer({
    config,
    logger: childLogger('social'),
    executor: persistence.executor(),
    overrides: config.social,
    middleware: identity.middleware(),
    conductor: socialConductorDispatch,
    targetResolver: socialTargetResolver,
    inference: socialReplyInference,
    ...(socialVouch ? { signedVouch: socialVouch } : {}),
    vault: {
      async resolve(ref: string): Promise<string | null> {
        try {
          return await governance.secrets().get(SOCIAL_SECRET_OWNER, ref);
        } catch {
          return null; // vault down ⇒ truthful null (never plaintext fallback)
        }
      },
    },
  });
  socialRef = social;
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
  // The human-notification delivery seam (`notifyEngine`) is built ABOVE (before
  // the engines module) so the SAME instance backs the agent-callable
  // `recoder.notify` MCP tool AND observability's alert notifier + needs-you board.
  //
  // (a) Arm the SHIPPED signals poller outside prod (embedded desktop + dev) so
  // stuck-work surfaces autonomously, not only on a human `GET /signals`. Use a
  // REAL test signal: `config.runtime.env` is the typed NodeEnv ('development' |
  // 'production' | 'test') — there is NO `config.runtime.isTest`. Tests ⇒ 0 so no
  // background timer and no boot-time availability probe fire in the unit suite.
  const isTestRuntime = config.runtime.env === 'test';
  const signalsPollIntervalMs = isTestRuntime
    ? 0
    : config.runtime.isProduction
      ? 60_000
      : 120_000;
  // (c) Opt-in GitHub/Linear detector tick, sourced from `bootEnv` like every
  // ops-recorder value (AppConfig carries no observability slice). ENFORCED
  // COUPLING: the tick rides inside `pollSignalsOnce`, so it is only enabled when
  // the poller is actually armed (interval > 0) — never silently dead. A `true`
  // env with the poller off is warned about (invariant made explicit), not honored.
  const signalsSyncRequested = bootEnv.OPS_RECORDER_SYNC_ENABLED === 'true';
  const signalsSyncEnabled = signalsPollIntervalMs > 0 && signalsSyncRequested;
  if (signalsSyncRequested && !signalsSyncEnabled) {
    childLogger('observability').warn(
      'OPS_RECORDER_SYNC_ENABLED set but the signals poller is off (interval 0); the detector tick will not run',
    );
  }
  // The three delivery objects the observability module consumes — signals bridge
  // onto the agent-os RunEvent bus (`source:'engine'`), needs-you signals + fired
  // alerts post through the SAME truthful notify webhook. Extracted verbatim into
  // `observability-seams.ts` (each degrades truthfully — never a fabricated send).
  const observabilityDelivery = createObservabilityDelivery({
    runEventBus: agentOs.runEventBus(),
    notifyEngine,
  });
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
    // Signals → state-of-record bridge: every normalized work signal ingests
    // into the agent-os RunEvent bus (provenance 'engine' — the ops-recorder
    // sidecar is an engine). Idempotent by eventId; a gate-refused ingest is a
    // truthful rejection, never a masked success.
    runEvents: observabilityDelivery.runEvents,
    // Needs-you signals surface through the notify webhook (the board seam).
    board: observabilityDelivery.board,
    // Alert delivery: fired alerts post through the same truthful notify seam.
    notifier: observabilityDelivery.notifier,
    // The supervised ops-recorder daemon's LIVE loopback URL (engines module
    // publishes it once its first health passes); a static OPS_RECORDER_URL
    // override still wins inside the client.
    opsRecorderUrlProvider: () => engines.endpoint('ops-recorder'),
    overrides: {
      otlpEndpoint: bootEnv.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
      opsRecorderUrl: bootEnv.OPS_RECORDER_URL ?? null,
      opsRecorderToken: bootEnv.OPS_RECORDER_TOKEN ?? null,
      // Mirrors the engines slice default (loopback-only dev sidecar runs
      // authless); the availability probe still decides truthfully.
      opsRecorderAuthDisabled: bootEnv.OPS_RECORDER_AUTH_DISABLED !== 'false',
      // (a) Arm the shipped poller outside prod (test ⇒ 0). (c) Opt-in detector
      // tick, enabled ONLY when the poller is armed (see the coupling above).
      signalsPollEnabled: true,
      signalsPollIntervalMs,
      signalsSyncEnabled,
    },
  });
  container.registerValue(DOMAIN_TOKENS.observability, observability);
  // Register observability's OWN engine health as the 15th source — its aggregate
  // includes itself (logging/metrics/tracing/signals), never a blind spot.
  healthRegistry.register(observability);

  // (b) SINGLE-WRITER late-bind: the conductor's completion hook reverse-pushes a
  // failed/stuck terminal run onto the ops-recorder stuck-work board, so a broken
  // run lands on the SAME board a stale PR does. This one structural adapter binds
  // the conductor-owned `RunSignalPushPort` to observability's `forwardRunSignal`
  // WITHOUT either domain importing the other (ConductorRunOutcome ⊆ RunOutcomeSignal,
  // OpsRecorderPushResult ⊇ RunSignalPushResult). Observability is built AFTER the
  // conductor, so this is a late setter (mirrors setUsageMeter / setEntitlementGate).
  // Degrade-truthful + fire-and-forget: the hook already swallows any fault, so a
  // push can never stall or fail a run completion; an unwired/down sidecar is a
  // truthful no-op (never a fabricated signal).
  conductor.setRunSignalPush({
    forwardRunSignal: (input) => observability.forwardRunSignal(input),
  });

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
  // The PUBLIC cockpit UI static mount. `COCKPIT_DIST` (packaged:
  // <resourcesPath>/cockpit/dist; dev: apps/desktop/cockpit/dist) is the
  // sanctioned env read HERE; absent ⇒ a repo-relative `../cockpit/dist` default.
  // Prepended so it resolves ahead of the domain routers (and the 404 tail);
  // `null` when the dist is absent ⇒ the mount is simply skipped.
  const cockpitDir = bootEnv.COCKPIT_DIST ?? resolvePath(process.cwd(), '../cockpit/dist');
  const cockpitProvider = buildCockpitProvider(cockpitDir, childLogger('cockpit-ui'));

  const providers: readonly RouteProvider[] = [
    // The cockpit SPA (PUBLIC, no auth) — served before any Bearer/api-key guard
    // so the product UI loads; skipped truthfully when its dist is absent.
    ...(cockpitProvider ? [cockpitProvider] : []),
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
    // Internal engines worker surface (INTERNAL_SERVICE_KEY-gated internally):
    // GET /internal/engines/health — truthful per-engine health for workers.
    routerProvider('engines-internal', '/internal/engines', engines.internalRoutes()),
    // Inference LLM-gateway edges: control + OpenAI-compatible surface (self-gated).
    routerProvider('inference', DOMAIN_REGISTRY.inference.mountBase, inference.routes()),
    // ALIAS: the built-in AI panel POSTs the flat `/api/gateway/v1/chat/completions`.
    // The canonical mount nests the OpenAI-compatible sub-router under `/gateway`
    // (→ `/api/gateway/gateway/v1/...`), so mount the SAME memoized gateway
    // sub-router (same handler instance + self-guard) at `/api/gateway` root so the
    // un-nested `/api/gateway/v1/chat/completions` (+ `/v1/embeddings`) resolves.
    // Canonical mount above stays intact; this only ADDS the flat path.
    routerProvider('inference-gateway-alias', '/api/gateway', inference.gatewayRoutes()),
    // Billing edges: plan/checkout/portal/cancel + RAW-BODY provider webhooks. The
    // global JSON parser stashes `req.rawBody` (chain.ts) so webhook signatures verify.
    routerProvider('billing', DOMAIN_REGISTRY.billing.mountBase, billing.routes()),
    // Internal billing usage ingest (INTERNAL_SERVICE_KEY-gated internally):
    // POST /internal/billing/meter — workers report per-run/token/engine usage.
    routerProvider('billing-internal', '/internal/billing', billing.internalRoutes()),
    // Memory + retrieval edges (mount under /api/agent-os alongside agent-os).
    routerProvider('memory', DOMAIN_REGISTRY.memory.mountBase, memory.routes()),
    // Internal memory harvest ingest (INTERNAL_SERVICE_KEY-gated internally):
    // workers POST completion-harvest candidates through this self-gated router.
    routerProvider('memory-internal', '/internal/agent-os/memory', memory.internalRoutes()),
    // Cloud edges: tenancy/sandboxes/preview/mesh (self-gated; degrade-safe).
    routerProvider('cloud', DOMAIN_REGISTRY.cloud.mountBase, cloud.routes()),
    // Internal cloud worker surface (INTERNAL_SERVICE_KEY-gated internally): the
    // mesh/xds writer + tenant provisioning edges workers drive. Degrade-truthful:
    // no xds/ziti endpoint configured (XDS_ENDPOINT/ZITI_ENDPOINT) ⇒ the writer
    // reports unconfigured, never a fabricated push.
    routerProvider('cloud-internal', '/internal/cloud', cloud.internalRoutes()),
    // Social edges: connectors/bindings read models + the hostile-by-default webhook
    // ingress (`POST /api/social/webhooks/:channel`, RAW-body HMAC over req.rawBody).
    routerProvider('social', DOMAIN_REGISTRY.social.mountBase, social.routes()),
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
