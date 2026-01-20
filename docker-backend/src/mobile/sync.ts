/**
 * Offline Sync Protocol for Mobile Devices
 *
 * Provides:
 * - Offline sync protocol
 * - Conflict resolution for file edits
 * - Delta sync for changes only
 * - Queue management for offline operations
 */

import crypto from 'crypto';

// ==================== Types ====================

export type SyncOperationType = 'create' | 'update' | 'delete' | 'rename' | 'move';
export type ConflictResolution = 'server_wins' | 'client_wins' | 'manual' | 'merge';
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  path: string;
  newPath?: string; // For rename/move operations
  content?: string; // For create/update operations
  contentHash?: string; // MD5 hash of content for verification
  baseVersion?: number; // Version this change is based on
  timestamp: number;
  deviceId: string;
  metadata?: Record<string, unknown>;
}

export interface SyncConflict {
  id: string;
  operationId: string;
  path: string;
  serverVersion: FileVersion;
  clientVersion: FileVersion;
  resolution?: ConflictResolution;
  resolvedContent?: string;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface FileVersion {
  content: string;
  contentHash: string;
  version: number;
  modifiedAt: number;
  modifiedBy: string;
  deviceId?: string;
}

export interface SyncQueueEntry {
  operation: SyncOperation;
  status: SyncStatus;
  retryCount: number;
  lastAttempt?: number;
  error?: string;
  priority: number;
}

export interface SyncState {
  projectId: string;
  userId: string;
  deviceId: string;
  lastSyncAt: number;
  lastSyncVersion: number;
  pendingOperations: SyncQueueEntry[];
  conflicts: SyncConflict[];
  fileVersions: Map<string, FileVersion>;
}

export interface SyncResult {
  success: boolean;
  syncedAt: number;
  syncVersion: number;
  appliedOperations: string[];
  conflicts: SyncConflict[];
  serverChanges: SyncOperation[];
  errors: Array<{ operationId: string; error: string }>;
}

export interface DeltaChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  contentHash?: string;
  version: number;
  timestamp: number;
}

export interface SyncStatusInfo {
  status: SyncStatus;
  lastSyncAt: number;
  pendingCount: number;
  conflictCount: number;
  nextSyncAt?: number;
}

// ==================== Constants ====================

const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_BASE = 1000; // 1 second
const RETRY_DELAY_MAX = 60000; // 1 minute
const SYNC_BATCH_SIZE = 50;
const VERSION_INCREMENT = 1;

// ==================== Utilities ====================

/**
 * Generate MD5 hash of content
 */
function hashContent(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Generate unique operation ID
 */
function generateOperationId(): string {
  return `op_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Calculate retry delay with exponential backoff
 */
function calculateRetryDelay(retryCount: number): number {
  const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount);
  return Math.min(delay, RETRY_DELAY_MAX);
}

/**
 * Compare two content hashes
 */
function contentMatches(hash1: string, hash2: string): boolean {
  return hash1.toLowerCase() === hash2.toLowerCase();
}

// ==================== Diff Utilities ====================

/**
 * Simple line-based diff for text content
 */
interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  lineNumber: number;
}

function computeLineDiff(original: string, modified: string): DiffLine[] {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const diff: DiffLine[] = [];

  // Simple LCS-based diff
  const lcs = computeLCS(originalLines, modifiedLines);
  let origIdx = 0;
  let modIdx = 0;
  let lcsIdx = 0;

  while (origIdx < originalLines.length || modIdx < modifiedLines.length) {
    if (lcsIdx < lcs.length && origIdx < originalLines.length && originalLines[origIdx] === lcs[lcsIdx]) {
      if (modIdx < modifiedLines.length && modifiedLines[modIdx] === lcs[lcsIdx]) {
        diff.push({ type: 'unchanged', content: lcs[lcsIdx], lineNumber: origIdx + 1 });
        origIdx++;
        modIdx++;
        lcsIdx++;
      } else if (modIdx < modifiedLines.length) {
        diff.push({ type: 'added', content: modifiedLines[modIdx], lineNumber: modIdx + 1 });
        modIdx++;
      }
    } else if (origIdx < originalLines.length) {
      diff.push({ type: 'removed', content: originalLines[origIdx], lineNumber: origIdx + 1 });
      origIdx++;
    } else if (modIdx < modifiedLines.length) {
      diff.push({ type: 'added', content: modifiedLines[modIdx], lineNumber: modIdx + 1 });
      modIdx++;
    }
  }

  return diff;
}

function computeLCS(arr1: string[], arr2: string[]): string[] {
  const m = arr1.length;
  const n = arr2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcs: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs.unshift(arr1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Three-way merge for conflict resolution
 */
function threeWayMerge(base: string, server: string, client: string): { merged: string; hasConflicts: boolean; conflictMarkers: string[] } {
  const baseLines = base.split('\n');
  const serverLines = server.split('\n');
  const clientLines = client.split('\n');

  const serverDiff = computeLineDiff(base, server);
  const clientDiff = computeLineDiff(base, client);

  const merged: string[] = [];
  const conflictMarkers: string[] = [];
  let hasConflicts = false;

  // Track which lines changed in each version
  const serverChanges = new Map<number, { type: string; content: string }>();
  const clientChanges = new Map<number, { type: string; content: string }>();

  for (const line of serverDiff) {
    if (line.type !== 'unchanged') {
      serverChanges.set(line.lineNumber, { type: line.type, content: line.content });
    }
  }

  for (const line of clientDiff) {
    if (line.type !== 'unchanged') {
      clientChanges.set(line.lineNumber, { type: line.type, content: line.content });
    }
  }

  // Merge line by line
  const maxLines = Math.max(baseLines.length, serverLines.length, clientLines.length);

  for (let i = 0; i < maxLines; i++) {
    const lineNum = i + 1;
    const baseLine = baseLines[i];
    const serverChange = serverChanges.get(lineNum);
    const clientChange = clientChanges.get(lineNum);

    if (!serverChange && !clientChange) {
      // No changes, use base
      if (baseLine !== undefined) {
        merged.push(baseLine);
      }
    } else if (serverChange && !clientChange) {
      // Only server changed
      if (serverChange.type === 'added') {
        merged.push(serverChange.content);
      }
      // If removed, don't add
    } else if (!serverChange && clientChange) {
      // Only client changed
      if (clientChange.type === 'added') {
        merged.push(clientChange.content);
      }
      // If removed, don't add
    } else if (serverChange && clientChange) {
      // Both changed - check if same change
      if (serverChange.content === clientChange.content) {
        merged.push(serverChange.content);
      } else {
        // Conflict
        hasConflicts = true;
        merged.push('<<<<<<< SERVER');
        merged.push(serverChange.content);
        merged.push('=======');
        merged.push(clientChange.content);
        merged.push('>>>>>>> CLIENT');
        conflictMarkers.push(`Line ${lineNum}: server="${serverChange.content}" vs client="${clientChange.content}"`);
      }
    }
  }

  return {
    merged: merged.join('\n'),
    hasConflicts,
    conflictMarkers,
  };
}

// ==================== Sync Manager ====================

class SyncManager {
  private syncStates = new Map<string, SyncState>();
  private globalVersion = 0;
  private operationLog: SyncOperation[] = [];

  /**
   * Get sync state key
   */
  private getStateKey(userId: string, deviceId: string, projectId: string): string {
    return `${userId}:${deviceId}:${projectId}`;
  }

  /**
   * Get or create sync state
   */
  private getSyncState(userId: string, deviceId: string, projectId: string): SyncState {
    const key = this.getStateKey(userId, deviceId, projectId);
    let state = this.syncStates.get(key);

    if (!state) {
      state = {
        projectId,
        userId,
        deviceId,
        lastSyncAt: 0,
        lastSyncVersion: 0,
        pendingOperations: [],
        conflicts: [],
        fileVersions: new Map(),
      };
      this.syncStates.set(key, state);
    }

    return state;
  }

  /**
   * Get current version for a file
   */
  getFileVersion(userId: string, projectId: string, path: string): FileVersion | undefined {
    // Check all device states for the most recent version
    let latestVersion: FileVersion | undefined;

    for (const [key, state] of this.syncStates.entries()) {
      if (key.includes(projectId)) {
        const version = state.fileVersions.get(path);
        if (version && (!latestVersion || version.version > latestVersion.version)) {
          latestVersion = version;
        }
      }
    }

    return latestVersion;
  }

  /**
   * Update file version
   */
  updateFileVersion(
    userId: string,
    projectId: string,
    path: string,
    content: string,
    deviceId?: string
  ): FileVersion {
    const existingVersion = this.getFileVersion(userId, projectId, path);
    const newVersion: FileVersion = {
      content,
      contentHash: hashContent(content),
      version: (existingVersion?.version || 0) + VERSION_INCREMENT,
      modifiedAt: Date.now(),
      modifiedBy: userId,
      deviceId,
    };

    // Update in all device states for this project
    for (const [key, state] of this.syncStates.entries()) {
      if (key.includes(projectId)) {
        state.fileVersions.set(path, newVersion);
      }
    }

    return newVersion;
  }

  /**
   * Process sync operations from a device
   */
  async processSync(
    userId: string,
    deviceId: string,
    projectId: string,
    operations: SyncOperation[],
    lastSyncAt?: number,
    conflictResolution: ConflictResolution = 'server_wins'
  ): Promise<SyncResult> {
    const state = this.getSyncState(userId, deviceId, projectId);
    const now = Date.now();
    const appliedOperations: string[] = [];
    const conflicts: SyncConflict[] = [];
    const errors: Array<{ operationId: string; error: string }> = [];

    // Get server changes since last sync
    const serverChanges = this.getServerChangesSince(projectId, lastSyncAt || state.lastSyncAt);

    // Process each operation
    for (const op of operations) {
      try {
        const result = await this.processOperation(userId, deviceId, projectId, op, conflictResolution);

        if (result.conflict) {
          conflicts.push(result.conflict);
        } else if (result.applied) {
          appliedOperations.push(op.id);
        }
      } catch (error) {
        errors.push({
          operationId: op.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Update sync state
    this.globalVersion++;
    state.lastSyncAt = now;
    state.lastSyncVersion = this.globalVersion;
    state.conflicts = [...state.conflicts, ...conflicts];

    // Remove applied operations from pending queue
    state.pendingOperations = state.pendingOperations.filter(
      entry => !appliedOperations.includes(entry.operation.id)
    );

    return {
      success: errors.length === 0,
      syncedAt: now,
      syncVersion: this.globalVersion,
      appliedOperations,
      conflicts,
      serverChanges,
      errors,
    };
  }

  /**
   * Process a single sync operation
   */
  private async processOperation(
    userId: string,
    deviceId: string,
    projectId: string,
    operation: SyncOperation,
    conflictResolution: ConflictResolution
  ): Promise<{ applied: boolean; conflict?: SyncConflict }> {
    const currentVersion = this.getFileVersion(userId, projectId, operation.path);

    // Check for conflicts
    if (currentVersion && operation.baseVersion !== undefined) {
      if (operation.baseVersion < currentVersion.version) {
        // Version mismatch - potential conflict
        const conflict = this.detectConflict(userId, projectId, operation, currentVersion);

        if (conflict) {
          // Try to resolve conflict
          const resolved = this.resolveConflict(conflict, conflictResolution);

          if (resolved) {
            // Apply resolved content
            this.applyOperation(userId, projectId, {
              ...operation,
              content: resolved.resolvedContent,
            }, deviceId);
            return { applied: true };
          }

          return { applied: false, conflict };
        }
      }
    }

    // No conflict, apply operation
    this.applyOperation(userId, projectId, operation, deviceId);

    // Log operation
    this.operationLog.push(operation);

    // Keep log size manageable
    if (this.operationLog.length > 10000) {
      this.operationLog = this.operationLog.slice(-5000);
    }

    return { applied: true };
  }

  /**
   * Detect if there's a real conflict
   */
  private detectConflict(
    userId: string,
    projectId: string,
    operation: SyncOperation,
    serverVersion: FileVersion
  ): SyncConflict | null {
    // No conflict if content matches
    if (operation.contentHash && contentMatches(operation.contentHash, serverVersion.contentHash)) {
      return null;
    }

    // Create conflict record
    return {
      id: crypto.randomUUID(),
      operationId: operation.id,
      path: operation.path,
      serverVersion,
      clientVersion: {
        content: operation.content || '',
        contentHash: operation.contentHash || hashContent(operation.content || ''),
        version: operation.baseVersion || 0,
        modifiedAt: operation.timestamp,
        modifiedBy: userId,
        deviceId: operation.deviceId,
      },
    };
  }

  /**
   * Resolve a conflict based on strategy
   */
  private resolveConflict(conflict: SyncConflict, resolution: ConflictResolution): SyncConflict | null {
    switch (resolution) {
      case 'server_wins':
        conflict.resolution = 'server_wins';
        conflict.resolvedContent = conflict.serverVersion.content;
        conflict.resolvedAt = Date.now();
        return conflict;

      case 'client_wins':
        conflict.resolution = 'client_wins';
        conflict.resolvedContent = conflict.clientVersion.content;
        conflict.resolvedAt = Date.now();
        return conflict;

      case 'merge':
        // Attempt three-way merge
        // For merge, we need a common base which might not be available
        // Fall back to client version if merge fails
        const baseContent = conflict.serverVersion.content; // Use server as base for now
        const { merged, hasConflicts } = threeWayMerge(
          baseContent,
          conflict.serverVersion.content,
          conflict.clientVersion.content
        );

        if (!hasConflicts) {
          conflict.resolution = 'merge';
          conflict.resolvedContent = merged;
          conflict.resolvedAt = Date.now();
          return conflict;
        }

        // Merge has conflicts, leave for manual resolution
        return null;

      case 'manual':
      default:
        // Return null to indicate manual resolution needed
        return null;
    }
  }

  /**
   * Apply an operation to the file version store
   */
  private applyOperation(
    userId: string,
    projectId: string,
    operation: SyncOperation,
    deviceId: string
  ): void {
    switch (operation.type) {
      case 'create':
      case 'update':
        if (operation.content !== undefined) {
          this.updateFileVersion(userId, projectId, operation.path, operation.content, deviceId);
        }
        break;

      case 'delete':
        // Remove file version
        for (const [key, state] of this.syncStates.entries()) {
          if (key.includes(projectId)) {
            state.fileVersions.delete(operation.path);
          }
        }
        break;

      case 'rename':
      case 'move':
        if (operation.newPath) {
          const currentVersion = this.getFileVersion(userId, projectId, operation.path);
          if (currentVersion) {
            // Create at new path
            this.updateFileVersion(userId, projectId, operation.newPath, currentVersion.content, deviceId);
            // Delete from old path
            for (const [key, state] of this.syncStates.entries()) {
              if (key.includes(projectId)) {
                state.fileVersions.delete(operation.path);
              }
            }
          }
        }
        break;
    }
  }

  /**
   * Get server changes since a timestamp
   */
  getServerChangesSince(projectId: string, since: number): SyncOperation[] {
    return this.operationLog.filter(op => {
      // Check if operation is for this project (simplified check)
      return op.timestamp > since;
    });
  }

  /**
   * Get sync status for a project
   */
  getSyncStatus(userId: string, deviceId: string, projectId: string): SyncStatusInfo {
    const state = this.getSyncState(userId, deviceId, projectId);

    let status: SyncStatus = 'synced';
    if (state.conflicts.filter(c => !c.resolvedAt).length > 0) {
      status = 'conflict';
    } else if (state.pendingOperations.length > 0) {
      status = 'pending';
    }

    return {
      status,
      lastSyncAt: state.lastSyncAt,
      pendingCount: state.pendingOperations.length,
      conflictCount: state.conflicts.filter(c => !c.resolvedAt).length,
    };
  }

  /**
   * Get pending operations for a device
   */
  getPendingOperations(
    userId: string,
    deviceId: string,
    projectId: string,
    since?: number
  ): { operations: SyncOperation[]; conflicts: SyncConflict[] } {
    const state = this.getSyncState(userId, deviceId, projectId);

    const operations = state.pendingOperations
      .filter(entry => !since || entry.operation.timestamp > since)
      .map(entry => entry.operation);

    const conflicts = state.conflicts.filter(c => !c.resolvedAt);

    return { operations, conflicts };
  }

  /**
   * Queue an operation for offline sync
   */
  queueOperation(
    userId: string,
    deviceId: string,
    projectId: string,
    operation: Omit<SyncOperation, 'id' | 'timestamp' | 'deviceId'>,
    priority: number = 0
  ): SyncOperation {
    const state = this.getSyncState(userId, deviceId, projectId);

    const fullOperation: SyncOperation = {
      ...operation,
      id: generateOperationId(),
      timestamp: Date.now(),
      deviceId,
      contentHash: operation.content ? hashContent(operation.content) : undefined,
    };

    const entry: SyncQueueEntry = {
      operation: fullOperation,
      status: 'pending',
      retryCount: 0,
      priority,
    };

    // Insert based on priority
    const insertIndex = state.pendingOperations.findIndex(e => e.priority < priority);
    if (insertIndex === -1) {
      state.pendingOperations.push(entry);
    } else {
      state.pendingOperations.splice(insertIndex, 0, entry);
    }

    return fullOperation;
  }

  /**
   * Retry failed operations
   */
  async retryFailedOperations(
    userId: string,
    deviceId: string,
    projectId: string
  ): Promise<{ retried: number; failed: number }> {
    const state = this.getSyncState(userId, deviceId, projectId);
    let retried = 0;
    let failed = 0;

    for (const entry of state.pendingOperations) {
      if (entry.status === 'error' && entry.retryCount < MAX_RETRY_COUNT) {
        const delay = calculateRetryDelay(entry.retryCount);
        const timeSinceLastAttempt = Date.now() - (entry.lastAttempt || 0);

        if (timeSinceLastAttempt >= delay) {
          entry.retryCount++;
          entry.lastAttempt = Date.now();
          entry.status = 'pending';
          retried++;
        }
      } else if (entry.retryCount >= MAX_RETRY_COUNT) {
        failed++;
      }
    }

    return { retried, failed };
  }

  /**
   * Resolve a conflict manually
   */
  resolveConflictManually(
    userId: string,
    deviceId: string,
    projectId: string,
    conflictId: string,
    resolution: ConflictResolution,
    resolvedContent?: string
  ): boolean {
    const state = this.getSyncState(userId, deviceId, projectId);
    const conflict = state.conflicts.find(c => c.id === conflictId);

    if (!conflict || conflict.resolvedAt) {
      return false;
    }

    conflict.resolution = resolution;
    conflict.resolvedAt = Date.now();
    conflict.resolvedBy = userId;

    if (resolution === 'server_wins') {
      conflict.resolvedContent = conflict.serverVersion.content;
    } else if (resolution === 'client_wins') {
      conflict.resolvedContent = conflict.clientVersion.content;
    } else if (resolvedContent) {
      conflict.resolvedContent = resolvedContent;
    }

    // Apply the resolved content
    if (conflict.resolvedContent) {
      this.updateFileVersion(userId, projectId, conflict.path, conflict.resolvedContent, deviceId);
    }

    return true;
  }

  /**
   * Get delta changes for a project
   */
  getDeltaChanges(
    userId: string,
    deviceId: string,
    projectId: string,
    sinceVersion: number
  ): DeltaChange[] {
    const changes: DeltaChange[] = [];
    const seen = new Set<string>();

    // Get all file versions that changed since the given version
    for (const [key, state] of this.syncStates.entries()) {
      if (key.includes(projectId)) {
        for (const [path, version] of state.fileVersions.entries()) {
          if (version.version > sinceVersion && !seen.has(path)) {
            seen.add(path);
            changes.push({
              path,
              type: 'modified',
              contentHash: version.contentHash,
              version: version.version,
              timestamp: version.modifiedAt,
            });
          }
        }
      }
    }

    // Sort by version
    changes.sort((a, b) => a.version - b.version);

    return changes;
  }

  /**
   * Get statistics for sync operations
   */
  getStats(): {
    totalStates: number;
    totalOperations: number;
    pendingOperations: number;
    unresolvedConflicts: number;
    globalVersion: number;
  } {
    let pendingOperations = 0;
    let unresolvedConflicts = 0;

    for (const state of this.syncStates.values()) {
      pendingOperations += state.pendingOperations.length;
      unresolvedConflicts += state.conflicts.filter(c => !c.resolvedAt).length;
    }

    return {
      totalStates: this.syncStates.size,
      totalOperations: this.operationLog.length,
      pendingOperations,
      unresolvedConflicts,
      globalVersion: this.globalVersion,
    };
  }

  /**
   * Clear sync state for a project (useful for project deletion)
   */
  clearProjectState(projectId: string): number {
    let cleared = 0;
    for (const [key] of this.syncStates.entries()) {
      if (key.includes(projectId)) {
        this.syncStates.delete(key);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Clear all sync states for a user
   */
  clearUserState(userId: string): number {
    let cleared = 0;
    for (const [key] of this.syncStates.entries()) {
      if (key.startsWith(userId)) {
        this.syncStates.delete(key);
        cleared++;
      }
    }
    return cleared;
  }
}

// ==================== Singleton Instance ====================

export const syncManager = new SyncManager();

// ==================== Exports ====================

export {
  SyncManager,
  hashContent,
  generateOperationId,
  computeLineDiff,
  threeWayMerge,
};
