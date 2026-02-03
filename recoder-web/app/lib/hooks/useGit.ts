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

  // Init
  initRepo: () => Promise<boolean>;
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
        console.debug(`[useGit] ${MAX_GIT_FAILURES} consecutive failures, suspending until container is ready`);
        setSuspended(true);
      } else {
        console.debug('[useGit] Status error:', err);
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
      console.error('[useGit] Stage error:', err);
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
      console.error('[useGit] Unstage error:', err);
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
      console.error('[useGit] Stage all error:', err);
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
      console.error('[useGit] Unstage all error:', err);
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
      console.error('[useGit] Commit error:', err);
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
      console.error('[useGit] Discard error:', err);
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
      console.error('[useGit] Diff error:', err);
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
      console.error('[useGit] Branches error:', err);
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
      console.error('[useGit] Checkout error:', err);
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
      console.error('[useGit] Create branch error:', err);
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
      console.error('[useGit] Delete branch error:', err);
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
      return commitList;
    } catch (err) {
      console.error('[useGit] History error:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

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
      console.error('[useGit] Init error:', err);
      toast.error('Failed to initialize repository');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus]);

  // Auto-fetch on mount when container is ready
  useEffect(() => {
    if (autoFetch && containerReady && projectId) {
      refreshStatus();
      getBranches();
    }
  }, [autoFetch, containerReady, projectId, refreshStatus, getBranches]);

  // Polling for auto-refresh
  useEffect(() => {
    if (pollInterval > 0 && containerReady && projectId && isGitRepo) {
      const interval = setInterval(refreshStatus, pollInterval);
      return () => clearInterval(interval);
    }
  }, [pollInterval, containerReady, projectId, isGitRepo, refreshStatus]);

  return useMemo(
    () => ({
      // State
      status,
      branches,
      commits,
      isLoading,
      isGitRepo,
      error,

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

      // Init
      initRepo,
    }),
    [
      status,
      branches,
      commits,
      isLoading,
      isGitRepo,
      error,
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
      initRepo,
    ]
  );
}

export default useGit;
