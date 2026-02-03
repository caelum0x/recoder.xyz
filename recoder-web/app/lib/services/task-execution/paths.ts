/**
 * Task Storage Paths
 * Utility functions for generating storage paths for tasks
 */

import type { TaskId, WorkspaceId } from './types';

/**
 * Get the storage path for a task
 */
export function taskPath(taskId: TaskId): string {
  return `tasks/${taskId}.json`;
}

/**
 * Get the storage path for a workspace's task index
 */
export function workspaceTaskPath(workspaceId: WorkspaceId): string {
  return `workspaces/${workspaceId}/tasks/index.json`;
}

/**
 * Get the storage path for a generation
 */
export function generationPath(generationId: string): string {
  return `generations/${generationId}.json`;
}
