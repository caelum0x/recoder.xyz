/**
 * Start Task
 * Functions for starting task execution
 */

import type { TaskId, TaskExecutionContext, OnGenerationComplete, OnGenerationError } from './types';
import { getTask } from './get-task';
import { patches } from './object/patch-creators';
import { patchTask } from './patch-task';
import { runTask } from './run-task';

export interface StartTaskInputs {
  taskId: TaskId;
}

export interface StartTaskCallbacks {
  onGenerationComplete?: OnGenerationComplete;
  onGenerationError?: OnGenerationError;
}

/**
 * Start a task that is in the created state
 * Transitions the task to inProgress and begins execution
 */
export async function startTask({
  taskId,
  context,
  onGenerationComplete,
  onGenerationError,
  runInBackground = true,
}: StartTaskInputs & {
  context: TaskExecutionContext;
  onGenerationComplete?: OnGenerationComplete;
  onGenerationError?: OnGenerationError;
  runInBackground?: boolean;
}): Promise<void> {
  const task = await getTask({ context, taskId });

  if (task.status !== 'created') {
    throw new Error(`Task ${taskId} is not in the created state (current: ${task.status})`);
  }

  // Transition to inProgress
  await patchTask({
    context,
    taskId,
    patches: [patches.status.set('inProgress')],
  });

  const executeTask = async () => {
    await runTask({
      context,
      taskId,
      onGenerationComplete,
      onGenerationError,
    });
  };

  if (runInBackground) {
    // Run in background using waitUntil
    context.waitUntil(executeTask);
  } else {
    // Run synchronously
    await executeTask();
  }
}

/**
 * Start a task and wait for it to complete
 * Returns the final task state
 */
export async function startTaskAndWait({
  taskId,
  context,
  onGenerationComplete,
  onGenerationError,
}: StartTaskInputs & {
  context: TaskExecutionContext;
  onGenerationComplete?: OnGenerationComplete;
  onGenerationError?: OnGenerationError;
}): Promise<void> {
  await startTask({
    taskId,
    context,
    onGenerationComplete,
    onGenerationError,
    runInBackground: false,
  });
}
