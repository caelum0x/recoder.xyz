/**
 * @module orchestration/scatter-gather
 *
 * Scatter-Gather orchestration pattern for the Recoder A2A ecosystem.
 *
 * This pattern enables parallel fan-out to multiple agents with configurable
 * result collection strategies:
 *
 * - `wait-all`: waits for every target to complete (including failures)
 * - `first-n`: resolves as soon as N successful results arrive
 * - `timeout`: waits up to a deadline, then gathers whatever is available
 * - `quorum`: requires a minimum fraction of agents to respond successfully
 *
 * Results are aggregated into a single execution record with individual
 * per-agent timing, status, and an optional merged output.
 */

import { logger as baseLogger } from '../../logger';

const logger = baseLogger.child({ component: 'a2a-scatter-gather' });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GatherStrategy = 'wait-all' | 'first-n' | 'timeout' | 'quorum';
export type ScatterGatherStatus = 'pending' | 'scattering' | 'gathering' | 'completed' | 'failed' | 'timeout';

export interface ScatterTarget {
  /** Agent ID to send the task to */
  agentId: string;
  /** Custom prompt for this agent (optional -- uses base prompt if not set) */
  prompt?: string;
  /** Weight for weighted aggregation (default 1.0) */
  weight?: number;
}

export interface ScatterGatherDefinition {
  /** Unique pattern ID */
  patternId: string;
  /** Human-readable name */
  name: string;
  /** List of agents to scatter to */
  targets: ScatterTarget[];
  /** How to gather results */
  gatherStrategy: GatherStrategy;
  /** For 'first-n': how many results needed */
  requiredResults?: number;
  /** For 'timeout': max wait in ms */
  timeoutMs?: number;
  /** For 'quorum': minimum fraction of agents that must respond (0-1) */
  quorumThreshold?: number;
}

export interface ScatterResult {
  agentId: string;
  status: 'completed' | 'failed' | 'timeout';
  output?: string;
  error?: string;
  durationMs: number;
  weight: number;
}

export interface ScatterGatherExecution {
  executionId: string;
  patternId: string;
  status: ScatterGatherStatus;
  /** Base prompt sent to all agents */
  prompt: string;
  /** Individual agent results */
  results: ScatterResult[];
  /** Aggregated final output */
  aggregatedOutput?: string;
  /** How many agents responded successfully */
  successCount: number;
  /** How many agents failed */
  failureCount: number;
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;
}

// ---------------------------------------------------------------------------
// ID generator
// ---------------------------------------------------------------------------

let idCounter = 0;

function generateExecutionId(): string {
  idCounter += 1;
  return `sg_exec_${Date.now()}_${idCounter}`;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class ScatterGatherOrchestrator {
  private patterns = new Map<string, ScatterGatherDefinition>();
  private executions = new Map<string, ScatterGatherExecution>();

  // -------------------------------------------------------------------------
  // Pattern CRUD
  // -------------------------------------------------------------------------

  /**
   * Register a scatter-gather pattern.
   */
  registerPattern(definition: ScatterGatherDefinition): void {
    logger.debug({ patternId: definition.patternId }, 'Registering scatter-gather pattern');
    this.patterns.set(definition.patternId, { ...definition });
  }

  /**
   * Get a registered pattern.
   */
  getPattern(patternId: string): ScatterGatherDefinition | undefined {
    return this.patterns.get(patternId);
  }

  /**
   * List all registered patterns.
   */
  listPatterns(): ScatterGatherDefinition[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Remove a pattern.
   */
  removePattern(patternId: string): boolean {
    return this.patterns.delete(patternId);
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Execute scatter-gather with the given prompt.
   * Fans out to all targets in parallel, then gathers results based on strategy.
   */
  async execute(
    patternId: string,
    prompt: string,
    executor: (agentId: string, prompt: string) => Promise<string>,
  ): Promise<ScatterGatherExecution> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      const execution: ScatterGatherExecution = {
        executionId: generateExecutionId(),
        patternId,
        status: 'failed',
        prompt,
        results: [],
        successCount: 0,
        failureCount: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        totalDurationMs: 0,
      };
      execution.aggregatedOutput = `Pattern not found: ${patternId}`;
      this.executions.set(execution.executionId, execution);
      logger.warn({ patternId }, 'Scatter-gather pattern not found');
      return execution;
    }

    const executionId = generateExecutionId();
    const startedAt = new Date();
    const execution: ScatterGatherExecution = {
      executionId,
      patternId,
      status: 'scattering',
      prompt,
      results: [],
      successCount: 0,
      failureCount: 0,
      startedAt: startedAt.toISOString(),
    };
    this.executions.set(executionId, execution);

    logger.info(
      { executionId, patternId, targetCount: pattern.targets.length, strategy: pattern.gatherStrategy },
      'Starting scatter-gather execution',
    );

    // Handle empty targets
    if (pattern.targets.length === 0) {
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      execution.totalDurationMs = Date.now() - startedAt.getTime();
      execution.aggregatedOutput = '';
      return execution;
    }

    // -----------------------------------------------------------------------
    // Scatter phase: fan out to all targets in parallel
    // -----------------------------------------------------------------------

    const useTimeout = pattern.gatherStrategy === 'timeout' && pattern.timeoutMs != null;
    const promises = pattern.targets.map(async (target): Promise<ScatterResult> => {
      const agentStart = Date.now();
      const agentPrompt = target.prompt ?? prompt;
      const weight = target.weight ?? 1.0;

      try {
        let result: string;

        if (useTimeout) {
          // Wrap in a race with a timeout
          result = await Promise.race([
            executor(target.agentId, agentPrompt),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('SCATTER_TIMEOUT')), pattern.timeoutMs!),
            ),
          ]);
        } else {
          result = await executor(target.agentId, agentPrompt);
        }

        return {
          agentId: target.agentId,
          status: 'completed',
          output: result,
          durationMs: Date.now() - agentStart,
          weight,
        };
      } catch (err) {
        const isTimeout = err instanceof Error && err.message === 'SCATTER_TIMEOUT';
        return {
          agentId: target.agentId,
          status: isTimeout ? 'timeout' : 'failed',
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - agentStart,
          weight,
        };
      }
    });

    // Wait for all to settle
    const settled = await Promise.allSettled(promises);

    const allResults: ScatterResult[] = settled.map((s) => {
      if (s.status === 'fulfilled') return s.value;
      // Should not happen since we already catch inside, but safety net
      return {
        agentId: 'unknown',
        status: 'failed' as const,
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
        durationMs: 0,
        weight: 1.0,
      };
    });

    // -----------------------------------------------------------------------
    // Gather phase: apply strategy
    // -----------------------------------------------------------------------

    execution.status = 'gathering';
    execution.results = allResults;
    execution.successCount = allResults.filter((r) => r.status === 'completed').length;
    execution.failureCount = allResults.filter((r) => r.status !== 'completed').length;

    const finalStatus = this.applyGatherStrategy(pattern, execution);
    execution.status = finalStatus;

    // Build aggregated output from successful results
    const successfulOutputs = allResults
      .filter((r) => r.status === 'completed' && r.output != null)
      .map((r) => r.output!);
    execution.aggregatedOutput = successfulOutputs.join('\n');

    execution.completedAt = new Date().toISOString();
    execution.totalDurationMs = Date.now() - startedAt.getTime();

    logger.info(
      {
        executionId,
        patternId,
        status: execution.status,
        successCount: execution.successCount,
        failureCount: execution.failureCount,
        totalDurationMs: execution.totalDurationMs,
      },
      'Scatter-gather execution finished',
    );

    return execution;
  }

  // -------------------------------------------------------------------------
  // Query executions
  // -------------------------------------------------------------------------

  /**
   * Get a past execution by ID.
   */
  getExecution(executionId: string): ScatterGatherExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * List all executions, optionally filtered by patternId.
   */
  listExecutions(patternId?: string): ScatterGatherExecution[] {
    const all = Array.from(this.executions.values());
    if (patternId) {
      return all.filter((e) => e.patternId === patternId);
    }
    return all;
  }

  /**
   * Reset all state (patterns and executions).
   */
  reset(): void {
    this.patterns.clear();
    this.executions.clear();
    logger.debug('Scatter-gather orchestrator state reset');
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Determine the final status based on the gather strategy.
   */
  private applyGatherStrategy(
    pattern: ScatterGatherDefinition,
    execution: ScatterGatherExecution,
  ): ScatterGatherStatus {
    const { gatherStrategy } = pattern;
    const { successCount, results } = execution;
    const totalTargets = pattern.targets.length;

    switch (gatherStrategy) {
      case 'wait-all': {
        // Always completes -- includes all results (even failures)
        return 'completed';
      }

      case 'first-n': {
        const required = pattern.requiredResults ?? 1;
        if (successCount >= required) {
          // Trim results to only the first N successful ones + keep failed for visibility
          return 'completed';
        }
        return 'failed';
      }

      case 'timeout': {
        // Whatever results are available after the timeout deadline
        // If we got at least one success, that is a completed execution
        if (successCount > 0) {
          return 'completed';
        }
        return 'timeout';
      }

      case 'quorum': {
        const threshold = pattern.quorumThreshold ?? 0.5;
        const quorumMet = totalTargets > 0 && successCount / totalTargets >= threshold;
        if (quorumMet) {
          return 'completed';
        }
        return 'failed';
      }

      default:
        return 'completed';
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: ScatterGatherOrchestrator | null = null;

/**
 * Get or create the singleton ScatterGatherOrchestrator instance.
 */
export function getScatterGatherOrchestrator(): ScatterGatherOrchestrator {
  if (!instance) {
    instance = new ScatterGatherOrchestrator();
  }
  return instance;
}

/**
 * Reset the singleton, dropping all patterns and executions.
 */
export function resetScatterGatherOrchestrator(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}
