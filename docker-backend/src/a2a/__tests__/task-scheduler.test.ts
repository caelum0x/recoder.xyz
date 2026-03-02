/**
 * @module task-scheduler.test
 *
 * Comprehensive test suite for the A2A Task Scheduler Service.
 *
 * Covers:
 * - createSchedule: defaults, ID generation, types
 * - getSchedule / listSchedules
 * - updateSchedule
 * - deleteSchedule
 * - pauseSchedule / resumeSchedule
 * - getState: status, nextRunAt, executionCount
 * - Interval tick execution, nextRunAt recalculation
 * - Once schedule: completes after execution
 * - tick() skips paused and future schedules
 * - maxExecutions: completes after N executions
 * - triggerExecution: immediate execution, history recording
 * - getExecutionHistory: ordered results
 * - Event emission
 * - Failed execution recording
 * - Singleton management (get/reset)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  A2ATaskScheduler,
  getA2ATaskScheduler,
  resetA2ATaskScheduler,
  type ScheduleDefinition,
  type ScheduleExecution,
} from '../task-scheduler.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIntervalSchedule(
  overrides: Partial<Omit<ScheduleDefinition, 'enabled'> & { enabled?: boolean }> = {},
) {
  return {
    scheduleId: 'sched_test_1',
    name: 'Test Interval Schedule',
    type: 'interval' as const,
    intervalMs: 5000,
    agentId: 'agent-codex',
    prompt: 'Run tests',
    ...overrides,
  };
}

function makeOnceSchedule(
  overrides: Partial<Omit<ScheduleDefinition, 'enabled'> & { enabled?: boolean }> = {},
) {
  return {
    scheduleId: 'sched_once_1',
    name: 'Test Once Schedule',
    type: 'once' as const,
    executeAt: new Date(Date.now() + 60_000).toISOString(),
    agentId: 'agent-claude',
    prompt: 'Generate report',
    ...overrides,
  };
}

const successExecutor = async (_agentId: string, _prompt: string): Promise<string> => {
  return 'Task completed successfully';
};

const failingExecutor = async (_agentId: string, _prompt: string): Promise<string> => {
  throw new Error('Executor failed');
};

// ===========================================================================
// Tests
// ===========================================================================

describe('A2ATaskScheduler', () => {
  let scheduler: A2ATaskScheduler;

  beforeEach(() => {
    resetA2ATaskScheduler();
    scheduler = new A2ATaskScheduler();
  });

  // -----------------------------------------------------------------------
  // 1. createSchedule returns definition with defaults
  // -----------------------------------------------------------------------

  describe('createSchedule', () => {
    it('returns definition with defaults applied', () => {
      const def = scheduler.createSchedule(makeIntervalSchedule());

      expect(def.scheduleId).toBe('sched_test_1');
      expect(def.name).toBe('Test Interval Schedule');
      expect(def.type).toBe('interval');
      expect(def.intervalMs).toBe(5000);
      expect(def.agentId).toBe('agent-codex');
      expect(def.prompt).toBe('Run tests');
      expect(def.enabled).toBe(true);
      expect(def.priority).toBe('normal');
      // interval default maxExecutions = 0 (unlimited)
      expect(def.maxExecutions).toBe(0);
    });

    it('defaults maxExecutions to 1 for once schedules', () => {
      const def = scheduler.createSchedule(makeOnceSchedule());
      expect(def.maxExecutions).toBe(1);
    });

    it('generates scheduleId when not provided', () => {
      const def = scheduler.createSchedule({
        name: 'Auto ID',
        type: 'interval',
        intervalMs: 1000,
        agentId: 'agent-x',
        prompt: 'test',
        scheduleId: '',
      });
      expect(def.scheduleId).toMatch(/^sched_[a-f0-9]{16}$/);
    });

    it('respects enabled=false', () => {
      const def = scheduler.createSchedule(makeIntervalSchedule({ enabled: false }));
      expect(def.enabled).toBe(false);
      const state = scheduler.getState(def.scheduleId);
      expect(state?.status).toBe('disabled');
    });
  });

  // -----------------------------------------------------------------------
  // 2. getSchedule / listSchedules
  // -----------------------------------------------------------------------

  describe('getSchedule / listSchedules', () => {
    it('getSchedule returns the created schedule', () => {
      scheduler.createSchedule(makeIntervalSchedule());
      const def = scheduler.getSchedule('sched_test_1');
      expect(def).toBeDefined();
      expect(def!.name).toBe('Test Interval Schedule');
    });

    it('getSchedule returns undefined for unknown ID', () => {
      expect(scheduler.getSchedule('nonexistent')).toBeUndefined();
    });

    it('listSchedules returns all schedules', () => {
      scheduler.createSchedule(makeIntervalSchedule());
      scheduler.createSchedule(makeOnceSchedule());
      const list = scheduler.listSchedules();
      expect(list).toHaveLength(2);
    });

    it('listSchedules returns empty array when none exist', () => {
      expect(scheduler.listSchedules()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // 3. updateSchedule
  // -----------------------------------------------------------------------

  describe('updateSchedule', () => {
    it('updates name, prompt, priority', () => {
      scheduler.createSchedule(makeIntervalSchedule());
      const updated = scheduler.updateSchedule('sched_test_1', {
        name: 'Updated Name',
        prompt: 'New prompt',
        priority: 'high',
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.prompt).toBe('New prompt');
      expect(updated!.priority).toBe('high');
    });

    it('returns undefined for unknown schedule', () => {
      expect(scheduler.updateSchedule('nonexistent', { name: 'X' })).toBeUndefined();
    });

    it('updates intervalMs and recalculates nextRunAt', () => {
      scheduler.createSchedule(makeIntervalSchedule());
      const before = scheduler.getState('sched_test_1')!.nextRunAt;

      scheduler.updateSchedule('sched_test_1', { intervalMs: 60_000 });

      const after = scheduler.getState('sched_test_1')!.nextRunAt;
      expect(after).toBeDefined();
      // The new nextRunAt should be further in the future than the original
      expect(new Date(after!).getTime()).toBeGreaterThan(new Date(before!).getTime());
    });
  });

  // -----------------------------------------------------------------------
  // 4. deleteSchedule
  // -----------------------------------------------------------------------

  describe('deleteSchedule', () => {
    it('deletes an existing schedule and returns true', () => {
      scheduler.createSchedule(makeIntervalSchedule());
      expect(scheduler.deleteSchedule('sched_test_1')).toBe(true);
      expect(scheduler.getSchedule('sched_test_1')).toBeUndefined();
    });

    it('returns false for unknown schedule', () => {
      expect(scheduler.deleteSchedule('nonexistent')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 5. pauseSchedule / resumeSchedule
  // -----------------------------------------------------------------------

  describe('pauseSchedule / resumeSchedule', () => {
    it('pauses an active schedule', () => {
      scheduler.createSchedule(makeIntervalSchedule());
      expect(scheduler.pauseSchedule('sched_test_1')).toBe(true);
      expect(scheduler.getState('sched_test_1')!.status).toBe('paused');
    });

    it('pause returns false for non-active schedule', () => {
      scheduler.createSchedule(makeIntervalSchedule());
      scheduler.pauseSchedule('sched_test_1');
      // Already paused
      expect(scheduler.pauseSchedule('sched_test_1')).toBe(false);
    });

    it('pause returns false for unknown schedule', () => {
      expect(scheduler.pauseSchedule('nonexistent')).toBe(false);
    });

    it('resumes a paused schedule', () => {
      scheduler.createSchedule(makeIntervalSchedule());
      scheduler.pauseSchedule('sched_test_1');
      expect(scheduler.resumeSchedule('sched_test_1')).toBe(true);
      expect(scheduler.getState('sched_test_1')!.status).toBe('active');
    });

    it('resume returns false for non-paused schedule', () => {
      scheduler.createSchedule(makeIntervalSchedule());
      // Active, not paused
      expect(scheduler.resumeSchedule('sched_test_1')).toBe(false);
    });

    it('resume recalculates nextRunAt for interval schedules', () => {
      scheduler.createSchedule(makeIntervalSchedule({ intervalMs: 10_000 }));
      scheduler.pauseSchedule('sched_test_1');

      const now = Date.now();
      scheduler.resumeSchedule('sched_test_1');
      const state = scheduler.getState('sched_test_1')!;
      const nextRunMs = new Date(state.nextRunAt!).getTime();
      // nextRunAt should be approximately now + 10s
      expect(nextRunMs).toBeGreaterThanOrEqual(now + 9_000);
      expect(nextRunMs).toBeLessThanOrEqual(now + 12_000);
    });
  });

  // -----------------------------------------------------------------------
  // 6. getState returns current state with nextRunAt
  // -----------------------------------------------------------------------

  describe('getState', () => {
    it('returns current state with nextRunAt for interval schedule', () => {
      scheduler.createSchedule(makeIntervalSchedule());
      const state = scheduler.getState('sched_test_1');

      expect(state).toBeDefined();
      expect(state!.scheduleId).toBe('sched_test_1');
      expect(state!.name).toBe('Test Interval Schedule');
      expect(state!.status).toBe('active');
      expect(state!.type).toBe('interval');
      expect(state!.nextRunAt).toBeDefined();
      expect(state!.executionCount).toBe(0);
      expect(state!.lastExecution).toBeUndefined();
      expect(state!.createdAt).toBeTruthy();
    });

    it('returns undefined for unknown schedule', () => {
      expect(scheduler.getState('nonexistent')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Interval schedule: tick() executes when due
  // -----------------------------------------------------------------------

  describe('tick() - interval execution', () => {
    it('executes a schedule that is due', async () => {
      scheduler.createSchedule(makeIntervalSchedule());

      // Manually set nextRunAt to the past so tick triggers it
      const state = (scheduler as any).schedules.get('sched_test_1');
      state.nextRunAt = new Date(Date.now() - 1000).toISOString();

      const executions = await scheduler.tick(successExecutor);
      expect(executions).toHaveLength(1);
      expect(executions[0].status).toBe('success');
      expect(executions[0].output).toBe('Task completed successfully');
      expect(executions[0].scheduleId).toBe('sched_test_1');
    });

    // -----------------------------------------------------------------------
    // 8. Interval schedule: recalculates nextRunAt after execution
    // -----------------------------------------------------------------------

    it('recalculates nextRunAt after execution', async () => {
      scheduler.createSchedule(makeIntervalSchedule({ intervalMs: 10_000 }));

      const internalState = (scheduler as any).schedules.get('sched_test_1');
      internalState.nextRunAt = new Date(Date.now() - 1000).toISOString();

      await scheduler.tick(successExecutor);

      const stateAfter = scheduler.getState('sched_test_1')!;
      const nextRunMs = new Date(stateAfter.nextRunAt!).getTime();
      // Should be approximately now + 10s
      expect(nextRunMs).toBeGreaterThan(Date.now() + 8_000);
      expect(stateAfter.executionCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Once schedule: completes after execution
  // -----------------------------------------------------------------------

  describe('tick() - once schedule', () => {
    it('completes after single execution', async () => {
      scheduler.createSchedule(makeOnceSchedule());

      // Set nextRunAt to past
      const internalState = (scheduler as any).schedules.get('sched_once_1');
      internalState.nextRunAt = new Date(Date.now() - 1000).toISOString();

      const executions = await scheduler.tick(successExecutor);
      expect(executions).toHaveLength(1);
      expect(executions[0].status).toBe('success');

      const state = scheduler.getState('sched_once_1')!;
      expect(state.status).toBe('completed');
      expect(state.nextRunAt).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 10. tick() skips paused schedules
  // -----------------------------------------------------------------------

  describe('tick() - paused schedules', () => {
    it('skips paused schedules', async () => {
      scheduler.createSchedule(makeIntervalSchedule());

      // Set nextRunAt to past
      const internalState = (scheduler as any).schedules.get('sched_test_1');
      internalState.nextRunAt = new Date(Date.now() - 1000).toISOString();

      scheduler.pauseSchedule('sched_test_1');

      const executions = await scheduler.tick(successExecutor);
      expect(executions).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 11. tick() skips future schedules (not yet due)
  // -----------------------------------------------------------------------

  describe('tick() - future schedules', () => {
    it('skips schedules that are not yet due', async () => {
      scheduler.createSchedule(makeIntervalSchedule());

      // nextRunAt is already in the future by default (now + intervalMs)
      const executions = await scheduler.tick(successExecutor);
      expect(executions).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 12. maxExecutions: completes after N executions
  // -----------------------------------------------------------------------

  describe('maxExecutions', () => {
    it('completes interval schedule after maxExecutions reached', async () => {
      scheduler.createSchedule(makeIntervalSchedule({ maxExecutions: 2 }));

      const internalState = (scheduler as any).schedules.get('sched_test_1');

      // First execution
      internalState.nextRunAt = new Date(Date.now() - 1000).toISOString();
      await scheduler.tick(successExecutor);
      expect(scheduler.getState('sched_test_1')!.status).toBe('active');
      expect(scheduler.getState('sched_test_1')!.executionCount).toBe(1);

      // Second execution
      internalState.nextRunAt = new Date(Date.now() - 1000).toISOString();
      await scheduler.tick(successExecutor);
      expect(scheduler.getState('sched_test_1')!.status).toBe('completed');
      expect(scheduler.getState('sched_test_1')!.executionCount).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // 13. triggerExecution: executes immediately
  // -----------------------------------------------------------------------

  describe('triggerExecution', () => {
    it('executes immediately regardless of nextRunAt', async () => {
      // nextRunAt is in the future
      scheduler.createSchedule(makeIntervalSchedule());

      const execution = await scheduler.triggerExecution('sched_test_1', successExecutor);
      expect(execution).toBeDefined();
      expect(execution!.status).toBe('success');
      expect(execution!.output).toBe('Task completed successfully');
    });

    it('returns undefined for unknown schedule', async () => {
      const result = await scheduler.triggerExecution('nonexistent', successExecutor);
      expect(result).toBeUndefined();
    });

    // -----------------------------------------------------------------------
    // 14. triggerExecution: records in execution history
    // -----------------------------------------------------------------------

    it('records execution in history', async () => {
      scheduler.createSchedule(makeIntervalSchedule());
      await scheduler.triggerExecution('sched_test_1', successExecutor);

      const history = scheduler.getExecutionHistory('sched_test_1');
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('success');
      expect(history[0].scheduleId).toBe('sched_test_1');
    });

    it('does NOT affect nextRunAt', async () => {
      scheduler.createSchedule(makeIntervalSchedule());
      const beforeNextRun = scheduler.getState('sched_test_1')!.nextRunAt;

      await scheduler.triggerExecution('sched_test_1', successExecutor);

      const afterNextRun = scheduler.getState('sched_test_1')!.nextRunAt;
      expect(afterNextRun).toBe(beforeNextRun);
    });
  });

  // -----------------------------------------------------------------------
  // 15. getExecutionHistory returns ordered history
  // -----------------------------------------------------------------------

  describe('getExecutionHistory', () => {
    it('returns most recent execution first', async () => {
      scheduler.createSchedule(makeIntervalSchedule());

      // Execute twice via triggerExecution
      await scheduler.triggerExecution('sched_test_1', successExecutor);
      await scheduler.triggerExecution('sched_test_1', successExecutor);

      const history = scheduler.getExecutionHistory('sched_test_1');
      expect(history).toHaveLength(2);
      // Most recent first
      const t0 = new Date(history[0].executedAt).getTime();
      const t1 = new Date(history[1].executedAt).getTime();
      expect(t0).toBeGreaterThanOrEqual(t1);
    });

    it('respects limit parameter', async () => {
      scheduler.createSchedule(makeIntervalSchedule());
      await scheduler.triggerExecution('sched_test_1', successExecutor);
      await scheduler.triggerExecution('sched_test_1', successExecutor);
      await scheduler.triggerExecution('sched_test_1', successExecutor);

      const history = scheduler.getExecutionHistory('sched_test_1', 2);
      expect(history).toHaveLength(2);
    });

    it('returns empty array for unknown schedule', () => {
      expect(scheduler.getExecutionHistory('nonexistent')).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // 16. Events emitted correctly
  // -----------------------------------------------------------------------

  describe('events', () => {
    it('emits schedule:created on createSchedule', () => {
      const handler = vi.fn();
      scheduler.on('schedule:created', handler);
      scheduler.createSchedule(makeIntervalSchedule());

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: 'sched_test_1' }),
      );
    });

    it('emits schedule:updated on updateSchedule', () => {
      const handler = vi.fn();
      scheduler.on('schedule:updated', handler);
      scheduler.createSchedule(makeIntervalSchedule());
      scheduler.updateSchedule('sched_test_1', { name: 'New Name' });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits schedule:deleted on deleteSchedule', () => {
      const handler = vi.fn();
      scheduler.on('schedule:deleted', handler);
      scheduler.createSchedule(makeIntervalSchedule());
      scheduler.deleteSchedule('sched_test_1');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: 'sched_test_1' }),
      );
    });

    it('emits schedule:paused on pauseSchedule', () => {
      const handler = vi.fn();
      scheduler.on('schedule:paused', handler);
      scheduler.createSchedule(makeIntervalSchedule());
      scheduler.pauseSchedule('sched_test_1');

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits schedule:resumed on resumeSchedule', () => {
      const handler = vi.fn();
      scheduler.on('schedule:resumed', handler);
      scheduler.createSchedule(makeIntervalSchedule());
      scheduler.pauseSchedule('sched_test_1');
      scheduler.resumeSchedule('sched_test_1');

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits schedule:executed on successful tick execution', async () => {
      const handler = vi.fn();
      scheduler.on('schedule:executed', handler);
      scheduler.createSchedule(makeIntervalSchedule());

      const internalState = (scheduler as any).schedules.get('sched_test_1');
      internalState.nextRunAt = new Date(Date.now() - 1000).toISOString();

      await scheduler.tick(successExecutor);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: 'sched_test_1',
          execution: expect.objectContaining({ status: 'success' }),
        }),
      );
    });

    it('emits schedule:completed when once schedule finishes', async () => {
      const handler = vi.fn();
      scheduler.on('schedule:completed', handler);
      scheduler.createSchedule(makeOnceSchedule());

      const internalState = (scheduler as any).schedules.get('sched_once_1');
      internalState.nextRunAt = new Date(Date.now() - 1000).toISOString();

      await scheduler.tick(successExecutor);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: 'sched_once_1' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 17. Failed execution recorded
  // -----------------------------------------------------------------------

  describe('failed execution', () => {
    it('records failed execution from tick', async () => {
      scheduler.createSchedule(makeIntervalSchedule());

      const internalState = (scheduler as any).schedules.get('sched_test_1');
      internalState.nextRunAt = new Date(Date.now() - 1000).toISOString();

      const executions = await scheduler.tick(failingExecutor);
      expect(executions).toHaveLength(1);
      expect(executions[0].status).toBe('failed');
      expect(executions[0].error).toBe('Executor failed');
    });

    it('records failed execution from triggerExecution', async () => {
      scheduler.createSchedule(makeIntervalSchedule());
      const execution = await scheduler.triggerExecution('sched_test_1', failingExecutor);

      expect(execution).toBeDefined();
      expect(execution!.status).toBe('failed');
      expect(execution!.error).toBe('Executor failed');
    });

    it('emits schedule:failed event on failed execution', async () => {
      const handler = vi.fn();
      scheduler.on('schedule:failed', handler);
      scheduler.createSchedule(makeIntervalSchedule());

      const internalState = (scheduler as any).schedules.get('sched_test_1');
      internalState.nextRunAt = new Date(Date.now() - 1000).toISOString();

      await scheduler.tick(failingExecutor);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: 'sched_test_1',
          execution: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });

    it('increments executionCount even on failure', async () => {
      scheduler.createSchedule(makeIntervalSchedule());
      await scheduler.triggerExecution('sched_test_1', failingExecutor);

      const state = scheduler.getState('sched_test_1')!;
      expect(state.executionCount).toBe(1);
      expect(state.lastExecution!.status).toBe('failed');
    });
  });

  // -----------------------------------------------------------------------
  // 18. Singleton management (get/reset)
  // -----------------------------------------------------------------------

  describe('singleton', () => {
    it('getA2ATaskScheduler returns the same instance', () => {
      const a = getA2ATaskScheduler();
      const b = getA2ATaskScheduler();
      expect(a).toBe(b);
    });

    it('resetA2ATaskScheduler creates a fresh instance', () => {
      const a = getA2ATaskScheduler();
      a.createSchedule(makeIntervalSchedule());
      expect(a.listSchedules()).toHaveLength(1);

      resetA2ATaskScheduler();
      const b = getA2ATaskScheduler();
      expect(a).not.toBe(b);
      expect(b.listSchedules()).toHaveLength(0);
    });
  });
});
