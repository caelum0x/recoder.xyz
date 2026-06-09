import type { RunEvent, TaskRun, TaskRunState } from '../domain';
import {
  isAllowedTaskRunTransition,
  transitionTaskRun,
} from '../domain';

export type RunEventApplicationResult = {
  run: TaskRun;
  applied: boolean;
  previousState: TaskRunState;
  targetState?: TaskRunState;
  reason: 'applied' | 'no_state_change' | 'illegal_transition';
};

const TASK_RUN_STATES: readonly TaskRunState[] = [
  'created',
  'compiled',
  'routed',
  'claimed',
  'running',
  'needs_input',
  'verifying',
  'waiting_for_approval',
  'approved',
  'delivered',
  'completed',
  'failed',
  'cancelled',
  'rejected',
];

export class RunService {
  appendEvent(run: TaskRun, event: RunEvent): TaskRun {
    return {
      ...run,
      updatedAt: event.createdAt,
      metadata: {
        ...(run.metadata ?? {}),
        lastEventId: event.eventId,
        lastEventType: event.type,
      },
    };
  }

  applyEvent(run: TaskRun, event: RunEvent): RunEventApplicationResult {
    const targetState = targetStateForEvent(event);
    const runWithLastEvent = this.appendEvent(run, event);

    if (!targetState || targetState === run.state) {
      return {
        run: runWithLastEvent,
        applied: false,
        previousState: run.state,
        targetState,
        reason: 'no_state_change',
      };
    }

    if (!isAllowedTaskRunTransition(run.state, targetState)) {
      return {
        run: runWithLastEvent,
        applied: false,
        previousState: run.state,
        targetState,
        reason: 'illegal_transition',
      };
    }

    return {
      run: transitionTaskRun(run, targetState, {
        now: event.createdAt,
        metadata: {
          lastEventId: event.eventId,
          lastEventType: event.type,
          lastEventAppliedAt: event.createdAt,
        },
      }),
      applied: true,
      previousState: run.state,
      targetState,
      reason: 'applied',
    };
  }
}

function targetStateForEvent(event: RunEvent): TaskRunState | undefined {
  if (event.type === 'started') {
    return taskRunState(event.state) ?? 'running';
  }

  if (event.type === 'needs_input') {
    return taskRunState(event.state) ?? 'needs_input';
  }

  if (event.type === 'approval_requested') {
    return taskRunState(event.state) ?? 'waiting_for_approval';
  }

  if (event.type === 'verified') {
    return taskRunState(event.state) ?? 'verifying';
  }

  if (event.type === 'completed') {
    return taskRunState(event.state) ?? 'completed';
  }

  if (event.type === 'failed') {
    return taskRunState(event.state) ?? 'failed';
  }

  if (event.type === 'state_transition') {
    return taskRunState(event.state);
  }

  return undefined;
}

function taskRunState(value: unknown): TaskRunState | undefined {
  return TASK_RUN_STATES.includes(value as TaskRunState) ? value as TaskRunState : undefined;
}
