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
import type { LlmGatewayPort } from '../../gateway/tensorzero-client.js';
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
import { generateTzConfig, type GeneratedTzConfig } from './adapters/tz-config-generator.js';
import type { StreamFetchLike } from './adapters/gateway-stream.js';
import { InferenceRoutingService } from './services/inference-routing.service.js';
import { buildInferenceRouter } from './routes/inference.routes.js';
import { createOpenAiCompatRouter } from './routes/openai-compat.routes.js';
import { buildInferenceMcpTools } from './mcp/inference-engine.js';
import { buildInferenceHealth } from './health.js';
import type { InferenceModule, InferenceModuleDeps } from './index.js';

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
  private readonly routingService: InferenceRoutingService;
  private started = false;

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
      this.gatewayPort = new TensorzeroTransportAdapter({
        logger: this.log,
        config: this.cfg,
        loopback,
        ...(streamFetch ? { streamFetch } : {}),
        napi,
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
  }

  gateway(): InferenceGatewayPort {
    return this.gatewayPort;
  }

  routing(): InferenceRoutingService {
    return this.routingService;
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
        mw: this.middleware,
      }),
    );
    // OpenAI base-url compatibility: `/inference/v1/...` and `/gateway/v1/...`.
    const openai = createOpenAiCompatRouter({
      routing: this.routingService,
      authenticateRequest: this.middleware.authenticate,
    });
    router.use('/inference', openai);
    router.use('/gateway', openai);
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
