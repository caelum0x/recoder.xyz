/**
 * @module task-scheduler.service
 *
 * A2A Task Scheduler Service for cron-like scheduled or interval-based task
 * submissions.
 *
 * Provides:
 * - Interval schedules (repeat every N ms)
 * - One-shot schedules (execute once at a specific time)
 * - Pause / resume / delete lifecycle
 * - Manual trigger (immediate execution)
 * - Execution history tracking
 * - Event emission for all state transitions
 * - tick()-based evaluation (no external cron libraries)
 *
 * Singleton access via `getA2ATaskScheduler()` / `resetA2ATaskScheduler()`.
 */

import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import { createLogger } from '../logger';

const logger = createLogger('a2a-task-scheduler');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduleType = 'interval' | 'once';
export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'disabled';

export interface ScheduleDefinition {
  /** Unique schedule ID */
  scheduleId: string;
  /** Human-readable name */
  name: string;
  /** Schedule type */
  type: ScheduleType;
  /** For 'interval': interval in ms */
  intervalMs?: number;
  /** For 'once': ISO timestamp when to execute */
  executeAt?: string;
  /** Agent ID to execute the task */
  agentId: string;
  /** Task prompt */
  prompt: string;
  /** Priority for queued tasks */
  priority?: 'critical' | 'high' | 'normal' | 'low';
  /** Whether the schedule is enabled */
  enabled: boolean;
  /** Max number of executions (0 = unlimited, default 0 for interval, 1 for once) */
  maxExecutions?: number;
  /** Metadata */
  metadata?: Record<string, string>;
}

export interface ScheduleExecution {
  executionId: string;
  scheduleId: string;
  executedAt: string;
  status: 'success' | 'failed';
  output?: string;
  error?: string;
  durationMs: number;
}

export interface ScheduleState {
  scheduleId: string;
  name: string;
  status: ScheduleStatus;
  type: ScheduleType;
  /** Next scheduled execution time (ISO) */
  nextRunAt?: string;
  /** Number of times executed so far */
  executionCount: number;
  /** Last execution result */
  lastExecution?: ScheduleExecution;
  createdAt: string;
}

export type SchedulerEventName =
  | 'schedule:created'
  | 'schedule:updated'
  | 'schedule:deleted'
  | 'schedule:paused'
  | 'schedule:resumed'
  | 'schedule:executed'
  | 'schedule:completed'
  | 'schedule:failed';

// ---------------------------------------------------------------------------
// Internal state tracked per schedule
// ---------------------------------------------------------------------------

interface InternalScheduleState {
  definition: ScheduleDefinition;
  status: ScheduleStatus;
  nextRunAt?: string;
  executionCount: number;
  lastExecution?: ScheduleExecution;
  createdAt: string;
  executionHistory: ScheduleExecution[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateScheduleId(): string {
  return `sched_${randomBytes(8).toString('hex')}`;
}

function generateExecutionId(): string {
  return `exec_${randomBytes(8).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// A2ATaskScheduler
// ---------------------------------------------------------------------------

export class A2ATaskScheduler extends EventEmitter {
  private readonly schedules = new Map<string, InternalScheduleState>();

  // -----------------------------------------------------------------------
  // Create
  // -----------------------------------------------------------------------

  createSchedule(
    input: Omit<ScheduleDefinition, 'enabled'> & { enabled?: boolean },
  ): ScheduleDefinition {
    const scheduleId = input.scheduleId || generateScheduleId();
    const enabled = input.enabled ?? true;
    const type = input.type;

    // Compute default maxExecutions
    let maxExecutions = input.maxExecutions;
    if (maxExecutions === undefined) {
      maxExecutions = type === 'once' ? 1 : 0;
    }

    const definition: ScheduleDefinition = {
      ...input,
      scheduleId,
      enabled,
      maxExecutions,
      priority: input.priority ?? 'normal',
    };

    // Calculate nextRunAt
    let nextRunAt: string | undefined;
    if (type === 'interval' && definition.intervalMs) {
      nextRunAt = new Date(Date.now() + definition.intervalMs).toISOString();
    } else if (type === 'once' && definition.executeAt) {
      nextRunAt = definition.executeAt;
    }

    const state: InternalScheduleState = {
      definition,
      status: enabled ? 'active' : 'disabled',
      nextRunAt,
      executionCount: 0,
      createdAt: new Date().toISOString(),
      executionHistory: [],
    };

    this.schedules.set(scheduleId, state);

    logger.info({ scheduleId, name: definition.name, type }, 'schedule created');
    this.emit('schedule:created', { scheduleId, definition });

    return definition;
  }

  // -----------------------------------------------------------------------
  // Get / List
  // -----------------------------------------------------------------------

  getSchedule(scheduleId: string): ScheduleDefinition | undefined {
    return this.schedules.get(scheduleId)?.definition;
  }

  listSchedules(): ScheduleDefinition[] {
    return [...this.schedules.values()].map((s) => s.definition);
  }

  // -----------------------------------------------------------------------
  // Update
  // -----------------------------------------------------------------------

  updateSchedule(
    scheduleId: string,
    updates: Partial<
      Pick<
        ScheduleDefinition,
        'name' | 'intervalMs' | 'executeAt' | 'prompt' | 'priority' | 'maxExecutions'
      >
    >,
  ): ScheduleDefinition | undefined {
    const state = this.schedules.get(scheduleId);
    if (!state) return undefined;

    const def = state.definition;

    if (updates.name !== undefined) def.name = updates.name;
    if (updates.intervalMs !== undefined) def.intervalMs = updates.intervalMs;
    if (updates.executeAt !== undefined) def.executeAt = updates.executeAt;
    if (updates.prompt !== undefined) def.prompt = updates.prompt;
    if (updates.priority !== undefined) def.priority = updates.priority;
    if (updates.maxExecutions !== undefined) def.maxExecutions = updates.maxExecutions;

    // Recalculate nextRunAt if interval changed
    if (updates.intervalMs !== undefined && def.type === 'interval') {
      state.nextRunAt = new Date(Date.now() + updates.intervalMs).toISOString();
    }
    if (updates.executeAt !== undefined && def.type === 'once') {
      state.nextRunAt = updates.executeAt;
    }

    // Update name in state for getState() convenience
    logger.info({ scheduleId, updates }, 'schedule updated');
    this.emit('schedule:updated', { scheduleId, definition: def });

    return def;
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  deleteSchedule(scheduleId: string): boolean {
    const existed = this.schedules.delete(scheduleId);
    if (existed) {
      logger.info({ scheduleId }, 'schedule deleted');
      this.emit('schedule:deleted', { scheduleId });
    }
    return existed;
  }

  // -----------------------------------------------------------------------
  // Pause / Resume
  // -----------------------------------------------------------------------

  pauseSchedule(scheduleId: string): boolean {
    const state = this.schedules.get(scheduleId);
    if (!state || state.status !== 'active') return false;

    state.status = 'paused';
    state.definition.enabled = false;

    logger.info({ scheduleId }, 'schedule paused');
    this.emit('schedule:paused', { scheduleId });
    return true;
  }

  resumeSchedule(scheduleId: string): boolean {
    const state = this.schedules.get(scheduleId);
    if (!state || state.status !== 'paused') return false;

    state.status = 'active';
    state.definition.enabled = true;

    // Recalculate nextRunAt for interval schedules
    if (state.definition.type === 'interval' && state.definition.intervalMs) {
      state.nextRunAt = new Date(Date.now() + state.definition.intervalMs).toISOString();
    }

    logger.info({ scheduleId }, 'schedule resumed');
    this.emit('schedule:resumed', { scheduleId });
    return true;
  }

  // -----------------------------------------------------------------------
  // State query
  // -----------------------------------------------------------------------

  getState(scheduleId: string): ScheduleState | undefined {
    const state = this.schedules.get(scheduleId);
    if (!state) return undefined;

    return {
      scheduleId: state.definition.scheduleId,
      name: state.definition.name,
      status: state.status,
      type: state.definition.type,
      nextRunAt: state.nextRunAt,
      executionCount: state.executionCount,
      lastExecution: state.lastExecution,
      createdAt: state.createdAt,
    };
  }

  // -----------------------------------------------------------------------
  // Execution history
  // -----------------------------------------------------------------------

  getExecutionHistory(scheduleId: string, limit?: number): ScheduleExecution[] {
    const state = this.schedules.get(scheduleId);
    if (!state) return [];

    // Return most recent first
    const history = [...state.executionHistory].reverse();
    if (limit !== undefined && limit > 0) {
      return history.slice(0, limit);
    }
    return history;
  }

  // -----------------------------------------------------------------------
  // Manual trigger
  // -----------------------------------------------------------------------

  async triggerExecution(
    scheduleId: string,
    executor: (agentId: string, prompt: string) => Promise<string>,
  ): Promise<ScheduleExecution | undefined> {
    const state = this.schedules.get(scheduleId);
    if (!state) return undefined;

    const execution = await this.executeSchedule(state, executor);
    // triggerExecution does NOT affect nextRunAt
    return execution;
  }

  // -----------------------------------------------------------------------
  // Tick -- check all schedules and execute those that are due
  // -----------------------------------------------------------------------

  async tick(
    executor: (agentId: string, prompt: string) => Promise<string>,
  ): Promise<ScheduleExecution[]> {
    const now = Date.now();
    const executions: ScheduleExecution[] = [];

    for (const state of this.schedules.values()) {
      // Skip non-active schedules
      if (state.status !== 'active') continue;

      // Skip schedules with no nextRunAt
      if (!state.nextRunAt) continue;

      // Check if schedule is due
      const nextRunMs = new Date(state.nextRunAt).getTime();
      if (now < nextRunMs) continue;

      // Execute
      const execution = await this.executeSchedule(state, executor);

      // Update nextRunAt for interval schedules
      if (state.definition.type === 'interval' && state.definition.intervalMs) {
        // Check if maxExecutions reached
        const max = state.definition.maxExecutions ?? 0;
        if (max > 0 && state.executionCount >= max) {
          state.status = 'completed';
          state.nextRunAt = undefined;
          logger.info({ scheduleId: state.definition.scheduleId }, 'schedule completed (max executions reached)');
          this.emit('schedule:completed', { scheduleId: state.definition.scheduleId });
        } else {
          state.nextRunAt = new Date(Date.now() + state.definition.intervalMs).toISOString();
        }
      } else if (state.definition.type === 'once') {
        state.status = 'completed';
        state.nextRunAt = undefined;
        logger.info({ scheduleId: state.definition.scheduleId }, 'once schedule completed');
        this.emit('schedule:completed', { scheduleId: state.definition.scheduleId });
      }

      executions.push(execution);
    }

    return executions;
  }

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  reset(): void {
    this.schedules.clear();
    this.removeAllListeners();
    logger.info('task scheduler reset');
  }

  // -----------------------------------------------------------------------
  // Internal execution
  // -----------------------------------------------------------------------

  private async executeSchedule(
    state: InternalScheduleState,
    executor: (agentId: string, prompt: string) => Promise<string>,
  ): Promise<ScheduleExecution> {
    const executionId = generateExecutionId();
    const startMs = Date.now();

    let execution: ScheduleExecution;

    try {
      const output = await executor(state.definition.agentId, state.definition.prompt);
      const durationMs = Date.now() - startMs;

      execution = {
        executionId,
        scheduleId: state.definition.scheduleId,
        executedAt: new Date(startMs).toISOString(),
        status: 'success',
        output,
        durationMs,
      };

      logger.info(
        { scheduleId: state.definition.scheduleId, executionId, durationMs },
        'schedule executed successfully',
      );
      this.emit('schedule:executed', { scheduleId: state.definition.scheduleId, execution });
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorMessage = err instanceof Error ? err.message : String(err);

      execution = {
        executionId,
        scheduleId: state.definition.scheduleId,
        executedAt: new Date(startMs).toISOString(),
        status: 'failed',
        error: errorMessage,
        durationMs,
      };

      logger.warn(
        { scheduleId: state.definition.scheduleId, executionId, error: errorMessage, durationMs },
        'schedule execution failed',
      );
      this.emit('schedule:failed', { scheduleId: state.definition.scheduleId, execution });
    }

    // Record execution
    state.executionCount++;
    state.lastExecution = execution;
    state.executionHistory.push(execution);

    return execution;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: A2ATaskScheduler | null = null;

export function getA2ATaskScheduler(): A2ATaskScheduler {
  if (!_instance) {
    _instance = new A2ATaskScheduler();
  }
  return _instance;
}

export function resetA2ATaskScheduler(): void {
  if (_instance) {
    _instance.reset();
  }
  _instance = null;
}
