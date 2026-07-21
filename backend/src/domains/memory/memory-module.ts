/**
 * `MemoryComposer` — the composer that fuses the Memory & Retrieval domain into
 * one module. It:
 *  - slices `MemoryConfig` from the injected `AppConfig` + bootstrap overrides
 *    (NO `process.env` here — every env read is folded in bootstrap),
 *  - builds the degrade-safe engine adapters (mem0 [+ optional sidecar], the
 *    beads issue-graph facet over the injected engines transport, ColBERT, the
 *    shared vector foundation → retrieval service),
 *  - binds the `MemoryRepository` over the persistence executor (relations) +
 *    the agent-os candidate/item store (conflict #3: agent-os owns those tables),
 *  - composes the recall fusion service, the candidate + governed lifecycle +
 *    harvest + relate services (promotion passes THE governance write seam),
 *  - exposes the `/api/agent-os` memory + retrieval routers and the gated MCP
 *    tool surface,
 *  - reports truthful engine-rollup health (candidates = the one hard dep).
 *
 * Degrade-safe throughout: no Qdrant/embedder → retrieval `not_configured`; no
 * mem0 → recall drops that source; no `bd` → beads source empty; pool down →
 * relation reads `[]`, relation writes throw truthfully. Nothing is faked.
 */
import { Router } from 'express';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { MemoryConfig } from './config.js';
import type { MemoryEngineReadiness } from './types.js';
import type { MemoryModule, MemoryModuleDeps } from './index.js';
import type { RecallService } from './recall/recall-fusion.js';
import type { RetrievalPort } from './ports/retrieval.port.js';
import type { ColbertSearchPort } from './ports/colbert-search.port.js';
import type { MemoryRepository } from './ports/memory-repository.port.js';
import type { CandidateService } from './lifecycle/candidate-service.js';
import type { MemoryLifecycle } from './lifecycle/memory-lifecycle.js';
import type { ForgetService } from './lifecycle/forget.js';
import type { RelateService } from './lifecycle/relate.js';
import type { MemoryWriteAllowlist } from './lifecycle/write-allowlist.js';
import type { IssueGraphService } from './ports/issue-graph.port.js';
import { createMem0Adapter } from './adapters/mem0.adapter.js';
import { createMem0SidecarClient } from './adapters/mem0-sidecar.client.js';
import { createIssueGraphService } from './issue-graph/issue-graph.service.js';
import { createColbertAdapter } from './adapters/colbert.adapter.js';
import { createColbertSearchClient } from './adapters/colbert-search.client.js';
import { createMemoryRepository } from './adapters/candidate-repository.adapter.js';
import { createVectorFoundation } from './retrieval/vector-foundation.js';
import { createRetrievalService } from './retrieval/retrieval-service.js';
import { createRecallService } from './recall/recall-fusion.js';
import { createCandidateService } from './lifecycle/candidate-service.js';
import { createMemoryLifecycle } from './lifecycle/memory-lifecycle.js';
import { MemoryMaintenanceService } from './lifecycle/memory-maintenance.service.js';
import { createForgetService } from './lifecycle/forget.js';
import {
  createHarvestService,
  type HarvestService,
} from './lifecycle/harvest.js';
import { createRelateService } from './lifecycle/relate.js';
import { createMemoryWriteAllowlist } from './lifecycle/write-allowlist.js';
import { buildMemoryRouter } from './routes/memory.routes.js';
import { buildInternalMemoryRouter } from './routes/internal-memory.routes.js';
import { buildRetrievalRouter } from './routes/retrieval.routes.js';
import { buildMemoryMcpTools } from './mcp/memory-engine.js';
import { buildRetrievalMcpTools } from './mcp/retrieval-engine.js';
import { memoryHealth } from './health.js';

export class MemoryComposer implements MemoryModule {
  readonly name = 'memory' as const;

  private readonly log: Logger;
  private readonly cfg: MemoryConfig;
  private readonly middleware: MemoryModuleDeps['middleware'];

  private readonly mem0: ReturnType<typeof createMem0Adapter>;
  private readonly issueGraphSvc: IssueGraphService;
  private readonly colbert: ReturnType<typeof createColbertAdapter>;
  private readonly colbertSearchClient: ReturnType<typeof createColbertSearchClient>;
  private readonly foundation: ReturnType<typeof createVectorFoundation>;
  private readonly repo: MemoryRepository;
  private readonly recallService: RecallService;
  private readonly retrievalService: RetrievalPort;
  private readonly candidateService: CandidateService;
  private readonly lifecycleService: MemoryLifecycle;
  private readonly forgetService: ForgetService;
  private readonly harvestService: HarvestService;
  private readonly relateService: RelateService;
  private readonly writeAllowlist: MemoryWriteAllowlist;
  private readonly maintenance: MemoryMaintenanceService;
  private readonly executorAvailable: () => boolean;
  private started = false;

  constructor(deps: MemoryModuleDeps, cfg: MemoryConfig) {
    this.log = deps.logger;
    this.cfg = cfg;
    this.middleware = deps.middleware;
    this.executorAvailable = () => deps.executor.isAvailable();

    // Engine adapters (each self-degrades). mem0 gets a self-hosted sidecar only
    // when the platform client is unconfigured AND a sidecar URL is present.
    const sidecar = cfg.mem0SidecarUrl
      ? createMem0SidecarClient(cfg.mem0SidecarUrl)
      : null;
    this.mem0 = createMem0Adapter({ sidecar });
    // The beads module facet over the INJECTED engines transport (the one `bd`
    // spawner) — memory never spawns `bd` or resolves the binary itself.
    this.issueGraphSvc = createIssueGraphService({
      engine: deps.beadsEngine,
      logger: this.log,
    });
    this.colbert = createColbertAdapter(cfg, deps.colbertFetch);
    // FIRST-STAGE ColBERT retriever over the SAME daemon (`colbertRerankUrl`):
    // late-interaction index search + per-collection index build. Degrade-safe.
    this.colbertSearchClient = createColbertSearchClient(
      cfg,
      ...(deps.colbertFetch ? ([deps.colbertFetch] as const) : []),
    );
    this.foundation = createVectorFoundation({
      config: cfg,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      ...(deps.colbertFetch ? { colbertFetch: deps.colbertFetch } : {}),
      ...(deps.embedFallback ? { embedFallback: deps.embedFallback } : {}),
      ...(deps.lanceLoader ? { lanceLoader: deps.lanceLoader } : {}),
    });

    // Repository: relations over the executor; items/candidates delegate to the
    // agent-os store (conflict #3 — agent-os owns those tables).
    this.repo = createMemoryRepository({
      query: deps.executor,
      store: deps.candidateStore,
    });

    // Retrieval (RAG) facade over the shared vector foundation, with the ColBERT
    // first-stage retriever UNIONed alongside Qdrant (degrade-safe when absent).
    this.retrievalService = createRetrievalService({
      foundation: this.foundation,
      colbertSearch: this.colbertSearchClient,
    });

    // Recall fusion — the highest-value operation. ColBERT late-interaction search
    // is a parallel recall source (over the mem0 collection), degrade-truthful.
    this.recallService = createRecallService({
      mem0: this.mem0,
      beads: this.issueGraphSvc,
      repository: this.repo,
      reranker: this.colbert,
      colbertSearch: this.colbertSearchClient,
      colbertCollection: cfg.mem0Collection,
      config: cfg,
      logger: this.log,
    });

    // Governance allowlist on memory writes (empty ⇒ allow-all, degrade-safe).
    this.writeAllowlist = createMemoryWriteAllowlist({
      scopes: cfg.writeScopeAllowlist,
    });

    // Lifecycle: candidate proposal → governed promotion → forget → harvest, + relations.
    this.candidateService = createCandidateService({
      repository: this.repo,
      beads: this.issueGraphSvc,
      allowlist: this.writeAllowlist,
      logger: this.log,
    });
    this.lifecycleService = createMemoryLifecycle({
      repository: this.repo,
      gate: deps.gate,
      beads: this.issueGraphSvc,
      // Close the semantic-memory loop: an accepted durable fact is mirrored into
      // mem0's vector store so its consolidation/relations/decay run on real data.
      mem0: this.mem0,
      logger: this.log,
    });
    this.forgetService = createForgetService({
      repository: this.repo,
      gate: deps.gate,
      logger: this.log,
    });
    this.harvestService = createHarvestService({
      candidates: this.candidateService,
      logger: this.log,
    });
    this.relateService = createRelateService({ repository: this.repo });

    // Maintenance loop: beads durability flush (`bd vc commit`) + config-gated
    // beads gc (`bd gc` every `gcEverySweeps` sweeps; 0 = off) + mem0
    // consolidation sweep + config-gated ColBERT per-repo index GC (prune
    // abandoned `repo_*` PLAID indexes every `colbertGcEverySweeps` sweeps; 0 =
    // off). Degrade-safe; the driver self-skips when bd/mem0/colbert are down.
    // `maintenanceIntervalMs === 0` disables it entirely.
    this.maintenance = new MemoryMaintenanceService({
      beads: this.issueGraphSvc,
      mem0: this.mem0,
      colbertSearch: this.colbertSearchClient,
      logger: this.log,
      intervalMs: cfg.maintenanceIntervalMs,
      gcEverySweeps: cfg.gcEverySweeps,
      colbertGcEverySweeps: cfg.colbertGcEverySweeps,
      colbertGcRetentionMs: cfg.colbertGcRetentionMs,
    });
  }

  recall(): RecallService {
    return this.recallService;
  }

  retrieval(): RetrievalPort {
    return this.retrievalService;
  }

  colbertSearch(): ColbertSearchPort {
    return this.colbertSearchClient;
  }

  candidates(): CandidateService {
    return this.candidateService;
  }

  lifecycle(): MemoryLifecycle {
    return this.lifecycleService;
  }

  forget(): ForgetService {
    return this.forgetService;
  }

  harvest(): HarvestService {
    return this.harvestService;
  }

  relations(): RelateService {
    return this.relateService;
  }

  /** The cohesive beads module facet (issue graph + memory verbs + durability). */
  issueGraph(): IssueGraphService {
    return this.issueGraphSvc;
  }

  repository(): MemoryRepository {
    return this.repo;
  }

  /** The `/api/agent-os` router: memory (recall/candidates/relations) + retrieval. */
  routes(): Router {
    const router = Router();
    router.use(
      buildMemoryRouter({
        recall: this.recallService,
        candidates: this.candidateService,
        lifecycle: this.lifecycleService,
        forget: this.forgetService,
        relations: this.relateService,
        middleware: this.middleware,
      })
    );
    router.use(
      buildRetrievalRouter({
        retrieval: this.retrievalService,
        middleware: this.middleware,
      })
    );
    return router;
  }

  /**
   * The `/internal/agent-os/memory/*` router (INTERNAL_SERVICE_KEY-gated). Carries
   * the worker-to-backend harvest ingest edge. Bootstrap mounts this under
   * `/internal/agent-os/memory` alongside the other domains' internal routers.
   */
  internalRoutes(): Router {
    return buildInternalMemoryRouter({
      harvest: this.harvestService,
      middleware: this.middleware,
    });
  }

  mcp(): readonly McpToolRegistration[] {
    return [...buildMemoryMcpTools(this), ...buildRetrievalMcpTools(this)];
  }

  /** Truthful engine-rollup health. `candidates` is the one hard dependency. */
  async health(): Promise<ComponentHealth> {
    const readiness: MemoryEngineReadiness[] = [];

    // mem0 (mirror) — probe truthfully.
    try {
      const h = await this.mem0.health();
      readiness.push(
        h.available
          ? { name: 'mem0', available: true, detail: { mode: h.mode } }
          : {
              name: 'mem0',
              available: false,
              reason: h.reason ?? 'mem0 unavailable',
            }
      );
    } catch (err) {
      readiness.push({
        name: 'mem0',
        available: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // beads (mirror) — a REAL probe through the one engine seam, never a guess.
    try {
      const beadsHealth = await this.issueGraphSvc.health();
      readiness.push(
        beadsHealth.available
          ? {
              name: 'beads',
              available: true,
              ...(beadsHealth.version
                ? { detail: { version: beadsHealth.version } }
                : {}),
            }
          : {
              name: 'beads',
              available: false,
              reason: beadsHealth.reason ?? 'bd binary/DB unavailable',
            }
      );
    } catch (err) {
      readiness.push({
        name: 'beads',
        available: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // colbert (mirror) — configured iff a rerank URL is set.
    readiness.push(
      this.cfg.colbertRerankUrl
        ? {
            name: 'colbert',
            available: true,
            detail: { url: hostOf(this.cfg.colbertRerankUrl) },
          }
        : {
            name: 'colbert',
            available: false,
            reason: 'COLBERT_RERANK_URL not set',
          }
    );

    // vector store (mirror) — truthful async probe: qdrant does a real liveness
    // GET (URL presence alone is not reachability); the embedded lance store
    // actually attempts its napi/SDK load.
    try {
      const storeProbe = await this.foundation.probeStore();
      readiness.push(
        storeProbe.available
          ? {
              name: 'vector',
              available: true,
              detail: { backend: storeProbe.backend },
            }
          : {
              name: 'vector',
              available: false,
              reason:
                storeProbe.reason ??
                `${storeProbe.backend} vector store unavailable`,
              detail: { backend: storeProbe.backend },
            }
      );
    } catch (err) {
      readiness.push({
        name: 'vector',
        available: false,
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // embedding (mirror).
    const embedProvider = this.foundation.embedder.provider ?? 'none';
    readiness.push(
      embedProvider !== 'none'
        ? {
            name: 'embedding',
            available: true,
            detail: { provider: embedProvider },
          }
        : {
            name: 'embedding',
            available: false,
            reason: 'no embedding provider configured',
          }
    );

    // candidates (store-of-record) — the ONE hard dependency (persistence pool).
    const poolUp = this.executorAvailable();
    readiness.push(
      poolUp
        ? { name: 'candidates', available: true }
        : {
            name: 'candidates',
            available: false,
            reason: 'persistence pool unavailable',
          }
    );

    return memoryHealth(readiness);
  }

  /** Boot: log the truthful engine posture + start the maintenance loop. Idempotent. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    // Beads durability flush + mem0 consolidation sweep (self-skips when down).
    this.maintenance.start();
    const beadsHealth = await this.issueGraphSvc.health();
    this.log.info(
      {
        mem0Sidecar: this.cfg.mem0SidecarUrl
          ? hostOf(this.cfg.mem0SidecarUrl)
          : null,
        colbert: Boolean(this.cfg.colbertRerankUrl),
        vector: this.foundation.store.configured,
        vectorBackend: this.foundation.storeBackend,
        retrievalConfigured: this.foundation.configured,
        beads: beadsHealth.available,
        maintenanceIntervalMs: this.cfg.maintenanceIntervalMs,
        gcEverySweeps: this.cfg.gcEverySweeps,
        colbertGcEverySweeps: this.cfg.colbertGcEverySweeps,
      },
      'memory module started'
    );
  }

  /** Shutdown: stop the maintenance loop. Idempotent, degrade-safe. */
  async stop(): Promise<void> {
    this.maintenance.stop();
  }
}

/** Extract a URL host for health detail (never the full URL, never secrets). */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
}
