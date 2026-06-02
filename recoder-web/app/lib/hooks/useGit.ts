/**
 * useGit - React hook for git operations
 *
 * Provides a clean interface for git operations:
 * - getStatus() - get git status (branch, staged, unstaged files)
 * - stage(file) / unstage(file) - stage/unstage individual files
 * - stageAll() / unstageAll() - stage/unstage all files
 * - commit(message) - commit staged changes
 * - getCurrentBranch() - get current branch name
 * - getBranches() - list all branches
 * - checkout(branch) - switch to a branch
 * - createBranch(name) - create a new branch
 * - deleteBranch(name) - delete a branch
 * - getHistory(limit) - get commit history
 * - getDiff(filePath) - get diff for a file
 * - discard(paths) - discard changes to files
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerGet, dockerPost, dockerDelete } from '~/lib/services/docker-api';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GitHook');

export interface GitFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicts: string[];
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  lastCommit?: string;
  lastCommitDate?: string;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  timestamp: number;
}

export interface GitDiff {
  filePath: string;
  original: string;
  modified: string;
  additions: number;
  deletions: number;
}

export interface GitPullRequest {
  number: number;
  url: string;
  state: string;
  title: string;
  head?: string;
  base?: string;
  draft?: boolean;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GitPullRequestDetail {
  pullRequest: GitPullRequest & {
    body?: string;
    merged?: boolean;
    mergeable?: boolean | null;
    mergeableState?: string | null;
    additions?: number;
    deletions?: number;
    changedFiles?: number;
  };
  reviews: Array<{ user?: string; state?: string; submittedAt?: string }>;
  checks: Array<{ name?: string; status?: string; conclusion?: string | null }>;
}

export interface CreatePullRequestOptions {
  title: string;
  body?: string;
  head?: string;
  base?: string;
  draft?: boolean;
  token?: string;
  taskId?: string;
}

export type GitStateType = 'clean' | 'merging' | 'rebasing' | 'cherry-picking';

export interface GitState {
  state: GitStateType;
  conflictFiles?: string[];
}

export interface GitConflicts {
  files: string[];
  type: 'merge' | 'rebase';
}

export interface UseGitOptions {
  /** Auto-fetch status when container is ready */
  autoFetch?: boolean;
  /** Poll interval in ms for auto-refresh (0 = disabled) */
  pollInterval?: number;
}

export interface UseGitReturn {
  // State
  status: GitStatus | null;
  branches: GitBranch[];
  commits: GitCommit[];
  isLoading: boolean;
  isGitRepo: boolean | null;
  error: string | null;
  gitState: GitState | null;
  pullRequests: GitPullRequest[];

  // Operations
  refreshStatus: () => Promise<void>;
  getStatus: () => Promise<GitStatus | null>;
  getCurrentBranch: () => string | null;
  stage: (files: string | string[]) => Promise<boolean>;
  unstage: (files: string | string[]) => Promise<boolean>;
  stageAll: () => Promise<boolean>;
  unstageAll: () => Promise<boolean>;
  commit: (message: string) => Promise<boolean>;
  discard: (files: string | string[]) => Promise<boolean>;
  discardAll: () => Promise<boolean>;
  getDiff: (filePath: string) => Promise<GitDiff | null>;

  // Branch operations
  getBranches: () => Promise<GitBranch[]>;
  checkout: (branch: string) => Promise<boolean>;
  createBranch: (name: string, checkout?: boolean) => Promise<boolean>;
  deleteBranch: (name: string, force?: boolean) => Promise<boolean>;

  // History operations
  getHistory: (limit?: number) => Promise<GitCommit[]>;
  loadMoreHistory: () => Promise<void>;
  hasMoreHistory: boolean;

  // Init
  initRepo: () => Promise<boolean>;

  // Remote operations
  push: (options?: { remote?: string; branch?: string; force?: boolean; setUpstream?: boolean; token?: string }) => Promise<boolean>;
  pull: (options?: { remote?: string; branch?: string; rebase?: boolean; token?: string }) => Promise<boolean>;
  fetchRemote: (remote?: string, token?: string) => Promise<boolean>;
  getRemotes: () => Promise<{ name: string; url: string; type: string }[]>;
  setRemote: (name: string, url: string) => Promise<boolean>;
  listPullRequests: (options?: { state?: 'open' | 'closed' | 'all'; token?: string }) => Promise<GitPullRequest[]>;
  createPullRequest: (options: CreatePullRequestOptions) => Promise<GitPullRequest | null>;
  getPullRequest: (number: number, token?: string) => Promise<GitPullRequestDetail | null>;

  // Enhanced operations
  merge: (branch: string, options?: { noFf?: boolean; squash?: boolean }) => Promise<{ success: boolean; conflicts?: string[] }>;
  rebase: (branch: string) => Promise<{ success: boolean; conflicts?: string[] }>;
  rebaseAbort: () => Promise<boolean>;
  rebaseContinue: () => Promise<{ success: boolean; conflicts?: string[] }>;
  getGitState: () => Promise<GitState | null>;
  getConflicts: () => Promise<GitConflicts | null>;
  renameBranch: (oldName: string, newName: string) => Promise<boolean>;
  forcePush: (options?: { remote?: string; branch?: string; token?: string }) => Promise<boolean>;
}

/** Max consecutive failures before suspending git polling */
const MAX_GIT_FAILURES = 3;

export function useGit(options: UseGitOptions = {}): UseGitReturn {
  const { autoFetch = true, pollInterval = 0 } = options;

  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);

  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suspended, setSuspended] = useState(false);
  const [gitState, setGitState] = useState<GitState | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [pullRequests, setPullRequests] = useState<GitPullRequest[]>([]);
  const historyPageSizeRef = useRef(50);
  const consecutiveFailuresRef = useRef(0);

  // Reset failure tracking when container becomes ready
  useEffect(() => {
    if (containerReady) {
      consecutiveFailuresRef.current = 0;
      setSuspended(false);
    }
  }, [containerReady]);

  // Get current branch
  const getCurrentBranch = useCallback(() => {
    return status?.branch || null;
  }, [status]);

  // Refresh git status - guarded by containerReady
  const refreshStatus = useCallback(async () => {
    if (!projectId) {
      setError('No project ID');
      return;
    }

    if (!containerReady || suspended) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await dockerGet<GitStatus>(`/api/git/${projectId}/status`);
      if (data) {
        setStatus(data);
        setIsGitRepo(!!data.branch);
        consecutiveFailuresRef.current = 0;
      } else {
        setIsGitRepo(false);
      }
    } catch (err) {
      consecutiveFailuresRef.current++;
      if (consecutiveFailuresRef.current >= MAX_GIT_FAILURES) {
        logger.debug(`[useGit] ${MAX_GIT_FAILURES} consecutive failures, suspending until container is ready`);
        setSuspended(true);
      } else {
        logger.debug('[useGit] Status error:', err);
      }
      setIsGitRepo(false);
      setError(err instanceof Error ? err.message : 'Failed to get git status');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, containerReady, suspended]);

  // Get status (returns current status or fetches new)
  const getStatus = useCallback(async () => {
    await refreshStatus();
    return status;
  }, [refreshStatus, status]);

  // Stage files
  const stage = useCallback(async (files: string | string[]): Promise<boolean> => {
    if (!projectId) return false;

    const filePaths = Array.isArray(files) ? files : [files];

    try {
      await dockerPost(`/api/git/${projectId}/stage`, { files: filePaths });
      await refreshStatus();
      return true;
    } catch (err) {
      logger.error('[useGit] Stage error:', err);
      toast.error('Failed to stage files');
      return false;
    }
  }, [projectId, refreshStatus]);

  // Unstage files
  const unstage = useCallback(async (files: string | string[]): Promise<boolean> => {
    if (!projectId) return false;

    const filePaths = Array.isArray(files) ? files : [files];

    try {
      await dockerPost(`/api/git/${projectId}/unstage`, { files: filePaths });
      await refreshStatus();
      return true;
    } catch (err) {
      logger.error('[useGit] Unstage error:', err);
      toast.error('Failed to unstage files');
      return false;
    }
  }, [projectId, refreshStatus]);

  // Stage all files
  const stageAll = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;

    try {
      await dockerPost(`/api/git/${projectId}/stage`, { files: [] }); // Empty = all
      await refreshStatus();
      return true;
    } catch (err) {
      logger.error('[useGit] Stage all error:', err);
      toast.error('Failed to stage all files');
      return false;
    }
  }, [projectId, refreshStatus]);

  // Unstage all files
  const unstageAll = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;

    try {
      await dockerPost(`/api/git/${projectId}/unstage`, { files: [] }); // Empty = all
      await refreshStatus();
      return true;
    } catch (err) {
      logger.error('[useGit] Unstage all error:', err);
      toast.error('Failed to unstage all files');
      return false;
    }
  }, [projectId, refreshStatus]);

  // Commit changes
  const commit = useCallback(async (message: string): Promise<boolean> => {
    if (!projectId) return false;

    if (!message.trim()) {
      toast.error('Please enter a commit message');
      return false;
    }

    setIsLoading(true);

    try {
      await dockerPost(`/api/git/${projectId}/commit`, { message: message.trim() });
      toast.success('Changes committed');
      await refreshStatus();
      return true;
    } catch (err) {
      logger.error('[useGit] Commit error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to commit';
      toast.error(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus]);

  // Discard changes
  const discard = useCallback(async (files: string | string[]): Promise<boolean> => {
    if (!projectId) return false;

    const filePaths = Array.isArray(files) ? files : [files];

    try {
      await dockerPost(`/api/git/${projectId}/discard`, { files: filePaths });
      toast.success('Changes discarded');
      await refreshStatus();
      return true;
    } catch (err) {
      logger.error('[useGit] Discard error:', err);
      toast.error('Failed to discard changes');
      return false;
    }
  }, [projectId, refreshStatus]);

  // Discard all changes
  const discardAll = useCallback(async (): Promise<boolean> => {
    if (!projectId || !status) return false;

    const allPaths = [
      ...(status.unstaged?.map((f) => f.path) || []),
    ];

    if (allPaths.length === 0) return true;

    return discard(allPaths);
  }, [projectId, status, discard]);

  // Get diff for a file
  const getDiff = useCallback(async (filePath: string): Promise<GitDiff | null> => {
    if (!projectId) return null;

    try {
      const data = await dockerGet<GitDiff>(`/api/git/${projectId}/diff?path=${encodeURIComponent(filePath)}`);
      return data || null;
    } catch (err) {
      logger.error('[useGit] Diff error:', err);
      return null;
    }
  }, [projectId]);

  // Get branches
  const getBranches = useCallback(async (): Promise<GitBranch[]> => {
    if (!projectId) return [];

    try {
      const data = await dockerGet<{ branches: GitBranch[] }>(`/api/git/${projectId}/branches`);
      const branchList = data?.branches || [];
      setBranches(branchList);
      return branchList;
    } catch (err) {
      logger.error('[useGit] Branches error:', err);
      return [];
    }
  }, [projectId]);

  // Checkout branch
  const checkout = useCallback(async (branch: string): Promise<boolean> => {
    if (!projectId) return false;

    setIsLoading(true);

    try {
      await dockerPost(`/api/git/${projectId}/checkout`, { branch });
      toast.success(`Switched to ${branch}`);
      await refreshStatus();
      await getBranches();
      return true;
    } catch (err) {
      logger.error('[useGit] Checkout error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to switch branch';
      toast.error(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus, getBranches]);

  // Create branch
  const createBranch = useCallback(async (name: string, checkoutAfter = true): Promise<boolean> => {
    if (!projectId) return false;

    setIsLoading(true);

    try {
      await dockerPost(`/api/git/${projectId}/branch`, { name, checkout: checkoutAfter });
      toast.success(`Created${checkoutAfter ? ' and switched to' : ''} ${name}`);
      await refreshStatus();
      await getBranches();
      return true;
    } catch (err) {
      logger.error('[useGit] Create branch error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to create branch';
      toast.error(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus, getBranches]);

  // Delete branch
  const deleteBranch = useCallback(async (name: string, force = false): Promise<boolean> => {
    if (!projectId) return false;

    try {
      await dockerDelete(`/api/git/${projectId}/branch/${encodeURIComponent(name)}${force ? '?force=true' : ''}`);
      toast.success(`Deleted branch ${name}`);
      await getBranches();
      return true;
    } catch (err) {
      logger.error('[useGit] Delete branch error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete branch';
      toast.error(errorMsg);
      return false;
    }
  }, [projectId, getBranches]);

  // Get commit history
  const getHistory = useCallback(async (limit = 50): Promise<GitCommit[]> => {
    if (!projectId) return [];

    setIsLoading(true);

    try {
      const data = await dockerGet<{ commits: GitCommit[] }>(`/api/git/${projectId}/log?limit=${limit}`);
      const commitList = data?.commits || [];
      setCommits(commitList);
      historyPageSizeRef.current = limit;
      setHasMoreHistory(commitList.length >= limit);
      return commitList;
    } catch (err) {
      logger.error('[useGit] History error:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Load more commits (increases the fetch limit)
  const loadMoreHistory = useCallback(async (): Promise<void> => {
    const nextLimit = historyPageSizeRef.current + 50;
    await getHistory(nextLimit);
  }, [getHistory]);

  // Initialize repository
  const initRepo = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;

    setIsLoading(true);

    try {
      await dockerPost(`/api/git/${projectId}/init`);
      toast.success('Git repository initialized');
      setIsGitRepo(true);
      await refreshStatus();
      return true;
    } catch (err) {
      logger.error('[useGit] Init error:', err);
      toast.error('Failed to initialize repository');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus]);

  // Push to remote
  const push = useCallback(async (options?: {
    remote?: string;
    branch?: string;
    force?: boolean;
    setUpstream?: boolean;
    token?: string;
  }): Promise<boolean> => {
    if (!projectId) return false;

    setIsLoading(true);
    try {
      await dockerPost(`/api/git/${projectId}/push`, {
        remote: options?.remote || 'origin',
        branch: options?.branch,
        force: options?.force,
        setUpstream: options?.setUpstream,
        token: options?.token,
      });
      toast.success('Pushed to remote');
      await refreshStatus();
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Push failed';
      toast.error(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus]);

  // Pull from remote
  const pull = useCallback(async (options?: {
    remote?: string;
    branch?: string;
    rebase?: boolean;
    token?: string;
  }): Promise<boolean> => {
    if (!projectId) return false;

    setIsLoading(true);
    try {
      const result = await dockerPost<{ error?: string; conflicts?: string[] }>(`/api/git/${projectId}/pull`, {
        remote: options?.remote || 'origin',
        branch: options?.branch,
        rebase: options?.rebase,
        token: options?.token,
      });

      if (result?.conflicts && result.conflicts.length > 0) {
        toast.warning(`Pulled with ${result.conflicts.length} conflict(s)`);
      } else {
        toast.success('Pulled from remote');
      }
      await refreshStatus();
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Pull failed';
      toast.error(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus]);

  // Fetch from remote (no merge)
  const fetchRemote = useCallback(async (remote?: string, token?: string): Promise<boolean> => {
    if (!projectId) return false;

    try {
      await dockerPost(`/api/git/${projectId}/fetch`, { remote: remote || 'origin', token });
      await refreshStatus();
      return true;
    } catch (err) {
      logger.error('[useGit] Fetch error:', err);
      return false;
    }
  }, [projectId, refreshStatus]);

  // Get remotes
  const getRemotes = useCallback(async (): Promise<{ name: string; url: string; type: string }[]> => {
    if (!projectId) return [];

    try {
      const data = await dockerGet<{ remotes: { name: string; url: string; type: string }[] }>(`/api/git/${projectId}/remotes`);
      return data?.remotes || [];
    } catch (err) {
      logger.error('[useGit] Remotes error:', err);
      return [];
    }
  }, [projectId]);

  // Set remote
  const setRemote = useCallback(async (name: string, url: string): Promise<boolean> => {
    if (!projectId) return false;

    try {
      await dockerPost(`/api/git/${projectId}/remote`, { name, url });
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to set remote');
      return false;
    }
  }, [projectId]);

  const listPullRequests = useCallback(async (options?: {
    state?: 'open' | 'closed' | 'all';
    token?: string;
  }): Promise<GitPullRequest[]> => {
    if (!projectId) return [];

    try {
      const params = new URLSearchParams();
      params.set('state', options?.state || 'open');
      if (options?.token) params.set('token', options.token);
      const data = await dockerGet<{ pullRequests: GitPullRequest[] }>(
        `/api/git/${projectId}/pull-requests?${params.toString()}`,
      );
      const prs = data?.pullRequests || [];
      setPullRequests(prs);
      return prs;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load pull requests');
      return [];
    }
  }, [projectId]);

  const createPullRequest = useCallback(async (options: CreatePullRequestOptions): Promise<GitPullRequest | null> => {
    if (!projectId) return null;

    const title = options.title.trim();
    if (!title) {
      toast.error('Pull request title required');
      return null;
    }

    setIsLoading(true);
    try {
      const data = await dockerPost<{
        pullRequest: GitPullRequest;
        taskAttachment?: { attached: boolean; taskId?: string; error?: string };
      }>(`/api/git/${projectId}/pull-request`, {
        ...options,
        title,
      });
      if (data?.taskAttachment?.error) {
        toast.warning(`Pull request opened, but task attachment failed: ${data.taskAttachment.error}`);
      } else if (data?.taskAttachment?.attached) {
        toast.success('Pull request opened and attached to task');
      } else {
        toast.success('Pull request opened');
      }
      await listPullRequests({ token: options.token });
      return data?.pullRequest || null;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to open pull request');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, listPullRequests]);

  const getPullRequest = useCallback(async (number: number, token?: string): Promise<GitPullRequestDetail | null> => {
    if (!projectId) return null;

    try {
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      return await dockerGet<GitPullRequestDetail>(
        `/api/git/${projectId}/pull-request/${number}?${params.toString()}`,
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load pull request');
      return null;
    }
  }, [projectId]);

  // Enhanced operations

  // Merge branch into current
  const merge = useCallback(async (branch: string, options?: { noFf?: boolean; squash?: boolean }): Promise<{ success: boolean; conflicts?: string[] }> => {
    if (!projectId) return { success: false };

    setIsLoading(true);
    try {
      const result = await dockerPost<{ success?: boolean; error?: string; conflicts?: string[] }>(`/api/git/${projectId}/merge`, {
        branch,
        noFf: options?.noFf,
        squash: options?.squash,
      });

      if (result?.conflicts) {
        toast.warning(`Merge conflicts in ${result.conflicts.length} file(s)`);
        await refreshStatus();
        return { success: false, conflicts: result.conflicts };
      }

      toast.success(`Merged ${branch}`);
      await refreshStatus();
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || 'Merge failed';
      if (msg.includes('conflicts')) {
        toast.warning(msg);
      } else {
        toast.error(msg);
      }
      await refreshStatus();

      // Try to extract conflicts from error response
      try {
        const parsed = JSON.parse(msg);
        if (parsed.conflicts) return { success: false, conflicts: parsed.conflicts };
      } catch {}

      return { success: false };
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus]);

  // Rebase onto branch
  const rebase = useCallback(async (branch: string): Promise<{ success: boolean; conflicts?: string[] }> => {
    if (!projectId) return { success: false };

    setIsLoading(true);
    try {
      const result = await dockerPost<{ success?: boolean; error?: string; conflicts?: string[] }>(`/api/git/${projectId}/rebase`, { branch });

      if (result?.conflicts) {
        toast.warning(`Rebase conflicts in ${result.conflicts.length} file(s)`);
        await refreshStatus();
        return { success: false, conflicts: result.conflicts };
      }

      toast.success(`Rebased onto ${branch}`);
      await refreshStatus();
      return { success: true };
    } catch (err: any) {
      toast.error(err?.message || 'Rebase failed');
      await refreshStatus();
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus]);

  // Abort rebase
  const rebaseAbort = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;

    setIsLoading(true);
    try {
      await dockerPost(`/api/git/${projectId}/rebase-abort`);
      toast.success('Rebase aborted');
      await refreshStatus();
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to abort rebase');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus]);

  // Continue rebase
  const rebaseContinue = useCallback(async (): Promise<{ success: boolean; conflicts?: string[] }> => {
    if (!projectId) return { success: false };

    setIsLoading(true);
    try {
      const result = await dockerPost<{ success?: boolean; error?: string; conflicts?: string[] }>(`/api/git/${projectId}/rebase-continue`);

      if (result?.conflicts) {
        toast.warning(`More conflicts in ${result.conflicts.length} file(s)`);
        await refreshStatus();
        return { success: false, conflicts: result.conflicts };
      }

      toast.success('Rebase continued');
      await refreshStatus();
      return { success: true };
    } catch (err: any) {
      toast.error(err?.message || 'Failed to continue rebase');
      await refreshStatus();
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus]);

  // Get git state (merging/rebasing/clean)
  const getGitState = useCallback(async (): Promise<GitState | null> => {
    if (!projectId) return null;

    try {
      const data = await dockerGet<GitState>(`/api/git/${projectId}/state`);
      if (data) {
        setGitState(data);
      }
      return data || null;
    } catch {
      return null;
    }
  }, [projectId]);

  // Get conflict files
  const getConflicts = useCallback(async (): Promise<GitConflicts | null> => {
    if (!projectId) return null;

    try {
      const data = await dockerGet<GitConflicts>(`/api/git/${projectId}/conflicts`);
      return data || null;
    } catch {
      return null;
    }
  }, [projectId]);

  // Rename branch
  const renameBranch = useCallback(async (oldName: string, newName: string): Promise<boolean> => {
    if (!projectId) return false;

    setIsLoading(true);
    try {
      await dockerPost(`/api/git/${projectId}/branch-rename`, { oldName, newName });
      toast.success(`Renamed branch to ${newName}`);
      await getBranches();
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to rename branch');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, getBranches]);

  // Force push (safe, with lease)
  const forcePush = useCallback(async (options?: { remote?: string; branch?: string; token?: string }): Promise<boolean> => {
    if (!projectId) return false;

    setIsLoading(true);
    try {
      await dockerPost(`/api/git/${projectId}/force-push`, {
        remote: options?.remote || 'origin',
        branch: options?.branch || status?.branch,
        token: options?.token,
      });
      toast.success('Force pushed (with lease)');
      await refreshStatus();
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Force push failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, status?.branch, refreshStatus]);

  // Auto-fetch on mount when container is ready
  useEffect(() => {
    if (autoFetch && containerReady && projectId) {
      refreshStatus();
      getBranches();
    }
  }, [autoFetch, containerReady, projectId, refreshStatus, getBranches]);

  // Polling for auto-refresh (includes git state detection)
  useEffect(() => {
    if (pollInterval > 0 && containerReady && projectId && isGitRepo) {
      const interval = setInterval(() => {
        refreshStatus();
        getGitState();
      }, pollInterval);
      return () => clearInterval(interval);
    }
  }, [pollInterval, containerReady, projectId, isGitRepo, refreshStatus, getGitState]);

  return useMemo(
    () => ({
      // State
      status,
      branches,
      commits,
      isLoading,
      isGitRepo,
      error,
      gitState,
      pullRequests,

      // Operations
      refreshStatus,
      getStatus,
      getCurrentBranch,
      stage,
      unstage,
      stageAll,
      unstageAll,
      commit,
      discard,
      discardAll,
      getDiff,

      // Branch operations
      getBranches,
      checkout,
      createBranch,
      deleteBranch,

      // History
      getHistory,
      loadMoreHistory,
      hasMoreHistory,

      // Init
      initRepo,

      // Remote operations
      push,
      pull,
      fetchRemote,
      getRemotes,
      setRemote,
      listPullRequests,
      createPullRequest,
      getPullRequest,

      // Enhanced operations
      merge,
      rebase,
      rebaseAbort,
      rebaseContinue,
      getGitState,
      getConflicts,
      renameBranch,
      forcePush,
    }),
    [
      status,
      branches,
      commits,
      isLoading,
      isGitRepo,
      error,
      gitState,
      pullRequests,
      refreshStatus,
      getStatus,
      getCurrentBranch,
      stage,
      unstage,
      stageAll,
      unstageAll,
      commit,
      discard,
      discardAll,
      getDiff,
      getBranches,
      checkout,
      createBranch,
      deleteBranch,
      getHistory,
      loadMoreHistory,
      hasMoreHistory,
      initRepo,
      push,
      pull,
      fetchRemote,
      getRemotes,
      setRemote,
      listPullRequests,
      createPullRequest,
      getPullRequest,
      merge,
      rebase,
      rebaseAbort,
      rebaseContinue,
      getGitState,
      getConflicts,
      renameBranch,
      forcePush,
    ]
  );
}

export default useGit;
