/**
 * Task Patching
 * Functions for applying patches to stored tasks
 */

import type { Task, TaskId, TaskExecutionContext } from './types';
import { type Patch, patchTask as patchTaskObject } from './object/patch-object';
import { taskPath } from './paths';

export type { Patch };

/**
 * Apply patches to a task and persist the changes
 */
export async function patchTask(args: {
  context: TaskExecutionContext;
  taskId: TaskId;
  patches: Patch[];
}): Promise<Task> {
  // Get the current task
  const currentTask = await args.context.storage.getJson<Task>({
    path: taskPath(args.taskId),
  });

  // Always update the updatedAt field
  const allPatches: Patch[] = [...args.patches, { path: 'updatedAt', set: Date.now() }];

  // Apply the patches
  const updatedTask = patchTaskObject(currentTask, ...allPatches);

  await args.context.storage.setJson({
    path: taskPath(args.taskId),
    data: updatedTask,
  });

  return updatedTask;
}
