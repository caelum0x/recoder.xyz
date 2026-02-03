/**
 * Git Client
 * API client for Git operations via docker-backend
 */

import { dockerGet, dockerPost, dockerDelete } from '~/lib/services/docker-api';
import type {
  GitStatus,
  GitBranch,
  GitCommit,
  GitDiff,
  GitStash,
  GitConflict,
  GitRemote,
  GitTag,
  GitBlameLine,
  GitOperationResult,
  GitLogOptions,
  GitDiffOptions,
  GitCherryPickOptions,
  GitRevertOptions,
  GitMergeOptions,
  GitPullOptions,
  GitPushOptions,
  GitStashOptions,
} from './types';

/**
 * Git API Client
 * All methods require a projectId to identify the container
 */
export class GitClient {
  private projectId: string;
  private baseUrl: string;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.baseUrl = `/api/git/${projectId}`;
  }

  // ==================== STATUS ====================

  /**
   * Get current repository status
   */
  async getStatus(): Promise<GitStatus> {
    return dockerGet<GitStatus>(`${this.baseUrl}/status`);
  }

  /**
   * Check if directory is a git repository
   */
  async isGitRepo(): Promise<boolean> {
    try {
      const status = await this.getStatus();
      return !!status.branch;
    } catch {
      return false;
    }
  }

  /**
   * Initialize a new git repository
   */
  async init(): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/init`);
  }

  // ==================== STAGING ====================

  /**
   * Stage files for commit
   * @param files - Array of file paths, or empty for all files
   */
  async stage(files: string[] = []): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/stage`, { files });
  }

  /**
   * Unstage files
   * @param files - Array of file paths, or empty for all files
   */
  async unstage(files: string[] = []): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/unstage`, { files });
  }

  /**
   * Discard changes to files
   * @param files - Array of file paths
   */
  async discard(files: string[]): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/discard`, { files });
  }

  /**
   * Clean untracked files
   * @param files - Array of file paths, or empty for all untracked
   */
  async clean(files: string[] = []): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/clean`, { files });
  }

  // ==================== COMMITS ====================

  /**
   * Create a commit
   * @param message - Commit message
   * @param options - Additional commit options
   */
  async commit(
    message: string,
    options?: { amend?: boolean; allowEmpty?: boolean }
  ): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/commit`, {
      message,
      ...options,
    });
  }

  /**
   * Get commit history
   */
  async getLog(options: GitLogOptions = {}): Promise<GitCommit[]> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    if (options.branch) params.set('branch', options.branch);
    if (options.path) params.set('path', options.path);
    if (options.author) params.set('author', options.author);
    if (options.since) params.set('since', options.since);
    if (options.until) params.set('until', options.until);
    if (options.grep) params.set('grep', options.grep);

    const query = params.toString();
    const url = query ? `${this.baseUrl}/log?${query}` : `${this.baseUrl}/log`;
    const result = await dockerGet<{ commits: GitCommit[] }>(url);
    return result.commits || [];
  }

  /**
   * Get details of a specific commit
   */
  async getCommit(hash: string): Promise<GitCommit> {
    return dockerGet<GitCommit>(`${this.baseUrl}/commit/${hash}`);
  }

  // ==================== BRANCHES ====================

  /**
   * Get all branches
   */
  async getBranches(): Promise<GitBranch[]> {
    const result = await dockerGet<{ branches: GitBranch[] }>(`${this.baseUrl}/branches`);
    return result.branches || [];
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string | null> {
    const status = await this.getStatus();
    return status.branch || null;
  }

  /**
   * Create a new branch
   */
  async createBranch(
    name: string,
    options?: { checkout?: boolean; startPoint?: string }
  ): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/branch`, {
      name,
      checkout: options?.checkout ?? true,
      startPoint: options?.startPoint,
    });
  }

  /**
   * Delete a branch
   */
  async deleteBranch(name: string, force = false): Promise<GitOperationResult> {
    const url = `${this.baseUrl}/branch/${encodeURIComponent(name)}${force ? '?force=true' : ''}`;
    return dockerDelete<GitOperationResult>(url);
  }

  /**
   * Rename a branch
   */
  async renameBranch(oldName: string, newName: string): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/branch/rename`, {
      oldName,
      newName,
    });
  }

  /**
   * Checkout a branch or commit
   */
  async checkout(target: string, options?: { create?: boolean }): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/checkout`, {
      branch: target,
      create: options?.create,
    });
  }

  // ==================== DIFFS ====================

  /**
   * Get diff for a file
   */
  async getDiff(filePath: string, options: GitDiffOptions = {}): Promise<GitDiff> {
    const params = new URLSearchParams();
    params.set('path', filePath);
    if (options.staged) params.set('staged', 'true');
    if (options.commit) params.set('commit', options.commit);
    if (options.compareWith) params.set('compareWith', options.compareWith);

    return dockerGet<GitDiff>(`${this.baseUrl}/diff?${params.toString()}`);
  }

  /**
   * Get diff for all changed files
   */
  async getAllDiffs(options: GitDiffOptions = {}): Promise<GitDiff[]> {
    const params = new URLSearchParams();
    if (options.staged) params.set('staged', 'true');
    if (options.commit) params.set('commit', options.commit);
    if (options.compareWith) params.set('compareWith', options.compareWith);

    const result = await dockerGet<{ diffs: GitDiff[] }>(`${this.baseUrl}/diffs?${params.toString()}`);
    return result.diffs || [];
  }

  /**
   * Get diff between two commits
   */
  async getCommitDiff(fromCommit: string, toCommit?: string): Promise<GitDiff[]> {
    const params = new URLSearchParams();
    params.set('from', fromCommit);
    if (toCommit) params.set('to', toCommit);

    const result = await dockerGet<{ diffs: GitDiff[] }>(`${this.baseUrl}/commit-diff?${params.toString()}`);
    return result.diffs || [];
  }

  // ==================== STASH ====================

  /**
   * List all stashes
   */
  async getStashes(): Promise<GitStash[]> {
    const result = await dockerGet<{ stashes: GitStash[] }>(`${this.baseUrl}/stashes`);
    return result.stashes || [];
  }

  /**
   * Create a stash
   */
  async stash(options: GitStashOptions = {}): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/stash`, options);
  }

  /**
   * Apply a stash
   */
  async stashApply(index: number, drop = false): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/stash/apply`, { index, drop });
  }

  /**
   * Pop a stash (apply and drop)
   */
  async stashPop(index = 0): Promise<GitOperationResult> {
    return this.stashApply(index, true);
  }

  /**
   * Drop a stash
   */
  async stashDrop(index: number): Promise<GitOperationResult> {
    return dockerDelete<GitOperationResult>(`${this.baseUrl}/stash/${index}`);
  }

  /**
   * Clear all stashes
   */
  async stashClear(): Promise<GitOperationResult> {
    return dockerDelete<GitOperationResult>(`${this.baseUrl}/stashes`);
  }

  // ==================== MERGE & CONFLICTS ====================

  /**
   * Merge a branch
   */
  async merge(options: GitMergeOptions): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/merge`, options);
  }

  /**
   * Abort an in-progress merge
   */
  async mergeAbort(): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/merge/abort`);
  }

  /**
   * Get merge conflicts
   */
  async getConflicts(): Promise<GitConflict[]> {
    const result = await dockerGet<{ conflicts: GitConflict[] }>(`${this.baseUrl}/conflicts`);
    return result.conflicts || [];
  }

  /**
   * Resolve a conflict
   */
  async resolveConflict(
    path: string,
    resolution: 'ours' | 'theirs' | 'custom',
    content?: string
  ): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/conflicts/resolve`, {
      path,
      resolution,
      content,
    });
  }

  // ==================== REMOTE OPERATIONS ====================

  /**
   * Get remotes
   */
  async getRemotes(): Promise<GitRemote[]> {
    const result = await dockerGet<{ remotes: GitRemote[] }>(`${this.baseUrl}/remotes`);
    return result.remotes || [];
  }

  /**
   * Add a remote
   */
  async addRemote(name: string, url: string): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/remotes`, { name, url });
  }

  /**
   * Remove a remote
   */
  async removeRemote(name: string): Promise<GitOperationResult> {
    return dockerDelete<GitOperationResult>(`${this.baseUrl}/remotes/${encodeURIComponent(name)}`);
  }

  /**
   * Fetch from remote
   */
  async fetch(remote = 'origin', options?: { prune?: boolean; all?: boolean }): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/fetch`, { remote, ...options });
  }

  /**
   * Pull from remote
   */
  async pull(options: GitPullOptions = {}): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/pull`, options);
  }

  /**
   * Push to remote
   */
  async push(options: GitPushOptions = {}): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/push`, options);
  }

  // ==================== ADVANCED OPERATIONS ====================

  /**
   * Cherry-pick a commit
   */
  async cherryPick(options: GitCherryPickOptions): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/cherry-pick`, options);
  }

  /**
   * Abort a cherry-pick
   */
  async cherryPickAbort(): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/cherry-pick/abort`);
  }

  /**
   * Revert a commit
   */
  async revert(options: GitRevertOptions): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/revert`, options);
  }

  /**
   * Abort a revert
   */
  async revertAbort(): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/revert/abort`);
  }

  /**
   * Reset to a commit
   */
  async reset(
    commit: string,
    mode: 'soft' | 'mixed' | 'hard' = 'mixed'
  ): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/reset`, { commit, mode });
  }

  // ==================== TAGS ====================

  /**
   * Get all tags
   */
  async getTags(): Promise<GitTag[]> {
    const result = await dockerGet<{ tags: GitTag[] }>(`${this.baseUrl}/tags`);
    return result.tags || [];
  }

  /**
   * Create a tag
   */
  async createTag(
    name: string,
    options?: { message?: string; commit?: string }
  ): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/tags`, { name, ...options });
  }

  /**
   * Delete a tag
   */
  async deleteTag(name: string): Promise<GitOperationResult> {
    return dockerDelete<GitOperationResult>(`${this.baseUrl}/tags/${encodeURIComponent(name)}`);
  }

  // ==================== BLAME ====================

  /**
   * Get blame information for a file
   */
  async blame(filePath: string): Promise<GitBlameLine[]> {
    const result = await dockerGet<{ blame: GitBlameLine[] }>(
      `${this.baseUrl}/blame?path=${encodeURIComponent(filePath)}`
    );
    return result.blame || [];
  }

  // ==================== CONFIG ====================

  /**
   * Get git config value
   */
  async getConfig(key: string): Promise<string | null> {
    try {
      const result = await dockerGet<{ value: string }>(`${this.baseUrl}/config/${encodeURIComponent(key)}`);
      return result.value || null;
    } catch {
      return null;
    }
  }

  /**
   * Set git config value
   */
  async setConfig(key: string, value: string, global = false): Promise<GitOperationResult> {
    return dockerPost<GitOperationResult>(`${this.baseUrl}/config`, { key, value, global });
  }
}

/**
 * Create a Git client for a project
 */
export function createGitClient(projectId: string): GitClient {
  return new GitClient(projectId);
}
