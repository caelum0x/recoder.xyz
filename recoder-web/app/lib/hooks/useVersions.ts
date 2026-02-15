/**
 * useVersions Hook
 * Manages version/snapshot history for project rollback and restore
 * Inspired by dyad's implementation
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import {
  snapshotStore,
  loadSnapshots,
  restoreSnapshot,
  getDiff,
  getFileDiff,
  type Snapshot,
  type SnapshotDiff,
} from '~/lib/stores/snapshots';
import { workbenchStore } from '~/lib/stores/workbench';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('Versions');

export interface Version {
  id: string;
  fullHash: string;
  message: string;
  timestamp: number;
  author: 'user' | 'ai' | 'auto';
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  isCurrent?: boolean;
  neonDbTimestamp?: string;  // ISO timestamp of Neon DB state at snapshot time
}

export interface VersionDiff {
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted';
    additions: number;
    deletions: number;
    diff?: string;
  }>;
  summary: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
}

export interface UseVersionsReturn {
  versions: Version[];
  loading: boolean;
  error: string | null;
  currentVersion: Version | null;
  selectedVersion: Version | null;
  selectedDiff: VersionDiff | null;
  diffLoading: boolean;
  isRestoring: boolean;
  refreshVersions: () => Promise<void>;
  getVersions: () => Promise<Version[]>;
  getVersionDiff: (versionId: string) => Promise<VersionDiff | null>;
  restoreVersion: (versionId: string) => Promise<boolean>;
  selectVersion: (version: Version | null) => void;
  getFileDiffContent: (versionId: string, filePath: string) => Promise<string | null>;
}

/**
 * Hook for managing version history and snapshots
 */
export function useVersions(projectId: string | null): UseVersionsReturn {
  const snapshotState = useStore(snapshotStore);
  const containerReady = useStore(workbenchStore.containerReady);

  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<VersionDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Convert snapshots to versions format
  const versions: Version[] = useMemo(() => {
    return snapshotState.snapshots.map((snapshot, index) => ({
      id: snapshot.id,
      fullHash: snapshot.fullHash,
      message: snapshot.message,
      timestamp: snapshot.timestamp,
      author: snapshot.author,
      filesChanged: snapshot.filesChanged,
      additions: snapshot.additions,
      deletions: snapshot.deletions,
      isCurrent: index === 0,
      neonDbTimestamp: snapshot.neonDbTimestamp,
    }));
  }, [snapshotState.snapshots]);

  // Current version (HEAD)
  const currentVersion: Version | null = useMemo(() => {
    if (!snapshotState.currentSnapshot) return null;
    return {
      id: snapshotState.currentSnapshot.id,
      fullHash: snapshotState.currentSnapshot.fullHash,
      message: snapshotState.currentSnapshot.message,
      timestamp: snapshotState.currentSnapshot.timestamp,
      author: snapshotState.currentSnapshot.author,
      filesChanged: snapshotState.currentSnapshot.filesChanged,
      additions: snapshotState.currentSnapshot.additions,
      deletions: snapshotState.currentSnapshot.deletions,
      isCurrent: true,
      neonDbTimestamp: snapshotState.currentSnapshot.neonDbTimestamp,
    };
  }, [snapshotState.currentSnapshot]);

  // Refresh versions from API
  const refreshVersions = useCallback(async () => {
    if (!projectId || !containerReady) return;
    await loadSnapshots(projectId);
  }, [projectId, containerReady]);

  // Get all versions
  const getVersions = useCallback(async (): Promise<Version[]> => {
    if (!projectId || !containerReady) return [];
    await loadSnapshots(projectId);
    return versions;
  }, [projectId, containerReady, versions]);

  // Get diff for a specific version
  const getVersionDiff = useCallback(async (versionId: string): Promise<VersionDiff | null> => {
    if (!projectId || !containerReady) return null;

    setDiffLoading(true);
    try {
      // Get diff between this version and HEAD
      const diff = await getDiff(projectId, versionId, 'HEAD');
      if (diff) {
        const versionDiff: VersionDiff = {
          files: diff.files,
          summary: diff.summary,
        };
        setSelectedDiff(versionDiff);
        return versionDiff;
      }
      return null;
    } catch (error) {
      logger.error('[useVersions] Get diff error:', error);
      return null;
    } finally {
      setDiffLoading(false);
    }
  }, [projectId, containerReady]);

  // Get file-level diff content
  const getFileDiffContent = useCallback(async (versionId: string, filePath: string): Promise<string | null> => {
    if (!projectId || !containerReady) return null;

    try {
      const diff = await getFileDiff(projectId, filePath, versionId, 'HEAD');
      return diff;
    } catch (error) {
      logger.error('[useVersions] Get file diff error:', error);
      return null;
    }
  }, [projectId, containerReady]);

  // Restore to a specific version
  const restoreVersionFn = useCallback(async (versionId: string): Promise<boolean> => {
    if (!projectId || !containerReady) {
      toast.error('Container not ready');
      return false;
    }

    setIsRestoring(true);
    try {
      const result = await restoreSnapshot(projectId, versionId);
      if (result.success) {
        if (result.dbRestored) {
          toast.success('Restored files and database to selected version');
        } else {
          toast.success('Restored to selected version');
        }
        // Refresh file tree
        workbenchStore.refreshFiles?.();
        // Clear selection
        setSelectedVersion(null);
        setSelectedDiff(null);
      } else {
        toast.error('Failed to restore version');
      }
      return result.success;
    } catch (error) {
      logger.error('[useVersions] Restore error:', error);
      toast.error('Failed to restore version');
      return false;
    } finally {
      setIsRestoring(false);
    }
  }, [projectId, containerReady]);

  // Select a version and load its diff
  const selectVersion = useCallback((version: Version | null) => {
    setSelectedVersion(version);
    if (version && !version.isCurrent) {
      getVersionDiff(version.id);
    } else {
      setSelectedDiff(null);
    }
  }, [getVersionDiff]);

  // Load versions when container is ready
  useEffect(() => {
    if (projectId && containerReady) {
      refreshVersions();
    }
  }, [projectId, containerReady, refreshVersions]);

  return {
    versions,
    loading: snapshotState.isLoading,
    error: snapshotState.error,
    currentVersion,
    selectedVersion,
    selectedDiff,
    diffLoading,
    isRestoring,
    refreshVersions,
    getVersions,
    getVersionDiff,
    restoreVersion: restoreVersionFn,
    selectVersion,
    getFileDiffContent,
  };
}

export default useVersions;
