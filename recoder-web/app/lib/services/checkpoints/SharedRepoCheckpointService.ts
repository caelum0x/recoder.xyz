/**
 * Shared Repo Checkpoint Service
 *
 * Uses a single shadow repository per workspace, with branches for each task.
 * This is more storage efficient than per-task repositories while still
 * maintaining task isolation through git branches.
 */

import path from 'path';
import fs from 'fs/promises';
import { ShadowCheckpointService } from './ShadowCheckpointService';
import type { CheckpointServiceOptions, CheckpointResult, SaveCheckpointOptions } from './types';

/**
 * Execute git command helper
 */
async function execGit(
  args: string[],
  options: { cwd: string }
): Promise<{ stdout: string; stderr: string }> {
  const { spawn } = await import('child_process');

  return new Promise((resolve, reject) => {
    const sanitizedEnv: Record<string, string> = {};
    const gitEnvVars = [
      'GIT_DIR',
      'GIT_WORK_TREE',
      'GIT_INDEX_FILE',
      'GIT_OBJECT_DIRECTORY',
      'GIT_ALTERNATE_OBJECT_DIRECTORIES',
      'GIT_CEILING_DIRECTORIES',
    ];

    for (const [key, value] of Object.entries(process.env)) {
      if (!gitEnvVars.includes(key) && value !== undefined) {
        sanitizedEnv[key] = value;
      }
    }

    const proc = spawn('git', args, {
      cwd: options.cwd,
      env: sanitizedEnv as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        reject(new Error(`Git command failed: git ${args.join(' ')}\n${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Checkpoint service that uses a shared repository with branches per task
 *
 * This provides a good balance between storage efficiency and task isolation.
 * All tasks share the same git repository but have separate branches.
 *
 * Directory structure:
 * ```
 * shadowDir/
 *   checkpoints/
 *     <workspace-hash>/
 *       .git/
 *         refs/heads/
 *           main
 *           recoder-task-1
 *           recoder-task-2
 * ```
 */
export class SharedRepoCheckpointService extends ShadowCheckpointService {
  /** Branch name for this task */
  private readonly branchName: string;

  /** Whether the branch has been created */
  private branchCreated: boolean = false;

  constructor(
    taskId: string,
    checkpointsDir: string,
    workspaceDir: string,
    log: (message: string) => void
  ) {
    super(taskId, checkpointsDir, workspaceDir, log);
    this.branchName = `recoder-${taskId}`;
  }

  /**
   * Create a new SharedRepoCheckpointService
   */
  public static create({
    taskId,
    workspaceDir,
    shadowDir,
    log = console.log,
  }: CheckpointServiceOptions): SharedRepoCheckpointService {
    const workspaceHash = ShadowCheckpointService.hashWorkspaceDir(workspaceDir);
    const checkpointsDir = path.join(shadowDir, 'checkpoints', workspaceHash);

    return new SharedRepoCheckpointService(taskId, checkpointsDir, workspaceDir, log);
  }

  /**
   * Initialize the shadow git repository and create/checkout task branch
   */
  public override async initShadowGit(
    onInit?: () => Promise<void>
  ): Promise<{ created: boolean; duration: number }> {
    // First initialize the base repository
    const result = await super.initShadowGit(async () => {
      // After base init, create and checkout task branch
      await this.createOrCheckoutBranch();
      await onInit?.();
    });

    return result;
  }

  /**
   * Create the task branch or checkout if it exists
   */
  private async createOrCheckoutBranch(): Promise<void> {
    try {
      // Check if branch exists
      const { stdout: branches } = await execGit(['branch', '--list', this.branchName], {
        cwd: this.checkpointsDir,
      });

      if (branches.includes(this.branchName)) {
        // Branch exists, checkout
        await execGit(['checkout', this.branchName], { cwd: this.checkpointsDir });
        this.log(`[SharedRepoCheckpointService] Checked out existing branch: ${this.branchName}`);
      } else {
        // Create new branch from current HEAD
        await execGit(['checkout', '-b', this.branchName], { cwd: this.checkpointsDir });
        this.log(`[SharedRepoCheckpointService] Created new branch: ${this.branchName}`);
      }

      this.branchCreated = true;
    } catch (error) {
      this.log(
        `[SharedRepoCheckpointService] Failed to create/checkout branch: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Save checkpoint on the task branch
   */
  public override async saveCheckpoint(
    message: string,
    options?: SaveCheckpointOptions
  ): Promise<CheckpointResult | undefined> {
    // Ensure we're on the correct branch
    if (this.branchCreated) {
      try {
        const { stdout: currentBranch } = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: this.checkpointsDir,
        });

        if (currentBranch.trim() !== this.branchName) {
          await execGit(['checkout', this.branchName], { cwd: this.checkpointsDir });
        }
      } catch {
        // Ignore checkout errors
      }
    }

    return super.saveCheckpoint(message, options);
  }

  /**
   * Get the branch name for this task
   */
  public getBranchName(): string {
    return this.branchName;
  }

  /**
   * List all task branches in the shared repository
   */
  public async listTaskBranches(): Promise<
    Array<{ branch: string; taskId: string; lastCommit: string }>
  > {
    const { stdout } = await execGit(['branch', '--list', 'recoder-*', '--format=%(refname:short)'], {
      cwd: this.checkpointsDir,
    });

    const branches: Array<{ branch: string; taskId: string; lastCommit: string }> = [];

    for (const branch of stdout.split('\n').filter((b) => b.trim())) {
      const taskId = branch.replace('recoder-', '');

      try {
        const { stdout: lastCommit } = await execGit(['log', '-1', '--format=%H', branch], {
          cwd: this.checkpointsDir,
        });

        branches.push({
          branch,
          taskId,
          lastCommit: lastCommit.trim(),
        });
      } catch {
        // Branch may not have commits
        branches.push({
          branch,
          taskId,
          lastCommit: '',
        });
      }
    }

    return branches;
  }

  /**
   * Delete a task's branch
   */
  public static async deleteTaskBranch(
    shadowDir: string,
    workspaceDir: string,
    taskId: string
  ): Promise<boolean> {
    const workspaceHash = ShadowCheckpointService.hashWorkspaceDir(workspaceDir);
    const repoDir = path.join(shadowDir, 'checkpoints', workspaceHash);
    const branchName = `recoder-${taskId}`;

    return ShadowCheckpointService.deleteBranch(repoDir, branchName);
  }

  /**
   * Get storage path for a workspace
   */
  public static getWorkspacePath(shadowDir: string, workspaceDir: string): string {
    const workspaceHash = ShadowCheckpointService.hashWorkspaceDir(workspaceDir);
    return path.join(shadowDir, 'checkpoints', workspaceHash);
  }

  /**
   * Check if workspace has any checkpoints
   */
  public static async hasCheckpoints(shadowDir: string, workspaceDir: string): Promise<boolean> {
    const repoDir = this.getWorkspacePath(shadowDir, workspaceDir);
    const gitDir = path.join(repoDir, '.git');

    try {
      await fs.access(gitDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get total storage size for a workspace's checkpoints
   */
  public static async getStorageSize(shadowDir: string, workspaceDir: string): Promise<number> {
    const repoDir = this.getWorkspacePath(shadowDir, workspaceDir);

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

    return calculateSize(repoDir);
  }

  /**
   * Garbage collect to reclaim space
   */
  public async gc(): Promise<void> {
    try {
      await execGit(['gc', '--aggressive', '--prune=now'], { cwd: this.checkpointsDir });
      this.log('[SharedRepoCheckpointService] Garbage collection completed');
    } catch (error) {
      this.log(
        `[SharedRepoCheckpointService] Garbage collection failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
