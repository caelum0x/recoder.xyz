/**
 * Create Task
 * Functions for creating new tasks with sequences and steps
 */

import type {
  Task,
  TaskId,
  WorkspaceId,
  Sequence,
  Step,
  CreatedGeneration,
  GenerationInput,
  TaskStarter,
  TaskExecutionContext,
} from './types';
import {
  TaskIdUtils,
  SequenceIdUtils,
  StepIdUtils,
  GenerationIdUtils,
} from './types';
import { taskPath, workspaceTaskPath, generationPath } from './paths';

export interface CreateTaskInputs {
  workspaceId: WorkspaceId;
  name: string;
  inputs?: GenerationInput[];
  starter?: TaskStarter;
  steps?: {
    name: string;
    operationType?: string;
  }[];
}

export type OnTaskCreate = (event: { task: Task }) => Promise<void> | void;

/**
 * Create a new task with optional sequences and steps
 */
export async function createTask(
  args: CreateTaskInputs & {
    context: TaskExecutionContext;
    onCreate?: OnTaskCreate;
  }
): Promise<{ task: Task; generations: CreatedGeneration[] }> {
  const taskId = TaskIdUtils.generate();
  const generations: CreatedGeneration[] = [];
  const sequences: Sequence[] = [];

  // Create steps and generations if provided
  if (args.steps && args.steps.length > 0) {
    const steps: Step[] = [];

    for (const stepDef of args.steps) {
      const generationId = GenerationIdUtils.generate();

      const generation: CreatedGeneration = {
        id: generationId,
        status: 'created',
        createdAt: Date.now(),
        context: {
          inputs: args.inputs || [],
          operationNode: stepDef.operationType
            ? {
                id: `node_${generationId}`,
                type: 'operation',
                name: stepDef.name,
                content: { type: stepDef.operationType },
                inputs: [],
                outputs: [],
              }
            : undefined,
        },
      };

      generations.push(generation);

      steps.push({
        id: StepIdUtils.generate(),
        name: stepDef.name,
        status: 'created',
        generationId: generation.id,
        duration: 0,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
      });
    }

    if (steps.length > 0) {
      sequences.push({
        id: SequenceIdUtils.generate(),
        status: 'created',
        steps,
        duration: {
          wallClock: 0,
          totalTask: 0,
        },
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
      });
    }
  }

  const task: Task = {
    id: taskId,
    workspaceId: args.workspaceId,
    status: 'created',
    name: args.name,
    starter: args.starter || { type: 'run-button' },
    nodeIdsConnectedToEnd: [],
    steps: {
      queued: generations.length,
      inProgress: 0,
      warning: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    trigger: 'manual',
    duration: {
      wallClock: 0,
      totalTask: 0,
    },
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    annotations: [],
    sequences,
  };

  args.context.logger.debug(`Created task: ${task.id}`);

  // Persist task and generations
  await Promise.all([
    args.context.storage.setJson({
      path: taskPath(task.id),
      data: task,
    }),
    ...generations.map((generation) =>
      args.context.storage.setJson({
        path: generationPath(generation.id),
        data: generation,
      })
    ),
    args.onCreate?.({ task }),
  ]);

  return { task, generations };
}

/**
 * Create a task from an existing task definition
 */
export async function createTaskFromDefinition(
  args: {
    task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> & { id?: TaskId };
    context: TaskExecutionContext;
    onCreate?: OnTaskCreate;
  }
): Promise<Task> {
  const taskId = args.task.id || TaskIdUtils.generate();
  const now = Date.now();

  const task: Task = {
    ...args.task,
    id: taskId,
    createdAt: now,
    updatedAt: now,
  };

  args.context.logger.debug(`Created task from definition: ${task.id}`);

  await args.context.storage.setJson({
    path: taskPath(task.id),
    data: task,
  });

  await args.onCreate?.({ task });

  return task;
}
