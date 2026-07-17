/**
 * Inference domain — public factory + the ONE public interface.
 *
 * `createInferenceModule(deps)` (ASYNC — it primes the delivery ladder) builds
 * the composer that hosts the BYOK LLM gateway: the TensorZero delivery ladder
 * (napi embedded gateway → loopback HTTP → none), the model catalog, the encrypted
 * BYOK key cache + provider-key metadata, the token/cost usage ledger, and the
 * OpenAI-wire-compatible surface with REAL per-token SSE streaming.
 *
 * Degrade-safe throughout: without a gateway endpoint the loopback tier is
 * unconfigured and the ladder falls to the napi embedded gateway or reports a
 * truthful `down`; without a DB the repos no-op and accounting is skipped; without
 * a vault master key the BYOK cache disables rather than storing plaintext.
 */
import type { Router } from 'express';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { LlmGatewayPort } from './llm-gateway-client.js';
import type { EngineClientPort } from '../engines/ports/engine-client.port.js';
import type { InferenceConfigOverrides } from './config.js';
import type { InferenceGatewayPort } from './ports/inference-gateway.port.js';
import type {
  KeyVaultPort,
  ModelCatalogRepository,
  ProviderKeyCache,
  ProviderKeyRepository,
  UsageLedgerRepository,
} from './ports/index.js';
import type { InferenceRoutingService } from './services/inference-routing.service.js';
import type { EntitlementGate } from './ports/entitlement-gate.port.js';
import type {
  ByokKeyResolver,
  ByokSecretsPort,
  InferenceKeyWriteGate,
} from './ports/byok-resolver.port.js';
import type { NapiTierPort, RouterTierPort } from './adapters/tensorzero-transport.adapter.js';
import type { ProviderFetchLike } from './adapters/direct-provider.transport.js';
import type { StreamFetchLike } from './adapters/gateway-stream.js';
import type { GeneratedTzConfig } from './adapters/tz-config-generator.js';

/** Dependencies injected by bootstrap (after persistence + identity are built). */
export interface InferenceModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor the catalog/ledger/provider-key repos bind to. */
  readonly executor: QueryExecutor;
  /** The composed identity auth middleware the routes guard with. */
  readonly middleware: AuthMiddleware;
  /** Not-yet-in-AppConfig inference values (gateway endpoint/key/paths/flags). */
  readonly overrides?: InferenceConfigOverrides;

  // --- Injectable transport tiers (production defaults built when omitted) ---
  /** Full gateway override (tests) — bypasses the default ladder assembly. */
  readonly gateway?: InferenceGatewayPort;
  /** Loopback HTTP tier override (default: over `gateway/tensorzero-client.ts`). */
  readonly loopback?: LlmGatewayPort;
  /** Streaming fetch override (default: the real global `fetch`). */
  readonly streamFetch?: StreamFetchLike;
  /** napi embedded-gateway tier override (default: over `engines/tensorzero-client.ts`). */
  readonly napi?: NapiTierPort;
  /**
   * The engines tensorzero `EngineClientPort` (from `domains/engines`). When
   * injected, the napi tier is built over it (CONFLICT #8-safe: reuses the engines
   * seam's SINGLE shared `.node` load) in preference to the legacy embedded-gateway
   * fallback. Bootstrap injects `enginesModule.client('tensorzero')` here.
   */
  readonly napiEngine?: EngineClientPort;
  /** Envelope-encryption vault for the BYOK key cache (default: unavailable). */
  readonly vault?: KeyVaultPort;

  // --- Rung 3 (direct BYOK multi-provider router) + governed key writes ------
  /**
   * The governance secrets seam (`governance.secrets()`) — the durable
   * envelope-encrypted store BYOK keys resolve from. Absent ⇒ BYOK resolution
   * + key writes are truthfully disabled (rung 3 falls back to platform keys).
   */
  readonly secrets?: ByokSecretsPort;
  /**
   * The governance gate (`governance.gate()`) governing key writes. Absent ⇒
   * `PUT /inference/keys/:provider` fails CLOSED until `setGovernanceGate`.
   */
  readonly gate?: InferenceKeyWriteGate;
  /** Platform fallback API keys by provider id (bootstrap env fold; may be empty). */
  readonly platformProviderKeys?: Readonly<Record<string, string>>;
  /** Rung-3 transport override (tests). */
  readonly router?: RouterTierPort;
  /** Injectable buffered fetch for the rung-3 provider calls (default: global fetch). */
  readonly providerFetch?: ProviderFetchLike;
}

/** The public surface bootstrap + other domains consume. */
export interface InferenceModule {
  readonly name: 'inference';
  /** The delivery-ladder gateway (napi → loopback → none). */
  gateway(): InferenceGatewayPort;
  /** The routing service (gateway + cost accounting + ledger). */
  routing(): InferenceRoutingService;
  /**
   * Inject the OPTIONAL billing entitlement gate consulted as a BYOK-aware
   * pre-dispatch token-quota check before each completion. Set post-construction by
   * bootstrap (`inference.setEntitlementGate(billing.gate())`). Absent ⇒ the ladder
   * degrades OPEN (no token quota); present ⇒ over-quota completions return a
   * truthful non-routed result (BYOK subjects bypass token metering inside the gate).
   */
  setEntitlementGate(gate: EntitlementGate): void;
  /**
   * Inject the governance gate governing BYOK key writes (bootstrap:
   * `inference.setGovernanceGate(governance.gate())`). Until wired, the
   * key-write route fails CLOSED with a truthful 503.
   */
  setGovernanceGate(gate: InferenceKeyWriteGate): void;
  /** The BYOK key resolver (delivery-path key resolution + governed store). */
  byokResolver(): ByokKeyResolver;
  /** The routable model catalog. */
  catalog(): ModelCatalogRepository;
  /** The token/cost usage ledger. */
  usage(): UsageLedgerRepository;
  /** BYOK provider-key metadata. */
  providerKeys(): ProviderKeyRepository;
  /** The encrypted BYOK key cache. */
  keyCache(): ProviderKeyCache;
  /** Generate a TensorZero config from the enabled catalog (pure; no fs/env). */
  generateConfig(): Promise<GeneratedTzConfig>;
  /** The inference control + OpenAI-compatible routers. */
  routes(): Router;
  /** The inference MCP tools (models / health / complete / feedback). */
  mcp(): readonly McpToolRegistration[];
  /** Truthful component health. */
  health(): Promise<ComponentHealth>;
  /** Boot hook (primes the napi tier). Idempotent. */
  start(): Promise<void>;
  /** Shutdown hook. Idempotent, degrade-safe. */
  stop(): Promise<void>;
}

// Value import last so the type-only imports above form no runtime cycle.
import { InferenceComposer } from './inference-module.js';

/**
 * Build the inference module. ASYNC to mirror the governance factory (the napi
 * tier is primed at `start()`, not here). Never throws for a missing endpoint /
 * unbuilt native gateway — the ladder degrades truthfully.
 */
export async function createInferenceModule(deps: InferenceModuleDeps): Promise<InferenceModule> {
  return new InferenceComposer(deps);
}
