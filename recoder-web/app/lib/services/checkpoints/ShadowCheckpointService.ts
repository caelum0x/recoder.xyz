/**
 * Shadow Checkpoint Service
 *
 * Provides non-intrusive snapshot capabilities using a shadow git repository.
 * This allows tracking project state changes without affecting the user's
 * actual git repository.
 *
 * Features:
 * - Shadow copies of project state using git
 * - Non-intrusive snapshots that don't affect the main repo
 * - Revert capabilities to any checkpoint
 * - Per-task snapshots for AI conversation tracking
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';

import type {
  CheckpointDiff,
  CheckpointResult,
  CheckpointEventMap,
  CheckpointServiceOptions,
  SaveCheckpointOptions,
  GetDiffOptions,
  DiffSummary,
  FileChange,
} from './types';
import { getExcludePatterns } from './excludes';

/**
 * Check if a file exists at the given path
 */
async function fileExistsAtPath(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Simple git command executor using child_process
 */
async function execGit(
  args: string[],
  options: { cwd: string; env?: Record<string, string> }
): Promise<{ stdout: string; stderr: string }> {
  const { spawn } = await import('child_process');

  return new Promise((resolve, reject) => {
    // Create sanitized environment without git-specific vars
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

    // Merge with any custom env
    const env = { ...sanitizedEnv, ...options.env };

    const proc = spawn('git', args, {
      cwd: options.cwd,
      env: env as NodeJS.ProcessEnv,
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

    proc.on('error', (err: Error) => {
      reject(err);
    });
  });
}

/**
 * Protected paths that should not have checkpoints enabled
 */
function getProtectedPaths(): string[] {
  const homedir = process.env.HOME || process.env.USERPROFILE || '';
  return [
    homedir,
    path.join(homedir, 'Desktop'),
    path.join(homedir, 'Documents'),
    path.join(homedir, 'Downloads'),
  ];
}

/**
 * Abstract base class for shadow checkpoint services
 *
 * This service creates a separate git repository (shadow repo) that tracks
 * changes to a workspace directory without interfering with any existing
 * git repository in that directory.
 */
export abstract class ShadowCheckpointService extends EventEmitter {
  /** Unique task identifier */
  public readonly taskId: string;

  /** Directory where the shadow git repository is stored */
  public readonly checkpointsDir: string;

  /** Directory of the workspace being tracked */
  public readonly workspaceDir: string;

  /** List of checkpoint commit hashes */
  protected _checkpoints: string[] = [];

  /** Base commit hash (initial state) */
  protected _baseHash?: string;

  /** Path to the .git directory in the shadow repo */
  protected readonly dotGitDir: string;

  /** Whether the service has been initialized */
  protected _isInitialized: boolean = false;

  /** Logging function */
  protected readonly log: (message: string) => void;

  /** Cached worktree config value */
  protected shadowGitConfigWorktree?: string;

  /**
   * Get the base commit hash
   */
  public get baseHash(): string | undefined {
    return this._baseHash;
  }

  /**
   * Set the base commit hash (protected)
   */
  protected set baseHash(value: string | undefined) {
    this._baseHash = value;
  }

  /**
   * Check if the service has been initialized
   */
  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Get a copy of all checkpoint hashes
   */
  public getCheckpoints(): string[] {
    return this._checkpoints.slice();
  }

  /**
   * Create a new ShadowCheckpointService
   *
   * @param taskId - Unique task identifier
   * @param checkpointsDir - Directory for shadow git repository
   * @param workspaceDir - Directory to track
   * @param log - Logging function
   */
  constructor(
    taskId: string,
    checkpointsDir: string,
    workspaceDir: string,
    log: (message: string) => void
  ) {
    super();

    // Validate workspace is not a protected path
    const protectedPaths = getProtectedPaths();
    if (protectedPaths.includes(workspaceDir)) {
      throw new Error(
        `Cannot use checkpoints in protected directory: ${workspaceDir}. ` +
          'Please use a project-specific directory.'
      );
    }

    this.taskId = taskId;
    this.checkpointsDir = checkpointsDir;
    this.workspaceDir = workspaceDir;
    this.dotGitDir = path.join(this.checkpointsDir, '.git');
    this.log = log;
  }

  /**
   * Initialize the shadow git repository
   *
   * @param onInit - Optional callback after initialization
   * @returns Object with created flag and duration
   */
  public async initShadowGit(
    onInit?: () => Promise<void>
  ): Promise<{ created: boolean; duration: number }> {
    if (this._isInitialized) {
      throw new Error('Shadow git repo already initialized');
    }

    // Check for nested git repositories
    const nestedGitPath = await this.getNestedGitRepository();
    if (nestedGitPath) {
      const relativePath = path.relative(this.workspaceDir, nestedGitPath);
      throw new Error(
        `Checkpoints are disabled because a nested git repository was detected at: ${relativePath}. ` +
          'Please remove or relocate nested git repositories to use the checkpoints feature.'
      );
    }

    // Create checkpoints directory
    await fs.mkdir(this.checkpointsDir, { recursive: true });

    let created = false;
    const startTime = Date.now();

    if (await fileExistsAtPath(this.dotGitDir)) {
      this.log(
        `[${this.constructor.name}#initShadowGit] shadow git repo already exists at ${this.dotGitDir}`
      );

      // Verify worktree matches
      const worktree = await this.getShadowGitConfigWorktree();
      if (worktree && worktree !== this.workspaceDir) {
        throw new Error(
          `Checkpoints can only be used in the original workspace: ${worktree} !== ${this.workspaceDir}`
        );
      }

      await this.writeExcludeFile();
      const { stdout } = await execGit(['rev-parse', 'HEAD'], { cwd: this.checkpointsDir });
      this.baseHash = stdout;
    } else {
      this.log(
        `[${this.constructor.name}#initShadowGit] creating shadow git repo at ${this.checkpointsDir}`
      );

      // Initialize new git repository
      await execGit(['init'], { cwd: this.checkpointsDir });
      await execGit(['config', 'core.worktree', this.workspaceDir], { cwd: this.checkpointsDir });
      await execGit(['config', 'commit.gpgSign', 'false'], { cwd: this.checkpointsDir });
      await execGit(['config', 'user.name', 'Recoder Checkpoints'], { cwd: this.checkpointsDir });
      await execGit(['config', 'user.email', 'checkpoints@recoder.xyz'], {
        cwd: this.checkpointsDir,
      });

      await this.writeExcludeFile();
      await this.stageAll();

      // Create initial commit
      const { stdout } = await execGit(['commit', '-m', 'initial commit', '--allow-empty'], {
        cwd: this.checkpointsDir,
      });

      // Get the commit hash
      const { stdout: hash } = await execGit(['rev-parse', 'HEAD'], { cwd: this.checkpointsDir });
      this.baseHash = hash;
      created = true;
    }

    const duration = Date.now() - startTime;

    this.log(
      `[${this.constructor.name}#initShadowGit] initialized shadow repo with base commit ${this.baseHash} in ${duration}ms`
    );

    this._isInitialized = true;

    await onInit?.();

    this.emit('initialize', {
      type: 'initialize',
      workspaceDir: this.workspaceDir,
      baseHash: this.baseHash!,
      created,
      duration,
    });

    return { created, duration };
  }

  /**
   * Write exclude patterns to .git/info/exclude
   */
  protected async writeExcludeFile(): Promise<void> {
    const infoDir = path.join(this.dotGitDir, 'info');
    await fs.mkdir(infoDir, { recursive: true });
    const patterns = await getExcludePatterns(this.workspaceDir);
    await fs.writeFile(path.join(infoDir, 'exclude'), patterns.join('\n'));
  }

  /**
   * Stage all changes for commit
   */
  private async stageAll(): Promise<void> {
    try {
      await execGit(['add', '.', '--ignore-errors'], { cwd: this.checkpointsDir });
    } catch (error) {
      this.log(
        `[${this.constructor.name}#stageAll] failed to add files to git: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Check for nested git repositories in the workspace
   */
  private async getNestedGitRepository(): Promise<string | null> {
    try {
      // Look for .git directories inside the workspace
      const findGitDirs = async (dir: string, depth: number = 0): Promise<string | null> => {
        if (depth > 5) return null; // Limit search depth

        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const fullPath = path.join(dir, entry.name);

            // Skip the root .git if it exists
            if (entry.name === '.git' && dir !== this.workspaceDir) {
              return dir; // Return the directory containing .git, not .git itself
            }

            // Skip common directories that shouldn't contain nested repos
            if (['node_modules', '.git', 'vendor', 'dist', 'build'].includes(entry.name)) {
              continue;
            }

            // Check for .git in subdirectories
            const nestedGitPath = path.join(fullPath, '.git');
            if (await fileExistsAtPath(nestedGitPath)) {
              return fullPath;
            }

            // Recurse into subdirectory
            const found = await findGitDirs(fullPath, depth + 1);
            if (found) return found;
          }
        } catch {
          // Ignore permission errors
        }

        return null;
      };

      return await findGitDirs(this.workspaceDir);
    } catch (error) {
      this.log(
        `[${this.constructor.name}#getNestedGitRepository] failed to check for nested git repos: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /**
   * Get the configured worktree from shadow git config
   */
  private async getShadowGitConfigWorktree(): Promise<string | undefined> {
    if (!this.shadowGitConfigWorktree) {
      try {
        const { stdout } = await execGit(['config', 'core.worktree'], { cwd: this.checkpointsDir });
        this.shadowGitConfigWorktree = stdout || undefined;
      } catch {
        // Config may not exist
      }
    }
    return this.shadowGitConfigWorktree;
  }

  /**
   * Save a new checkpoint
   *
   * @param message - Checkpoint message/description
   * @param options - Optional settings for the checkpoint
   * @returns Checkpoint result or undefined if no changes
   */
  public async saveCheckpoint(
    message: string,
    options?: SaveCheckpointOptions
  ): Promise<CheckpointResult | undefined> {
    try {
      this.log(
        `[${this.constructor.name}#saveCheckpoint] starting checkpoint save (allowEmpty: ${
          options?.allowEmpty ?? false
        })`
      );

      if (!this._isInitialized) {
        throw new Error('Shadow git repo not initialized');
      }

      const startTime = Date.now();
      await this.stageAll();

      // Build commit command
      const commitArgs = ['commit', '-m', message];
      if (options?.allowEmpty) {
        commitArgs.push('--allow-empty');
      }

      let commitHash: string | undefined;

      try {
        await execGit(commitArgs, { cwd: this.checkpointsDir });
        const { stdout } = await execGit(['rev-parse', 'HEAD'], { cwd: this.checkpointsDir });
        commitHash = stdout;
      } catch (error) {
        // Check if error is "nothing to commit"
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('nothing to commit') || errorMessage.includes('no changes added')) {
          this.log(
            `[${this.constructor.name}#saveCheckpoint] found no changes to commit in ${
              Date.now() - startTime
            }ms`
          );
          return undefined;
        }
        throw error;
      }

      const fromHash = this._checkpoints[this._checkpoints.length - 1] ?? this.baseHash!;
      const toHash = commitHash || fromHash;
      this._checkpoints.push(toHash);
      const duration = Date.now() - startTime;

      if (commitHash) {
        this.emit('checkpoint', {
          type: 'checkpoint',
          fromHash,
          toHash,
          duration,
          suppressMessage: options?.suppressMessage ?? false,
        });

        this.log(
          `[${this.constructor.name}#saveCheckpoint] checkpoint saved in ${duration}ms -> ${commitHash}`
        );

        return { commit: commitHash };
      }

      return undefined;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.log(`[${this.constructor.name}#saveCheckpoint] failed to create checkpoint: ${error.message}`);
      this.emit('error', { type: 'error', error });
      throw error;
    }
  }

  /**
   * Restore the workspace to a previous checkpoint
   *
   * @param commitHash - Hash of the checkpoint to restore
   */
  public async restoreCheckpoint(commitHash: string): Promise<void> {
    try {
      this.log(`[${this.constructor.name}#restoreCheckpoint] starting checkpoint restore`);

      if (!this._isInitialized) {
        throw new Error('Shadow git repo not initialized');
      }

      const start = Date.now();

      // Clean untracked files
      await execGit(['clean', '-f', '-d', '-f'], { cwd: this.checkpointsDir });

      // Reset to checkpoint
      await execGit(['reset', '--hard', commitHash], { cwd: this.checkpointsDir });

      // Remove all checkpoints after the specified commitHash
      const checkpointIndex = this._checkpoints.indexOf(commitHash);
      if (checkpointIndex !== -1) {
        this._checkpoints = this._checkpoints.slice(0, checkpointIndex + 1);
      }

      const duration = Date.now() - start;
      this.emit('restore', { type: 'restore', commitHash, duration });
      this.log(
        `[${this.constructor.name}#restoreCheckpoint] restored checkpoint ${commitHash} in ${duration}ms`
      );
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      this.log(
        `[${this.constructor.name}#restoreCheckpoint] failed to restore checkpoint: ${error.message}`
      );
      this.emit('error', { type: 'error', error });
      throw error;
    }
  }

  /**
   * Get diff between two checkpoints
   *
   * @param options - Options specifying from/to commits
   * @returns Array of file diffs
   */
  public async getDiff(options: GetDiffOptions = {}): Promise<CheckpointDiff[]> {
    if (!this._isInitialized) {
      throw new Error('Shadow git repo not initialized');
    }

    let { from, to } = options;
    const result: CheckpointDiff[] = [];

    // Get initial commit if from not specified
    if (!from) {
      const { stdout } = await execGit(['rev-list', '--max-parents=0', 'HEAD'], {
        cwd: this.checkpointsDir,
      });
      from = stdout.trim();
    }

    // Stage all changes so untracked files appear in diff
    await this.stageAll();

    this.log(
      `[${this.constructor.name}#getDiff] diffing ${to ? `${from}..${to}` : `${from}..HEAD`}`
    );

    // Get diff summary
    const diffArgs = ['diff', '--name-status'];
    if (to) {
      diffArgs.push(`${from}..${to}`);
    } else {
      diffArgs.push(from);
    }

    const { stdout: diffOutput } = await execGit(diffArgs, { cwd: this.checkpointsDir });
    const cwdPath = (await this.getShadowGitConfigWorktree()) || this.workspaceDir || '';

    // Parse diff output
    const lines = diffOutput.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      const [status, ...pathParts] = line.split('\t');
      const relPath = pathParts.join('\t'); // Handle paths with tabs

      if (!relPath) continue;

      const absPath = path.join(cwdPath, relPath);

      // Get content before
      let before = '';
      try {
        const { stdout } = await execGit(['show', `${from}:${relPath}`], {
          cwd: this.checkpointsDir,
        });
        before = stdout;
      } catch {
        // File didn't exist in from commit
      }

      // Get content after
      let after = '';
      try {
        if (to) {
          const { stdout } = await execGit(['show', `${to}:${relPath}`], {
            cwd: this.checkpointsDir,
          });
          after = stdout;
        } else {
          // Read from filesystem for HEAD
          after = await fs.readFile(absPath, 'utf8');
        }
      } catch {
        // File doesn't exist or was deleted
      }

      result.push({
        paths: { relative: relPath, absolute: absPath },
        content: { before, after },
      });
    }

    return result;
  }

  /**
   * Get a summary of changes between checkpoints
   */
  public async getDiffSummary(options: GetDiffOptions = {}): Promise<DiffSummary> {
    if (!this._isInitialized) {
      throw new Error('Shadow git repo not initialized');
    }

    let { from, to } = options;

    if (!from) {
      const { stdout } = await execGit(['rev-list', '--max-parents=0', 'HEAD'], {
        cwd: this.checkpointsDir,
      });
      from = stdout.trim();
    }

    await this.stageAll();

    const diffArgs = ['diff', '--numstat'];
    if (to) {
      diffArgs.push(`${from}..${to}`);
    } else {
      diffArgs.push(from);
    }

    const { stdout } = await execGit(diffArgs, { cwd: this.checkpointsDir });

    const files: FileChange[] = [];
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (const line of stdout.split('\n').filter((l) => l.trim())) {
      const [additions, deletions, filePath] = line.split('\t');
      const add = parseInt(additions, 10) || 0;
      const del = parseInt(deletions, 10) || 0;

      files.push({
        type: add > 0 && del === 0 ? 'added' : del > 0 && add === 0 ? 'deleted' : 'modified',
        path: filePath,
        additions: add,
        deletions: del,
      });

      totalInsertions += add;
      totalDeletions += del;
    }

    return {
      files,
      totalFiles: files.length,
      insertions: totalInsertions,
      deletions: totalDeletions,
    };
  }

  /**
   * List all checkpoints with their messages
   */
  public async listCheckpoints(): Promise<Array<{ hash: string; message: string; date: string }>> {
    if (!this._isInitialized) {
      throw new Error('Shadow git repo not initialized');
    }

    const { stdout } = await execGit(
      ['log', '--oneline', '--format=%H|%s|%ci'],
      { cwd: this.checkpointsDir }
    );

    return stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [hash, message, date] = line.split('|');
        return { hash, message, date };
      });
  }

  // EventEmitter type-safe overrides
  override emit<K extends keyof CheckpointEventMap>(event: K, data: CheckpointEventMap[K]): boolean {
    return super.emit(event, data);
  }

  override on<K extends keyof CheckpointEventMap>(
    event: K,
    listener: (data: CheckpointEventMap[K]) => void
  ): this {
    return super.on(event, listener);
  }

  override off<K extends keyof CheckpointEventMap>(
    event: K,
    listener: (data: CheckpointEventMap[K]) => void
  ): this {
    return super.off(event, listener);
  }

  override once<K extends keyof CheckpointEventMap>(
    event: K,
    listener: (data: CheckpointEventMap[K]) => void
  ): this {
    return super.once(event, listener);
  }

  // Static utility methods

  /**
   * Hash a workspace directory path for storage
   */
  public static hashWorkspaceDir(workspaceDir: string): string {
    return crypto.createHash('sha256').update(workspaceDir).digest('hex').toString().slice(0, 8);
  }

  /**
   * Get the directory for a task's checkpoint repository
   */
  protected static taskRepoDir({
    taskId,
    globalStorageDir,
  }: {
    taskId: string;
    globalStorageDir: string;
  }): string {
    return path.join(globalStorageDir, 'tasks', taskId, 'checkpoints');
  }

  /**
   * Get the directory for a workspace's checkpoint repository
   */
  protected static workspaceRepoDir({
    globalStorageDir,
    workspaceDir,
  }: {
    globalStorageDir: string;
    workspaceDir: string;
  }): string {
    return path.join(globalStorageDir, 'checkpoints', this.hashWorkspaceDir(workspaceDir));
  }

  /**
   * Delete a task's checkpoint branch
   */
  public static async deleteTask({
    taskId,
    globalStorageDir,
    workspaceDir,
  }: {
    taskId: string;
    globalStorageDir: string;
    workspaceDir: string;
  }): Promise<void> {
    const workspaceRepoDir = this.workspaceRepoDir({ globalStorageDir, workspaceDir });
    const branchName = `recoder-${taskId}`;

    try {
      await this.deleteBranch(workspaceRepoDir, branchName);
      console.log(`[${this.name}#deleteTask.${taskId}] deleted branch ${branchName}`);
    } catch (error) {
      console.error(`[${this.name}#deleteTask.${taskId}] failed to delete branch ${branchName}`);
    }
  }

  /**
   * Delete a branch from the checkpoint repository
   */
  public static async deleteBranch(repoDir: string, branchName: string): Promise<boolean> {
    try {
      const { stdout: branches } = await execGit(['branch', '--list'], { cwd: repoDir });

      if (!branches.includes(branchName)) {
        console.error(`[ShadowCheckpointService#deleteBranch] branch ${branchName} does not exist`);
        return false;
      }

      const { stdout: currentBranch } = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: repoDir,
      });

      if (currentBranch.trim() === branchName) {
        // Switch to main/master before deleting
        await execGit(['reset', '--hard'], { cwd: repoDir });
        await execGit(['clean', '-f', '-d'], { cwd: repoDir });

        const defaultBranch = branches.includes('main') ? 'main' : 'master';
        await execGit(['checkout', defaultBranch, '--force'], { cwd: repoDir });
      }

      await execGit(['branch', '-D', branchName], { cwd: repoDir });
      return true;
    } catch (error) {
      console.error(
        `[ShadowCheckpointService#deleteBranch] failed to delete branch ${branchName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }
}
