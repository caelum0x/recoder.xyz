/**
 * SnapshotBar Component
 * Compact snapshot controls for the workbench header
 */

import React, { useState, useEffect, useRef } from 'react';
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

export function SnapshotBar({ projectId, className = '' }: SnapshotBarProps) {
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

  // Handle quick save
  const handleQuickSave = async () => {
    setIsCreating(true);
    await createSnapshot(projectId, 'Quick save', 'user');
    setIsCreating(false);
  };

  // Handle restore
  const handleRestore = async (snapshot: Snapshot) => {
    if (confirmRestore === snapshot.id) {
      await restoreSnapshot(projectId, snapshot.id);
      setConfirmRestore(null);
      setShowDropdown(false);
    } else {
      setConfirmRestore(snapshot.id);
      setTimeout(() => setConfirmRestore(null), 3000);
    }
  };

  // Format time
  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getAuthorLabel = (author: string) => {
    switch (author) {
      case 'ai': return 'AI';
      case 'auto': return 'Auto';
      default: return 'User';
    }
  };

  return (
    <div className={`relative flex items-center gap-1 ${className}`} ref={dropdownRef}>
      {/* Quick save button */}
      <button
        onClick={handleQuickSave}
        disabled={isCreating}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
                   ${state.hasUnsavedChanges 
                     ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' 
                     : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'}`}
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
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700/50 
                   hover:bg-gray-700 rounded transition-colors text-gray-400"
        title="View snapshots"
      >
        <span>{state.snapshots.length}</span>
        <span className={`transform transition-transform ${showDropdown ? 'rotate-180' : ''}`}>
          v
        </span>
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-gray-800 border border-gray-700 
                        rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/80">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Snapshots</span>
              {state.currentSnapshot && (
                <span className="text-xs text-gray-500">
                  Current: {state.currentSnapshot.id}
                </span>
              )}
            </div>
          </div>

          {/* Snapshot list */}
          <div className="max-h-64 overflow-auto">
            {state.snapshots.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No snapshots yet
              </div>
            ) : (
              state.snapshots.slice(0, 10).map((snapshot, index) => (
                <div
                  key={snapshot.id}
                  className={`flex items-center justify-between px-3 py-2 hover:bg-gray-700/50
                             border-b border-gray-700/50 last:border-0 ${
                               index === 0 ? 'bg-blue-500/10' : ''
                             }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-500">{getAuthorLabel(snapshot.author)}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate max-w-36">
                        {snapshot.message}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
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
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
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
            <div className="px-3 py-2 border-t border-gray-700 bg-gray-800/80">
              <span className="text-xs text-gray-500">
                +{state.snapshots.length - 10} more snapshots
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SnapshotBar;
