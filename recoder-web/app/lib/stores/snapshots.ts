/**
 * Snapshot Store
 * Manages Git-based project snapshots for instant rollback/restore
 */

import { atom, map } from 'nanostores';
import { dockerGet, dockerPost } from '~/lib/services/docker-api';

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
// API Response Types
// ============================================

interface ErrorResponse {
  error?: string;
}

interface CreateSnapshotResponse extends Snapshot {}

interface LoadSnapshotsResponse {
  snapshots: Snapshot[];
}

interface SnapshotStatusResponse {
  hasChanges: boolean;
  current: Snapshot | null;
}

interface RestoreSnapshotResponse {
  success: boolean;
}

interface DiffResponse extends SnapshotDiff {}

interface FileDiffResponse {
  diff: string;
}

interface FileContentResponse {
  content: string;
}

interface AutoSaveResponse {
  success: boolean;
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
    const snapshot = await dockerPost<CreateSnapshotResponse>(`/api/snapshot/${projectId}`, { message, author });
    return snapshot;
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
    const data = await dockerGet<LoadSnapshotsResponse>(`/api/snapshots/${projectId}?limit=${limit}`);

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
    const data = await dockerGet<SnapshotStatusResponse>(`/api/snapshot/${projectId}/status`);

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
    await dockerPost<RestoreSnapshotResponse>(`/api/snapshot/${projectId}/restore`, { snapshotId });

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
    const diff = await dockerGet<DiffResponse>(`/api/snapshot/${projectId}/diff?from=${from}&to=${to}`);

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
    const data = await dockerGet<FileDiffResponse>(
      `/api/snapshot/${projectId}/file-diff?path=${encodeURIComponent(filePath)}&from=${from}&to=${to}`
    );
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
    const data = await dockerGet<FileContentResponse>(
      `/api/snapshot/${projectId}/file?path=${encodeURIComponent(filePath)}&snapshotId=${snapshotId}`
    );
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
    await dockerPost<AutoSaveResponse>(`/api/snapshot/${projectId}/auto-save`, { enabled, intervalMs });
    snapshotStore.setKey('autoSaveEnabled', enabled);
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
