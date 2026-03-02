/**
 * SnapshotBar Component
 * Compact snapshot controls for the workbench header
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useStore } from '@nanostores/react';
import { 
  snapshotStore, 
  createSnapshot, 
  restoreSnapshot,
  loadSnapshots,
  checkSnapshotStatus,
  type Snapshot 
} from '~/lib/stores/snapshots';
import { workbenchStore } from '~/lib/stores/workbench';

interface SnapshotBarProps {
  projectId: string;
  className?: string;
}

export const SnapshotBar = memo(function SnapshotBar({ projectId, className = '' }: SnapshotBarProps) {
  const state = useStore(snapshotStore);
  const containerReady = useStore(workbenchStore.containerReady);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load snapshots only when container is ready (prevents 404s before container exists)
  useEffect(() => {
    if (projectId && containerReady) {
      loadSnapshots(projectId);
      checkSnapshotStatus(projectId);
    }
  }, [projectId, containerReady]);

  // Periodically check for unsaved changes (only when container is ready)
  useEffect(() => {
    if (!projectId || !containerReady) return;
    const interval = setInterval(() => {
      checkSnapshotStatus(projectId);
    }, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [projectId, containerReady]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setConfirmRestore(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // PERFORMANCE: Memoize quick save handler
  const handleQuickSave = useCallback(async () => {
    setIsCreating(true);
    await createSnapshot(projectId, 'Quick save', 'user');
    setIsCreating(false);
  }, [projectId]);

  // PERFORMANCE: Memoize restore handler
  const handleRestore = useCallback(async (snapshot: Snapshot) => {
    if (confirmRestore === snapshot.id) {
      await restoreSnapshot(projectId, snapshot.id);
      setConfirmRestore(null);
      setShowDropdown(false);
    } else {
      setConfirmRestore(snapshot.id);
      setTimeout(() => setConfirmRestore(null), 3000);
    }
  }, [confirmRestore, projectId]);

  // PERFORMANCE: Memoize dropdown toggle
  const toggleDropdown = useCallback(() => {
    setShowDropdown(prev => !prev);
  }, []);

  // Format time
  const formatTime = useCallback((timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, []);

  const getAuthorLabel = useCallback((author: string) => {
    switch (author) {
      case 'ai': return 'AI';
      case 'auto': return 'Auto';
      default: return 'User';
    }
  }, []);

  return (
    <div className={`relative flex items-center gap-1 ${className}`} ref={dropdownRef}>
      {/* Quick save button */}
      <button
        onClick={handleQuickSave}
        disabled={isCreating}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
                   ${state.hasUnsavedChanges 
                     ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                     : 'bg-recoder-elements-background-depth-3/50 text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-3'}`}
        title={state.hasUnsavedChanges ? 'Save snapshot (unsaved changes)' : 'Create snapshot'}
      >
        {isCreating ? (
          <span className="animate-spin text-xs">...</span>
        ) : (
          <span className="text-xs">Save</span>
        )}
        {state.hasUnsavedChanges && (
          <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
        )}
      </button>

      {/* Dropdown toggle */}
      <button
        onClick={toggleDropdown}
        className="flex items-center gap-1 px-2 py-1 text-xs bg-recoder-elements-background-depth-3/50
                   hover:bg-recoder-elements-background-depth-3 rounded transition-colors text-recoder-elements-textSecondary"
        title="View snapshots"
      >
        <span>{state.snapshots.length}</span>
        <span className={`transform transition-transform ${showDropdown ? 'rotate-180' : ''}`}>
          v
        </span>
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-recoder-elements-background-depth-3 border border-recoder-elements-borderColor
                        rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-recoder-elements-borderColor bg-recoder-elements-background-depth-3/80">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-recoder-elements-textPrimary">Snapshots</span>
              {state.currentSnapshot && (
                <span className="text-xs text-recoder-elements-textTertiary">
                  Current: {state.currentSnapshot.id}
                </span>
              )}
            </div>
          </div>

          {/* Snapshot list */}
          <div className="max-h-64 overflow-auto">
            {state.snapshots.length === 0 ? (
              <div className="p-4 text-center text-recoder-elements-textTertiary text-sm">
                No snapshots yet
              </div>
            ) : (
              state.snapshots.slice(0, 10).map((snapshot, index) => (
                <div
                  key={snapshot.id}
                  className={`flex items-center justify-between px-3 py-2 hover:bg-recoder-elements-background-depth-3/50
                             border-b border-recoder-elements-borderColor/50 last:border-0 ${
                               index === 0 ? 'bg-blue-500/10' : ''
                             }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-recoder-elements-textTertiary">{getAuthorLabel(snapshot.author)}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-recoder-elements-textPrimary truncate max-w-36">
                        {snapshot.message}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-recoder-elements-textTertiary">
                        <span className="font-mono">{snapshot.id}</span>
                        <span>-</span>
                        <span>{formatTime(snapshot.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                  
                  {index === 0 ? (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                      HEAD
                    </span>
                  ) : (
                    <button
                      onClick={() => handleRestore(snapshot)}
                      className={`text-xs px-2 py-1 rounded transition-colors whitespace-nowrap ${
                        confirmRestore === snapshot.id
                          ? 'bg-red-500 text-white'
                          : 'bg-recoder-elements-background-depth-3 hover:bg-recoder-elements-background-depth-3 text-recoder-elements-textSecondary'
                      }`}
                    >
                      {confirmRestore === snapshot.id ? 'Confirm?' : 'Restore'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {state.snapshots.length > 10 && (
            <div className="px-3 py-2 border-t border-recoder-elements-borderColor bg-recoder-elements-background-depth-3/80">
              <span className="text-xs text-recoder-elements-textTertiary">
                +{state.snapshots.length - 10} more snapshots
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default SnapshotBar;
