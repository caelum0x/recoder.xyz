/**
 * Engine supervisor — SKELETON.
 *
 * The fusion law (ARCHITECTURE §2) reaches non-TS engines through three
 * supervisors: napi loader, daemon supervisor, sidecar supervisor. Phase 6
 * (`domains/engines`) owns the real implementations. This boot-time skeleton
 * exists so the spine has a single, degrade-safe place to declare engine specs
 * and expose their (currently unstarted) health — every engine reports a
 * truthful `down` with a reason until Phase 6 wires the transports.
 *
 * TODO(phase-6): replace the no-op `supervise` with the real
 * napi-loader / daemon-supervisor / sidecar-supervisor from `domains/engines`
 * and have this delegate to `EnginesModule`.
 */
import type { ComponentHealth, EngineStatus, HealthStatus } from '../shared/health-types.js';
import type { Logger } from '../shared/logger.js';

export type EngineKind = 'napi' | 'daemon' | 'sidecar' | 'cli';

/** Declarative description of an engine to be supervised (later). */
export interface EngineSpec {
  readonly name: string;
  readonly kind: EngineKind;
  /** Optional external URL that means "do not spawn, connect here". */
  readonly externalUrl?: string;
  /** Human note about what the engine provides. */
  readonly provides?: string;
}

/** A registered-but-unstarted engine handle. */
export interface SupervisedEngine {
  readonly spec: EngineSpec;
  status(): EngineStatus;
}

export interface EngineSupervisorDeps {
  readonly logger: Logger;
}

export class EngineSupervisor {
  private readonly engines = new Map<string, EngineSpec>();
  private readonly logger: Logger;

  constructor(deps: EngineSupervisorDeps) {
    this.logger = deps.logger;
  }

  /**
   * Register an engine spec. Degrade-safe no-op: nothing is spawned or loaded in
   * Phase 0 — the engine is recorded so its (down) health is truthful.
   */
  supervise(spec: EngineSpec): SupervisedEngine {
    this.engines.set(spec.name, spec);
    this.logger.debug(
      { engine: spec.name, kind: spec.kind },
      'engine registered (supervision deferred to phase 6)',
    );
    return {
      spec,
      status: (): EngineStatus => ({
        name: spec.name,
        status: 'down',
        reason: 'engine supervision not yet implemented (phase 6)',
      }),
    };
  }

  /** Names of all registered engines. */
  names(): readonly string[] {
    return [...this.engines.keys()];
  }

  /**
   * Start all supervised engines. No-op in Phase 0 — returns immediately so boot
   * never blocks on an engine. Phase 6 makes this spawn/load with backoff.
   */
  async start(): Promise<void> {
    if (this.engines.size > 0) {
      this.logger.info({ count: this.engines.size }, 'engine supervisor: start is a no-op until phase 6');
    }
  }

  /** Stop all supervised engines. No-op in Phase 0. */
  async stop(): Promise<void> {
    // Nothing spawned yet; nothing to drain.
  }

  /** Truthful component health: no engines started → down-with-reason each. */
  health(): ComponentHealth {
    const engines: EngineStatus[] = [...this.engines.values()].map((spec) => ({
      name: spec.name,
      status: 'down' as HealthStatus,
      reason: 'engine supervision not yet implemented (phase 6)',
    }));
    if (engines.length === 0) {
      return { name: 'engine-supervisor', status: 'up', degraded: false, detail: { engines: 0 } };
    }
    return {
      name: 'engine-supervisor',
      status: 'degraded',
      degraded: true,
      reason: 'engines registered but supervision deferred to phase 6',
      engines,
    };
  }
}

/** Construct an engine supervisor. */
export function createEngineSupervisor(deps: EngineSupervisorDeps): EngineSupervisor {
  return new EngineSupervisor(deps);
}
