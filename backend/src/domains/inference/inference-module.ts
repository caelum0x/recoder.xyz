/**
 * `InferenceComposer` — the composer that fuses the BYOK LLM gateway into one
 * module. It:
 *  - slices the injected `AppConfig` into `InferenceConfig` (no env reads here),
 *  - assembles the delivery ladder (`TensorzeroTransportAdapter`) over the injected
 *    (or default) napi + loopback + streaming tiers — CONFLICT #8-safe: the napi
 *    tier CONSUMES the engines client's process-memoized `.node`, never re-loads it,
 *  - builds the durable repositories (catalog / usage ledger / delivery outcome /
 *    provider-key metadata) over the persistence `QueryExecutor`,
 *  - wraps the ladder with cost accounting in `InferenceRoutingService`,
 *  - exposes the control + OpenAI-compatible routers (real per-token SSE),
 *  - reports truthful health + the read/complete MCP tools.
 *
 * No `process.env` reads; no top-level singletons. Every stateful path is
 * degrade-safe: without a DB the repos no-op, without an endpoint the ladder falls
 * to napi or reports `down`, without a vault key the BYOK cache disables.
 */
import { Router } from 'express';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { Logger } from '../../shared/logger.js';
import type { LlmGatewayPort } from './llm-gateway-client.js';
import { sliceInferenceConfig, type InferenceConfig } from './config.js';
import type { InferenceGatewayPort } from './ports/inference-gateway.port.js';
import type {
  KeyVaultPort,
  ModelCatalogRepository,
  ProviderKeyCache,
  ProviderKeyRepository,
  UsageLedgerRepository,
} from './ports/index.js';
import type { DeliveryOutcomeRepository } from './ports/usage-ledger.port.js';
import { PgModelCatalogRepository } from './repositories/model-catalog.repository.js';
import { PgProviderKeyRepository } from './repositories/provider-key.repository.js';
import {
  PgUsageLedgerRepository,
  PgDeliveryOutcomeRepository,
} from './repositories/usage-ledger.repository.js';
import { TensorzeroTransportAdapter, type NapiTierPort } from './adapters/tensorzero-transport.adapter.js';
import {
  createDefaultLoopbackClient,
  createEmbeddedNapiTier,
  createRealStreamFetch,
} from './adapters/default-transports.js';
import { createEngineClientNapiTier } from './adapters/engine-client-napi-tier.js';
import { createProviderKeyCache } from './adapters/byok-key-cache.js';
import { createByokKeyResolver } from './adapters/byok-key-resolver.js';
import { createDirectProviderTransport } from './adapters/direct-provider.transport.js';
import type { ByokKeyResolver, InferenceKeyWriteGate } from './ports/byok-resolver.port.js';
import { generateTzConfig, type GeneratedTzConfig } from './adapters/tz-config-generator.js';
import type { StreamFetchLike } from './adapters/gateway-stream.js';
import { InferenceRoutingService } from './services/inference-routing.service.js';
import { buildInferenceRouter } from './routes/inference.routes.js';
import { createOpenAiCompatRouter } from './routes/openai-compat.routes.js';
import { createOpenAiEmbeddingsRouter } from './routes/openai-embeddings.routes.js';
import { buildInferenceMcpTools } from './mcp/inference-engine.js';
import { buildInferenceHealth } from './health.js';
import type { InferenceModule, InferenceModuleDeps } from './index.js';
import type { EntitlementGate } from './ports/entitlement-gate.port.js';
import type { UsageMeterPort } from './ports/usage-meter.port.js';
import type { PalRoutePlannerPort } from './ports/pal-route.port.js';
import type { RunInferenceSinkPort } from './ports/run-inference-sink.port.js';
// TYPE-ONLY: the frozen Phase-11 tracing seam (erased at build); the concrete
// value is late-bound by bootstrap via `setTracer` AFTER observability composes.
import type { TracerPort } from '../observability/ports/tracer.port.js';

/** A permanently-unavailable vault → the BYOK cache disables (no plaintext cache). */
function unavailableVault(): KeyVaultPort {
  return {
    available: false,
    async encrypt(): Promise<string> {
      throw new Error('key vault unavailable (no master key configured)');
    },
    async decrypt(): Promise<string> {
      throw new Error('key vault unavailable (no master key configured)');
    },
  };
}

export class InferenceComposer implements InferenceModule {
  readonly name = 'inference' as const;

  private readonly log: Logger;
  private readonly cfg: InferenceConfig;
  private readonly executor: QueryExecutor;
  private readonly middleware: AuthMiddleware;
  private readonly gatewayPort: InferenceGatewayPort;
  private readonly napiTier?: NapiTierPort;
  private readonly catalogRepo: ModelCatalogRepository;
  private readonly ledgerRepo: UsageLedgerRepository;
  private readonly outcomeRepo: DeliveryOutcomeRepository;
  private readonly providerKeyRepo: ProviderKeyRepository;
  private readonly keyCacheImpl: ProviderKeyCache;
  private readonly byokResolverImpl: ByokKeyResolver;
  private readonly routingService: InferenceRoutingService;
  private keyWriteGate?: InferenceKeyWriteGate;
  /** BE-7.3b: the late-bound tracer for outbound provider HTTP (via `setTracer`). */
  private tracer: TracerPort | null = null;
  private started = false;
  // Memoized OpenAI-compatible sub-routers, so the canonical `routes()` mount and
  // the `/api/gateway` bootstrap alias (`gatewayRoutes()`) share the SAME handler
  // instances + auth guard — one router, no duplicated logic.
  private openaiCompatRouter?: Router;
  private openaiEmbeddingsRouter?: Router;

  constructor(deps: InferenceModuleDeps) {
    this.log = deps.logger;
    this.cfg = sliceInferenceConfig(deps.config, deps.overrides ?? {});
    this.executor = deps.executor;
    this.middleware = deps.middleware;

    // Durable repositories over the single persistence executor.
    this.catalogRepo = new PgModelCatalogRepository(this.executor, this.log);
    this.ledgerRepo = new PgUsageLedgerRepository(this.executor, this.log);
    this.outcomeRepo = new PgDeliveryOutcomeRepository(this.executor, this.log);
    this.providerKeyRepo = new PgProviderKeyRepository(this.executor, this.log);

    // Encrypted BYOK key cache (disabled when the vault is unavailable).
    this.keyCacheImpl = createProviderKeyCache({ vault: deps.vault ?? unavailableVault() });

    // BYOK key RESOLUTION into the delivery path: cache → governance secrets →
    // cache upsert. Without the secrets seam the resolver reports disabled and
    // rung 3 declines truthfully (never a plaintext side-channel).
    this.byokResolverImpl = createByokKeyResolver({
      logger: this.log,
      cache: this.keyCacheImpl,
      repository: this.providerKeyRepo,
      secrets: deps.secrets,
    });
    if (deps.gate) this.keyWriteGate = deps.gate;

    // Assemble the delivery ladder (full override wins; else build default tiers).
    if (deps.gateway) {
      this.gatewayPort = deps.gateway;
    } else {
      const loopback: LlmGatewayPort = deps.loopback ?? createDefaultLoopbackClient(this.cfg);
      const streamFetch: StreamFetchLike | undefined = deps.streamFetch ?? createRealStreamFetch();
      // napi tier priority: explicit override → engines EngineClientPort (CONFLICT
      // #8-safe, shared .node load) → legacy embedded-gateway fallback.
      const napi: NapiTierPort =
        deps.napi ??
        (deps.napiEngine
          ? createEngineClientNapiTier(deps.napiEngine, this.log)
          : createEmbeddedNapiTier(this.log));
      this.napiTier = napi;
      // Rung 3: the direct BYOK multi-provider router (override → default).
      const router =
        deps.router ??
        createDirectProviderTransport({
          logger: this.log,
          resolver: this.byokResolverImpl,
          platformKeys: deps.platformProviderKeys ?? {},
          ...(deps.providerFetch ? { fetch: deps.providerFetch } : {}),
          timeoutMs: this.cfg.requestTimeoutMs,
          // Late-bind seam: resolved per call, so `setTracer` (bootstrap, after
          // observability composes) takes effect without rebuilding the ladder.
          tracer: () => this.tracer,
        });
      this.gatewayPort = new TensorzeroTransportAdapter({
        logger: this.log,
        config: this.cfg,
        loopback,
        ...(streamFetch ? { streamFetch } : {}),
        napi,
        router,
      });
    }

    // Wrap the ladder with cost accounting + the durable ledger.
    this.routingService = new InferenceRoutingService({
      logger: this.log,
      gateway: this.gatewayPort,
      catalog: this.catalogRepo,
      ledger: this.ledgerRepo,
      outcomes: this.outcomeRepo,
    });
    // FUSION: the pal routing brain is NO LONGER self-wired here. It lives behind
    // the engines-owned `PalBrainService` facet; bootstrap injects it over
    // `engines.pal()` via `setPalRouter(createInferenceRoutePalAdapter(...))` so
    // the inference domain takes no direct pal-engine-package import (§7 grep
    // gate). Until injected, requests route as supplied — the degrade-safe default.
  }

  gateway(): InferenceGatewayPort {
    return this.gatewayPort;
  }

  routing(): InferenceRoutingService {
    return this.routingService;
  }

  /** Inject the optional billing entitlement gate (BYOK-aware token quota). */
  setEntitlementGate(gate: EntitlementGate): void {
    this.routingService.setEntitlementGate(gate);
  }

  /** Inject the optional billing usage meter (per-completion token metering). */
  setUsageMeter(meter: UsageMeterPort): void {
    this.routingService.setUsageMeter(meter);
  }

  /**
   * BE-7.3b: late-bind the observability tracer (bootstrap calls this AFTER
   * observability is composed — same single-writer discipline as
   * `conductor.setMetrics`). Once set, every rung-3 direct provider completion
   * opens an `inference.provider_call` child span and carries W3C `traceparent`.
   * Unwired ⇒ the call path is untouched (degrade-truthful).
   */
  setTracer(tracer: TracerPort): void {
    this.tracer = tracer;
  }

  /**
   * Inject the optional pal routing brain (the engines-owned `PalBrainService`
   * facet, adapted). Bootstrap wires it over `engines.pal()`; a `routingHint`-
   * carrying request then routes by task INTENT. Absent ⇒ requests route as
   * supplied. No direct pal-engine-package import crosses this domain.
   */
  setPalRouter(planner: PalRoutePlannerPort): void {
    this.routingService.setPalRouter(planner);
  }

  /**
   * Inject the optional run-inference sink (conductor's single-writer
   * `recordRunInferenceId`, adapted). Once wired, a `napi`-tier routed
   * completion carrying a `correlationWorkspaceId` correlates its
   * `inference_id` back to its workspace so a MERGE can fire real RLHF
   * feedback. Absent ⇒ a truthful no-op; fire-and-forget, never blocks delivery.
   */
  setRunInferenceSink(sink: RunInferenceSinkPort): void {
    this.routingService.setRunInferenceSink(sink);
  }

  /**
   * Inject the governance gate that governs BYOK key writes. Until set (or
   * passed as `deps.gate`), `PUT /inference/keys/:provider` fails CLOSED with a
   * truthful 503 — a secret write is never allowed ungoverned.
   */
  setGovernanceGate(gate: InferenceKeyWriteGate): void {
    this.keyWriteGate = gate;
  }

  /** The BYOK key resolver (delivery-path key resolution + governed store). */
  byokResolver(): ByokKeyResolver {
    return this.byokResolverImpl;
  }

  catalog(): ModelCatalogRepository {
    return this.catalogRepo;
  }

  usage(): UsageLedgerRepository {
    return this.ledgerRepo;
  }

  providerKeys(): ProviderKeyRepository {
    return this.providerKeyRepo;
  }

  keyCache(): ProviderKeyCache {
    return this.keyCacheImpl;
  }

  async generateConfig(): Promise<GeneratedTzConfig> {
    const models = await this.catalogRepo.list({ enabledOnly: true });
    return generateTzConfig(models);
  }

  /** The inference control router + the OpenAI-compatible routers. */
  routes(): Router {
    const router = Router();
    router.use(
      buildInferenceRouter({
        gateway: this.gatewayPort,
        routing: this.routingService,
        catalog: this.catalogRepo,
        ledger: this.ledgerRepo,
        providerKeys: this.providerKeyRepo,
        keyCache: this.keyCacheImpl,
        resolver: this.byokResolverImpl,
        getGate: () => this.keyWriteGate,
        mw: this.middleware,
        soloMode: this.cfg.soloMode,
      }),
    );
    // OpenAI base-url compatibility: `/inference/v1/...` and `/gateway/v1/...`.
    const openai = this.getOpenaiCompatRouter();
    router.use('/inference', openai);
    router.use('/gateway', openai);
    // Embeddings edge: `/inference/v1/embeddings` and `/gateway/v1/embeddings`.
    const embeddings = this.getOpenaiEmbeddingsRouter();
    router.use('/inference', embeddings);
    router.use('/gateway', embeddings);
    return router;
  }

  /** Memoized OpenAI chat-completion sub-router (`/v1/chat/completions`). */
  private getOpenaiCompatRouter(): Router {
    if (!this.openaiCompatRouter) {
      this.openaiCompatRouter = createOpenAiCompatRouter({
        routing: this.routingService,
        authenticateRequest: this.middleware.authenticate,
      });
    }
    return this.openaiCompatRouter;
  }

  /** Memoized OpenAI embeddings sub-router (`/v1/embeddings`). */
  private getOpenaiEmbeddingsRouter(): Router {
    if (!this.openaiEmbeddingsRouter) {
      this.openaiEmbeddingsRouter = createOpenAiEmbeddingsRouter({
        routing: this.routingService,
        authenticateRequest: this.middleware.authenticate,
      });
    }
    return this.openaiEmbeddingsRouter;
  }

  /**
   * The OpenAI-compatible gateway sub-router mounted at its OWN base — reuses the
   * SAME memoized handler instances + auth guard `routes()` mounts under
   * `/inference` and `/gateway`. Bootstrap mounts this at `/api/gateway` so the
   * built-in AI panel's `POST /api/gateway/v1/chat/completions` (and
   * `/v1/embeddings`) resolves WITHOUT a doubled `/gateway/gateway` segment.
   */
  gatewayRoutes(): Router {
    const router = Router();
    router.use(this.getOpenaiCompatRouter());
    router.use(this.getOpenaiEmbeddingsRouter());
    return router;
  }

  mcp(): readonly McpToolRegistration[] {
    return buildInferenceMcpTools({
      gateway: this.gatewayPort,
      catalog: this.catalogRepo,
      routing: this.routingService,
    });
  }

  async health(): Promise<ComponentHealth> {
    return buildInferenceHealth({
      gateway: this.gatewayPort,
      ledgerDurable: this.ledgerRepo.isDurable(),
    });
  }

  /** Boot: prime the napi tier so `available()` reflects the real bind state. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.napiTier?.ensureBooted) {
      await this.napiTier.ensureBooted();
    }
    const health = await this.gatewayPort.health();
    this.log.info(
      {
        tier: health.tier,
        available: health.available,
        napiBound: health.napiBound,
        loopbackConfigured: health.loopbackConfigured,
        streamingEnabled: this.cfg.streamingEnabled,
      },
      'inference module started',
    );
  }

  /** Shutdown: the tiers are process-lifetime / GC-owned. No-op. */
  async stop(): Promise<void> {
    // Idempotent, degrade-safe: nothing owned here to drain.
  }
}
