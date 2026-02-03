/**
 * Get Task
 * Functions for retrieving tasks from storage
 */

import type { Task, TaskId, TaskExecutionContext } from './types';
import { taskPath } from './paths';

/**
 * Retrieve a task by ID from storage
 */
export async function getTask(args: {
  taskId: TaskId;
  context: TaskExecutionContext;
}): Promise<Task> {
  const task = await args.context.storage.getJson<Task>({
    path: taskPath(args.taskId),
  });
  return task;
}

/**
 * Check if a task exists in storage
 */
export async function taskExists(args: {
  taskId: TaskId;
  context: TaskExecutionContext;
}): Promise<boolean> {
  return args.context.storage.exists({
    path: taskPath(args.taskId),
  });
}
