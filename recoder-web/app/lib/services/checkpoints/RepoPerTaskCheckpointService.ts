/**
 * Repo Per Task Checkpoint Service
 *
 * Creates a separate checkpoint repository for each task/conversation.
 * This provides complete isolation between tasks and allows for
 * independent checkpoint histories.
 */

import path from 'path';
import { ShadowCheckpointService } from './ShadowCheckpointService';
import type { CheckpointServiceOptions } from './types';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('RepoCheckpoint');

/**
 * Checkpoint service that creates a separate repository for each task
 *
 * This is useful when you want complete isolation between different
 * AI conversation sessions or tasks. Each task gets its own git repository
 * in a subdirectory of the shadow storage.
 *
 * Directory structure:
 * ```
 * shadowDir/
 *   tasks/
 *     task-1/
 *       checkpoints/
 *         .git/
 *     task-2/
 *       checkpoints/
 *         .git/
 * ```
 */
export class RepoPerTaskCheckpointService extends ShadowCheckpointService {
  /**
   * Create a new RepoPerTaskCheckpointService
   *
   * @param options - Configuration options
   * @returns New service instance
   */
  public static create({
    taskId,
    workspaceDir,
    shadowDir,
    log = console.log,
  }: CheckpointServiceOptions): RepoPerTaskCheckpointService {
    return new RepoPerTaskCheckpointService(
      taskId,
      path.join(shadowDir, 'tasks', taskId, 'checkpoints'),
      workspaceDir,
      log
    );
  }

  /**
   * Get the storage path for a specific task
   *
   * @param shadowDir - Base shadow storage directory
   * @param taskId - Task identifier
   * @returns Path to the task's checkpoint directory
   */
  public static getTaskPath(shadowDir: string, taskId: string): string {
    return path.join(shadowDir, 'tasks', taskId, 'checkpoints');
  }

  /**
   * Check if a task has existing checkpoints
   *
   * @param shadowDir - Base shadow storage directory
   * @param taskId - Task identifier
   * @returns Promise resolving to true if checkpoints exist
   */
  public static async hasCheckpoints(shadowDir: string, taskId: string): Promise<boolean> {
    const fs = await import('fs/promises');
    const checkpointsDir = this.getTaskPath(shadowDir, taskId);
    const gitDir = path.join(checkpointsDir, '.git');

    try {
      await fs.access(gitDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete all checkpoints for a task
   *
   * @param shadowDir - Base shadow storage directory
   * @param taskId - Task identifier
   * @returns Promise resolving when deletion is complete
   */
  public static async deleteTaskCheckpoints(shadowDir: string, taskId: string): Promise<void> {
    const fs = await import('fs/promises');
    const taskDir = path.join(shadowDir, 'tasks', taskId);

    try {
      await fs.rm(taskDir, { recursive: true, force: true });
      logger.info(`[RepoPerTaskCheckpointService] Deleted checkpoints for task: ${taskId}`);
    } catch (error) {
      logger.error(
        `[RepoPerTaskCheckpointService] Failed to delete checkpoints for task ${taskId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * List all tasks with checkpoints
   *
   * @param shadowDir - Base shadow storage directory
   * @returns Promise resolving to array of task IDs
   */
  public static async listTasks(shadowDir: string): Promise<string[]> {
    const fs = await import('fs/promises');
    const tasksDir = path.join(shadowDir, 'tasks');

    try {
      const entries = await fs.readdir(tasksDir, { withFileTypes: true });
      const tasks: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const gitDir = path.join(tasksDir, entry.name, 'checkpoints', '.git');
          try {
            await fs.access(gitDir);
            tasks.push(entry.name);
          } catch {
            // No checkpoints for this task
          }
        }
      }

      return tasks;
    } catch {
      return [];
    }
  }

  /**
   * Get storage usage for a task's checkpoints
   *
   * @param shadowDir - Base shadow storage directory
   * @param taskId - Task identifier
   * @returns Promise resolving to size in bytes
   */
  public static async getTaskStorageSize(shadowDir: string, taskId: string): Promise<number> {
    const fs = await import('fs/promises');
    const taskDir = path.join(shadowDir, 'tasks', taskId);

    const calculateSize = async (dir: string): Promise<number> => {
      let size = 0;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            size += await calculateSize(fullPath);
          } else {
            const stats = await fs.stat(fullPath);
            size += stats.size;
          }
        }
      } catch {
        // Ignore errors
      }

      return size;
    };

    return calculateSize(taskDir);
  }

  /**
   * Clean up old task checkpoints
   *
   * @param shadowDir - Base shadow storage directory
   * @param maxAge - Maximum age in milliseconds (default: 7 days)
   * @returns Promise resolving to number of tasks cleaned up
   */
  public static async cleanupOldTasks(
    shadowDir: string,
    maxAge: number = 7 * 24 * 60 * 60 * 1000
  ): Promise<number> {
    const fs = await import('fs/promises');
    const tasksDir = path.join(shadowDir, 'tasks');
    const now = Date.now();
    let cleaned = 0;

    try {
      const entries = await fs.readdir(tasksDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const taskPath = path.join(tasksDir, entry.name);

          try {
            const stats = await fs.stat(taskPath);
            const age = now - stats.mtimeMs;

            if (age > maxAge) {
              await fs.rm(taskPath, { recursive: true, force: true });
              cleaned++;
              logger.info(
                `[RepoPerTaskCheckpointService] Cleaned up old task: ${entry.name} (age: ${Math.round(age / 86400000)} days)`
              );
            }
          } catch {
            // Ignore errors for individual tasks
          }
        }
      }
    } catch {
      // Tasks directory doesn't exist
    }

    return cleaned;
  }
}
