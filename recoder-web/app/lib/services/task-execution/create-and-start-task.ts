/**
 * Create and Start Task
 * Combined function for creating a task and immediately starting execution
 */

import type {
  Task,
  TaskExecutionContext,
  OnGenerationComplete,
  OnGenerationError,
} from './types';
import { createTask, type CreateTaskInputs, type OnTaskCreate } from './create-task';
import { runTask, type RunTaskCallbacks } from './run-task';

interface CreateAndStartTaskCallbacks extends RunTaskCallbacks {
  taskCreate?: OnTaskCreate;
  generationComplete?: OnGenerationComplete;
  generationError?: OnGenerationError;
}

export interface CreateAndStartTaskInputs extends CreateTaskInputs {
  callbacks?: CreateAndStartTaskCallbacks;
}

/**
 * Create a new task and immediately start execution
 * Combines createTask and runTask for convenience
 */
export async function createAndStartTask(
  args: CreateAndStartTaskInputs & {
    context: TaskExecutionContext;
  }
): Promise<{ task: Task }> {
  const { task } = await createTask({
    ...args,
    onCreate: args.callbacks?.taskCreate,
  });

  await args.callbacks?.taskCreate?.({ task });

  await runTask({
    context: args.context,
    taskId: task.id,
    callbacks: args.callbacks,
    onGenerationComplete: args.callbacks?.generationComplete,
    onGenerationError: args.callbacks?.generationError,
  });

  return { task };
}

/**
 * Create a task and start it in the background
 * Returns immediately after task creation
 */
export async function createAndStartTaskAsync(
  args: CreateAndStartTaskInputs & {
    context: TaskExecutionContext;
  }
): Promise<{ task: Task }> {
  const { task } = await createTask({
    ...args,
    onCreate: args.callbacks?.taskCreate,
  });

  await args.callbacks?.taskCreate?.({ task });

  // Start in background
  args.context.waitUntil(async () => {
    await runTask({
      context: args.context,
      taskId: task.id,
      callbacks: args.callbacks,
      onGenerationComplete: args.callbacks?.generationComplete,
      onGenerationError: args.callbacks?.generationError,
    });
  });

  return { task };
}
