"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contextCache = void 0;
exports.computeFileHash = computeFileHash;
exports.computeFileHashes = computeFileHashes;
const crypto_1 = __importDefault(require("crypto"));
// ============================================================================
// Configuration
// ============================================================================
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 100; // Maximum number of cached contexts
const MAX_FILE_SIZE = 500 * 1024; // 500KB max per file
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes
// ============================================================================
// Context Cache Manager
// ============================================================================
class ContextCacheManager {
    caches = new Map();
    projectIndex = new Map(); // projectId -> cacheIds
    ttl = DEFAULT_TTL_MS;
    hitCount = 0;
    missCount = 0;
    cleanupTimer = null;
    constructor() {
        this.startCleanupTimer();
    }
    // --------------------------------------------------------------------------
    // Public API
    // --------------------------------------------------------------------------
    /**
     * Create or update a context cache for a project
     */
    createCache(projectId, files, systemPrompt) {
        // Clean up old caches for this project
        this.cleanupProjectCaches(projectId);
        // Generate cache ID
        const cacheId = this.generateCacheId(projectId);
        // Hash and store files
        const cachedFiles = new Map();
        let totalSize = 0;
        for (const [path, content] of files) {
            if (content.length > MAX_FILE_SIZE) {
                console.warn(`[ContextCache] File ${path} exceeds max size, truncating`);
            }
            const truncatedContent = content.slice(0, MAX_FILE_SIZE);
            const hash = this.hashContent(truncatedContent);
            const size = Buffer.byteLength(truncatedContent, 'utf8');
            cachedFiles.set(path, {
                content: truncatedContent,
                hash,
                size,
                cachedAt: Date.now(),
            });
            totalSize += size;
        }
        // Hash system prompt if provided
        const systemPromptHash = systemPrompt ? this.hashContent(systemPrompt) : undefined;
        const cachedContext = {
            id: cacheId,
            projectId,
            files: cachedFiles,
            systemPromptHash,
            systemPromptContent: systemPrompt,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 0,
            totalSize,
        };
        this.caches.set(cacheId, cachedContext);
        // Update project index
        if (!this.projectIndex.has(projectId)) {
            this.projectIndex.set(projectId, new Set());
        }
        this.projectIndex.get(projectId).add(cacheId);
        // Enforce max cache size
        this.enforceCacheLimit();
        console.log(`[ContextCache] Created cache ${cacheId} for project ${projectId} (${cachedFiles.size} files, ${this.formatBytes(totalSize)})`);
        return cacheId;
    }
    /**
     * Get cached context by ID
     */
    getCache(cacheId) {
        const cache = this.caches.get(cacheId);
        if (!cache) {
            this.missCount++;
            return null;
        }
        // Check if expired
        if (Date.now() - cache.lastAccessed > this.ttl) {
            this.deleteCache(cacheId);
            this.missCount++;
            return null;
        }
        // Update access stats
        cache.lastAccessed = Date.now();
        cache.accessCount++;
        this.hitCount++;
        return cache;
    }
    /**
     * Compute diff between client files and cached context
     */
    computeDiff(cacheId, currentFiles) {
        const cache = this.getCache(cacheId);
        if (!cache) {
            return null;
        }
        const changedFiles = new Map();
        const deletedFiles = [];
        const unchangedHashes = new Map();
        // Find changed and new files
        for (const [path, content] of currentFiles) {
            const cachedFile = cache.files.get(path);
            const currentHash = this.hashContent(content);
            if (!cachedFile) {
                // New file
                changedFiles.set(path, content);
            }
            else if (cachedFile.hash !== currentHash) {
                // Modified file
                changedFiles.set(path, content);
            }
            else {
                // Unchanged file
                unchangedHashes.set(path, currentHash);
            }
        }
        // Find deleted files
        for (const path of cache.files.keys()) {
            if (!currentFiles.has(path)) {
                deletedFiles.push(path);
            }
        }
        return {
            cacheId,
            changedFiles,
            deletedFiles,
            unchangedHashes,
        };
    }
    /**
     * Apply diff to cached context and return full reconstructed context
     */
    applyDiff(cacheId, diff) {
        const cache = this.getCache(cacheId);
        if (!cache) {
            return null;
        }
        const reconstructedContext = new Map();
        let filesUpdated = 0;
        let filesFromCache = 0;
        let bytesSaved = 0;
        // Start with cached files
        for (const [path, cachedFile] of cache.files) {
            // Skip deleted files
            if (diff.deletedFiles?.includes(path)) {
                continue;
            }
            // Check if file was updated
            if (diff.changedFiles?.has(path)) {
                const newContent = diff.changedFiles.get(path);
                reconstructedContext.set(path, newContent);
                // Update cache with new content
                const hash = this.hashContent(newContent);
                const size = Buffer.byteLength(newContent, 'utf8');
                cache.files.set(path, {
                    content: newContent,
                    hash,
                    size,
                    cachedAt: Date.now(),
                });
                filesUpdated++;
            }
            else {
                // Use cached content
                reconstructedContext.set(path, cachedFile.content);
                bytesSaved += cachedFile.size;
                filesFromCache++;
            }
        }
        // Add new files that weren't in cache
        if (diff.changedFiles) {
            for (const [path, content] of diff.changedFiles) {
                if (!cache.files.has(path)) {
                    reconstructedContext.set(path, content);
                    // Add to cache
                    const hash = this.hashContent(content);
                    const size = Buffer.byteLength(content, 'utf8');
                    cache.files.set(path, {
                        content,
                        hash,
                        size,
                        cachedAt: Date.now(),
                    });
                    filesUpdated++;
                }
            }
        }
        // Remove deleted files from cache
        if (diff.deletedFiles) {
            for (const path of diff.deletedFiles) {
                cache.files.delete(path);
            }
        }
        // Update cache total size
        cache.totalSize = Array.from(cache.files.values()).reduce((sum, f) => sum + f.size, 0);
        console.log(`[ContextCache] Applied diff to ${cacheId}: ${filesUpdated} updated, ${filesFromCache} from cache, ${this.formatBytes(bytesSaved)} saved`);
        return {
            cacheId,
            filesUpdated,
            filesFromCache,
            bytesSaved,
            reconstructedContext,
        };
    }
    /**
     * Get file hashes for a cached context (for client-side comparison)
     */
    getFileHashes(cacheId) {
        const cache = this.getCache(cacheId);
        if (!cache) {
            return null;
        }
        const hashes = new Map();
        for (const [path, file] of cache.files) {
            hashes.set(path, file.hash);
        }
        return hashes;
    }
    /**
     * Validate client-provided hashes against cache
     */
    validateHashes(cacheId, clientHashes) {
        const cache = this.getCache(cacheId);
        if (!cache) {
            return { valid: false, mismatches: [] };
        }
        const mismatches = [];
        for (const [path, clientHash] of clientHashes) {
            const cachedFile = cache.files.get(path);
            if (!cachedFile) {
                mismatches.push(path);
            }
            else if (cachedFile.hash !== clientHash) {
                mismatches.push(path);
            }
        }
        return {
            valid: mismatches.length === 0,
            mismatches,
        };
    }
    /**
     * Get latest cache ID for a project
     */
    getLatestCacheForProject(projectId) {
        const cacheIds = this.projectIndex.get(projectId);
        if (!cacheIds || cacheIds.size === 0) {
            return null;
        }
        // Find the most recently accessed cache
        let latestCache = null;
        let latestId = null;
        for (const cacheId of cacheIds) {
            const cache = this.caches.get(cacheId);
            if (cache && (!latestCache || cache.lastAccessed > latestCache.lastAccessed)) {
                latestCache = cache;
                latestId = cacheId;
            }
        }
        return latestId;
    }
    /**
     * Delete a specific cache
     */
    deleteCache(cacheId) {
        const cache = this.caches.get(cacheId);
        if (!cache) {
            return false;
        }
        // Remove from project index
        const projectCaches = this.projectIndex.get(cache.projectId);
        if (projectCaches) {
            projectCaches.delete(cacheId);
            if (projectCaches.size === 0) {
                this.projectIndex.delete(cache.projectId);
            }
        }
        this.caches.delete(cacheId);
        console.log(`[ContextCache] Deleted cache ${cacheId}`);
        return true;
    }
    /**
     * Delete all caches for a project
     */
    deleteProjectCaches(projectId) {
        const cacheIds = this.projectIndex.get(projectId);
        if (!cacheIds) {
            return 0;
        }
        let deleted = 0;
        for (const cacheId of cacheIds) {
            if (this.caches.delete(cacheId)) {
                deleted++;
            }
        }
        this.projectIndex.delete(projectId);
        console.log(`[ContextCache] Deleted ${deleted} caches for project ${projectId}`);
        return deleted;
    }
    /**
     * Get cache statistics
     */
    getStats() {
        let totalFiles = 0;
        let totalSizeBytes = 0;
        let oldestAge = 0;
        for (const cache of this.caches.values()) {
            totalFiles += cache.files.size;
            totalSizeBytes += cache.totalSize;
            const age = Date.now() - cache.createdAt;
            if (age > oldestAge) {
                oldestAge = age;
            }
        }
        const totalHits = this.hitCount + this.missCount;
        return {
            totalCaches: this.caches.size,
            totalFiles,
            totalSizeBytes,
            hitCount: this.hitCount,
            missCount: this.missCount,
            hitRate: totalHits > 0 ? this.hitCount / totalHits : 0,
            avgFilesPerCache: this.caches.size > 0 ? totalFiles / this.caches.size : 0,
            oldestCacheAge: oldestAge,
        };
    }
    /**
     * Clear all caches
     */
    clearAll() {
        const count = this.caches.size;
        this.caches.clear();
        this.projectIndex.clear();
        this.hitCount = 0;
        this.missCount = 0;
        console.log(`[ContextCache] Cleared all ${count} caches`);
    }
    /**
     * Set TTL for cache entries
     */
    setTTL(ttlMs) {
        this.ttl = ttlMs;
    }
    /**
     * Shutdown cleanup timer
     */
    shutdown() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
    // --------------------------------------------------------------------------
    // Private Methods
    // --------------------------------------------------------------------------
    generateCacheId(projectId) {
        const timestamp = Date.now().toString(36);
        const random = crypto_1.default.randomBytes(4).toString('hex');
        return `ctx_${projectId.slice(0, 8)}_${timestamp}_${random}`;
    }
    hashContent(content) {
        return crypto_1.default.createHash('sha256').update(content).digest('hex').slice(0, 16);
    }
    formatBytes(bytes) {
        if (bytes < 1024)
            return `${bytes}B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
    cleanupProjectCaches(projectId) {
        const cacheIds = this.projectIndex.get(projectId);
        if (!cacheIds || cacheIds.size < 3) {
            return;
        }
        // Keep only the 2 most recent caches per project
        const caches = [];
        for (const cacheId of cacheIds) {
            const cache = this.caches.get(cacheId);
            if (cache) {
                caches.push(cache);
            }
        }
        caches.sort((a, b) => b.lastAccessed - a.lastAccessed);
        // Delete older caches
        for (let i = 2; i < caches.length; i++) {
            this.deleteCache(caches[i].id);
        }
    }
    enforceCacheLimit() {
        if (this.caches.size <= MAX_CACHE_SIZE) {
            return;
        }
        // Sort by last accessed (oldest first)
        const sorted = Array.from(this.caches.values()).sort((a, b) => a.lastAccessed - b.lastAccessed);
        // Delete oldest caches until we're under the limit
        const toDelete = sorted.slice(0, sorted.length - MAX_CACHE_SIZE);
        for (const cache of toDelete) {
            this.deleteCache(cache.id);
        }
    }
    cleanupExpiredCaches() {
        const now = Date.now();
        const expired = [];
        for (const [cacheId, cache] of this.caches) {
            if (now - cache.lastAccessed > this.ttl) {
                expired.push(cacheId);
            }
        }
        for (const cacheId of expired) {
            this.deleteCache(cacheId);
        }
        if (expired.length > 0) {
            console.log(`[ContextCache] Cleaned up ${expired.length} expired caches`);
        }
    }
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredCaches();
        }, CLEANUP_INTERVAL_MS);
        // Don't prevent process exit
        this.cleanupTimer.unref();
    }
}
// ============================================================================
// Exports
// ============================================================================
exports.contextCache = new ContextCacheManager();
// Helper function for computing file hash (for client-side use)
function computeFileHash(content) {
    return crypto_1.default.createHash('sha256').update(content).digest('hex').slice(0, 16);
}
// Helper to compute hashes for multiple files
function computeFileHashes(files) {
    const hashes = new Map();
    for (const [path, content] of files) {
        hashes.set(path, computeFileHash(content));
    }
    return hashes;
}
