import type { TaskRun, TaskRunState, TaskSpec } from '../domain';
import { transitionTaskRun } from '../domain';

export type CreateTaskRunInput = {
  runId: string;
  task: TaskSpec;
  assigneeAgentId?: string;
  instructionBundleId?: string;
  now?: string;
};

export class TaskService {
  createRun(input: CreateTaskRunInput): TaskRun {
    const now = input.now ?? new Date().toISOString();
    return {
      runId: input.runId,
      taskId: input.task.taskId,
      spaceId: input.task.spaceId,
      state: 'created',
      assigneeAgentId: input.assigneeAgentId,
      instructionBundleId: input.instructionBundleId,
      updatedAt: now,
    };
  }

  transition(run: TaskRun, to: TaskRunState, metadata?: Record<string, unknown>): TaskRun {
    return transitionTaskRun(run, to, { metadata });
  }
}
