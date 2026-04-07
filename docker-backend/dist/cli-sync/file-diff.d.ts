/**
 * File Diff Utilities for CLI-Web Sync
 * Provides utilities for comparing files between CLI and web IDE
 */
export interface FileMeta {
    path: string;
    hash: string;
    size: number;
    mtime?: number;
}
export interface DiffResult {
    added: string[];
    modified: string[];
    deleted: string[];
    unchanged: string[];
}
export interface DetailedFileDiff {
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'unchanged';
    localHash?: string;
    remoteHash?: string;
    localSize?: number;
    remoteSize?: number;
}
/**
 * Calculate SHA256 hash of content
 */
export declare function hashContent(content: string | Buffer): string;
/**
 * Create file metadata map from content map
 */
export declare function createFileMetaMap(files: Record<string, string>): Map<string, FileMeta>;
/**
 * Compare two file sets and return differences
 */
export declare function diffFileSets(localFiles: Record<string, string>, remoteFiles: Record<string, string>): DiffResult;
/**
 * Get detailed diff information for each file
 */
export declare function getDetailedDiff(localFiles: Record<string, string>, remoteFiles: Record<string, string>): DetailedFileDiff[];
/**
 * Generate unified diff between two file contents
 */
export declare function generateUnifiedDiff(path: string, localContent: string | undefined, remoteContent: string | undefined): string;
/**
 * Calculate statistics about a diff
 */
export declare function getDiffStats(diff: DiffResult): {
    totalChanges: number;
    addedCount: number;
    modifiedCount: number;
    deletedCount: number;
    unchangedCount: number;
    hasChanges: boolean;
};
