/**
 * GitPanel - VS Code style Source Control panel
 * Enhanced with local git support, branches, and commit history
 */

import { memo, useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { GitBranchList } from './GitBranchList';
import { GitHistory } from './GitHistory';
import { useGit } from '~/lib/hooks/useGit';

interface GitPanelProps {
  files: Record<string, unknown>;
  onFileSelect?: (filePath: string) => void;
  onShowDiff?: (filePath: string, original: string, modified: string) => void;
}

type TabView = 'changes' | 'history';

export const GitPanel = memo(({ files, onFileSelect, onShowDiff }: GitPanelProps) => {
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);

  const git = useGit({ autoFetch: true });

  const [commitMessage, setCommitMessage] = useState('');
  const [activeTab, setActiveTab] = useState<TabView>('changes');
  const [showGitHubConfig, setShowGitHubConfig] = useState(false);
  const [pushRejected, setPushRejected] = useState(false);
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

  // Load history when history tab is active
  useEffect(() => {
    if (activeTab === 'history' && git.isGitRepo) {
      git.getHistory();
    }
  }, [activeTab, git.isGitRepo]);

  // Fetch git state on mount
  useEffect(() => {
    if (git.isGitRepo && containerReady) {
      git.getGitState();
    }
  }, [git.isGitRepo, containerReady]);

  // Commit with local message state
  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) {
      toast.error('Please enter a commit message');
      return;
    }
    const success = await git.commit(commitMessage);
    if (success) {
      setCommitMessage('');
      if (activeTab === 'history') {
        git.getHistory();
      }
    }
  }, [commitMessage, git.commit, activeTab, git.getHistory]);

  // Push with auth error handling and rejection detection
  const handlePush = useCallback(async () => {
    setPushRejected(false);
    const success = await git.push({
      remote: 'origin',
      token: gitHubConfig?.accessToken,
      setUpstream: true,
    });
    if (!success) {
      setPushRejected(true);
      setShowGitHubConfig(true);
    }
  }, [git.push, gitHubConfig]);

  // Force push (safe, with lease)
  const handleForcePush = useCallback(async () => {
    if (!confirm('Force push (with lease)? This will overwrite remote changes.')) return;
    const success = await git.forcePush({
      remote: 'origin',
      token: gitHubConfig?.accessToken,
    });
    if (success) {
      setPushRejected(false);
    }
  }, [git.forcePush, gitHubConfig]);

  // Pull with auth error handling
  const handlePull = useCallback(async () => {
    const success = await git.pull({
      remote: 'origin',
      token: gitHubConfig?.accessToken,
    });
    if (!success) {
      setShowGitHubConfig(true);
    }
    if (success && activeTab === 'history') {
      git.getHistory();
    }
  }, [git.pull, gitHubConfig, activeTab, git.getHistory]);

  // Discard with confirmation
  const handleDiscard = useCallback(async (paths: string[]) => {
    if (!confirm(`Discard changes to ${paths.length} file(s)?`)) return;
    await git.discard(paths);
  }, [git.discard]);

  // Merge handler for branch list
  const handleMerge = useCallback(async (branch: string) => {
    await git.merge(branch);
    await git.getGitState();
  }, [git.merge, git.getGitState]);

  // Rename handler for branch list
  const handleRenameBranch = useCallback(async (oldName: string, newName: string) => {
    return git.renameBranch(oldName, newName);
  }, [git.renameBranch]);

  // Not a git repo
  if (git.isGitRepo === false) {
    return (
      <div className="flex flex-col h-full text-sm bg-recoder-elements-background-depth-1">
        <div className="p-4 text-center">
          <span className="i-ph:git-branch text-4xl text-purple-400 mb-3 block" />
          <h3 className="text-recoder-elements-textPrimary font-medium mb-2">
            No Git Repository
          </h3>
          <p className="text-recoder-elements-textTertiary text-xs mb-4">
            Initialize a git repository to track changes
          </p>
          <button
            onClick={git.initRepo}
            disabled={git.isLoading}
            className="px-4 py-2 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-white"
          >
            {git.isLoading ? (
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
  if (!containerReady || git.isGitRepo === null) {
    return (
      <div className="flex flex-col h-full justify-center items-center text-sm bg-recoder-elements-background-depth-1">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mb-2" />
        <span className="text-recoder-elements-textTertiary">
          {!containerReady ? 'Waiting for container...' : 'Loading git status...'}
        </span>
      </div>
    );
  }

  const stagedCount = git.status?.staged?.length || 0;
  const unstagedCount = (git.status?.unstaged?.length || 0) + (git.status?.untracked?.length || 0);
  const hasConflicts = (git.status?.conflicts?.length || 0) > 0;

  return (
    <div className="flex flex-col h-full text-sm bg-recoder-elements-background-depth-1">
      {/* Header with Branch Selector */}
      <div className="px-3 py-2 border-b border-recoder-elements-borderColor">
        <GitBranchList
          branches={git.branches}
          currentBranch={git.status?.branch || 'main'}
          isLoading={git.isLoading}
          onCheckout={git.checkout}
          onCreate={git.createBranch}
          onDelete={git.deleteBranch}
          onMerge={handleMerge}
          onRename={handleRenameBranch}
          onRefresh={git.getBranches}
        />

        {/* Ahead/Behind indicator */}
        {(git.status?.ahead || git.status?.behind) ? (
          <div className="flex items-center gap-2 mt-2 text-xs text-recoder-elements-textTertiary">
            {git.status.ahead > 0 && (
              <span className="flex items-center gap-1">
                <span className="i-ph:arrow-up" />
                {git.status.ahead} ahead
              </span>
            )}
            {git.status.behind > 0 && (
              <span className="flex items-center gap-1">
                <span className="i-ph:arrow-down" />
                {git.status.behind} behind
              </span>
            )}
          </div>
        ) : null}
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-recoder-elements-borderColor">
        <button
          onClick={() => setActiveTab('changes')}
          className={classNames(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'changes'
              ? 'text-recoder-elements-textPrimary border-b-2 border-purple-500'
              : 'text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary'
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
              ? 'text-recoder-elements-textPrimary border-b-2 border-purple-500'
              : 'text-recoder-elements-textTertiary hover:text-recoder-elements-textSecondary'
          )}
        >
          History
        </button>
        <button
          onClick={git.refreshStatus}
          disabled={git.isLoading}
          className="px-2 py-2 text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
          title="Refresh"
        >
          <span className={classNames('i-ph:arrows-clockwise', git.isLoading ? 'animate-spin' : '')} />
        </button>
      </div>

      {/* Changes View */}
      {activeTab === 'changes' && (
        <>
          {/* Git State Banner (merge/rebase in progress) */}
          {git.gitState && git.gitState.state !== 'clean' && (
            <div className="px-3 py-2 bg-orange-500/10 border-b border-orange-500/30">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-orange-400 text-xs font-medium">
                  <span className="i-ph:git-merge" />
                  {git.gitState.state === 'merging' && 'Merge in progress'}
                  {git.gitState.state === 'rebasing' && 'Rebase in progress'}
                  {git.gitState.state === 'cherry-picking' && 'Cherry-pick in progress'}
                </div>
                <div className="flex gap-1">
                  {(git.gitState.state === 'rebasing') && (
                    <>
                      <button
                        onClick={async () => { await git.rebaseContinue(); await git.getGitState(); }}
                        disabled={git.isLoading}
                        className="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-white"
                      >
                        Continue
                      </button>
                      <button
                        onClick={async () => { await git.rebaseAbort(); await git.getGitState(); }}
                        disabled={git.isLoading}
                        className="px-2 py-0.5 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-white"
                      >
                        Abort
                      </button>
                    </>
                  )}
                </div>
              </div>
              {git.gitState.conflictFiles && git.gitState.conflictFiles.length > 0 && (
                <div className="mt-1">
                  <div className="text-xs text-orange-300 mb-1">Conflicted files:</div>
                  {git.gitState.conflictFiles.map((file) => (
                    <button
                      key={file}
                      onClick={() => onFileSelect?.(file)}
                      className="block w-full text-left text-xs text-orange-200 hover:text-white hover:underline px-1 py-0.5 truncate"
                    >
                      {file}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Conflicts Warning (from status) */}
          {hasConflicts && (!git.gitState || git.gitState.state === 'clean') && (
            <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30">
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <span className="i-ph:warning-circle" />
                {git.status?.conflicts?.length} merge conflict(s)
              </div>
            </div>
          )}

          {/* Commit input */}
          <div className="px-3 py-2 border-b border-recoder-elements-borderColor">
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Commit message"
              rows={2}
              className="w-full px-2 py-1.5 text-xs bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor rounded focus:border-purple-500 focus:outline-none text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary resize-none"
            />
            <div className="flex gap-1 mt-2">
              <button
                onClick={handleCommit}
                disabled={git.isLoading || stagedCount === 0 || !commitMessage.trim()}
                className="flex-1 px-2 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-recoder-elements-background-depth-3 disabled:opacity-50 rounded text-white"
              >
                {git.isLoading ? (
                  <span className="i-ph:spinner animate-spin" />
                ) : (
                  `Commit (${stagedCount})`
                )}
              </button>
            </div>
            {/* Push / Pull buttons */}
            <div className="flex gap-1 mt-1">
              <button
                onClick={handlePull}
                disabled={git.isLoading}
                className="flex-1 px-2 py-1 text-xs bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary rounded border border-recoder-elements-borderColor disabled:opacity-50"
                title="Pull from remote"
              >
                <span className="i-ph:arrow-down mr-1" />
                Pull
              </button>
              <button
                onClick={handlePush}
                disabled={git.isLoading}
                className="flex-1 px-2 py-1 text-xs bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-background-depth-2 text-recoder-elements-textSecondary rounded border border-recoder-elements-borderColor disabled:opacity-50"
                title="Push to remote"
              >
                <span className="i-ph:arrow-up mr-1" />
                Push
              </button>
            </div>
            {/* Force push offer when normal push was rejected */}
            {pushRejected && (
              <button
                onClick={handleForcePush}
                disabled={git.isLoading}
                className="w-full mt-1 px-2 py-1 text-xs bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 rounded border border-orange-500/30 disabled:opacity-50"
                title="Force push with --force-with-lease (safe)"
              >
                <span className="i-ph:warning mr-1" />
                Force Push (safe)
              </button>
            )}
          </div>

          {/* Staged Changes */}
          {stagedCount > 0 && (
            <div className="border-b border-recoder-elements-borderColor">
              <div className="flex items-center justify-between px-3 py-1.5 bg-recoder-elements-background-depth-2">
                <span className="text-xs font-medium text-green-400">
                  Staged Changes ({stagedCount})
                </span>
                <button
                  onClick={() => git.unstageAll()}
                  className="text-xs text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
                >
                  Unstage All
                </button>
              </div>
              <div className="max-h-32 overflow-auto">
                {git.status?.staged?.map((file) => (
                  <FileItem
                    key={file.path}
                    path={file.path}
                    status={file.status}
                    staged
                    onToggleStage={() => git.unstage(file.path)}
                    onSelect={() => onFileSelect?.(file.path)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Unstaged Changes */}
          <div className="flex-1 overflow-auto">
            <div className="flex items-center justify-between px-3 py-1.5 bg-recoder-elements-background-depth-2 sticky top-0">
              <span className="text-xs font-medium text-recoder-elements-textSecondary">
                Changes ({unstagedCount})
              </span>
              {unstagedCount > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => git.stageAll()}
                    className="text-xs text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
                  >
                    Stage All
                  </button>
                  <button
                    onClick={() => {
                      const allPaths = [
                        ...(git.status?.unstaged?.map(f => f.path) || []),
                      ];
                      handleDiscard(allPaths);
                    }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Discard All
                  </button>
                </div>
              )}
            </div>

            {unstagedCount === 0 ? (
              <div className="px-3 py-4 text-center text-recoder-elements-textTertiary text-xs">
                <span className="i-ph:check-circle text-green-500 text-lg block mb-1" />
                {stagedCount === 0 ? 'No changes' : 'All changes staged'}
              </div>
            ) : (
              <>
                {git.status?.unstaged?.map((file) => (
                  <FileItem
                    key={file.path}
                    path={file.path}
                    status={file.status}
                    staged={false}
                    onToggleStage={() => git.stage(file.path)}
                    onSelect={() => onFileSelect?.(file.path)}
                    onDiscard={() => handleDiscard([file.path])}
                  />
                ))}
                {git.status?.untracked?.map((path) => (
                  <FileItem
                    key={path}
                    path={path}
                    status="added"
                    staged={false}
                    untracked
                    onToggleStage={() => git.stage(path)}
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
          commits={git.commits}
          isLoading={git.isLoading}
          onLoadMore={git.loadMoreHistory}
          hasMore={git.hasMoreHistory}
        />
      )}

      {/* GitHub Config Panel (inline) */}
      {showGitHubConfig && (
        <div className="border-t border-recoder-elements-borderColor p-3 bg-recoder-elements-background-depth-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-recoder-elements-textPrimary">
              <span className="i-ph:github-logo mr-1" />
              GitHub Remote
            </span>
            <button
              onClick={() => setShowGitHubConfig(false)}
              className="text-xs text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary"
            >
              <span className="i-ph:x" />
            </button>
          </div>
          <input
            type="text"
            placeholder="owner/repo"
            value={gitHubConfig ? `${gitHubConfig.owner}/${gitHubConfig.repo}` : ''}
            onChange={(e) => {
              const [owner = '', repo = ''] = e.target.value.split('/');
              const config = { owner, repo, branch: gitHubConfig?.branch || 'main', accessToken: gitHubConfig?.accessToken || '' };
              setGitHubConfig(config);
              localStorage.setItem('recoder-git-config', JSON.stringify(config));
            }}
            className="w-full px-2 py-1 text-xs bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor rounded mb-1 text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary"
          />
          <input
            type="password"
            placeholder="GitHub token (ghp_...)"
            value={gitHubConfig?.accessToken || ''}
            onChange={(e) => {
              const config = { owner: gitHubConfig?.owner || '', repo: gitHubConfig?.repo || '', branch: gitHubConfig?.branch || 'main', accessToken: e.target.value };
              setGitHubConfig(config);
              localStorage.setItem('recoder-git-config', JSON.stringify(config));
            }}
            className="w-full px-2 py-1 text-xs bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor rounded mb-2 text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary"
          />
          <button
            onClick={async () => {
              if (!gitHubConfig?.owner || !gitHubConfig?.repo) return;
              const url = `https://github.com/${gitHubConfig.owner}/${gitHubConfig.repo}.git`;
              const success = await git.setRemote('origin', url);
              if (success) {
                toast.success('Remote configured');
                setShowGitHubConfig(false);
              }
            }}
            disabled={!gitHubConfig?.owner || !gitHubConfig?.repo}
            className="w-full px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-white"
          >
            Save Remote
          </button>
        </div>
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
    <div className="flex items-center gap-1 px-3 py-1 hover:bg-recoder-elements-background-depth-3 group">
      <button
        onClick={onToggleStage}
        className={classNames(
          'p-0.5 rounded hover:bg-recoder-elements-background-depth-4',
          staged ? 'text-green-400' : 'text-recoder-elements-textTertiary'
        )}
        title={staged ? 'Unstage' : 'Stage'}
      >
        <span className={staged ? 'i-ph:minus' : 'i-ph:plus'} />
      </button>
      <span className={classNames('text-xs', statusColors[status] || 'text-recoder-elements-textTertiary')}>
        <span className={statusIcons[status] || 'i-ph:file'} />
      </span>
      {untracked && (
        <span className="text-xs text-green-400/70">U</span>
      )}
      <button
        onClick={onSelect}
        className="flex-1 text-left truncate text-xs text-recoder-elements-textPrimary hover:underline"
        title={path}
      >
        {fileName}
        {dirPath && <span className="text-recoder-elements-textTertiary ml-1">{dirPath}</span>}
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
