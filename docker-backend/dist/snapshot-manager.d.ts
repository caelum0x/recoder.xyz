/**
 * Git-based Snapshot Manager
 * Handles project snapshots using Git for instant rollback/restore
 *
 * Each snapshot is a Git commit in the project's /workspace directory.
 * This enables:
 * - Instant restore to any previous state
 * - Diff comparison between snapshots
 * - Auto-save at key moments (before AI changes, after user saves)
 */
export interface Snapshot {
    id: string;
    fullHash: string;
    message: string;
    timestamp: number;
    author: string;
    filesChanged?: number;
    additions?: number;
    deletions?: number;
    neonDbTimestamp?: string;
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
/**
 * SnapshotManager - Git-based project state management
 */
export declare class SnapshotManager {
    private autoSaveIntervals;
    private autoSaveEnabled;
    /**
     * Initialize Git repository in container if not exists
     */
    initRepo(containerId: string): Promise<void>;
    /**
     * Create a new snapshot (Git commit)
     */
    createSnapshot(containerId: string, projectId: string, message: string, author?: 'user' | 'ai' | 'auto', options?: {
        neonDbTimestamp?: string;
    }): Promise<Snapshot>;
    /**
     * Get current HEAD snapshot
     */
    getCurrentSnapshot(containerId: string): Promise<Snapshot | null>;
    /**
     * List all snapshots (Git commits)
     */
    listSnapshots(containerId: string, limit?: number): Promise<Snapshot[]>;
    /**
     * Restore to a specific snapshot
     */
    restoreSnapshot(containerId: string, projectId: string, snapshotId: string): Promise<boolean>;
    /**
     * Get neonDbTimestamp for a specific snapshot (public, for restore route)
     */
    getSnapshotDbTimestamp(containerId: string, snapshotId: string): Promise<string | undefined>;
    /**
     * Read neonDbTimestamp from git notes for a single commit
     */
    private readNoteTimestamp;
    /**
     * Batch-read all git notes (hash → neonDbTimestamp) for efficiency
     */
    private readAllNotes;
    /**
     * Get diff between two snapshots
     */
    getDiff(containerId: string, fromSnapshot: string, toSnapshot?: string): Promise<SnapshotDiff>;
    /**
     * Get unified diff for a specific file between snapshots
     */
    getFileDiff(containerId: string, filePath: string, fromSnapshot: string, toSnapshot?: string): Promise<string>;
    /**
     * Enable auto-save for a project
     */
    startAutoSave(containerId: string, projectId: string, intervalMs?: number): void;
    /**
     * Stop auto-save for a project
     */
    stopAutoSave(projectId: string): void;
    /**
     * Check if there are unsaved changes
     */
    hasUnsavedChanges(containerId: string): Promise<boolean>;
    /**
     * Get file content at a specific snapshot
     */
    getFileAtSnapshot(containerId: string, filePath: string, snapshotId: string): Promise<string | null>;
    /**
     * Compress Git repository to save space
     * Git already compresses objects, but gc --aggressive optimizes further
     */
    compress(containerId: string): Promise<{
        before: string;
        after: string;
    }>;
    /**
     * Prune old snapshots, keeping only the last N
     */
    pruneOldSnapshots(containerId: string, keepCount?: number): Promise<number>;
    /**
     * Get repository stats
     */
    getStats(containerId: string): Promise<{
        totalSnapshots: number;
        repoSize: string;
        oldestSnapshot: string | null;
        newestSnapshot: string | null;
    }>;
}
export declare const snapshotManager: SnapshotManager;
