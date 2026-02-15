/**
 * Checkpoints Store
 * Nanostores-based reactive state for checkpoint management
 *
 * Provides a reactive layer for checkpoint operations,
 * enabling React components to subscribe to checkpoint state changes.
 */

import { atom, computed, map } from 'nanostores';
import type { Message } from 'ai';
import * as checkpointService from '~/lib/services/checkpoint';
import { createScopedLogger } from '~/utils/logger';
import type {
  Checkpoint,
  CheckpointSummary,
  CheckpointDiff,
  CheckpointBranch,
} from '~/lib/services/checkpoint';

// Re-export types for convenience
export type {
  Checkpoint,
  CheckpointSummary,
  CheckpointDiff,
  CheckpointBranch,
  FileSnapshot,
} from '~/lib/services/checkpoint';

const logger = createScopedLogger('CheckpointsStore');

// ============================================
// State Atoms
// ============================================

/**
 * Current project ID for checkpoint context
 */
export const currentProjectId = atom<string | null>(null);

/**
 * Main checkpoint store state
 */
export const checkpointStore = map<{
  /** List of checkpoint summaries */
  summaries: CheckpointSummary[];
  /** Currently selected checkpoint ID */
  selectedCheckpointId: string | null;
  /** Current checkpoint pointer (where we are in history) */
  currentCheckpointId: string | null;
  /** Whether we're currently loading checkpoints */
  isLoading: boolean;
  /** Last error message */
  error: string | null;
  /** Auto-checkpoint enabled */
  autoCheckpointEnabled: boolean;
  /** Last auto-checkpoint timestamp */
  lastAutoCheckpoint: number | null;
}>({
  summaries: [],
  selectedCheckpointId: null,
  currentCheckpointId: null,
  isLoading: false,
  error: null,
  autoCheckpointEnabled: true,
  lastAutoCheckpoint: null,
});

/**
 * Branches for the current project
 */
export const branchesAtom = atom<CheckpointBranch[]>([]);

/**
 * Currently active branch name
 */
export const activeBranchAtom = atom<string | null>(null);

/**
 * Checkpoint comparison state
 */
export const comparisonState = map<{
  fromCheckpointId: string | null;
  toCheckpointId: string | null;
  diff: CheckpointDiff | null;
  isComparing: boolean;
}>({
  fromCheckpointId: null,
  toCheckpointId: null,
  diff: null,
  isComparing: false,
});

/**
 * Checkpoint being previewed (for UI preview mode)
 */
export const previewCheckpointAtom = atom<Checkpoint | null>(null);

/**
 * Whether we're in preview mode
 */
export const isPreviewModeAtom = atom<boolean>(false);

// ============================================
// Computed Values
// ============================================

/**
 * Total checkpoint count
 */
export const checkpointCount = computed(checkpointStore, (store) => store.summaries.length);

/**
 * Has any checkpoints
 */
export const hasCheckpoints = computed(checkpointStore, (store) => store.summaries.length > 0);

/**
 * Selected checkpoint summary
 */
export const selectedSummary = computed(checkpointStore, (store) => {
  if (!store.selectedCheckpointId) return null;
  return store.summaries.find(s => s.id === store.selectedCheckpointId) || null;
});

/**
 * Current checkpoint summary (where we are in history)
 */
export const currentSummary = computed(checkpointStore, (store) => {
  if (!store.currentCheckpointId) return null;
  return store.summaries.find(s => s.id === store.currentCheckpointId) || null;
});

/**
 * Can create checkpoint (has project ID)
 */
export const canCreateCheckpoint = computed(currentProjectId, (projectId) => projectId !== null);

/**
 * Auto checkpoints (filtered by author)
 */
export const autoCheckpoints = computed(checkpointStore, (store) =>
  store.summaries.filter(s => s.author === 'auto')
);

/**
 * User checkpoints (filtered by author)
 */
export const userCheckpoints = computed(checkpointStore, (store) =>
  store.summaries.filter(s => s.author === 'user')
);

/**
 * AI checkpoints (filtered by author)
 */
export const aiCheckpoints = computed(checkpointStore, (store) =>
  store.summaries.filter(s => s.author === 'ai')
);

/**
 * Latest checkpoint
 */
export const latestCheckpoint = computed(checkpointStore, (store) => {
  if (store.summaries.length === 0) return null;
  return store.summaries.reduce((latest, s) =>
    s.timestamp > latest.timestamp ? s : latest
  );
});

/**
 * Storage size (bytes)
 */
export const storageSizeAtom = atom<number>(0);

/**
 * Formatted storage size
 */
export const formattedStorageSize = computed(storageSizeAtom, (bytes) =>
  checkpointService.formatStorageSize(bytes)
);

// ============================================
// Actions
// ============================================

/**
 * Initialize checkpoints for a project
 */
export function initializeCheckpoints(projectId: string): void {
  currentProjectId.set(projectId);
  refreshCheckpoints();
  refreshBranches();
  updateStorageSize();

  // Load current checkpoint ID
  const currentId = checkpointService.getCurrentCheckpointId(projectId);
  checkpointStore.setKey('currentCheckpointId', currentId);
}

/**
 * Refresh checkpoints from service
 */
export function refreshCheckpoints(): void {
  const projectId = currentProjectId.get();
  if (!projectId) return;

  checkpointStore.setKey('isLoading', true);
  checkpointStore.setKey('error', null);

  try {
    const summaries = checkpointService.getCheckpointSummaries(projectId);
    checkpointStore.setKey('summaries', summaries);
    checkpointStore.setKey('isLoading', false);
  } catch (error) {
    checkpointStore.setKey('error', String(error));
    checkpointStore.setKey('isLoading', false);
  }
}

/**
 * Refresh branches from service
 */
export function refreshBranches(): void {
  const projectId = currentProjectId.get();
  if (!projectId) return;

  const branches = checkpointService.getBranches(projectId);
  branchesAtom.set(branches);
}

/**
 * Update storage size
 */
export function updateStorageSize(): void {
  const projectId = currentProjectId.get();
  if (!projectId) return;

  const size = checkpointService.getCheckpointsStorageSize(projectId);
  storageSizeAtom.set(size);
}

/**
 * Create a new checkpoint
 */
export function createCheckpoint(
  description: string,
  messages: Message[],
  files: Record<string, string>,
  options?: {
    author?: 'user' | 'ai' | 'auto';
    tags?: string[];
  }
): Checkpoint | null {
  const projectId = currentProjectId.get();
  if (!projectId) {
    logger.error('[CheckpointStore] No project ID set');
    return null;
  }

  try {
    const checkpoint = checkpointService.createCheckpoint(
      projectId,
      description,
      messages,
      files,
      options
    );

    // Update store
    refreshCheckpoints();
    updateStorageSize();

    // Set as current checkpoint
    checkpointStore.setKey('currentCheckpointId', checkpoint.id);
    checkpointService.setCurrentCheckpointId(projectId, checkpoint.id);

    return checkpoint;
  } catch (error) {
    checkpointStore.setKey('error', String(error));
    return null;
  }
}

/**
 * Create an auto-checkpoint (for automatic checkpointing)
 */
export function createAutoCheckpoint(
  messages: Message[],
  files: Record<string, string>,
  operationDescription?: string
): Checkpoint | null {
  const projectId = currentProjectId.get();
  const store = checkpointStore.get();

  if (!projectId || !store.autoCheckpointEnabled) {
    return null;
  }

  // Throttle auto-checkpoints
  const now = Date.now();
  if (store.lastAutoCheckpoint && now - store.lastAutoCheckpoint < 30000) {
    // Don't create auto-checkpoint within 30 seconds of last one
    return null;
  }

  try {
    const checkpoint = checkpointService.createAutoCheckpoint(
      projectId,
      messages,
      files,
      operationDescription
    );

    if (checkpoint) {
      checkpointStore.setKey('lastAutoCheckpoint', now);
      refreshCheckpoints();
      updateStorageSize();
    }

    return checkpoint;
  } catch (error) {
    logger.error('[CheckpointStore] Auto-checkpoint failed:', error);
    return null;
  }
}

/**
 * Resume from a checkpoint
 */
export function resumeFromCheckpoint(
  checkpointId: string
): { messages: Message[]; files: Record<string, string> } | null {
  const projectId = currentProjectId.get();
  if (!projectId) return null;

  try {
    const result = checkpointService.resumeFromCheckpoint(projectId, checkpointId);

    if (result) {
      // Update current checkpoint
      checkpointStore.setKey('currentCheckpointId', checkpointId);
      checkpointService.setCurrentCheckpointId(projectId, checkpointId);

      // Exit preview mode if active
      isPreviewModeAtom.set(false);
      previewCheckpointAtom.set(null);
    }

    return result;
  } catch (error) {
    checkpointStore.setKey('error', String(error));
    return null;
  }
}

/**
 * Select a checkpoint (for viewing/comparison)
 */
export function selectCheckpoint(checkpointId: string | null): void {
  checkpointStore.setKey('selectedCheckpointId', checkpointId);
}

/**
 * Delete a checkpoint
 */
export function deleteCheckpoint(checkpointId: string): boolean {
  const projectId = currentProjectId.get();
  if (!projectId) return false;

  const success = checkpointService.deleteCheckpoint(projectId, checkpointId);

  if (success) {
    refreshCheckpoints();
    updateStorageSize();

    // Clear selection if deleted checkpoint was selected
    const store = checkpointStore.get();
    if (store.selectedCheckpointId === checkpointId) {
      checkpointStore.setKey('selectedCheckpointId', null);
    }
    if (store.currentCheckpointId === checkpointId) {
      checkpointStore.setKey('currentCheckpointId', null);
      checkpointService.setCurrentCheckpointId(projectId, null);
    }
  }

  return success;
}

/**
 * Prune old checkpoints
 */
export function pruneCheckpoints(keepCount?: number): number {
  const projectId = currentProjectId.get();
  if (!projectId) return 0;

  const deleted = checkpointService.pruneCheckpoints(projectId, keepCount);

  if (deleted > 0) {
    refreshCheckpoints();
    updateStorageSize();
  }

  return deleted;
}

/**
 * Clear all checkpoints
 */
export function clearAllCheckpoints(): void {
  const projectId = currentProjectId.get();
  if (!projectId) return;

  checkpointService.clearCheckpoints(projectId);
  checkpointStore.setKey('summaries', []);
  checkpointStore.setKey('selectedCheckpointId', null);
  checkpointStore.setKey('currentCheckpointId', null);
  updateStorageSize();
}

/**
 * Toggle auto-checkpoint
 */
export function toggleAutoCheckpoint(): void {
  const current = checkpointStore.get().autoCheckpointEnabled;
  checkpointStore.setKey('autoCheckpointEnabled', !current);
}

/**
 * Set auto-checkpoint enabled
 */
export function setAutoCheckpointEnabled(enabled: boolean): void {
  checkpointStore.setKey('autoCheckpointEnabled', enabled);
}

// ============================================
// Comparison Actions
// ============================================

/**
 * Start comparing two checkpoints
 */
export function startComparison(fromId: string, toId: string): void {
  const projectId = currentProjectId.get();
  if (!projectId) return;

  comparisonState.setKey('fromCheckpointId', fromId);
  comparisonState.setKey('toCheckpointId', toId);
  comparisonState.setKey('isComparing', true);

  const diff = checkpointService.compareCheckpoints(projectId, fromId, toId);
  comparisonState.setKey('diff', diff);
}

/**
 * Compare checkpoint to current state
 */
export function compareToCurrentState(
  checkpointId: string,
  currentFiles: Record<string, string>,
  currentMessageCount: number
): CheckpointDiff | null {
  const projectId = currentProjectId.get();
  if (!projectId) return null;

  const diff = checkpointService.compareToCurrentState(
    projectId,
    checkpointId,
    currentFiles,
    currentMessageCount
  );

  comparisonState.setKey('fromCheckpointId', checkpointId);
  comparisonState.setKey('toCheckpointId', null);
  comparisonState.setKey('diff', diff);
  comparisonState.setKey('isComparing', true);

  return diff;
}

/**
 * Clear comparison state
 */
export function clearComparison(): void {
  comparisonState.set({
    fromCheckpointId: null,
    toCheckpointId: null,
    diff: null,
    isComparing: false,
  });
}

// ============================================
// Preview Actions
// ============================================

/**
 * Enter preview mode for a checkpoint
 */
export function previewCheckpoint(checkpointId: string): void {
  const projectId = currentProjectId.get();
  if (!projectId) return;

  const checkpoint = checkpointService.getCheckpoint(projectId, checkpointId);

  if (checkpoint) {
    previewCheckpointAtom.set(checkpoint);
    isPreviewModeAtom.set(true);
  }
}

/**
 * Exit preview mode
 */
export function exitPreviewMode(): void {
  previewCheckpointAtom.set(null);
  isPreviewModeAtom.set(false);
}

// ============================================
// Branch Actions
// ============================================

/**
 * Create a branch from a checkpoint
 */
export function createBranch(
  checkpointId: string,
  branchName: string,
  description?: string
): CheckpointBranch | null {
  const projectId = currentProjectId.get();
  if (!projectId) return null;

  const branch = checkpointService.createBranch(
    projectId,
    checkpointId,
    branchName,
    description
  );

  if (branch) {
    refreshBranches();
    refreshCheckpoints(); // Branch name updates on checkpoint
    activeBranchAtom.set(branchName);
  }

  return branch;
}

/**
 * Switch to a branch
 */
export function switchToBranch(branchName: string): { messages: Message[]; files: Record<string, string> } | null {
  const projectId = currentProjectId.get();
  if (!projectId) return null;

  const branches = branchesAtom.get();
  const branch = branches.find(b => b.name === branchName);

  if (!branch) return null;

  const result = resumeFromCheckpoint(branch.checkpointId);

  if (result) {
    activeBranchAtom.set(branchName);
  }

  return result;
}

/**
 * Delete a branch
 */
export function deleteBranch(branchName: string): boolean {
  const projectId = currentProjectId.get();
  if (!projectId) return false;

  const success = checkpointService.deleteBranch(projectId, branchName);

  if (success) {
    refreshBranches();

    // Clear active branch if it was deleted
    if (activeBranchAtom.get() === branchName) {
      activeBranchAtom.set(null);
    }
  }

  return success;
}

// ============================================
// Tag Actions
// ============================================

/**
 * Add tags to a checkpoint
 */
export function addTags(checkpointId: string, tags: string[]): boolean {
  const projectId = currentProjectId.get();
  if (!projectId) return false;

  const success = checkpointService.addCheckpointTags(projectId, checkpointId, tags);

  if (success) {
    refreshCheckpoints();
  }

  return success;
}

/**
 * Remove tags from a checkpoint
 */
export function removeTags(checkpointId: string, tags: string[]): boolean {
  const projectId = currentProjectId.get();
  if (!projectId) return false;

  const success = checkpointService.removeCheckpointTags(projectId, checkpointId, tags);

  if (success) {
    refreshCheckpoints();
  }

  return success;
}

/**
 * Update checkpoint description
 */
export function updateDescription(checkpointId: string, description: string): boolean {
  const projectId = currentProjectId.get();
  if (!projectId) return false;

  const success = checkpointService.updateCheckpointDescription(
    projectId,
    checkpointId,
    description
  );

  if (success) {
    refreshCheckpoints();
  }

  return success;
}

// ============================================
// Import/Export Actions
// ============================================

/**
 * Export checkpoints for backup
 */
export function exportCheckpoints(): string | null {
  const projectId = currentProjectId.get();
  if (!projectId) return null;

  return checkpointService.exportCheckpoints(projectId);
}

/**
 * Import checkpoints from backup
 */
export function importCheckpoints(
  data: string,
  options?: { merge?: boolean }
): { imported: number; errors: string[] } {
  const projectId = currentProjectId.get();
  if (!projectId) {
    return { imported: 0, errors: ['No project ID set'] };
  }

  const result = checkpointService.importCheckpoints(projectId, data, options);

  if (result.imported > 0) {
    refreshCheckpoints();
    refreshBranches();
    updateStorageSize();
  }

  return result;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get full checkpoint data
 */
export function getFullCheckpoint(checkpointId: string): Checkpoint | null {
  const projectId = currentProjectId.get();
  if (!projectId) return null;

  return checkpointService.getCheckpoint(projectId, checkpointId);
}

/**
 * Get checkpoint timeline
 */
export function getTimeline(): Checkpoint[] {
  const projectId = currentProjectId.get();
  if (!projectId) return [];

  return checkpointService.getCheckpointTimeline(projectId);
}

/**
 * Reset checkpoint store (call when changing projects)
 */
export function resetCheckpointStore(): void {
  currentProjectId.set(null);
  checkpointStore.set({
    summaries: [],
    selectedCheckpointId: null,
    currentCheckpointId: null,
    isLoading: false,
    error: null,
    autoCheckpointEnabled: true,
    lastAutoCheckpoint: null,
  });
  branchesAtom.set([]);
  activeBranchAtom.set(null);
  comparisonState.set({
    fromCheckpointId: null,
    toCheckpointId: null,
    diff: null,
    isComparing: false,
  });
  previewCheckpointAtom.set(null);
  isPreviewModeAtom.set(false);
  storageSizeAtom.set(0);
}

/**
 * Format timestamp for display
 */
export function formatCheckpointTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get checkpoint author display name
 */
export function getAuthorDisplayName(author: 'user' | 'ai' | 'auto'): string {
  switch (author) {
    case 'user':
      return 'Manual';
    case 'ai':
      return 'AI';
    case 'auto':
      return 'Auto';
    default:
      return author;
  }
}
