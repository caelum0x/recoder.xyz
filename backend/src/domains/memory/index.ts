/**
 * Memory & Retrieval domain — public factory + the ONE public interface.
 *
 * `createMemoryModule(deps)` builds the composer that fronts the shared memory
 * fabric: fusion recall (mem0 ∪ beads ∪ candidates ∪ items), the RAG retrieval
 * facade, the candidate → governed-promotion lifecycle, run-completion harvest,
 * and the memory-owned relation graph.
 *
 * Boundary contracts:
 *  - Canonical `memory_items` / `memory_candidates` tables are agent-os-owned;
 *    this domain reaches them via the injected `candidateStore` slice (conflict
 *    #3), and owns ONLY `memory_relations`.
 *  - Durable promotion passes THE governance write seam (`gate.decide`), so the
 *    runtime never writes durable memory on its own authority.
 *  - Every engine is degrade-safe: an absent dependency yields a truthful empty
 *    recall / `not_configured` retrieval / down health — never a fabricated result.
 *
 * Synchronous factory (no async probing): the adapters self-resolve lazily and
 * report truthful health on demand.
 */
import type { Router } from 'express';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { GovernanceGate } from '../governance/ports/gate.port.js';
import type { MemoryConfigOverrides } from './config.js';
import type { MemoryCandidateItemStore } from './ports/memory-repository.port.js';
import type { RecallService } from './recall/recall-fusion.js';
import type { RetrievalPort } from './ports/retrieval.port.js';
import type { MemoryRepository } from './ports/memory-repository.port.js';
import type { CandidateService } from './lifecycle/candidate-service.js';
import type { MemoryLifecycle } from './lifecycle/memory-lifecycle.js';
import type { HarvestService } from './lifecycle/harvest.js';
import type { RelateService } from './lifecycle/relate.js';
import type { FetchLike } from './vector-store.js';
import type { ColbertFetch } from './adapters/colbert-sidecar.client.js';
import type { EmbeddingPort } from './ports/embedding.port.js';
import type { LanceModuleLoader } from './adapters/lance-napi.client.js';

/** Dependencies injected by bootstrap (after persistence + identity + governance). */
export interface MemoryModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor the memory-owned `memory_relations` table binds to. */
  readonly executor: QueryExecutor;
  /** The composed identity auth middleware the memory/retrieval edges guard with. */
  readonly middleware: AuthMiddleware;
  /** THE governance write seam — durable promotion is a governed mutation. */
  readonly gate: GovernanceGate;
  /** The agent-os repository slice that owns `memory_items` + `memory_candidates`. */
  readonly candidateStore: MemoryCandidateItemStore;
  /** Not-yet-in-AppConfig memory values (Qdrant/embedder/colbert/mem0 URLs+keys). */
  readonly overrides?: MemoryConfigOverrides;
  /** Injectable fetch for the embedding + vector adapters (tests). */
  readonly fetchImpl?: FetchLike;
  /** Injectable fetch for the ColBERT sidecar (tests). */
  readonly colbertFetch?: ColbertFetch;
  /**
   * OPTIONAL embeddings fallback — the inference domain's embed seam, shaped as
   * the domain `EmbeddingPort` by bootstrap (NO cross-domain import here). Used
   * when no HTTP embed provider (tensorzero/openai) is configured or one fails.
   */
  readonly embedFallback?: EmbeddingPort;
  /** Test seam for the embedded Lance (napi) vector store module loader. */
  readonly lanceLoader?: LanceModuleLoader;
}

/** The public surface every other domain consumes. */
export interface MemoryModule {
  readonly name: 'memory';
  /** Fusion recall (mem0 ∪ beads ∪ candidates ∪ items → rerank → dedupe → rank). */
  recall(): RecallService;
  /** The RAG ingest/search facade (brain/pal/rag/code-intel consume this). */
  retrieval(): RetrievalPort;
  /** Candidate wisp proposal + read. */
  candidates(): CandidateService;
  /** The GOVERNED candidate → durable-item promotion lifecycle. */
  lifecycle(): MemoryLifecycle;
  /** Run-completion harvest (evidence-backed candidate from a finished run). */
  harvest(): HarvestService;
  /** The memory-owned relation graph (`relate(from, to, kind)`). */
  relations(): RelateService;
  /** The unified memory repository (items/candidates delegated, relations owned). */
  repository(): MemoryRepository;
  /** The `/api/agent-os` router: memory + retrieval edges. */
  routes(): Router;
  /** The gated MCP tools (recall/remember + retrieval search/ingest). */
  mcp(): readonly McpToolRegistration[];
  /** Truthful component health (candidates = the one hard dep). */
  health(): Promise<ComponentHealth>;
  /** Boot hook (idempotent). */
  start(): Promise<void>;
  /** Shutdown hook (idempotent, degrade-safe). */
  stop(): Promise<void>;
}

// Value imports last so the type-only imports above form no runtime cycle.
import { MemoryComposer } from './memory-module.js';
import { sliceMemoryConfig } from './config.js';

/**
 * Build the memory module. Slices config from `AppConfig` + bootstrap overrides
 * and assembles the degrade-safe composer. Never throws for a missing engine —
 * absent dependencies degrade to truthful empty recall / `not_configured`.
 */
export function createMemoryModule(deps: MemoryModuleDeps): MemoryModule {
  const cfg = sliceMemoryConfig(deps.config, deps.overrides ?? {});
  return new MemoryComposer(deps, cfg);
}
