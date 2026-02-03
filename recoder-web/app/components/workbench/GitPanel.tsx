/**
 * GitPanel - VS Code style Source Control panel
 * Enhanced with local git support, branches, and commit history
 */

import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerGet, dockerPost, dockerDelete } from '~/lib/services/docker-api';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { GitBranchList, type GitBranch } from './GitBranchList';
import { GitHistory, type GitCommit } from './GitHistory';

interface GitPanelProps {
  files: Record<string, unknown>;
  onFileSelect?: (filePath: string) => void;
  onShowDiff?: (filePath: string, original: string, modified: string) => void;
}

interface GitFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string;
}

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicts: string[];
}

type TabView = 'changes' | 'history';

/** Max consecutive failures before pausing git operations */
const MAX_GIT_FAILURES = 3;

export const GitPanel = memo(({ files, onFileSelect, onShowDiff }: GitPanelProps) => {
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);

  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>('changes');
  const [showGitHubConfig, setShowGitHubConfig] = useState(false);
  const [gitSuspended, setGitSuspended] = useState(false);
  const consecutiveFailuresRef = useRef(0);
  const [gitHubConfig, setGitHubConfig] = useState<{
    owner: string;
    repo: string;
    branch: string;
    accessToken: string;
  } | null>(null);

  // Load GitHub config from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recoder-git-config');
    if (saved) {
      try {
        setGitHubConfig(JSON.parse(saved));
      } catch {}
    }
  }, []);

  // Reset failure tracking when container becomes ready
  useEffect(() => {
    if (containerReady) {
      consecutiveFailuresRef.current = 0;
      setGitSuspended(false);
    }
  }, [containerReady]);

  // Load git status when container is ready
  useEffect(() => {
    if (containerReady && projectId) {
      refreshStatus();
    }
  }, [containerReady, projectId]);

  // Refresh git status - only when container is ready
  const refreshStatus = useCallback(async () => {
    if (!projectId || !containerReady || gitSuspended) return;

    setIsLoading(true);
    try {
      const data = await dockerGet<GitStatus>(`/api/git/${projectId}/status`);
      if (data) {
        setStatus(data);
        setIsGitRepo(!!data.branch);
        // Reset failure counter on success
        consecutiveFailuresRef.current = 0;
      } else {
        setIsGitRepo(false);
      }
    } catch (error) {
      consecutiveFailuresRef.current++;
      if (consecutiveFailuresRef.current >= MAX_GIT_FAILURES) {
        console.debug(`[Git] ${MAX_GIT_FAILURES} consecutive failures, suspending git polling until container is ready`);
        setGitSuspended(true);
      } else {
        console.debug('[Git] Status error:', error);
      }
      setIsGitRepo(false);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, containerReady, gitSuspended]);

  // Load branches - only when container is ready
  const loadBranches = useCallback(async () => {
    if (!projectId || !containerReady || gitSuspended) return;

    try {
      const data = await dockerGet<{ branches: GitBranch[] }>(`/api/git/${projectId}/branches`);
      if (data) {
        setBranches(data.branches || []);
      }
    } catch (error) {
      console.debug('[Git] Branches error:', error);
    }
  }, [projectId, containerReady, gitSuspended]);

  // Load commit history - only when container is ready
  const loadHistory = useCallback(async () => {
    if (!projectId || !containerReady || gitSuspended) return;

    setIsLoading(true);
    try {
      const data = await dockerGet<{ commits: GitCommit[] }>(`/api/git/${projectId}/log?limit=50`);
      if (data) {
        setCommits(data.commits || []);
      }
    } catch (error) {
      console.debug('[Git] History error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, containerReady, gitSuspended]);

  // Load branches when tab changes or on mount
  useEffect(() => {
    if (isGitRepo && projectId) {
      loadBranches();
    }
  }, [isGitRepo, projectId, loadBranches]);

  // Load history when history tab is active
  useEffect(() => {
    if (activeTab === 'history' && isGitRepo) {
      loadHistory();
    }
  }, [activeTab, isGitRepo, loadHistory]);

  // Initialize git repo
  const initRepo = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    try {
      await dockerPost(`/api/git/${projectId}/init`);
      toast.success('Git repository initialized');
      setIsGitRepo(true);
      refreshStatus();
    } catch (error) {
      toast.error('Failed to initialize repository');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus]);

  // Stage files
  const stageFiles = useCallback(async (paths: string[]) => {
    if (!projectId) return;

    try {
      await dockerPost(`/api/git/${projectId}/stage`, { files: paths });
      refreshStatus();
    } catch (error) {
      toast.error('Failed to stage files');
    }
  }, [projectId, refreshStatus]);

  // Unstage files
  const unstageFiles = useCallback(async (paths: string[]) => {
    if (!projectId) return;

    try {
      await dockerPost(`/api/git/${projectId}/unstage`, { files: paths });
      refreshStatus();
    } catch (error) {
      toast.error('Failed to unstage files');
    }
  }, [projectId, refreshStatus]);

  // Commit changes
  const commit = useCallback(async () => {
    if (!projectId || !commitMessage.trim()) {
      toast.error('Please enter a commit message');
      return;
    }

    setIsLoading(true);
    try {
      await dockerPost<{ error?: string }>(`/api/git/${projectId}/commit`, {
        message: commitMessage.trim(),
      });
      toast.success('Changes committed');
      setCommitMessage('');
      refreshStatus();
      if (activeTab === 'history') {
        loadHistory();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to commit';
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, commitMessage, refreshStatus, activeTab, loadHistory]);

  // Discard changes
  const discardChanges = useCallback(async (paths: string[]) => {
    if (!projectId) return;
    if (!confirm(`Discard changes to ${paths.length} file(s)?`)) return;

    try {
      await dockerPost(`/api/git/${projectId}/discard`, { files: paths });
      toast.success('Changes discarded');
      refreshStatus();
    } catch (error) {
      toast.error('Failed to discard changes');
    }
  }, [projectId, refreshStatus]);

  // Checkout branch
  const checkoutBranch = useCallback(async (branch: string) => {
    if (!projectId) return;

    setIsLoading(true);
    try {
      await dockerPost(`/api/git/${projectId}/checkout`, { branch });
      toast.success(`Switched to ${branch}`);
      refreshStatus();
      loadBranches();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to switch branch';
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus, loadBranches]);

  // Create branch
  const createBranch = useCallback(async (name: string) => {
    if (!projectId) return;

    setIsLoading(true);
    try {
      await dockerPost(`/api/git/${projectId}/branch`, { name, checkout: true });
      toast.success(`Created and switched to ${name}`);
      refreshStatus();
      loadBranches();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to create branch';
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, refreshStatus, loadBranches]);

  // Delete branch
  const deleteBranch = useCallback(async (name: string, force?: boolean) => {
    if (!projectId) return;

    try {
      await dockerDelete(`/api/git/${projectId}/branch/${encodeURIComponent(name)}${force ? '?force=true' : ''}`);
      toast.success(`Deleted branch ${name}`);
      loadBranches();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to delete branch';
      toast.error(errorMsg);
    }
  }, [projectId, loadBranches]);

  // Not a git repo
  if (isGitRepo === false) {
    return (
      <div className="flex flex-col h-full text-sm bg-bolt-elements-background-depth-1">
        <div className="p-4 text-center">
          <span className="i-ph:git-branch text-4xl text-purple-400 mb-3 block" />
          <h3 className="text-bolt-elements-textPrimary font-medium mb-2">
            No Git Repository
          </h3>
          <p className="text-bolt-elements-textTertiary text-xs mb-4">
            Initialize a git repository to track changes
          </p>
          <button
            onClick={initRepo}
            disabled={isLoading}
            className="px-4 py-2 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-white"
          >
            {isLoading ? (
              <span className="i-ph:spinner animate-spin" />
            ) : (
              <>
                <span className="i-ph:git-branch mr-1" />
                Initialize Repository
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (!containerReady || isGitRepo === null) {
    return (
      <div className="flex flex-col h-full justify-center items-center text-sm bg-bolt-elements-background-depth-1">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mb-2" />
        <span className="text-bolt-elements-textTertiary">
          {!containerReady ? 'Waiting for container...' : 'Loading git status...'}
        </span>
      </div>
    );
  }

  // PERFORMANCE: Memoize derived state calculations
  const stagedCount = useMemo(() => status?.staged?.length || 0, [status?.staged?.length]);
  const unstagedCount = useMemo(() => (status?.unstaged?.length || 0) + (status?.untracked?.length || 0), [status?.unstaged?.length, status?.untracked?.length]);
  const hasConflicts = useMemo(() => (status?.conflicts?.length || 0) > 0, [status?.conflicts?.length]);

  return (
    <div className="flex flex-col h-full text-sm bg-bolt-elements-background-depth-1">
      {/* Header with Branch Selector */}
      <div className="px-3 py-2 border-b border-bolt-elements-borderColor">
        <GitBranchList
          branches={branches}
          currentBranch={status?.branch || 'main'}
          isLoading={isLoading}
          onCheckout={checkoutBranch}
          onCreate={createBranch}
          onDelete={deleteBranch}
          onRefresh={loadBranches}
        />

        {/* Ahead/Behind indicator */}
        {(status?.ahead || status?.behind) ? (
          <div className="flex items-center gap-2 mt-2 text-xs text-bolt-elements-textTertiary">
            {status.ahead > 0 && (
              <span className="flex items-center gap-1">
                <span className="i-ph:arrow-up" />
                {status.ahead} ahead
              </span>
            )}
            {status.behind > 0 && (
              <span className="flex items-center gap-1">
                <span className="i-ph:arrow-down" />
                {status.behind} behind
              </span>
            )}
          </div>
        ) : null}
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-bolt-elements-borderColor">
        <button
          onClick={() => setActiveTab('changes')}
          className={classNames(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'changes'
              ? 'text-bolt-elements-textPrimary border-b-2 border-purple-500'
              : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary'
          )}
        >
          Changes
          {(stagedCount + unstagedCount) > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
              {stagedCount + unstagedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={classNames(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'history'
              ? 'text-bolt-elements-textPrimary border-b-2 border-purple-500'
              : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary'
          )}
        >
          History
        </button>
        <button
          onClick={refreshStatus}
          disabled={isLoading}
          className="px-2 py-2 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
          title="Refresh"
        >
          <span className={classNames('i-ph:arrows-clockwise', isLoading ? 'animate-spin' : '')} />
        </button>
      </div>

      {/* Changes View */}
      {activeTab === 'changes' && (
        <>
          {/* Conflicts Warning */}
          {hasConflicts && (
            <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30">
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <span className="i-ph:warning-circle" />
                {status?.conflicts?.length} merge conflict(s)
              </div>
            </div>
          )}

          {/* Commit input */}
          <div className="px-3 py-2 border-b border-bolt-elements-borderColor">
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message"
              rows={2}
              className="w-full px-2 py-1.5 text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:border-purple-500 focus:outline-none text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary resize-none"
            />
            <div className="flex gap-1 mt-2">
              <button
                onClick={commit}
                disabled={isLoading || stagedCount === 0 || !commitMessage.trim()}
                className="flex-1 px-2 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-bolt-elements-background-depth-3 disabled:opacity-50 rounded text-white"
              >
                {isLoading ? (
                  <span className="i-ph:spinner animate-spin" />
                ) : (
                  `Commit (${stagedCount})`
                )}
              </button>
            </div>
          </div>

          {/* Staged Changes */}
          {stagedCount > 0 && (
            <div className="border-b border-bolt-elements-borderColor">
              <div className="flex items-center justify-between px-3 py-1.5 bg-bolt-elements-background-depth-2">
                <span className="text-xs font-medium text-green-400">
                  Staged Changes ({stagedCount})
                </span>
                <button
                  onClick={() => unstageFiles([])}
                  className="text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
                >
                  Unstage All
                </button>
              </div>
              <div className="max-h-32 overflow-auto">
                {status?.staged?.map((file) => (
                  <FileItem
                    key={file.path}
                    path={file.path}
                    status={file.status}
                    staged
                    onToggleStage={() => unstageFiles([file.path])}
                    onSelect={() => onFileSelect?.(file.path)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Unstaged Changes */}
          <div className="flex-1 overflow-auto">
            <div className="flex items-center justify-between px-3 py-1.5 bg-bolt-elements-background-depth-2 sticky top-0">
              <span className="text-xs font-medium text-bolt-elements-textSecondary">
                Changes ({unstagedCount})
              </span>
              {unstagedCount > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => stageFiles([])}
                    className="text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
                  >
                    Stage All
                  </button>
                  <button
                    onClick={() => {
                      const allPaths = [
                        ...(status?.unstaged?.map(f => f.path) || []),
                      ];
                      discardChanges(allPaths);
                    }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Discard All
                  </button>
                </div>
              )}
            </div>

            {unstagedCount === 0 ? (
              <div className="px-3 py-4 text-center text-bolt-elements-textTertiary text-xs">
                <span className="i-ph:check-circle text-green-500 text-lg block mb-1" />
                {stagedCount === 0 ? 'No changes' : 'All changes staged'}
              </div>
            ) : (
              <>
                {status?.unstaged?.map((file) => (
                  <FileItem
                    key={file.path}
                    path={file.path}
                    status={file.status}
                    staged={false}
                    onToggleStage={() => stageFiles([file.path])}
                    onSelect={() => onFileSelect?.(file.path)}
                    onDiscard={() => discardChanges([file.path])}
                  />
                ))}
                {status?.untracked?.map((path) => (
                  <FileItem
                    key={path}
                    path={path}
                    status="added"
                    staged={false}
                    untracked
                    onToggleStage={() => stageFiles([path])}
                    onSelect={() => onFileSelect?.(path)}
                  />
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* History View */}
      {activeTab === 'history' && (
        <GitHistory
          commits={commits}
          isLoading={isLoading}
          onLoadMore={() => {}} // TODO: implement pagination
          hasMore={false}
        />
      )}
    </div>
  );
});

GitPanel.displayName = 'GitPanel';

// File item component
interface FileItemProps {
  path: string;
  status: string;
  staged: boolean;
  untracked?: boolean;
  onToggleStage: () => void;
  onSelect: () => void;
  onDiscard?: () => void;
}

const FileItem = memo(({ path, status, staged, untracked, onToggleStage, onSelect, onDiscard }: FileItemProps) => {
  const fileName = path.split('/').pop() || path;
  const dirPath = path.substring(0, path.lastIndexOf('/')) || '';

  const statusColors: Record<string, string> = {
    added: 'text-green-400',
    modified: 'text-yellow-400',
    deleted: 'text-red-400',
    renamed: 'text-blue-400',
    copied: 'text-blue-400',
  };

  const statusIcons: Record<string, string> = {
    added: 'i-ph:plus',
    modified: 'i-ph:pencil',
    deleted: 'i-ph:trash',
    renamed: 'i-ph:arrow-right',
    copied: 'i-ph:copy',
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1 hover:bg-bolt-elements-background-depth-3 group">
      <button
        onClick={onToggleStage}
        className={classNames(
          'p-0.5 rounded hover:bg-bolt-elements-background-depth-4',
          staged ? 'text-green-400' : 'text-bolt-elements-textTertiary'
        )}
        title={staged ? 'Unstage' : 'Stage'}
      >
        <span className={staged ? 'i-ph:minus' : 'i-ph:plus'} />
      </button>
      <span className={classNames('text-xs', statusColors[status] || 'text-bolt-elements-textTertiary')}>
        <span className={statusIcons[status] || 'i-ph:file'} />
      </span>
      {untracked && (
        <span className="text-xs text-green-400/70">U</span>
      )}
      <button
        onClick={onSelect}
        className="flex-1 text-left truncate text-xs text-bolt-elements-textPrimary hover:underline"
        title={path}
      >
        {fileName}
        {dirPath && <span className="text-bolt-elements-textTertiary ml-1">{dirPath}</span>}
      </button>
      {!staged && onDiscard && (
        <button
          onClick={onDiscard}
          className="p-0.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 rounded"
          title="Discard changes"
        >
          <span className="i-ph:arrow-counter-clockwise text-xs" />
        </button>
      )}
    </div>
  );
});

FileItem.displayName = 'FileItem';

export default GitPanel;
