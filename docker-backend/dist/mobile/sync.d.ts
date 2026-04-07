/**
 * Offline Sync Protocol for Mobile Devices
 *
 * Provides:
 * - Offline sync protocol
 * - Conflict resolution for file edits
 * - Delta sync for changes only
 * - Queue management for offline operations
 */
export type SyncOperationType = 'create' | 'update' | 'delete' | 'rename' | 'move';
export type ConflictResolution = 'server_wins' | 'client_wins' | 'manual' | 'merge';
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';
export interface SyncOperation {
    id: string;
    type: SyncOperationType;
    path: string;
    newPath?: string;
    content?: string;
    contentHash?: string;
    baseVersion?: number;
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
    errors: Array<{
        operationId: string;
        error: string;
    }>;
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
/**
 * Generate MD5 hash of content
 */
declare function hashContent(content: string): string;
/**
 * Generate unique operation ID
 */
declare function generateOperationId(): string;
/**
 * Simple line-based diff for text content
 */
interface DiffLine {
    type: 'unchanged' | 'added' | 'removed';
    content: string;
    lineNumber: number;
}
declare function computeLineDiff(original: string, modified: string): DiffLine[];
/**
 * Three-way merge for conflict resolution
 */
declare function threeWayMerge(base: string, server: string, client: string): {
    merged: string;
    hasConflicts: boolean;
    conflictMarkers: string[];
};
declare class SyncManager {
    private syncStates;
    private globalVersion;
    private operationLog;
    /**
     * Get sync state key
     */
    private getStateKey;
    /**
     * Get or create sync state
     */
    private getSyncState;
    /**
     * Get current version for a file
     */
    getFileVersion(userId: string, projectId: string, path: string): FileVersion | undefined;
    /**
     * Update file version
     */
    updateFileVersion(userId: string, projectId: string, path: string, content: string, deviceId?: string): FileVersion;
    /**
     * Process sync operations from a device
     */
    processSync(userId: string, deviceId: string, projectId: string, operations: SyncOperation[], lastSyncAt?: number, conflictResolution?: ConflictResolution): Promise<SyncResult>;
    /**
     * Process a single sync operation
     */
    private processOperation;
    /**
     * Detect if there's a real conflict
     */
    private detectConflict;
    /**
     * Resolve a conflict based on strategy
     */
    private resolveConflict;
    /**
     * Apply an operation to the file version store
     */
    private applyOperation;
    /**
     * Get server changes since a timestamp
     */
    getServerChangesSince(projectId: string, since: number): SyncOperation[];
    /**
     * Get sync status for a project
     */
    getSyncStatus(userId: string, deviceId: string, projectId: string): SyncStatusInfo;
    /**
     * Get pending operations for a device
     */
    getPendingOperations(userId: string, deviceId: string, projectId: string, since?: number): {
        operations: SyncOperation[];
        conflicts: SyncConflict[];
    };
    /**
     * Queue an operation for offline sync
     */
    queueOperation(userId: string, deviceId: string, projectId: string, operation: Omit<SyncOperation, 'id' | 'timestamp' | 'deviceId'>, priority?: number): SyncOperation;
    /**
     * Retry failed operations
     */
    retryFailedOperations(userId: string, deviceId: string, projectId: string): Promise<{
        retried: number;
        failed: number;
    }>;
    /**
     * Resolve a conflict manually
     */
    resolveConflictManually(userId: string, deviceId: string, projectId: string, conflictId: string, resolution: ConflictResolution, resolvedContent?: string): boolean;
    /**
     * Get delta changes for a project
     */
    getDeltaChanges(userId: string, deviceId: string, projectId: string, sinceVersion: number): DeltaChange[];
    /**
     * Get statistics for sync operations
     */
    getStats(): {
        totalStates: number;
        totalOperations: number;
        pendingOperations: number;
        unresolvedConflicts: number;
        globalVersion: number;
    };
    /**
     * Clear sync state for a project (useful for project deletion)
     */
    clearProjectState(projectId: string): number;
    /**
     * Clear all sync states for a user
     */
    clearUserState(userId: string): number;
}
export declare const syncManager: SyncManager;
export { SyncManager, hashContent, generateOperationId, computeLineDiff, threeWayMerge, };
