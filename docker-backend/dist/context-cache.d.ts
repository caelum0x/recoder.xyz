/**
 * Server-Side Context Cache
 * Sprint 8-3: Prompt Caching / Context Optimization
 *
 * Eliminates redundant context transmission by:
 * 1. Caching file contents server-side with content hashes
 * 2. Accepting only changed files from client
 * 3. Reconstructing full context from cache + diff
 * 4. Supports Anthropic prompt caching headers when available
 *
 * Benefits:
 * - Reduces request payload size by 90%+ for unchanged projects
 * - Cuts latency for large projects
 * - Reduces API costs (smaller prompts)
 */
export interface CachedFile {
    content: string;
    hash: string;
    size: number;
    cachedAt: number;
}
export interface CachedContext {
    id: string;
    projectId: string;
    files: Map<string, CachedFile>;
    systemPromptHash?: string;
    systemPromptContent?: string;
    createdAt: number;
    lastAccessed: number;
    accessCount: number;
    totalSize: number;
}
export interface ContextDiff {
    cacheId: string;
    changedFiles: Map<string, string>;
    deletedFiles: string[];
    unchangedHashes: Map<string, string>;
}
export interface ContextCacheStats {
    totalCaches: number;
    totalFiles: number;
    totalSizeBytes: number;
    hitCount: number;
    missCount: number;
    hitRate: number;
    avgFilesPerCache: number;
    oldestCacheAge: number;
}
export interface ContextUpdateResult {
    cacheId: string;
    filesUpdated: number;
    filesFromCache: number;
    bytesSaved: number;
    reconstructedContext: Map<string, string>;
}
declare class ContextCacheManager {
    private caches;
    private projectIndex;
    private ttl;
    private hitCount;
    private missCount;
    private cleanupTimer;
    constructor();
    /**
     * Create or update a context cache for a project
     */
    createCache(projectId: string, files: Map<string, string>, systemPrompt?: string): string;
    /**
     * Get cached context by ID
     */
    getCache(cacheId: string): CachedContext | null;
    /**
     * Compute diff between client files and cached context
     */
    computeDiff(cacheId: string, currentFiles: Map<string, string>): ContextDiff | null;
    /**
     * Apply diff to cached context and return full reconstructed context
     */
    applyDiff(cacheId: string, diff: Partial<ContextDiff>): ContextUpdateResult | null;
    /**
     * Get file hashes for a cached context (for client-side comparison)
     */
    getFileHashes(cacheId: string): Map<string, string> | null;
    /**
     * Validate client-provided hashes against cache
     */
    validateHashes(cacheId: string, clientHashes: Map<string, string>): {
        valid: boolean;
        mismatches: string[];
    };
    /**
     * Get latest cache ID for a project
     */
    getLatestCacheForProject(projectId: string): string | null;
    /**
     * Delete a specific cache
     */
    deleteCache(cacheId: string): boolean;
    /**
     * Delete all caches for a project
     */
    deleteProjectCaches(projectId: string): number;
    /**
     * Get cache statistics
     */
    getStats(): ContextCacheStats;
    /**
     * Clear all caches
     */
    clearAll(): void;
    /**
     * Set TTL for cache entries
     */
    setTTL(ttlMs: number): void;
    /**
     * Shutdown cleanup timer
     */
    shutdown(): void;
    private generateCacheId;
    private hashContent;
    private formatBytes;
    private cleanupProjectCaches;
    private enforceCacheLimit;
    private cleanupExpiredCaches;
    private startCleanupTimer;
}
export declare const contextCache: ContextCacheManager;
export declare function computeFileHash(content: string): string;
export declare function computeFileHashes(files: Map<string, string>): Map<string, string>;
export {};
