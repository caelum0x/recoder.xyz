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
  createBrain,
  createContinuumActivity,
  createRepoIntelAuto,
  type Brain,
  type BrainContext,
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
  // memory/docs/tasks are intentionally left undefined: the Brain degrades them
  // to empty until those backends are wired. repo + activity are auto-adapters
  // that themselves degrade safely when gitnexus / continuum are absent.
  return createBrain({
    repo: createRepoIntelAuto(),
    activity: createContinuumActivity(),
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
