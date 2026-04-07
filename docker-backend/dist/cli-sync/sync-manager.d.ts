/**
 * CLI-Web Sync Manager
 * Manages synchronization state and operations between CLI and web IDE
 */
import { EventEmitter } from 'events';
import { getDiffStats, type DiffResult, type DetailedFileDiff } from './file-diff.js';
export interface SyncLink {
    projectId: string;
    userId: string;
    linkedAt: string;
    lastSyncAt?: string;
    syncDirection?: 'push' | 'pull' | 'bidirectional';
    cliVersion?: string;
    clientId: string;
}
export interface SyncSession {
    projectId: string;
    userId: string;
    clientId: string;
    connectedAt: string;
    lastActivity: string;
    status: 'connected' | 'syncing' | 'idle' | 'error';
    pendingChanges: number;
}
export interface SyncState {
    projectId: string;
    localFiles: Record<string, string>;
    remoteFiles: Record<string, string>;
    lastLocalHash: string;
    lastRemoteHash: string;
    conflictFiles: string[];
}
export interface SyncEvent {
    type: 'file-created' | 'file-modified' | 'file-deleted' | 'sync-complete' | 'conflict';
    projectId: string;
    path?: string;
    source: 'cli' | 'web';
    timestamp: string;
    data?: unknown;
}
declare class SyncManager extends EventEmitter {
    private links;
    private sessions;
    private syncState;
    private fileHashes;
    constructor();
    /**
     * Link a CLI client to a project
     */
    linkProject(params: {
        projectId: string;
        userId: string;
        clientId: string;
        cliVersion?: string;
    }): SyncLink;
    /**
     * Unlink a CLI client from a project
     */
    unlinkProject(projectId: string): boolean;
    /**
     * Check if a project is linked
     */
    isLinked(projectId: string): boolean;
    /**
     * Get link info for a project
     */
    getLink(projectId: string): SyncLink | undefined;
    /**
     * Register a new sync session (WebSocket connection)
     */
    registerSession(params: {
        projectId: string;
        userId: string;
        clientId: string;
    }): SyncSession;
    /**
     * Update session activity
     */
    updateSessionActivity(clientId: string, status?: SyncSession['status']): void;
    /**
     * Close a sync session
     */
    closeSession(clientId: string): void;
    /**
     * Get active sessions for a project
     */
    getProjectSessions(projectId: string): SyncSession[];
    /**
     * Get sync status for a project
     */
    getSyncStatus(projectId: string, currentFiles?: Record<string, string>): {
        isLinked: boolean;
        link?: SyncLink;
        activeSessions: number;
        diff?: DiffResult;
        stats?: ReturnType<typeof getDiffStats>;
    };
    /**
     * Update remote files state (from web IDE)
     */
    updateRemoteState(projectId: string, files: Record<string, string>): void;
    /**
     * Update local files state (from CLI)
     */
    updateLocalState(projectId: string, files: Record<string, string>): void;
    /**
     * Compute diff between local and remote
     */
    computeDiff(projectId: string, localFiles: Record<string, string>, remoteFiles: Record<string, string>): {
        diff: DiffResult;
        detailed: DetailedFileDiff[];
        stats: ReturnType<typeof getDiffStats>;
    };
    /**
     * Execute push: Apply local files to remote
     */
    executePush(projectId: string, localFiles: Record<string, string>, remoteFiles: Record<string, string>, applyToRemote: (files: Record<string, string>, deleted: string[]) => Promise<void>): Promise<{
        success: boolean;
        applied: {
            added: string[];
            modified: string[];
            deleted: string[];
        };
    }>;
    /**
     * Execute pull: Apply remote files to local
     */
    executePull(projectId: string, localFiles: Record<string, string>, remoteFiles: Record<string, string>, applyToLocal: (files: Record<string, string>, deleted: string[]) => Promise<void>): Promise<{
        success: boolean;
        applied: {
            added: string[];
            modified: string[];
            deleted: string[];
        };
    }>;
    /**
     * Broadcast a sync event to all connected clients for a project
     */
    broadcastEvent(projectId: string, event: Omit<SyncEvent, 'projectId' | 'timestamp'>): void;
    /**
     * Handle incoming file change from CLI
     */
    handleCliFileChange(params: {
        projectId: string;
        clientId: string;
        path: string;
        content?: string;
    }): void;
    /**
     * Handle incoming file change from web IDE
     */
    handleWebFileChange(params: {
        projectId: string;
        path: string;
        content?: string;
    }): void;
    /**
     * Compute a hash representing the entire file set
     */
    private computeFilesHash;
    /**
     * Clean up stale sessions (no activity for more than 5 minutes)
     */
    cleanupStaleSessions(): void;
    /**
     * Get all active links (for debugging/admin)
     */
    getAllLinks(): SyncLink[];
    /**
     * Get all active sessions (for debugging/admin)
     */
    getAllSessions(): SyncSession[];
}
export declare const syncManager: SyncManager;
export {};
