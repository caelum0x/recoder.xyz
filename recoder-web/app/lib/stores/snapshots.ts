/**
 * Snapshot Store
 * Manages Git-based project snapshots for instant rollback/restore
 */

import { atom, map } from 'nanostores';

const DOCKER_URL = typeof window !== 'undefined' 
  ? (import.meta.env?.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100')
  : 'http://localhost:3100';

export interface Snapshot {
  id: string;           // Git commit hash (short)
  fullHash: string;     // Full commit hash
  message: string;      // Snapshot description
  timestamp: number;    // Unix timestamp
  author: 'user' | 'ai' | 'auto';
  filesChanged?: number;
  additions?: number;
  deletions?: number;
}

export interface SnapshotDiff {
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

// ============================================
// Store State
// ============================================

interface SnapshotStoreState {
  snapshots: Snapshot[];
  currentSnapshot: Snapshot | null;
  selectedSnapshot: string | null;
  error: string | null;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  autoSaveEnabled: boolean;
  compareFrom: string | null;
  compareTo: string | null;
}

const initialState: SnapshotStoreState = {
  snapshots: [],
  currentSnapshot: null,
  selectedSnapshot: null,
  error: null,
  isLoading: false,
  hasUnsavedChanges: false,
  autoSaveEnabled: false,
  compareFrom: null,
  compareTo: null,
};

/** Main snapshot store */
export const snapshotStore = map<SnapshotStoreState>(initialState);

/** Cache for diff results to avoid redundant API calls */
const diffCache = new Map<string, SnapshotDiff>();

// ============================================
// Computed Values
// ============================================

/** Get snapshots list */
export const snapshotsAtom = atom<Snapshot[]>([]);

/** Current snapshot (HEAD) */
export const currentSnapshotAtom = atom<Snapshot | null>(null);

/** Loading state */
export const isLoadingAtom = atom<boolean>(false);

/** Has unsaved changes */
export const hasUnsavedChangesAtom = atom<boolean>(false);

/**
 * Check if container is ready before snapshot operations
 */
async function isContainerReady(): Promise<boolean> {
  try {
    const { workbenchStore } = await import('./workbench');
    return workbenchStore.containerReady.get();
  } catch {
    return false;
  }
}

/**
 * Create a new snapshot
 */
export async function createSnapshot(
  projectId: string,
  message: string,
  author: 'user' | 'ai' | 'auto' = 'user'
): Promise<Snapshot | null> {
  // Don't call snapshot API if container isn't ready yet
  if (!await isContainerReady()) {
    console.log('[Snapshot] Skipping create - container not ready');
    return null;
  }

  try {
    const response = await fetch(`${DOCKER_URL}/api/snapshot/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, author }),
    });

    if (!response.ok) {
      const data = await response.json() as { error?: string };
      throw new Error(data.error || 'Failed to create snapshot');
    }

    return await response.json() as Snapshot;
  } catch (error: any) {
    console.error('[Snapshot] Create error:', error);
    return null;
  }
}

/**
 * Load all snapshots for a project
 */
export async function loadSnapshots(projectId: string, limit: number = 50): Promise<void> {
  // Don't call snapshot API if container isn't ready yet
  if (!await isContainerReady()) {
    console.log('[Snapshot] Skipping load - container not ready');
    return;
  }

  snapshotStore.setKey('isLoading', true);
  snapshotStore.setKey('error', null);

  try {
    const response = await fetch(`${DOCKER_URL}/api/snapshots/${projectId}?limit=${limit}`);

    if (!response.ok) {
      const data = await response.json() as { error?: string };
      throw new Error(data.error || 'Failed to load snapshots');
    }

    const data = await response.json() as { snapshots: Snapshot[] };

    snapshotStore.setKey('snapshots', data.snapshots);
    if (data.snapshots.length > 0) {
      snapshotStore.setKey('currentSnapshot', data.snapshots[0]);
    }
    snapshotStore.setKey('isLoading', false);
  } catch (error: any) {
    snapshotStore.setKey('error', error.message);
    snapshotStore.setKey('isLoading', false);
    console.error('[Snapshot] Load error:', error);
  }
}

/**
 * Get current snapshot status
 */
export async function checkSnapshotStatus(projectId: string): Promise<void> {
  try {
    const response = await fetch(`${DOCKER_URL}/api/snapshot/${projectId}/status`);

    if (!response.ok) return;

    const data = await response.json() as { hasChanges: boolean; current: Snapshot | null };
    
    snapshotStore.setKey('hasUnsavedChanges', data.hasChanges);
    if (data.current) {
      snapshotStore.setKey('currentSnapshot', data.current);
    }
  } catch (error) {
    console.error('[Snapshot] Status check error:', error);
  }
}

/**
 * Restore to a specific snapshot
 */
export async function restoreSnapshot(projectId: string, snapshotId: string): Promise<boolean> {
  snapshotStore.setKey('isLoading', true);
  snapshotStore.setKey('error', null);

  try {
    const response = await fetch(`${DOCKER_URL}/api/snapshot/${projectId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotId }),
    });

    if (!response.ok) {
      const data = await response.json() as { error?: string };
      throw new Error(data.error || 'Failed to restore snapshot');
    }

    // Reload snapshots to get updated list
    await loadSnapshots(projectId);
    
    return true;
  } catch (error: any) {
    snapshotStore.setKey('error', error.message);
    snapshotStore.setKey('isLoading', false);
    console.error('[Snapshot] Restore error:', error);
    return false;
  }
}

/**
 * Get diff between two snapshots
 */
export async function getDiff(
  projectId: string,
  from: string,
  to: string = 'HEAD'
): Promise<SnapshotDiff | null> {
  const cacheKey = `${projectId}:${from}:${to}`;
  
  // Check cache
  if (diffCache.has(cacheKey)) {
    return diffCache.get(cacheKey)!;
  }

  try {
    const response = await fetch(
      `${DOCKER_URL}/api/snapshot/${projectId}/diff?from=${from}&to=${to}`
    );

    if (!response.ok) {
      const data = await response.json() as { error?: string };
      throw new Error(data.error || 'Failed to get diff');
    }

    const diff = await response.json() as SnapshotDiff;
    
    // Cache the result
    diffCache.set(cacheKey, diff);
    
    return diff;
  } catch (error: any) {
    console.error('[Snapshot] Diff error:', error);
    return null;
  }
}

/**
 * Get file diff between snapshots
 */
export async function getFileDiff(
  projectId: string,
  filePath: string,
  from: string,
  to: string = 'HEAD'
): Promise<string | null> {
  try {
    const response = await fetch(
      `${DOCKER_URL}/api/snapshot/${projectId}/file-diff?path=${encodeURIComponent(filePath)}&from=${from}&to=${to}`
    );

    if (!response.ok) return null;

    const data = await response.json() as { diff: string };
    return data.diff;
  } catch (error) {
    console.error('[Snapshot] File diff error:', error);
    return null;
  }
}

/**
 * Get file content at a specific snapshot
 */
export async function getFileAtSnapshot(
  projectId: string,
  filePath: string,
  snapshotId: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `${DOCKER_URL}/api/snapshot/${projectId}/file?path=${encodeURIComponent(filePath)}&snapshotId=${snapshotId}`
    );

    if (!response.ok) return null;

    const data = await response.json() as { content: string };
    return data.content;
  } catch (error) {
    console.error('[Snapshot] Get file error:', error);
    return null;
  }
}

/**
 * Enable/disable auto-save
 */
export async function setAutoSave(
  projectId: string,
  enabled: boolean,
  intervalMs: number = 5 * 60 * 1000
): Promise<void> {
  try {
    const response = await fetch(`${DOCKER_URL}/api/snapshot/${projectId}/auto-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, intervalMs }),
    });

    if (response.ok) {
      snapshotStore.setKey('autoSaveEnabled', enabled);
    }
  } catch (error) {
    console.error('[Snapshot] Auto-save toggle error:', error);
  }
}

/**
 * Select a snapshot for viewing
 */
export function selectSnapshot(snapshotId: string | null): void {
  snapshotStore.setKey('selectedSnapshot', snapshotId);
}

/**
 * Set compare snapshots
 */
export function setCompareSnapshots(from: string | null, to: string | null): void {
  const current = snapshotStore.get();
  snapshotStore.set({
    ...current,
    compareFrom: from,
    compareTo: to,
  });
}

/**
 * Clear snapshot store (on project change)
 */
export function clearSnapshots(): void {
  snapshotStore.set(initialState);
  diffCache.clear();
}

/**
 * Auto-snapshot before AI changes
 * Call this before AI starts making changes
 */
export async function snapshotBeforeAI(projectId: string): Promise<Snapshot | null> {
  return createSnapshot(projectId, 'Before AI changes', 'auto');
}

/**
 * Auto-snapshot after AI changes complete
 */
export async function snapshotAfterAI(projectId: string, description: string): Promise<Snapshot | null> {
  return createSnapshot(projectId, description, 'ai');
}

/**
 * Integrate with workbench - call this when AI actions start
 */
let currentAIBatch: { projectId: string; startTime: number; description: string } | null = null;

export function startAIChangesBatch(projectId: string, description: string = 'AI changes') {
  if (!currentAIBatch) {
    currentAIBatch = {
      projectId,
      startTime: Date.now(),
      description
    };
    // Create a "before" snapshot
    snapshotBeforeAI(projectId).catch(console.error);
  }
}

export async function endAIChangesBatch(description?: string): Promise<Snapshot | null> {
  if (!currentAIBatch) return null;
  
  const { projectId, description: defaultDescription } = currentAIBatch;
  currentAIBatch = null;
  
  // Wait a moment for file changes to complete
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return snapshotAfterAI(projectId, description || defaultDescription);
}

/**
 * Initialize snapshots for a project - call when container is ready
 */
export async function initializeSnapshots(projectId: string, enableAutoSave: boolean = true): Promise<void> {
  await loadSnapshots(projectId);
  if (enableAutoSave) {
    await setAutoSave(projectId, true);
  }
}
