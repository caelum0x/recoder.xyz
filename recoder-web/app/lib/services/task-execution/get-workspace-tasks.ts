/**
 * Get Workspace Tasks
 * Functions for retrieving tasks associated with a workspace
 */

import type { Task, TaskId, WorkspaceId, TaskIndexObject, TaskExecutionContext } from './types';
import { taskPath, workspaceTaskPath } from './paths';

/**
 * Get the task index for a workspace
 */
async function getWorkspaceTaskIndex(args: {
  context: TaskExecutionContext;
  workspaceId: WorkspaceId;
}): Promise<TaskIndexObject[]> {
  try {
    const index = await args.context.storage.getJson<TaskIndexObject[]>({
      path: workspaceTaskPath(args.workspaceId),
    });
    return index || [];
  } catch {
    // Index doesn't exist yet
    return [];
  }
}

/**
 * Get all tasks for a workspace
 */
export async function getWorkspaceTasks(args: {
  context: TaskExecutionContext;
  workspaceId: WorkspaceId;
}): Promise<Task[]> {
  const workspaceTaskIndices = await getWorkspaceTaskIndex(args);

  const workspaceTasks = (
    await Promise.all(
      workspaceTaskIndices.map(async (workspaceTaskIndex) => {
        try {
          return await args.context.storage.getJson<Task>({
            path: taskPath(workspaceTaskIndex.id),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          args.context.logger.warn(
            `Failed to load workspace task ${workspaceTaskIndex.id}: ${errorMessage}`
          );
          return null;
        }
      })
    )
  ).filter((task): task is Task => task !== null);

  return workspaceTasks;
}

/**
 * Get in-progress tasks for a workspace
 */
export async function getWorkspaceInprogressTask(args: {
  context: TaskExecutionContext;
  workspaceId: WorkspaceId;
}): Promise<Task | undefined> {
  args.context.logger.debug('getWorkspaceInprogressTask');

  const workspaceTasks = await getWorkspaceTasks(args);

  args.context.logger.debug(`Found ${workspaceTasks.length} workspace tasks`);

  const inprogressTasks = workspaceTasks
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((task) => task.status === 'inProgress');

  args.context.logger.debug(`Found ${inprogressTasks.length} in-progress tasks`);

  if (inprogressTasks.length === 0) {
    args.context.logger.debug('No in-progress tasks found');
    return undefined;
  }

  if (inprogressTasks.length > 1) {
    args.context.logger.warn(
      `Workspace ${args.workspaceId} has ${inprogressTasks.length} in-progress tasks`
    );
  }

  args.context.logger.debug(`Returning in-progress task ${inprogressTasks[0].id}`);
  return inprogressTasks[0];
}

/**
 * Add a task to the workspace index
 */
export async function addTaskToWorkspaceIndex(args: {
  context: TaskExecutionContext;
  workspaceId: WorkspaceId;
  task: Task;
}): Promise<void> {
  const existingIndex = await getWorkspaceTaskIndex({
    context: args.context,
    workspaceId: args.workspaceId,
  });

  // Check if task already exists in index
  const existingTaskIndex = existingIndex.findIndex((item) => item.id === args.task.id);

  const indexItem: TaskIndexObject = {
    id: args.task.id,
    status: args.task.status,
    name: args.task.name,
    createdAt: args.task.createdAt,
    updatedAt: args.task.updatedAt,
  };

  let newIndex: TaskIndexObject[];
  if (existingTaskIndex >= 0) {
    // Update existing entry
    newIndex = [...existingIndex];
    newIndex[existingTaskIndex] = indexItem;
  } else {
    // Add new entry
    newIndex = [...existingIndex, indexItem];
  }

  await args.context.storage.setJson({
    path: workspaceTaskPath(args.workspaceId),
    data: newIndex,
  });
}

/**
 * Remove a task from the workspace index
 */
export async function removeTaskFromWorkspaceIndex(args: {
  context: TaskExecutionContext;
  workspaceId: WorkspaceId;
  taskId: TaskId;
}): Promise<void> {
  const existingIndex = await getWorkspaceTaskIndex({
    context: args.context,
    workspaceId: args.workspaceId,
  });

  const newIndex = existingIndex.filter((item) => item.id !== args.taskId);

  await args.context.storage.setJson({
    path: workspaceTaskPath(args.workspaceId),
    data: newIndex,
  });
}
