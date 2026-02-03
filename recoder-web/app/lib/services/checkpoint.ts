/**
 * Checkpoint Service
 * Manages conversation checkpoints for AI conversations
 * Inspired by kilocode's checkpoint implementation
 *
 * Features:
 * - Save conversation state at key moments
 * - Resume from any checkpoint
 * - Track file states at each checkpoint
 * - Support branching from checkpoints
 */

import type { Message } from 'ai';
import { nanoid } from 'nanoid';

// ============================================
// Types
// ============================================

export interface FileSnapshot {
  /** File path */
  path: string;
  /** File content at checkpoint time */
  content: string;
  /** Last modified timestamp */
  lastModified: number;
}

export interface Checkpoint {
  /** Unique checkpoint ID */
  id: string;
  /** Human-readable description */
  description: string;
  /** When the checkpoint was created */
  timestamp: number;
  /** Conversation messages up to this point */
  messages: Message[];
  /** Message index at checkpoint (position in conversation) */
  messageIndex: number;
  /** Files state at checkpoint time */
  files: FileSnapshot[];
  /** File paths that existed at this checkpoint */
  filePaths: string[];
  /** Who created the checkpoint */
  author: 'user' | 'ai' | 'auto';
  /** Parent checkpoint ID for branching */
  parentId: string | null;
  /** Branch name (optional) */
  branchName?: string;
  /** Tags for organization */
  tags?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface CheckpointDiff {
  /** Files added since the compared checkpoint */
  added: FileSnapshot[];
  /** Files modified since the compared checkpoint */
  modified: Array<{
    path: string;
    oldContent: string;
    newContent: string;
  }>;
  /** Files removed since the compared checkpoint */
  removed: string[];
  /** Message count difference */
  messageCountDiff: number;
}

export interface CheckpointBranch {
  /** Branch name */
  name: string;
  /** Checkpoint ID where branch was created */
  checkpointId: string;
  /** Branch creation timestamp */
  createdAt: number;
  /** Description */
  description?: string;
}

export interface CheckpointSummary {
  id: string;
  description: string;
  timestamp: number;
  messageCount: number;
  fileCount: number;
  author: 'user' | 'ai' | 'auto';
  branchName?: string;
}

// ============================================
// Storage Keys
// ============================================

const STORAGE_KEY_PREFIX = 'recoder_checkpoint_';
const BRANCHES_KEY = 'recoder_checkpoint_branches';
const CURRENT_CHECKPOINT_KEY = 'recoder_current_checkpoint';

// ============================================
// Internal State
// ============================================

/** In-memory checkpoint cache */
const checkpointCache = new Map<string, Checkpoint>();

/** Max checkpoints to keep (per conversation/project) */
const MAX_CHECKPOINTS = 50;

/** Auto-checkpoint interval in milliseconds (5 minutes) */
export const AUTO_CHECKPOINT_INTERVAL = 5 * 60 * 1000;

// ============================================
// Core Functions
// ============================================

/**
 * Generate a unique checkpoint ID
 */
function generateCheckpointId(): string {
  return `ckpt_${nanoid(10)}`;
}

/**
 * Get storage key for a project's checkpoints
 */
function getStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

/**
 * Create a new checkpoint
 */
export function createCheckpoint(
  projectId: string,
  description: string,
  messages: Message[],
  files: Record<string, string>,
  options: {
    author?: 'user' | 'ai' | 'auto';
    parentId?: string | null;
    branchName?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  } = {}
): Checkpoint {
  const {
    author = 'user',
    parentId = null,
    branchName,
    tags,
    metadata,
  } = options;

  const timestamp = Date.now();

  // Convert files map to snapshots
  const fileSnapshots: FileSnapshot[] = Object.entries(files).map(([path, content]) => ({
    path,
    content,
    lastModified: timestamp,
  }));

  const checkpoint: Checkpoint = {
    id: generateCheckpointId(),
    description,
    timestamp,
    messages: structuredClone(messages), // Deep clone to avoid mutations
    messageIndex: messages.length - 1,
    files: fileSnapshots,
    filePaths: Object.keys(files),
    author,
    parentId,
    branchName,
    tags,
    metadata,
  };

  // Save to storage
  saveCheckpoint(projectId, checkpoint);

  // Update cache
  checkpointCache.set(checkpoint.id, checkpoint);

  console.log(`[Checkpoint] Created checkpoint: ${checkpoint.id} - "${description}"`);

  return checkpoint;
}

/**
 * Create an auto-checkpoint after successful file operations
 */
export function createAutoCheckpoint(
  projectId: string,
  messages: Message[],
  files: Record<string, string>,
  operationDescription?: string
): Checkpoint | null {
  // Don't create checkpoint if no messages or files
  if (messages.length === 0 && Object.keys(files).length === 0) {
    return null;
  }

  const description = operationDescription || `Auto-checkpoint at ${new Date().toLocaleTimeString()}`;

  return createCheckpoint(projectId, description, messages, files, {
    author: 'auto',
  });
}

/**
 * Save checkpoint to storage
 */
function saveCheckpoint(projectId: string, checkpoint: Checkpoint): void {
  if (typeof window === 'undefined') return;

  try {
    const storageKey = getStorageKey(projectId);
    const existingData = localStorage.getItem(storageKey);
    const checkpoints: Checkpoint[] = existingData ? JSON.parse(existingData) : [];

    // Add new checkpoint
    checkpoints.push(checkpoint);

    // Enforce max checkpoints limit - remove oldest first
    while (checkpoints.length > MAX_CHECKPOINTS) {
      const removed = checkpoints.shift();
      if (removed) {
        checkpointCache.delete(removed.id);
      }
    }

    localStorage.setItem(storageKey, JSON.stringify(checkpoints));
  } catch (error) {
    console.error('[Checkpoint] Failed to save checkpoint:', error);
  }
}

/**
 * Load all checkpoints for a project
 */
export function loadCheckpoints(projectId: string): Checkpoint[] {
  if (typeof window === 'undefined') return [];

  try {
    const storageKey = getStorageKey(projectId);
    const data = localStorage.getItem(storageKey);

    if (!data) return [];

    const checkpoints: Checkpoint[] = JSON.parse(data);

    // Update cache
    for (const checkpoint of checkpoints) {
      checkpointCache.set(checkpoint.id, checkpoint);
    }

    return checkpoints;
  } catch (error) {
    console.error('[Checkpoint] Failed to load checkpoints:', error);
    return [];
  }
}

/**
 * Get a specific checkpoint by ID
 */
export function getCheckpoint(projectId: string, checkpointId: string): Checkpoint | null {
  // Check cache first
  if (checkpointCache.has(checkpointId)) {
    return checkpointCache.get(checkpointId) || null;
  }

  // Load from storage
  const checkpoints = loadCheckpoints(projectId);
  return checkpoints.find(cp => cp.id === checkpointId) || null;
}

/**
 * Get checkpoint summaries (lightweight list for UI)
 */
export function getCheckpointSummaries(projectId: string): CheckpointSummary[] {
  const checkpoints = loadCheckpoints(projectId);

  return checkpoints.map(cp => ({
    id: cp.id,
    description: cp.description,
    timestamp: cp.timestamp,
    messageCount: cp.messages.length,
    fileCount: cp.filePaths.length,
    author: cp.author,
    branchName: cp.branchName,
  }));
}

/**
 * Delete a checkpoint
 */
export function deleteCheckpoint(projectId: string, checkpointId: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const storageKey = getStorageKey(projectId);
    const checkpoints = loadCheckpoints(projectId);

    const filtered = checkpoints.filter(cp => cp.id !== checkpointId);

    if (filtered.length === checkpoints.length) {
      return false; // Checkpoint not found
    }

    localStorage.setItem(storageKey, JSON.stringify(filtered));
    checkpointCache.delete(checkpointId);

    console.log(`[Checkpoint] Deleted checkpoint: ${checkpointId}`);
    return true;
  } catch (error) {
    console.error('[Checkpoint] Failed to delete checkpoint:', error);
    return false;
  }
}

/**
 * Delete old checkpoints to save space
 * Keeps the most recent N checkpoints and any with special tags
 */
export function pruneCheckpoints(
  projectId: string,
  keepCount: number = 20,
  preserveTags: string[] = ['important', 'milestone']
): number {
  if (typeof window === 'undefined') return 0;

  try {
    const checkpoints = loadCheckpoints(projectId);

    // Separate protected and unprotected checkpoints
    const protected_: Checkpoint[] = [];
    const unprotected: Checkpoint[] = [];

    for (const cp of checkpoints) {
      const hasProtectedTag = cp.tags?.some(tag => preserveTags.includes(tag));
      if (hasProtectedTag) {
        protected_.push(cp);
      } else {
        unprotected.push(cp);
      }
    }

    // Sort unprotected by timestamp (newest first)
    unprotected.sort((a, b) => b.timestamp - a.timestamp);

    // Keep only the most recent unprotected checkpoints
    const toKeep = unprotected.slice(0, keepCount);
    const toDelete = unprotected.slice(keepCount);

    // Delete old checkpoints
    for (const cp of toDelete) {
      checkpointCache.delete(cp.id);
    }

    // Save combined result
    const storageKey = getStorageKey(projectId);
    const remaining = [...protected_, ...toKeep].sort((a, b) => a.timestamp - b.timestamp);
    localStorage.setItem(storageKey, JSON.stringify(remaining));

    console.log(`[Checkpoint] Pruned ${toDelete.length} checkpoints, kept ${remaining.length}`);
    return toDelete.length;
  } catch (error) {
    console.error('[Checkpoint] Failed to prune checkpoints:', error);
    return 0;
  }
}

/**
 * Clear all checkpoints for a project
 */
export function clearCheckpoints(projectId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const storageKey = getStorageKey(projectId);
    const checkpoints = loadCheckpoints(projectId);

    // Clear cache
    for (const cp of checkpoints) {
      checkpointCache.delete(cp.id);
    }

    localStorage.removeItem(storageKey);
    console.log(`[Checkpoint] Cleared all checkpoints for project: ${projectId}`);
  } catch (error) {
    console.error('[Checkpoint] Failed to clear checkpoints:', error);
  }
}

// ============================================
// Resume Functions
// ============================================

/**
 * Resume conversation from a checkpoint
 * Returns the messages and files state to restore
 */
export function resumeFromCheckpoint(
  projectId: string,
  checkpointId: string
): { messages: Message[]; files: Record<string, string> } | null {
  const checkpoint = getCheckpoint(projectId, checkpointId);

  if (!checkpoint) {
    console.error(`[Checkpoint] Checkpoint not found: ${checkpointId}`);
    return null;
  }

  // Convert file snapshots back to files map
  const files: Record<string, string> = {};
  for (const snapshot of checkpoint.files) {
    files[snapshot.path] = snapshot.content;
  }

  console.log(`[Checkpoint] Resuming from checkpoint: ${checkpointId} - "${checkpoint.description}"`);

  return {
    messages: structuredClone(checkpoint.messages),
    files,
  };
}

/**
 * Get current checkpoint ID (for tracking position)
 */
export function getCurrentCheckpointId(projectId: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const key = `${CURRENT_CHECKPOINT_KEY}_${projectId}`;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Set current checkpoint ID
 */
export function setCurrentCheckpointId(projectId: string, checkpointId: string | null): void {
  if (typeof window === 'undefined') return;

  try {
    const key = `${CURRENT_CHECKPOINT_KEY}_${projectId}`;
    if (checkpointId) {
      localStorage.setItem(key, checkpointId);
    } else {
      localStorage.removeItem(key);
    }
  } catch (error) {
    console.error('[Checkpoint] Failed to set current checkpoint:', error);
  }
}

// ============================================
// Comparison Functions
// ============================================

/**
 * Compare two checkpoints and return the diff
 */
export function compareCheckpoints(
  projectId: string,
  fromCheckpointId: string,
  toCheckpointId: string
): CheckpointDiff | null {
  const fromCheckpoint = getCheckpoint(projectId, fromCheckpointId);
  const toCheckpoint = getCheckpoint(projectId, toCheckpointId);

  if (!fromCheckpoint || !toCheckpoint) {
    console.error('[Checkpoint] One or both checkpoints not found');
    return null;
  }

  const fromFilesMap = new Map(fromCheckpoint.files.map(f => [f.path, f.content]));
  const toFilesMap = new Map(toCheckpoint.files.map(f => [f.path, f.content]));

  const added: FileSnapshot[] = [];
  const modified: Array<{ path: string; oldContent: string; newContent: string }> = [];
  const removed: string[] = [];

  // Find added and modified files
  for (const file of toCheckpoint.files) {
    if (!fromFilesMap.has(file.path)) {
      added.push(file);
    } else {
      const oldContent = fromFilesMap.get(file.path)!;
      if (oldContent !== file.content) {
        modified.push({
          path: file.path,
          oldContent,
          newContent: file.content,
        });
      }
    }
  }

  // Find removed files
  for (const file of fromCheckpoint.files) {
    if (!toFilesMap.has(file.path)) {
      removed.push(file.path);
    }
  }

  return {
    added,
    modified,
    removed,
    messageCountDiff: toCheckpoint.messages.length - fromCheckpoint.messages.length,
  };
}

/**
 * Compare checkpoint to current state
 */
export function compareToCurrentState(
  projectId: string,
  checkpointId: string,
  currentFiles: Record<string, string>,
  currentMessageCount: number
): CheckpointDiff | null {
  const checkpoint = getCheckpoint(projectId, checkpointId);

  if (!checkpoint) {
    return null;
  }

  const checkpointFilesMap = new Map(checkpoint.files.map(f => [f.path, f.content]));
  const currentFilesSet = new Set(Object.keys(currentFiles));

  const added: FileSnapshot[] = [];
  const modified: Array<{ path: string; oldContent: string; newContent: string }> = [];
  const removed: string[] = [];

  // Find added and modified files
  for (const [path, content] of Object.entries(currentFiles)) {
    if (!checkpointFilesMap.has(path)) {
      added.push({ path, content, lastModified: Date.now() });
    } else {
      const oldContent = checkpointFilesMap.get(path)!;
      if (oldContent !== content) {
        modified.push({
          path,
          oldContent,
          newContent: content,
        });
      }
    }
  }

  // Find removed files
  for (const file of checkpoint.files) {
    if (!currentFilesSet.has(file.path)) {
      removed.push(file.path);
    }
  }

  return {
    added,
    modified,
    removed,
    messageCountDiff: currentMessageCount - checkpoint.messages.length,
  };
}

// ============================================
// Branching Functions
// ============================================

/**
 * Create a branch from a checkpoint
 */
export function createBranch(
  projectId: string,
  checkpointId: string,
  branchName: string,
  description?: string
): CheckpointBranch | null {
  const checkpoint = getCheckpoint(projectId, checkpointId);

  if (!checkpoint) {
    return null;
  }

  const branch: CheckpointBranch = {
    name: branchName,
    checkpointId,
    createdAt: Date.now(),
    description,
  };

  // Save branch
  saveBranch(projectId, branch);

  // Update checkpoint with branch name
  checkpoint.branchName = branchName;
  updateCheckpoint(projectId, checkpoint);

  console.log(`[Checkpoint] Created branch "${branchName}" from checkpoint: ${checkpointId}`);

  return branch;
}

/**
 * Save branch to storage
 */
function saveBranch(projectId: string, branch: CheckpointBranch): void {
  if (typeof window === 'undefined') return;

  try {
    const key = `${BRANCHES_KEY}_${projectId}`;
    const existingData = localStorage.getItem(key);
    const branches: CheckpointBranch[] = existingData ? JSON.parse(existingData) : [];

    // Replace if branch name exists, otherwise add
    const existingIndex = branches.findIndex(b => b.name === branch.name);
    if (existingIndex >= 0) {
      branches[existingIndex] = branch;
    } else {
      branches.push(branch);
    }

    localStorage.setItem(key, JSON.stringify(branches));
  } catch (error) {
    console.error('[Checkpoint] Failed to save branch:', error);
  }
}

/**
 * Get all branches for a project
 */
export function getBranches(projectId: string): CheckpointBranch[] {
  if (typeof window === 'undefined') return [];

  try {
    const key = `${BRANCHES_KEY}_${projectId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Delete a branch
 */
export function deleteBranch(projectId: string, branchName: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const key = `${BRANCHES_KEY}_${projectId}`;
    const branches = getBranches(projectId);
    const filtered = branches.filter(b => b.name !== branchName);

    if (filtered.length === branches.length) {
      return false;
    }

    localStorage.setItem(key, JSON.stringify(filtered));
    console.log(`[Checkpoint] Deleted branch: ${branchName}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Update an existing checkpoint
 */
function updateCheckpoint(projectId: string, checkpoint: Checkpoint): void {
  if (typeof window === 'undefined') return;

  try {
    const storageKey = getStorageKey(projectId);
    const checkpoints = loadCheckpoints(projectId);

    const index = checkpoints.findIndex(cp => cp.id === checkpoint.id);
    if (index >= 0) {
      checkpoints[index] = checkpoint;
      localStorage.setItem(storageKey, JSON.stringify(checkpoints));
      checkpointCache.set(checkpoint.id, checkpoint);
    }
  } catch (error) {
    console.error('[Checkpoint] Failed to update checkpoint:', error);
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Add tags to a checkpoint
 */
export function addCheckpointTags(
  projectId: string,
  checkpointId: string,
  tags: string[]
): boolean {
  const checkpoint = getCheckpoint(projectId, checkpointId);

  if (!checkpoint) {
    return false;
  }

  checkpoint.tags = Array.from(new Set([...(checkpoint.tags || []), ...tags]));
  updateCheckpoint(projectId, checkpoint);

  return true;
}

/**
 * Remove tags from a checkpoint
 */
export function removeCheckpointTags(
  projectId: string,
  checkpointId: string,
  tags: string[]
): boolean {
  const checkpoint = getCheckpoint(projectId, checkpointId);

  if (!checkpoint) {
    return false;
  }

  checkpoint.tags = (checkpoint.tags || []).filter(t => !tags.includes(t));
  updateCheckpoint(projectId, checkpoint);

  return true;
}

/**
 * Update checkpoint description
 */
export function updateCheckpointDescription(
  projectId: string,
  checkpointId: string,
  description: string
): boolean {
  const checkpoint = getCheckpoint(projectId, checkpointId);

  if (!checkpoint) {
    return false;
  }

  checkpoint.description = description;
  updateCheckpoint(projectId, checkpoint);

  return true;
}

/**
 * Get checkpoints by tag
 */
export function getCheckpointsByTag(projectId: string, tag: string): Checkpoint[] {
  const checkpoints = loadCheckpoints(projectId);
  return checkpoints.filter(cp => cp.tags?.includes(tag));
}

/**
 * Get the latest checkpoint
 */
export function getLatestCheckpoint(projectId: string): Checkpoint | null {
  const checkpoints = loadCheckpoints(projectId);

  if (checkpoints.length === 0) {
    return null;
  }

  return checkpoints.reduce((latest, cp) =>
    cp.timestamp > latest.timestamp ? cp : latest
  );
}

/**
 * Get checkpoint timeline (sorted by timestamp)
 */
export function getCheckpointTimeline(projectId: string): Checkpoint[] {
  const checkpoints = loadCheckpoints(projectId);
  return checkpoints.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Calculate storage size used by checkpoints
 */
export function getCheckpointsStorageSize(projectId: string): number {
  if (typeof window === 'undefined') return 0;

  try {
    const storageKey = getStorageKey(projectId);
    const data = localStorage.getItem(storageKey);
    return data ? new Blob([data]).size : 0;
  } catch {
    return 0;
  }
}

/**
 * Format storage size for display
 */
export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Export checkpoints for backup
 */
export function exportCheckpoints(projectId: string): string {
  const checkpoints = loadCheckpoints(projectId);
  const branches = getBranches(projectId);

  return JSON.stringify({
    version: 1,
    projectId,
    exportedAt: Date.now(),
    checkpoints,
    branches,
  }, null, 2);
}

/**
 * Import checkpoints from backup
 */
export function importCheckpoints(
  projectId: string,
  data: string,
  options: { merge?: boolean } = {}
): { imported: number; errors: string[] } {
  const result = { imported: 0, errors: [] as string[] };

  if (typeof window === 'undefined') {
    result.errors.push('Import only available in browser');
    return result;
  }

  try {
    const parsed = JSON.parse(data);

    if (!parsed.checkpoints || !Array.isArray(parsed.checkpoints)) {
      result.errors.push('Invalid checkpoint data format');
      return result;
    }

    const existingCheckpoints = options.merge ? loadCheckpoints(projectId) : [];
    const existingIds = new Set(existingCheckpoints.map(cp => cp.id));

    for (const checkpoint of parsed.checkpoints) {
      if (existingIds.has(checkpoint.id)) {
        result.errors.push(`Skipped duplicate checkpoint: ${checkpoint.id}`);
        continue;
      }

      saveCheckpoint(projectId, checkpoint);
      result.imported++;
    }

    // Import branches
    if (parsed.branches && Array.isArray(parsed.branches)) {
      for (const branch of parsed.branches) {
        saveBranch(projectId, branch);
      }
    }

    console.log(`[Checkpoint] Imported ${result.imported} checkpoints`);
  } catch (error) {
    result.errors.push(`Failed to parse import data: ${error}`);
  }

  return result;
}
