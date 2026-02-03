/**
 * VersionHistoryPanel Component
 * Full-featured version history UI with two views:
 *   1. Snapshots - automatic snapshots created by AI/auto-save
 *   2. Git Commits - raw git commit history from the container
 *
 * Both views support restoring to a previous version.
 * Connects to docker-backend git endpoints for commit history.
 */

import { memo, useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { useVersions, type Version, type VersionDiff } from '~/lib/hooks/useVersions';
import { dockerGet, dockerPost } from '~/lib/services/docker-api';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

// ============================================
// Types
// ============================================

type ViewTab = 'snapshots' | 'commits';

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  timestamp: number;
}

interface VersionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================
// Sub-components
// ============================================

/** Renders a single diff line with syntax coloring */
function DiffLine({ line, index }: { line: string; index: number }) {
  let lineClass = 'text-bolt-elements-textSecondary';
  if (line.startsWith('+') && !line.startsWith('+++')) {
    lineClass = 'text-green-400 bg-green-500/10';
  } else if (line.startsWith('-') && !line.startsWith('---')) {
    lineClass = 'text-red-400 bg-red-500/10';
  } else if (line.startsWith('@@')) {
    lineClass = 'text-blue-400';
  }
  return (
    <div key={index} className={classNames('px-2', lineClass)}>
      {line || ' '}
    </div>
  );
}

/** Tab button in the sidebar header */
function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={classNames(
        'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
        active
          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
          : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 border border-transparent'
      )}
    >
      <span className={icon} />
      {label}
    </button>
  );
}

// ============================================
// Main Component
// ============================================

export const VersionHistoryPanel = memo(function VersionHistoryPanel({
  isOpen,
  onClose,
}: VersionHistoryPanelProps) {
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);

  // Active tab
  const [activeTab, setActiveTab] = useState<ViewTab>('commits');

  // ---- Snapshot-based state (existing useVersions hook) ----
  const {
    versions,
    loading: snapshotLoading,
    error: snapshotError,
    selectedVersion,
    selectedDiff,
    diffLoading,
    isRestoring: snapshotRestoring,
    refreshVersions,
    restoreVersion,
    selectVersion,
    getFileDiffContent,
  } = useVersions(projectId);

  // ---- Git commit-based state ----
  const [gitCommits, setGitCommits] = useState<GitCommit[]>([]);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [commitReverting, setCommitReverting] = useState<string | null>(null);
  const [confirmRevertHash, setConfirmRevertHash] = useState<string | null>(null);

  // ---- Shared state ----
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [fileDiffs, setFileDiffs] = useState<Record<string, string>>({});
  const [loadingDiffs, setLoadingDiffs] = useState<Set<string>>(new Set());

  // ============================================
  // Git commit operations
  // ============================================

  const fetchGitCommits = useCallback(async () => {
    if (!projectId || !containerReady) return;
    setGitLoading(true);
    setGitError(null);
    try {
      const data = await dockerGet<{ commits: GitCommit[] }>(
        `/api/git/${encodeURIComponent(projectId)}/log?limit=50`
      );
      setGitCommits(data.commits || []);
    } catch (err: any) {
      const message = err?.message || 'Failed to load git history';
      setGitError(message);
      console.error('[VersionHistory] Git log error:', err);
    } finally {
      setGitLoading(false);
    }
  }, [projectId, containerReady]);

  const handleRevertToCommit = useCallback(async (commit: GitCommit) => {
    if (!projectId || commitReverting) return;

    // Two-click confirmation
    if (confirmRevertHash === commit.hash) {
      setCommitReverting(commit.hash);
      setConfirmRevertHash(null);
      try {
        await dockerPost(`/api/snapshot/${encodeURIComponent(projectId)}/restore`, {
          snapshotId: commit.hash,
        });
        toast.success(`Restored to: ${commit.message}`);
        // Refresh file tree and commits
        workbenchStore.refreshFiles?.();
        await fetchGitCommits();
        setSelectedCommit(null);
        onClose();
      } catch (err: any) {
        console.error('[VersionHistory] Revert error:', err);
        toast.error(err?.message || 'Failed to revert to selected commit');
      } finally {
        setCommitReverting(null);
      }
    } else {
      setConfirmRevertHash(commit.hash);
      // Auto-clear confirmation after 3 seconds
      setTimeout(() => setConfirmRevertHash(null), 3000);
    }
  }, [projectId, commitReverting, confirmRevertHash, fetchGitCommits, onClose]);

  // ============================================
  // Snapshot operations (preserved from original)
  // ============================================

  const handleSnapshotRestore = useCallback(async (version: Version) => {
    if (confirmRestore === version.id) {
      await restoreVersion(version.id);
      setConfirmRestore(null);
      onClose();
    } else {
      setConfirmRestore(version.id);
      setTimeout(() => setConfirmRestore(null), 3000);
    }
  }, [confirmRestore, restoreVersion, onClose]);

  const toggleFileDiff = useCallback(async (filePath: string) => {
    const newExpanded = new Set(expandedFiles);

    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath);
    } else {
      newExpanded.add(filePath);

      if (!fileDiffs[filePath] && selectedVersion) {
        setLoadingDiffs(prev => new Set([...prev, filePath]));
        const diff = await getFileDiffContent(selectedVersion.id, filePath);
        if (diff) {
          setFileDiffs(prev => ({ ...prev, [filePath]: diff }));
        }
        setLoadingDiffs(prev => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
      }
    }

    setExpandedFiles(newExpanded);
  }, [expandedFiles, fileDiffs, selectedVersion, getFileDiffContent]);

  // ============================================
  // Utility functions
  // ============================================

  const formatTime = useCallback((timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const formatDate = useCallback((dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const diff = Date.now() - date.getTime();
      if (diff < 60000) return 'just now';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }, []);

  const getAuthorBadge = useCallback((author: string) => {
    switch (author) {
      case 'ai':
        return {
          label: 'AI',
          className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
          icon: 'i-ph:robot',
        };
      case 'auto':
        return {
          label: 'Auto',
          className: 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary border-bolt-elements-borderColor',
          icon: 'i-ph:clock',
        };
      default:
        return {
          label: 'User',
          className: 'bg-green-500/20 text-green-400 border-green-500/30',
          icon: 'i-ph:user',
        };
    }
  }, []);

  const getStatusStyle = useCallback((status: string) => {
    switch (status) {
      case 'added':
        return { icon: 'i-ph:plus-circle', color: 'text-green-400' };
      case 'deleted':
        return { icon: 'i-ph:minus-circle', color: 'text-red-400' };
      case 'modified':
      default:
        return { icon: 'i-ph:pencil-circle', color: 'text-yellow-400' };
    }
  }, []);

  // ============================================
  // Effects
  // ============================================

  // Fetch git commits when the panel opens or tab switches to commits
  useEffect(() => {
    if (isOpen && activeTab === 'commits' && projectId && containerReady) {
      fetchGitCommits();
    }
  }, [isOpen, activeTab, projectId, containerReady, fetchGitCommits]);

  // Clear selection when switching tabs
  useEffect(() => {
    setSelectedCommit(null);
    setConfirmRevertHash(null);
    setConfirmRestore(null);
    setExpandedFiles(new Set());
    setFileDiffs({});
  }, [activeTab]);

  // ============================================
  // Derived values
  // ============================================

  const isLoading = activeTab === 'snapshots' ? snapshotLoading : gitLoading;
  const errorMessage = activeTab === 'snapshots' ? snapshotError : gitError;
  const itemCount = activeTab === 'snapshots' ? versions.length : gitCommits.length;
  const isRestoring = activeTab === 'snapshots' ? snapshotRestoring : commitReverting !== null;

  const handleRefresh = useCallback(() => {
    if (activeTab === 'snapshots') {
      refreshVersions();
    } else {
      fetchGitCommits();
    }
  }, [activeTab, refreshVersions, fetchGitCommits]);

  if (!isOpen) return null;

  // ============================================
  // Render helpers
  // ============================================

  /** Render the snapshot list (left sidebar) */
  function renderSnapshotList() {
    if (snapshotLoading && versions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textTertiary">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mb-3" />
          <span className="text-sm">Loading snapshots...</span>
        </div>
      );
    }

    if (snapshotError) {
      return (
        <div className="p-4 text-center text-red-400 text-sm">
          <span className="i-ph:warning-circle text-2xl mb-2 block" />
          {snapshotError}
        </div>
      );
    }

    if (versions.length === 0) {
      return (
        <div className="p-6 text-center text-bolt-elements-textTertiary">
          <span className="i-ph:clock-counter-clockwise text-4xl mb-3 block opacity-50" />
          <p className="text-sm">No snapshots yet</p>
          <p className="text-xs mt-1 opacity-75">
            Snapshots are created automatically when AI makes changes
          </p>
        </div>
      );
    }

    return (
      <div className="py-2">
        {versions.map((version, index) => {
          const authorBadge = getAuthorBadge(version.author);
          const isSelected = selectedVersion?.id === version.id;
          const isCurrent = version.isCurrent;

          return (
            <button
              key={version.id}
              onClick={() => selectVersion(version)}
              className={classNames(
                'w-full text-left px-4 py-3 transition-colors border-l-2',
                isSelected
                  ? 'bg-orange-500/10 border-l-orange-500'
                  : 'border-l-transparent hover:bg-bolt-elements-background-depth-2',
                isCurrent && !isSelected && 'bg-blue-500/5'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Timeline dot */}
                <div className="flex flex-col items-center pt-1">
                  <div
                    className={classNames(
                      'w-3 h-3 rounded-full border-2',
                      isCurrent
                        ? 'bg-blue-500 border-blue-400'
                        : 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor'
                    )}
                  />
                  {index < versions.length - 1 && (
                    <div className="w-0.5 h-8 bg-bolt-elements-borderColor mt-1" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isCurrent && (
                      <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded border border-blue-500/30">
                        Current
                      </span>
                    )}
                    <span
                      className={classNames(
                        'px-1.5 py-0.5 text-xs rounded border flex items-center gap-1',
                        authorBadge.className
                      )}
                    >
                      <span className={authorBadge.icon} />
                      {authorBadge.label}
                    </span>
                  </div>

                  <p className="text-sm text-bolt-elements-textPrimary truncate font-medium">
                    {version.message || 'Snapshot'}
                  </p>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-bolt-elements-textTertiary font-mono">
                      {version.id}
                    </span>
                    <span className="text-xs text-bolt-elements-textTertiary">
                      {formatTime(version.timestamp)}
                    </span>
                  </div>

                  {(version.filesChanged !== undefined || version.additions !== undefined) && (
                    <div className="flex items-center gap-2 mt-1.5 text-xs">
                      {version.filesChanged !== undefined && (
                        <span className="text-bolt-elements-textTertiary">
                          {version.filesChanged} file{version.filesChanged !== 1 ? 's' : ''}
                        </span>
                      )}
                      {version.additions !== undefined && version.additions > 0 && (
                        <span className="text-green-400">+{version.additions}</span>
                      )}
                      {version.deletions !== undefined && version.deletions > 0 && (
                        <span className="text-red-400">-{version.deletions}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  /** Render the git commits list (left sidebar) */
  function renderGitCommitsList() {
    if (gitLoading && gitCommits.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textTertiary">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mb-3" />
          <span className="text-sm">Loading commits...</span>
        </div>
      );
    }

    if (gitError) {
      return (
        <div className="p-4 text-center text-red-400 text-sm">
          <span className="i-ph:warning-circle text-2xl mb-2 block" />
          {gitError}
        </div>
      );
    }

    if (gitCommits.length === 0) {
      return (
        <div className="p-6 text-center text-bolt-elements-textTertiary">
          <span className="i-ph:git-commit text-4xl mb-3 block opacity-50" />
          <p className="text-sm">No git commits yet</p>
          <p className="text-xs mt-1 opacity-75">
            Commits appear here as changes are made to the project
          </p>
        </div>
      );
    }

    return (
      <div className="py-2">
        {gitCommits.map((commit, index) => {
          const isSelected = selectedCommit?.hash === commit.hash;
          const isCurrent = index === 0;

          return (
            <button
              key={commit.hash}
              onClick={() => setSelectedCommit(commit)}
              className={classNames(
                'w-full text-left px-4 py-3 transition-colors border-l-2',
                isSelected
                  ? 'bg-orange-500/10 border-l-orange-500'
                  : 'border-l-transparent hover:bg-bolt-elements-background-depth-2',
                isCurrent && !isSelected && 'bg-blue-500/5'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Timeline dot */}
                <div className="flex flex-col items-center pt-1">
                  <div
                    className={classNames(
                      'w-3 h-3 rounded-full border-2',
                      isCurrent
                        ? 'bg-blue-500 border-blue-400'
                        : 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor'
                    )}
                  />
                  {index < gitCommits.length - 1 && (
                    <div className="w-0.5 h-8 bg-bolt-elements-borderColor mt-1" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isCurrent && (
                      <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded border border-blue-500/30">
                        HEAD
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-bolt-elements-textPrimary truncate font-medium">
                    {commit.message || 'No message'}
                  </p>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-bolt-elements-textTertiary font-mono">
                      {commit.shortHash}
                    </span>
                    <span className="text-xs text-bolt-elements-textTertiary">
                      {formatDate(commit.date)}
                    </span>
                  </div>

                  {commit.author && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-bolt-elements-textTertiary">
                      <span className="i-ph:user text-[10px]" />
                      <span>{commit.author}</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  /** Render the details panel for a selected snapshot (right side) */
  function renderSnapshotDetails() {
    if (!selectedVersion) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-bolt-elements-textTertiary p-6">
          <span className="i-ph:clock-counter-clockwise text-6xl mb-4 opacity-30" />
          <p className="text-lg font-medium text-bolt-elements-textSecondary">
            Select a snapshot to view details
          </p>
          <p className="text-sm mt-2 text-center max-w-md">
            Click on a snapshot in the list to see what files were changed and preview the
            differences. You can restore any previous version with one click.
          </p>
        </div>
      );
    }

    return (
      <>
        {/* Selected Version Header */}
        <div className="px-5 py-4 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-semibold text-bolt-elements-textPrimary truncate">
                {selectedVersion.message || 'Snapshot'}
              </span>
              {selectedVersion.isCurrent && (
                <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full shrink-0">
                  Current Version
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-bolt-elements-textTertiary">
              <span className="font-mono">{selectedVersion.fullHash || selectedVersion.id}</span>
              <span>{formatTime(selectedVersion.timestamp)}</span>
              <span
                className={classNames(
                  'px-1.5 py-0.5 text-xs rounded',
                  getAuthorBadge(selectedVersion.author).className
                )}
              >
                {getAuthorBadge(selectedVersion.author).label}
              </span>
            </div>
          </div>

          {!selectedVersion.isCurrent && (
            <button
              onClick={() => handleSnapshotRestore(selectedVersion)}
              disabled={snapshotRestoring}
              className={classNames(
                'px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 shrink-0 ml-4',
                confirmRestore === selectedVersion.id
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              )}
            >
              {snapshotRestoring ? (
                <>
                  <span className="i-ph:spinner animate-spin" />
                  Restoring...
                </>
              ) : confirmRestore === selectedVersion.id ? (
                <>
                  <span className="i-ph:warning" />
                  Click to Confirm
                </>
              ) : (
                <>
                  <span className="i-ph:arrow-counter-clockwise" />
                  Restore This Version
                </>
              )}
            </button>
          )}
        </div>

        {/* Changed Files */}
        <div className="flex-1 overflow-auto p-4">
          {selectedVersion.isCurrent ? (
            <div className="h-full flex flex-col items-center justify-center text-bolt-elements-textTertiary">
              <span className="i-ph:check-circle text-5xl text-green-500 mb-3" />
              <p className="text-lg font-medium text-bolt-elements-textSecondary">
                This is the current version
              </p>
              <p className="text-sm mt-1">Select a previous version to see changes and restore</p>
            </div>
          ) : diffLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-bolt-elements-textTertiary">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500 mb-3" />
              <span>Loading changes...</span>
            </div>
          ) : selectedDiff ? (
            <div className="space-y-2">
              {/* Summary */}
              <div className="flex items-center gap-4 px-4 py-3 bg-bolt-elements-background-depth-2 rounded-lg mb-4">
                <div className="flex items-center gap-2">
                  <span className="i-ph:files text-lg text-bolt-elements-textSecondary" />
                  <span className="text-sm text-bolt-elements-textPrimary font-medium">
                    {selectedDiff.summary.filesChanged} file
                    {selectedDiff.summary.filesChanged !== 1 ? 's' : ''} changed
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-green-400 flex items-center gap-1">
                    <span className="i-ph:plus" />
                    {selectedDiff.summary.additions} additions
                  </span>
                  <span className="text-red-400 flex items-center gap-1">
                    <span className="i-ph:minus" />
                    {selectedDiff.summary.deletions} deletions
                  </span>
                </div>
              </div>

              {/* File List */}
              {selectedDiff.files.map((file) => {
                const statusStyle = getStatusStyle(file.status);
                const isExpanded = expandedFiles.has(file.path);
                const isDiffLoading = loadingDiffs.has(file.path);

                return (
                  <div
                    key={file.path}
                    className="border border-bolt-elements-borderColor rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleFileDiff(file.path)}
                      className="w-full px-4 py-3 flex items-center gap-3 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 transition-colors"
                    >
                      <span className={classNames(statusStyle.icon, statusStyle.color)} />
                      <span className="flex-1 text-left text-sm text-bolt-elements-textPrimary font-mono truncate">
                        {file.path}
                      </span>
                      <div className="flex items-center gap-2 text-xs">
                        {file.additions > 0 && (
                          <span className="text-green-400">+{file.additions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span className="text-red-400">-{file.deletions}</span>
                        )}
                      </div>
                      <span
                        className={classNames(
                          'i-ph:caret-down transition-transform',
                          isExpanded ? 'rotate-180' : ''
                        )}
                      />
                    </button>

                    {isExpanded && (
                      <div className="border-t border-bolt-elements-borderColor">
                        {isDiffLoading ? (
                          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
                            <span className="i-ph:spinner animate-spin mr-2" />
                            Loading diff...
                          </div>
                        ) : fileDiffs[file.path] ? (
                          <pre className="p-4 text-xs font-mono overflow-auto max-h-96 bg-bolt-elements-background-depth-1">
                            {fileDiffs[file.path].split('\n').map((line, i) => (
                              <DiffLine key={i} line={line} index={i} />
                            ))}
                          </pre>
                        ) : file.diff ? (
                          <pre className="p-4 text-xs font-mono overflow-auto max-h-96 bg-bolt-elements-background-depth-1">
                            {file.diff.split('\n').map((line, i) => (
                              <DiffLine key={i} line={line} index={i} />
                            ))}
                          </pre>
                        ) : (
                          <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
                            No diff available
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-bolt-elements-textTertiary">
              <span className="i-ph:file-search text-4xl mb-3 opacity-50" />
              <p className="text-sm">No changes to display</p>
            </div>
          )}
        </div>
      </>
    );
  }

  /** Render the details panel for a selected git commit (right side) */
  function renderCommitDetails() {
    if (!selectedCommit) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-bolt-elements-textTertiary p-6">
          <span className="i-ph:git-commit text-6xl mb-4 opacity-30" />
          <p className="text-lg font-medium text-bolt-elements-textSecondary">
            Select a commit to view details
          </p>
          <p className="text-sm mt-2 text-center max-w-md">
            Click on a commit in the list to view its details. You can restore your project to any
            previous commit.
          </p>
        </div>
      );
    }

    const isCurrent = gitCommits.length > 0 && gitCommits[0].hash === selectedCommit.hash;

    return (
      <>
        {/* Selected Commit Header */}
        <div className="px-5 py-4 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-semibold text-bolt-elements-textPrimary truncate">
                {selectedCommit.message || 'No message'}
              </span>
              {isCurrent && (
                <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full shrink-0">
                  HEAD
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-bolt-elements-textTertiary flex-wrap">
              <span className="font-mono">{selectedCommit.hash}</span>
              <span>{formatDate(selectedCommit.date)}</span>
              {selectedCommit.author && (
                <span className="flex items-center gap-1">
                  <span className="i-ph:user text-xs" />
                  {selectedCommit.author}
                </span>
              )}
            </div>
          </div>

          {!isCurrent && (
            <button
              onClick={() => handleRevertToCommit(selectedCommit)}
              disabled={commitReverting !== null}
              className={classNames(
                'px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 shrink-0 ml-4',
                confirmRevertHash === selectedCommit.hash
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              )}
            >
              {commitReverting === selectedCommit.hash ? (
                <>
                  <span className="i-ph:spinner animate-spin" />
                  Restoring...
                </>
              ) : confirmRevertHash === selectedCommit.hash ? (
                <>
                  <span className="i-ph:warning" />
                  Click to Confirm
                </>
              ) : (
                <>
                  <span className="i-ph:arrow-counter-clockwise" />
                  Restore This Commit
                </>
              )}
            </button>
          )}
        </div>

        {/* Commit Content */}
        <div className="flex-1 overflow-auto p-4">
          {isCurrent ? (
            <div className="h-full flex flex-col items-center justify-center text-bolt-elements-textTertiary">
              <span className="i-ph:check-circle text-5xl text-green-500 mb-3" />
              <p className="text-lg font-medium text-bolt-elements-textSecondary">
                This is the current commit (HEAD)
              </p>
              <p className="text-sm mt-1">
                Select a previous commit to restore your project to that state
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Commit Info Card */}
              <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-4">
                <h4 className="text-sm font-medium text-bolt-elements-textSecondary mb-3 flex items-center gap-2">
                  <span className="i-ph:info" />
                  Commit Details
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="text-bolt-elements-textTertiary w-16 shrink-0">Hash</span>
                    <span className="text-bolt-elements-textPrimary font-mono text-xs break-all">
                      {selectedCommit.hash}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-bolt-elements-textTertiary w-16 shrink-0">Message</span>
                    <span className="text-bolt-elements-textPrimary">
                      {selectedCommit.message}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-bolt-elements-textTertiary w-16 shrink-0">Author</span>
                    <span className="text-bolt-elements-textPrimary">
                      {selectedCommit.author}
                      {selectedCommit.authorEmail && (
                        <span className="text-bolt-elements-textTertiary ml-1">
                          &lt;{selectedCommit.authorEmail}&gt;
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-bolt-elements-textTertiary w-16 shrink-0">Date</span>
                    <span className="text-bolt-elements-textPrimary">{selectedCommit.date}</span>
                  </div>
                </div>
              </div>

              {/* Restore Warning */}
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="i-ph:warning text-yellow-400 text-lg shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-400">Restore Warning</p>
                    <p className="text-xs text-bolt-elements-textTertiary mt-1">
                      Restoring to this commit will reset all files to their state at this point in
                      history. Any uncommitted changes will be lost. A backup snapshot is created
                      automatically before restoring.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  // ============================================
  // Main Render
  // ============================================

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-bolt-elements-background-depth-2 rounded-xl shadow-2xl w-[95%] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-bolt-elements-borderColor">
        {/* Header */}
        <div className="px-5 py-4 bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <span className="i-ph:clock-counter-clockwise text-xl text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
                Version History
              </h2>
              <p className="text-sm text-bolt-elements-textTertiary">
                {itemCount} {activeTab === 'snapshots' ? 'snapshot' : 'commit'}
                {itemCount !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 hover:bg-bolt-elements-background-depth-3 rounded-lg transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              title="Refresh"
            >
              <span
                className={classNames(
                  'i-ph:arrows-clockwise text-lg',
                  isLoading ? 'animate-spin' : ''
                )}
              />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-bolt-elements-background-depth-3 rounded-lg transition-colors text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
            >
              <span className="i-ph:x text-xl" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Sidebar - Version/Commit List */}
          <div className="w-80 border-r border-bolt-elements-borderColor flex flex-col bg-bolt-elements-background-depth-1">
            {/* Tab Switcher */}
            <div className="px-3 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
              <div className="flex gap-1">
                <TabButton
                  active={activeTab === 'commits'}
                  icon="i-ph:git-commit"
                  label="Git Commits"
                  onClick={() => setActiveTab('commits')}
                />
                <TabButton
                  active={activeTab === 'snapshots'}
                  icon="i-ph:camera"
                  label="Snapshots"
                  onClick={() => setActiveTab('snapshots')}
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto">
              {activeTab === 'snapshots' ? renderSnapshotList() : renderGitCommitsList()}
            </div>
          </div>

          {/* Right Panel - Details */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeTab === 'snapshots' ? renderSnapshotDetails() : renderCommitDetails()}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor flex items-center justify-between">
          <p className="text-xs text-bolt-elements-textTertiary">
            <span className="i-ph:info mr-1" />
            {activeTab === 'snapshots'
              ? 'Snapshots are created automatically when AI makes changes to your project'
              : 'Git commits show the full history of changes inside the container'}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

export default VersionHistoryPanel;
