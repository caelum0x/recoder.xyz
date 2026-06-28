/**
 * BrainService — flag-gated, fail-safe bridge from docker-backend to
 * @recoder/brain (the shared-memory subsystem).
 *
 * SAFETY CONTRACT (binding — .claude/rules/production.md):
 * - ADDITIVE and FLAG-GATED. Default behavior is a pure no-op.
 * - Gate: RECODER_BRAIN_ENABLED (truthy = on, default OFF). When disabled,
 *   assembleForTask() returns null immediately and NO adapters are constructed.
 * - FAIL-SAFE. Any error from the brain or its adapters is logged and degrades
 *   to null; it never throws into a request path.
 *
 * The Brain is built lazily on first enabled use, so the flag-off path never
 * touches git-nexus / continuum.
 */

import {
  createBeadsTasks,
  createBrain,
  createContext7Docs,
  createContinuumActivity,
  createMem0Memory,
  createRepoIntelAuto,
  runCacheDoctor,
  type Brain,
  type BrainContext,
  type CacheReport,
} from '@recoder/brain';

const BRAIN_FLAG_ENV = 'RECODER_BRAIN_ENABLED';
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

export interface BrainAssembleInput {
  task: string;
  repoRoot: string;
  focusFiles?: string[];
  limit?: number;
}

export interface BrainServiceLogger {
  error: (message: string, error: unknown) => void;
}

/**
 * Truthful projection of the shared Brain's headline value metric — the
 * assemble-once cache accounting (hits/misses/hitRate/tokensSaved) plus the
 * human-readable cache-doctor summary.
 *
 * `enabled` reflects the RECODER_BRAIN_ENABLED gate. `report` carries the live
 * {@link CacheReport} from `Brain.cacheStats()` projected through
 * `runCacheDoctor()`. It is null ONLY when the brain is disabled or its stats
 * could not be read (fail-safe) — never a fabricated zeroed "all good".
 */
export interface BrainCacheStatus {
  /** True when RECODER_BRAIN_ENABLED is truthy. */
  readonly enabled: boolean;
  /**
   * The live cache report, or null when disabled / unreadable. When non-null,
   * `report.available` is false until the brain has been read at least once —
   * that is honest ("nothing reported yet"), distinct from a fake 0-saved green.
   */
  readonly report: CacheReport | null;
}

export interface BrainServiceDeps {
  /** Reads the gate. Defaults to RECODER_BRAIN_ENABLED (truthy = on). */
  isEnabled?: () => boolean;
  /** Builds the Brain lazily. Injected in tests; defaults to the real fusion. */
  brainFactory?: () => Brain;
  /** Sink for fail-safe error logging. Defaults to console.error. */
  logger?: BrainServiceLogger;
}

function readFlagFromEnv(): boolean {
  const raw = process.env[BRAIN_FLAG_ENV]?.trim().toLowerCase();
  return raw !== undefined && TRUTHY.has(raw);
}

function defaultBrainFactory(): Brain {
  // All five real sources are wired. Each adapter is individually degrade-safe:
  // it returns empty when its underlying tool/key is absent (gitnexus, continuum,
  // mem0 key, context7, beads `bd`), so assembly stays fail-safe and the flag-off
  // path remains a pure no-op (this factory is only invoked when enabled).
  return createBrain({
    repo: createRepoIntelAuto(),
    activity: createContinuumActivity(),
    memory: createMem0Memory(),
    docs: createContext7Docs(),
    tasks: createBeadsTasks(),
  });
}

export class BrainService {
  private readonly isEnabledFn: () => boolean;
  private readonly brainFactory: () => Brain;
  private readonly logger: BrainServiceLogger;
  private brain: Brain | null = null;

  constructor(deps: BrainServiceDeps = {}) {
    this.isEnabledFn = deps.isEnabled ?? readFlagFromEnv;
    this.brainFactory = deps.brainFactory ?? defaultBrainFactory;
    this.logger = deps.logger ?? {
      error: (message, error) => console.error(message, error),
    };
  }

  /** True when the gate env var is truthy. Default OFF. */
  isEnabled(): boolean {
    return this.isEnabledFn();
  }

  /**
   * Assemble a shared BrainContext for a task. Returns null when the flag is
   * off (pure no-op, no adapters constructed) or when assembly fails-safe.
   */
  async assembleForTask(input: BrainAssembleInput): Promise<BrainContext | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const brain = this.getBrain();
      return await brain.assemble({
        task: input.task,
        repoRoot: input.repoRoot,
        focusFiles: input.focusFiles,
        limit: input.limit,
      });
    } catch (error: unknown) {
      this.logger.error('[brain-service] assembleForTask failed (degrading to null)', error);
      return null;
    }
  }

  /**
   * Surface the live, shared Brain's cache accounting — the headline
   * "X tokens saved by the shared brain" metric — for the control plane to
   * REPORT. Reads the SAME Brain instance used by assembleForTask() (and thus by
   * the conductor bundle), so the numbers are real, not a throwaway snapshot.
   *
   * Degrade-safe and truthful:
   * - Flag OFF  -> { enabled: false, report: null } (no brain constructed).
   * - Flag ON   -> projects `brain.cacheStats()` through runCacheDoctor(). If the
   *                brain has never been read, `report.available` is false (honest
   *                "nothing reported yet"), NOT a fabricated zeroed success.
   * - On any error reading stats -> { enabled: true, report: null } (logged),
   *                never throws into the request path.
   */
  cacheReport(): BrainCacheStatus {
    if (!this.isEnabled()) {
      return { enabled: false, report: null };
    }

    try {
      const brain = this.getBrain();
      const report = runCacheDoctor(brain.cacheStats());
      return { enabled: true, report };
    } catch (error: unknown) {
      this.logger.error('[brain-service] cacheReport failed (degrading to null)', error);
      return { enabled: true, report: null };
    }
  }

  private getBrain(): Brain {
    if (!this.brain) {
      this.brain = this.brainFactory();
    }
    return this.brain;
  }
}

export function createBrainService(deps?: BrainServiceDeps): BrainService {
  return new BrainService(deps);
}
