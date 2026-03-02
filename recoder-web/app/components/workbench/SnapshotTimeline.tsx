/**
 * SnapshotTimeline Component
 * Visual timeline of project snapshots with restore/compare functionality
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { 
  snapshotStore, 
  loadSnapshots, 
  createSnapshot, 
  restoreSnapshot,
  checkSnapshotStatus,
  getDiff,
  setAutoSave,
  selectSnapshot,
  type Snapshot,
  type SnapshotDiff
} from '~/lib/stores/snapshots';
import { workbenchStore } from '~/lib/stores/workbench';

interface SnapshotTimelineProps {
  projectId: string;
  className?: string;
  compact?: boolean;
}

export function SnapshotTimeline({ projectId, className = '', compact = false }: SnapshotTimelineProps) {
  const state = useStore(snapshotStore);
  const containerReady = useStore(workbenchStore.containerReady);
  const [showDiff, setShowDiff] = useState(false);
  const [selectedDiff, setSelectedDiff] = useState<SnapshotDiff | null>(null);
  const [snapshotMessage, setSnapshotMessage] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  // Load snapshots only when container is ready (prevents 404s)
  useEffect(() => {
    if (projectId && containerReady) {
      loadSnapshots(projectId);
      checkSnapshotStatus(projectId);
    }
  }, [projectId, containerReady]);

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get author label
  const getAuthorLabel = (author: string) => {
    switch (author) {
      case 'ai': return 'AI';
      case 'auto': return 'Auto';
      default: return 'User';
    }
  };

  // Get author color
  const getAuthorColor = (author: string) => {
    switch (author) {
      case 'ai': return 'text-purple-400';
      case 'auto': return 'text-recoder-elements-textSecondary';
      default: return 'text-blue-400';
    }
  };

  // Handle create snapshot
  const handleCreateSnapshot = async () => {
    if (!snapshotMessage.trim()) return;
    setIsCreating(true);
    await createSnapshot(projectId, snapshotMessage.trim(), 'user');
    setSnapshotMessage('');
    setIsCreating(false);
  };

  // Handle restore
  const handleRestore = async (snapshotId: string) => {
    if (confirmRestore === snapshotId) {
      await restoreSnapshot(projectId, snapshotId);
      setConfirmRestore(null);
    } else {
      setConfirmRestore(snapshotId);
      // Auto-clear confirmation after 3 seconds
      setTimeout(() => setConfirmRestore(null), 3000);
    }
  };

  // Handle view diff
  const handleViewDiff = async (snapshot: Snapshot) => {
    const idx = state.snapshots.indexOf(snapshot);
    if (idx < state.snapshots.length - 1) {
      const previousSnapshot = state.snapshots[idx + 1];
      const diff = await getDiff(projectId, previousSnapshot.id, snapshot.id);
      setSelectedDiff(diff);
      setShowDiff(true);
      selectSnapshot(snapshot.id);
    }
  };

  // Toggle auto-save
  const handleToggleAutoSave = () => {
    setAutoSave(projectId, !state.autoSaveEnabled);
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Quick snapshot button */}
        <button
          onClick={() => createSnapshot(projectId, 'Quick save', 'user')}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-background-depth-3
                     rounded transition-colors"
          title="Create snapshot"
        >
          <span>Save</span>
        </button>

        {/* Snapshot count */}
        {state.snapshots.length > 0 && (
          <span className="text-xs text-recoder-elements-textSecondary">
            {state.snapshots.length} snapshots
          </span>
        )}

        {/* Unsaved indicator */}
        {state.hasUnsavedChanges && (
          <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" title="Unsaved changes" />
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-recoder-elements-background-depth-1 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-recoder-elements-borderColor">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-recoder-elements-textPrimary">Snapshots</h3>
          {state.hasUnsavedChanges && (
            <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleAutoSave}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              state.autoSaveEnabled 
                ? 'bg-green-500/20 text-green-400'
                : 'bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-3'
            }`}
            title={state.autoSaveEnabled ? 'Auto-save enabled' : 'Enable auto-save'}
          >
            {state.autoSaveEnabled ? 'Auto' : 'Manual'}
          </button>
        </div>
      </div>

      {/* Create new snapshot */}
      <div className="p-3 border-b border-recoder-elements-borderColor">
        <div className="flex gap-2">
          <input
            type="text"
            value={snapshotMessage}
            onChange={(e) => setSnapshotMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateSnapshot()}
            placeholder="Snapshot message..."
            className="flex-1 px-3 py-2 text-sm bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded
                       focus:outline-none focus:border-blue-500 text-recoder-elements-textPrimary placeholder-recoder-elements-textTertiary"
          />
          <button
            onClick={handleCreateSnapshot}
            disabled={!snapshotMessage.trim() || isCreating}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 
                       disabled:bg-recoder-elements-background-depth-3 disabled:text-recoder-elements-textTertiary rounded transition-colors"
          >
            {isCreating ? '...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Error display */}
      {state.error && (
        <div className="p-3 bg-red-500/20 text-red-400 text-sm">
          {state.error}
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-auto p-3">
        {state.isLoading && state.snapshots.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-recoder-elements-textTertiary">
            Loading snapshots...
          </div>
        ) : state.snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-recoder-elements-textTertiary">
            <span>No snapshots yet</span>
            <span className="text-xs mt-1">Create your first snapshot above</span>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-recoder-elements-borderColor" />

            {/* Snapshot items */}
            {state.snapshots.map((snapshot, index) => (
              <div
                key={snapshot.id}
                className={`relative pl-10 pb-4 ${
                  index === 0 ? 'pt-0' : ''
                }`}
              >
                {/* Timeline dot */}
                <div
                  className={`absolute left-2.5 w-3 h-3 rounded-full border-2 ${
                    index === 0
                      ? 'bg-blue-500 border-blue-400'
                      : 'bg-recoder-elements-background-depth-2 border-recoder-elements-borderColor'
                  }`}
                />

                {/* Snapshot card */}
                <div
                  className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                    state.selectedSnapshot === snapshot.id
                      ? 'bg-recoder-elements-background-depth-2 border-blue-500'
                      : 'bg-recoder-elements-background-depth-2/50 border-recoder-elements-borderColor hover:border-recoder-elements-borderColor'
                  }`}
                  onClick={() => selectSnapshot(snapshot.id)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${getAuthorColor(snapshot.author)}`}>
                        {getAuthorLabel(snapshot.author)}
                      </span>
                      <span className="font-mono text-xs text-recoder-elements-textTertiary">
                        {snapshot.id}
                      </span>
                    </div>
                    <span className="text-xs text-recoder-elements-textTertiary">
                      {formatTime(snapshot.timestamp)}
                    </span>
                  </div>

                  {/* Message */}
                  <p className="text-sm text-recoder-elements-textPrimary mb-2 line-clamp-2">
                    {snapshot.message}
                  </p>

                  {/* Stats */}
                  {snapshot.filesChanged !== undefined && (
                    <div className="flex items-center gap-3 text-xs text-recoder-elements-textTertiary mb-2">
                      <span>{snapshot.filesChanged} files</span>
                      {snapshot.additions !== undefined && snapshot.additions > 0 && (
                        <span className="text-green-400">+{snapshot.additions}</span>
                      )}
                      {snapshot.deletions !== undefined && snapshot.deletions > 0 && (
                        <span className="text-red-400">-{snapshot.deletions}</span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-2">
                    {index > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(snapshot.id);
                        }}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          confirmRestore === snapshot.id
                            ? 'bg-red-500 text-white'
                            : 'bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary'
                        }`}
                      >
                        {confirmRestore === snapshot.id ? 'Confirm?' : 'Restore'}
                      </button>
                    )}
                    {index < state.snapshots.length - 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDiff(snapshot);
                        }}
                        className="px-2 py-1 text-xs bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-background-depth-3
                                   rounded transition-colors text-recoder-elements-textSecondary"
                      >
                        Diff
                      </button>
                    )}
                    {index === 0 && (
                      <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded">
                        Current
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Diff Modal */}
      {showDiff && selectedDiff && (
        <DiffModal
          diff={selectedDiff}
          onClose={() => {
            setShowDiff(false);
            setSelectedDiff(null);
          }}
        />
      )}
    </div>
  );
}

// Diff Modal Component
interface DiffModalProps {
  diff: SnapshotDiff;
  onClose: () => void;
}

function DiffModal({ diff, onClose }: DiffModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-recoder-elements-background-depth-1 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-recoder-elements-borderColor">
          <div>
            <h3 className="font-medium text-recoder-elements-textPrimary">Changes</h3>
            <p className="text-sm text-recoder-elements-textSecondary">
              {diff.summary.filesChanged} files • 
              <span className="text-green-400"> +{diff.summary.additions}</span>
              <span className="text-red-400"> -{diff.summary.deletions}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-recoder-elements-background-depth-2 rounded"
          >
            ✕
          </button>
        </div>

        {/* File list */}
        <div className="overflow-auto max-h-[60vh] p-4">
          {diff.files.length === 0 ? (
            <p className="text-recoder-elements-textTertiary text-center py-8">No changes</p>
          ) : (
            <div className="space-y-2">
              {diff.files.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between p-3 bg-recoder-elements-background-depth-2 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                      file.status === 'added' 
                        ? 'bg-green-500/20 text-green-400'
                        : file.status === 'deleted'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : 'M'}
                    </span>
                    <span className="text-sm text-recoder-elements-textPrimary font-mono truncate max-w-md">
                      {file.path}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">+{file.additions}</span>
                    <span className="text-red-400">-{file.deletions}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SnapshotTimeline;
