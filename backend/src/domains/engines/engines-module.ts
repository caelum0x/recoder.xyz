/**
 * `EnginesComposer` — the composer that fuses the multi-language engine seam into
 * one module. It:
 *  - slices the injected `AppConfig` into `EnginesConfig` (no env reads here),
 *  - builds the three supervisors (napi loader / daemon / sidecar) over ONE shared
 *    `ProcessRegistry`,
 *  - constructs the DEEP per-engine adapters behind the frozen `EngineClientPort`:
 *    napi (openfang / tensorzero / governance-kernel) over the shared loader
 *    (CONFLICT #8-safe: ONE `.node` load), daemon (colbert / ops-recorder /
 *    multica / ziti) over the shared supervisor, sidecar (mem0 / browser-use /
 *    pal-mcp) over the shared sidecar supervisor, and cli (beads / tmux / dmux /
 *    recodergit),
 *  - builds the interop-gated MCP host (`InteropHostBundle`) seeded with the
 *    canonical catalog + this domain's own engine binders (beads / browser-use /
 *    pal-plan), leaving agent-os + conductor to add theirs at bootstrap,
 *  - exposes the typed engine clients + the host + truthful per-engine health.
 *
 * No `process.env` reads (config is injected; the napi loader owns its own default
 * env accessor). No top-level singletons. Every path is degrade-safe: an absent
 * `.node` / daemon binary / uv venv / CLI leaves that engine `down` with a reason,
 * never a faked `up`; a missing DB no-ops the health registry.
 */
import { Router } from 'express';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { Logger } from '../../shared/logger.js';
import { sliceEnginesConfig, isEngineEnabled, type EnginesConfig } from './config.js';
import { ENGINE_IDS, ENGINE_TRANSPORTS, DEFAULT_LOOPBACK, isRestartable, isEngineId } from './constants.js';
import { down, type EngineDescriptor, type EngineHealth, type EngineId } from './types.js';
import type { EngineClientPort } from './ports/engine-client.port.js';
import type { EngineRegistryPort, EngineHealthRepository, McpHostPort } from './ports/index.js';
import { NapiLoader } from './supervisor/napi-loader.js';
import { ProcessRegistry } from './supervisor/process-registry.js';
import { DaemonSupervisor } from './supervisor/daemon-supervisor.js';
import { SidecarSupervisor } from './supervisor/sidecar-supervisor.js';
import { PgEngineHealthRepository } from './adapters/engine-health.repository.js';
import {
  createNapiEngineClients,
  registerNapiEngineTools,
  type NapiEngineClients,
  type NapiEngineRegistration,
} from './adapters/napi/index.js';
import {
  ColbertLoopbackAdapter,
  OpsRecorderLoopbackAdapter,
  MulticaLoopbackAdapter,
  ZitiRestAdapter,
  type DaemonAdapterConfig,
} from './adapters/daemon/index.js';
import {
  Mem0Adapter,
  BrowserUseAdapter,
  PalMcpAdapter,
  browserUseEngineBinder,
  palPlanEngineBinder,
} from './adapters/sidecar/index.js';
import {
  BeadsAdapter,
  TmuxAdapter,
  DmuxAdapter,
  RecodergitAdapter,
  beadsEngineBinder,
} from './adapters/cli/index.js';
import { InteropHostBundle } from './mcp/mcp-host.js';
import { buildEnginesMcpTools, enginesMcpServer } from './mcp/engines-engine.js';
import { registerModuleToolsOnHost, type ModuleToolsRegistration } from './mcp/host-registrar.js';
import { buildEnginesHealth } from './health.js';
import type { EnginesModule, EnginesModuleDeps } from './index.js';

/** Build the static declared-engine descriptors from the closed engine catalog. */
function buildDescriptors(): readonly EngineDescriptor[] {
  return ENGINE_IDS.map((id) => {
    const transport = ENGINE_TRANSPORTS[id];
    return {
      id,
      transport,
      title: id,
      restartable: isRestartable(transport),
      // napi/cli engines + externally-managed daemons are expected-absent degrades.
      optional: true,
    };
  });
}

/** A tiny in-memory declared-engine catalog (capability discovery surface). */
class InMemoryEngineRegistry implements EngineRegistryPort {
  private readonly descriptors: readonly EngineDescriptor[];
  private readonly byId: ReadonlyMap<EngineId, EngineDescriptor>;

  constructor(descriptors: readonly EngineDescriptor[]) {
    this.descriptors = descriptors;
    this.byId = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
  }

  list(): readonly EngineDescriptor[] {
    return this.descriptors;
  }

  get(id: EngineId): EngineDescriptor | null {
    return this.byId.get(id) ?? null;
  }

  byTransport(transport: EngineDescriptor['transport']): readonly EngineDescriptor[] {
    return this.descriptors.filter((descriptor) => descriptor.transport === transport);
  }
}

export class EnginesComposer implements EnginesModule {
  readonly name = 'engines' as const;

  private readonly log: Logger;
  private readonly cfg: EnginesConfig;
  private readonly executor: QueryExecutor;
  private readonly middleware: AuthMiddleware;
  private readonly registryImpl: EngineRegistryPort;
  private readonly healthRepo: EngineHealthRepository;
  private readonly napiClients: NapiEngineClients;
  private readonly daemonSupervisor: DaemonSupervisor;
  private readonly sidecarSupervisor: SidecarSupervisor;
  private readonly adapters: ReadonlyMap<EngineId, EngineClientPort>;
  private readonly hostBundle: InteropHostBundle;
  private hostReady = false;
  private napiRegistration: NapiEngineRegistration | null = null;
  private started = false;

  constructor(deps: EnginesModuleDeps) {
    this.log = deps.logger;
    this.cfg = sliceEnginesConfig(deps.config, deps.overrides ?? {});
    this.executor = deps.executor;
    this.middleware = deps.middleware;

    this.registryImpl = new InMemoryEngineRegistry(buildDescriptors());
    this.healthRepo = new PgEngineHealthRepository(this.executor, this.log);

    // ONE shared process registry backs both supervisors (no double-spawn).
    const processRegistry = new ProcessRegistry(this.log);
    this.daemonSupervisor = new DaemonSupervisor(processRegistry, this.log);
    this.sidecarSupervisor = new SidecarSupervisor(processRegistry, this.log);

    // The napi group over the ONE shared loader (CONFLICT #8-safe single `.node`).
    const napiLoader = new NapiLoader(this.log, {
      repoRoot: this.cfg.repoRoot,
    });
    this.napiClients = createNapiEngineClients({
      loader: napiLoader,
      logger: this.log,
      kernel: deps.kernel,
    });

    this.adapters = this.buildAdapters();

    // The interop-gated MCP host, seeded with THIS domain's engine binders. The
    // wiring guard logs (does not throw) for servers agent-os/conductor still bind.
    this.hostBundle = new InteropHostBundle({
      ...(this.cfg.palRootDir ? { palRootDir: this.cfg.palRootDir } : {}),
      engineBinders: [beadsEngineBinder(), browserUseEngineBinder(), palPlanEngineBinder()],
      onWiringWarning: (err) =>
        this.log.debug(
          { err: err instanceof Error ? err.message : String(err) },
          'engines MCP host: engine binders pending from agent-os/conductor (expected pre-wiring)',
        ),
    });
    this.hostReady = true;
  }

  /** Construct the DEEP per-engine adapters behind the frozen `EngineClientPort`. */
  private buildAdapters(): ReadonlyMap<EngineId, EngineClientPort> {
    const map = new Map<EngineId, EngineClientPort>();

    // --- napi (in-process `.node`) ---
    map.set('openfang', this.napiClients.openfang());
    map.set('tensorzero', this.napiClients.tensorzero());
    map.set('governance', this.napiClients.governanceKernel());

    // --- daemon (supervised loopback HTTP) ---
    map.set(
      'colbert',
      new ColbertLoopbackAdapter(this.daemonSupervisor, this.daemonCfg('colbert'), this.log),
    );
    map.set(
      'ops-recorder',
      new OpsRecorderLoopbackAdapter(this.daemonSupervisor, this.daemonCfg('ops-recorder'), this.log),
    );
    map.set(
      'multica',
      new MulticaLoopbackAdapter(this.daemonSupervisor, this.daemonCfg('multica'), this.log),
    );
    map.set('ziti', new ZitiRestAdapter(this.daemonCfg('ziti'), this.log));

    // --- sidecar (uv venv; stdio-MCP / loopback HTTP) ---
    map.set(
      'mem0',
      new Mem0Adapter({ supervisor: this.sidecarSupervisor, config: this.cfg, log: this.log }),
    );
    map.set(
      'browser-use',
      new BrowserUseAdapter({ supervisor: this.sidecarSupervisor, config: this.cfg, log: this.log }),
    );
    map.set(
      'pal-mcp',
      new PalMcpAdapter({ supervisor: this.sidecarSupervisor, config: this.cfg, log: this.log }),
    );

    // --- cli (one-shot subprocess) ---
    map.set('beads', new BeadsAdapter({ config: this.cfg, log: this.log }));
    map.set('tmux', new TmuxAdapter({ config: this.cfg, log: this.log }));
    map.set('dmux', new DmuxAdapter({ config: this.cfg, log: this.log }));
    map.set('recodergit', new RecodergitAdapter({ config: this.cfg, log: this.log }));

    return map;
  }

  /** Project the narrowed daemon-adapter config for one daemon engine (no env reads). */
  private daemonCfg(id: 'colbert' | 'ops-recorder' | 'multica' | 'ziti'): DaemonAdapterConfig {
    const listenAddr = DEFAULT_LOOPBACK[id];
    return {
      enabled: isEngineEnabled(this.cfg, id),
      externalUrl: this.cfg.externalUrls[id] ?? null,
      binOverride: this.cfg.daemonBins[id] ?? null,
      ...(listenAddr ? { listenAddr } : {}),
    };
  }

  client(id: EngineId): EngineClientPort | null {
    return this.adapters.get(id) ?? null;
  }

  tensorzero(): EngineClientPort | null {
    return this.client('tensorzero');
  }

  registry(): EngineRegistryPort {
    return this.registryImpl;
  }

  host(): McpHostPort {
    return this.hostBundle;
  }

  /**
   * Bridge: register a capability domain's flat `mcp()` tools into the gated host
   * under `serverId`. Bootstrap calls this once per domain that exposes `mcp()`
   * (agent-os / billing / memory / conductor / observability / …) so those tools
   * become agent-callable behind interop's `authorize → risk → execute → audit`
   * gate. Degrade-safe: an unready host yields a truthful no-op + warn.
   */
  registerModuleTools(
    serverId: string,
    tools: readonly McpToolRegistration[],
  ): ModuleToolsRegistration {
    return registerModuleToolsOnHost(
      this.hostReady ? this.hostBundle : null,
      serverId,
      tools,
      this.log,
    );
  }

  /** Truthful live health for every declared engine (an unbound engine is `down`). */
  async listHealth(): Promise<readonly EngineHealth[]> {
    const readings = await Promise.all(
      ENGINE_IDS.map(async (id): Promise<EngineHealth> => {
        const adapter = this.adapters.get(id);
        if (!adapter) {
          // Declared but not constructed here (e.g. tensorzero-loopback lives in
          // the inference module). Truthful `down`, never a faked `up`.
          return down(id, ENGINE_TRANSPORTS[id], 'no adapter bound in engines composer');
        }
        try {
          return await adapter.health();
        } catch (err) {
          return down(
            id,
            ENGINE_TRANSPORTS[id],
            `health probe error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    );
    // Best-effort durable snapshot; no-ops without a pool.
    void this.recordHealth(readings);
    return readings;
  }

  private async recordHealth(readings: readonly EngineHealth[]): Promise<void> {
    if (!this.healthRepo.isDurable()) return;
    await Promise.all(
      readings.map(async (reading) => {
        try {
          await this.healthRepo.recordHealth(reading);
        } catch {
          /* degrade-safe: durable snapshot is best-effort */
        }
      }),
    );
  }

  /** The read-only `/engines` router: list declared engines + per-engine health. */
  routes(): Router {
    const router = Router();
    router.get('/engines', this.middleware.authenticate, (_req, res) => {
      res.json({ engines: this.registryImpl.list() });
    });
    router.get('/engines/health', this.middleware.authenticate, (_req, res) => {
      void this.listHealth().then((engines) => res.json({ engines }));
    });
    return router;
  }

  mcp(): readonly McpToolRegistration[] {
    return buildEnginesMcpTools({
      listDescriptors: () => this.registryImpl.list(),
      listHealth: () => this.listHealth().then((readings) => readings),
      engineHealth: async (id) => {
        const adapter = this.adapters.get(id);
        if (!adapter) return null;
        return adapter.health();
      },
      restart: async (id, requestedBy, reason) => {
        const descriptor = this.registryImpl.get(id);
        if (!descriptor || !descriptor.restartable) {
          return { outcome: 'skipped', reason: 'not restartable' };
        }
        const adapter = this.adapters.get(id);
        if (!adapter) return { outcome: 'skipped', reason: 'no adapter bound' };
        try {
          await adapter.stop();
          await adapter.start();
          const record = { engineId: id, requestedBy, outcome: 'restarted' as const, ...(reason ? { reason } : {}) };
          void this.healthRepo.recordRestart(record).catch(() => undefined);
          return { outcome: 'restarted' };
        } catch (err) {
          return { outcome: 'failed', reason: err instanceof Error ? err.message : String(err) };
        }
      },
    });
  }

  async health(): Promise<ComponentHealth> {
    const engines = await this.listHealth();
    return buildEnginesHealth({
      engines,
      hostReady: this.hostReady,
      registryDurable: this.healthRepo.isDurable(),
    });
  }

  /** Boot: register the napi engine tools into the host + log posture. Idempotent. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    // Seed the `engines` server + bind the napi engine tools behind the gate.
    this.hostBundle.registerServer(enginesMcpServer);
    this.napiRegistration = registerNapiEngineTools(this.hostBundle, this.napiClients);
    const engines = await this.listHealth();
    this.log.info(
      {
        declared: ENGINE_IDS.length,
        bound: this.adapters.size,
        up: engines.filter((engine) => engine.status === 'up').length,
        napiServers: this.napiRegistration.servers,
        hostReady: this.hostReady,
      },
      'engines module started',
    );
  }

  /** Shutdown: stop supervised daemons/sidecars. Idempotent, degrade-safe. */
  async stop(): Promise<void> {
    await Promise.all(
      [...this.adapters.values()].map(async (adapter) => {
        try {
          await adapter.stop();
        } catch {
          /* idempotent, degrade-safe */
        }
      }),
    );
  }
}

/** Re-export so `isEngineId` is available to callers narrowing raw ids. */
export { isEngineId };
