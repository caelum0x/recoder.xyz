/**
 * Context Cache Client Service
 * Sprint 8-3: Prompt Caching / Context Optimization (Frontend)
 *
 * Client-side service for managing server-side context caching:
 * 1. Computes file hashes locally using Web Crypto API
 * 2. Compares with server cache to determine diffs
 * 3. Sends only changed files, reducing request size
 * 4. Reconstructs context via server-side cache + diff
 *
 * Usage:
 *   const cache = await contextCacheService.getOrCreateCache(projectId, files);
 *   const diff = await contextCacheService.computeLocalDiff(cache.cacheId, files);
 *   // Send only diff.changedFiles to AI endpoint
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ContextCacheService');

// ============================================================================
// Types
// ============================================================================

export interface CacheInfo {
  cacheId: string;
  projectId: string;
  hashes: Record<string, string>;
  fileCount: number;
  totalSize: number;
  lastAccessed: number;
}

export interface CacheDiff {
  cacheId: string;
  changedFiles: Record<string, string>;
  deletedFiles: string[];
  unchangedCount: number;
  bytesSaved: number;
}

export interface CacheStats {
  totalCaches: number;
  totalFiles: number;
  totalSizeBytes: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
}

interface CacheResult {
  success: boolean;
  cacheId: string;
  fileCount: number;
  isNew: boolean;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const DOCKER_BACKEND_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';
const LOCAL_HASH_CACHE_KEY = 'recoder:context-hashes';

// ============================================================================
// Web Crypto Hash Function
// ============================================================================

/**
 * Compute SHA-256 hash of content using Web Crypto API
 * Returns first 16 hex chars for consistency with server
 */
async function computeHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 16);
}

/**
 * Compute hashes for multiple files
 */
async function computeFileHashes(files: Map<string, string>): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  const promises: Promise<void>[] = [];

  for (const [path, content] of files) {
    promises.push(
      computeHash(content).then((hash) => {
        hashes.set(path, hash);
      })
    );
  }

  await Promise.all(promises);
  return hashes;
}

// ============================================================================
// Local Hash Cache (for fast local comparison)
// ============================================================================

interface LocalHashCache {
  projectId: string;
  cacheId: string;
  hashes: Record<string, string>;
  timestamp: number;
}

function getLocalHashCache(projectId: string): LocalHashCache | null {
  try {
    const stored = localStorage.getItem(`${LOCAL_HASH_CACHE_KEY}:${projectId}`);
    if (!stored) return null;

    const cache: LocalHashCache = JSON.parse(stored);

    // Check if cache is still valid (30 minutes)
    if (Date.now() - cache.timestamp > 30 * 60 * 1000) {
      localStorage.removeItem(`${LOCAL_HASH_CACHE_KEY}:${projectId}`);
      return null;
    }

    return cache;
  } catch {
    return null;
  }
}

function setLocalHashCache(projectId: string, cacheId: string, hashes: Record<string, string>): void {
  try {
    const cache: LocalHashCache = {
      projectId,
      cacheId,
      hashes,
      timestamp: Date.now(),
    };
    localStorage.setItem(`${LOCAL_HASH_CACHE_KEY}:${projectId}`, JSON.stringify(cache));
  } catch {
    // localStorage may be full or unavailable
  }
}

function clearLocalHashCache(projectId: string): void {
  try {
    localStorage.removeItem(`${LOCAL_HASH_CACHE_KEY}:${projectId}`);
  } catch {
    // Ignore errors
  }
}

// ============================================================================
// Context Cache Service
// ============================================================================

class ContextCacheService {
  private pendingRequests = new Map<string, Promise<CacheResult>>();

  /**
   * Get or create a context cache for a project
   */
  async getOrCreateCache(
    projectId: string,
    files: Map<string, string>,
    systemPrompt?: string
  ): Promise<CacheResult> {
    // Check for existing pending request (dedup)
    const pendingKey = `${projectId}`;
    const pending = this.pendingRequests.get(pendingKey);
    if (pending) {
      return pending;
    }

    const promise = this._getOrCreateCache(projectId, files, systemPrompt);
    this.pendingRequests.set(pendingKey, promise);

    try {
      return await promise;
    } finally {
      this.pendingRequests.delete(pendingKey);
    }
  }

  private async _getOrCreateCache(
    projectId: string,
    files: Map<string, string>,
    systemPrompt?: string
  ): Promise<CacheResult> {
    try {
      // First, check if we have a local cache with matching hashes
      const localCache = getLocalHashCache(projectId);

      if (localCache) {
        // Compute current file hashes
        const currentHashes = await computeFileHashes(files);

        // Check if all files match
        let allMatch = true;
        const cachedPaths = new Set(Object.keys(localCache.hashes));
        const currentPaths = new Set(currentHashes.keys());

        // Check for same file set
        if (cachedPaths.size !== currentPaths.size) {
          allMatch = false;
        } else {
          for (const [path, hash] of currentHashes) {
            if (localCache.hashes[path] !== hash) {
              allMatch = false;
              break;
            }
          }
        }

        if (allMatch) {
          // Verify server cache still exists
          const serverCache = await this.getCacheInfo(localCache.cacheId);
          if (serverCache) {
            logger.debug(`Cache hit for project ${projectId}: ${localCache.cacheId}`);
            return {
              success: true,
              cacheId: localCache.cacheId,
              fileCount: files.size,
              isNew: false,
            };
          }
        }
      }

      // Create new cache on server
      logger.debug(`Creating new cache for project ${projectId} with ${files.size} files`);

      const response = await fetch(`${DOCKER_BACKEND_URL}/api/context/cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          projectId,
          files: Object.fromEntries(files),
          systemPrompt,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create cache: ${error}`);
      }

      const data: any = await response.json();

      // Store hashes locally for fast future comparisons
      const hashes = await computeFileHashes(files);
      setLocalHashCache(projectId, data.cacheId, Object.fromEntries(hashes));

      return {
        success: true,
        cacheId: data.cacheId,
        fileCount: data.fileCount,
        isNew: true,
      };
    } catch (error: any) {
      logger.error('Error in getOrCreateCache:', error);
      return {
        success: false,
        cacheId: '',
        fileCount: 0,
        isNew: false,
        error: error.message,
      };
    }
  }

  /**
   * Get cache info from server
   */
  async getCacheInfo(cacheId: string): Promise<CacheInfo | null> {
    try {
      const response = await fetch(`${DOCKER_BACKEND_URL}/api/context/cache/${cacheId}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Compute diff between current files and cached context (locally)
   * This is faster than sending to server for comparison
   */
  async computeLocalDiff(
    projectId: string,
    cacheId: string,
    currentFiles: Map<string, string>
  ): Promise<CacheDiff | null> {
    try {
      // Get local cache first (fastest)
      let cachedHashes: Record<string, string> | null = null;
      const localCache = getLocalHashCache(projectId);

      if (localCache && localCache.cacheId === cacheId) {
        cachedHashes = localCache.hashes;
      } else {
        // Fetch hashes from server
        const response = await fetch(`${DOCKER_BACKEND_URL}/api/context/cache/${cacheId}/hashes`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          return null;
        }

        const data: any = await response.json();
        cachedHashes = data.hashes;

        // Update local cache
        setLocalHashCache(projectId, cacheId, cachedHashes!);
      }

      if (!cachedHashes) {
        return null;
      }

      // Compute current file hashes
      const currentHashes = await computeFileHashes(currentFiles);

      // Compute diff
      const changedFiles: Record<string, string> = {};
      const deletedFiles: string[] = [];
      let unchangedCount = 0;
      let bytesSaved = 0;

      // Find changed and new files
      for (const [path, content] of currentFiles) {
        const currentHash = currentHashes.get(path)!;
        const cachedHash = cachedHashes[path];

        if (!cachedHash || cachedHash !== currentHash) {
          changedFiles[path] = content;
        } else {
          unchangedCount++;
          bytesSaved += new Blob([content]).size;
        }
      }

      // Find deleted files
      const currentPaths = new Set(currentFiles.keys());
      for (const path of Object.keys(cachedHashes)) {
        if (!currentPaths.has(path)) {
          deletedFiles.push(path);
        }
      }

      return {
        cacheId,
        changedFiles,
        deletedFiles,
        unchangedCount,
        bytesSaved,
      };
    } catch (error) {
      logger.error('Error computing local diff:', error);
      return null;
    }
  }

  /**
   * Apply diff to server cache and get reconstructed context
   */
  async applyDiff(cacheId: string, diff: CacheDiff): Promise<Map<string, string> | null> {
    try {
      const response = await fetch(`${DOCKER_BACKEND_URL}/api/context/cache/${cacheId}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          changedFiles: diff.changedFiles,
          deletedFiles: diff.deletedFiles,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data: any = await response.json();
      return new Map(Object.entries(data.files));
    } catch (error) {
      logger.error('Error applying diff:', error);
      return null;
    }
  }

  /**
   * Invalidate cache for a project
   */
  async invalidateCache(projectId: string): Promise<boolean> {
    try {
      clearLocalHashCache(projectId);

      const response = await fetch(`${DOCKER_BACKEND_URL}/api/context/cache/project/${projectId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats | null> {
    try {
      const response = await fetch(`${DOCKER_BACKEND_URL}/api/context/cache/stats`);

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Get the latest cache ID for a project
   */
  async getLatestCacheId(projectId: string): Promise<string | null> {
    // Check local first
    const localCache = getLocalHashCache(projectId);
    if (localCache) {
      return localCache.cacheId;
    }

    // Check server
    try {
      const response = await fetch(
        `${DOCKER_BACKEND_URL}/api/context/cache/project/${projectId}/latest`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        return null;
      }

      const data: any = await response.json();
      return data.cacheId;
    } catch {
      return null;
    }
  }

  /**
   * Prepare context for AI request with caching optimization
   *
   * Returns optimized payload:
   * - If cache exists and is valid: only changed files + cacheId
   * - If no cache: full files + creates new cache
   */
  async prepareContextForRequest(
    projectId: string,
    files: Map<string, string>,
    systemPrompt?: string
  ): Promise<{
    useCaching: boolean;
    cacheId: string | null;
    files: Record<string, string>;
    bytesSaved: number;
    fromCache: number;
  }> {
    try {
      // Try to get existing cache
      const cacheResult = await this.getOrCreateCache(projectId, files, systemPrompt);

      if (!cacheResult.success || cacheResult.isNew) {
        // New cache created or error - send all files
        return {
          useCaching: cacheResult.success,
          cacheId: cacheResult.cacheId || null,
          files: Object.fromEntries(files),
          bytesSaved: 0,
          fromCache: 0,
        };
      }

      // Compute diff against existing cache
      const diff = await this.computeLocalDiff(projectId, cacheResult.cacheId, files);

      if (!diff) {
        // Diff failed - send all files
        return {
          useCaching: false,
          cacheId: null,
          files: Object.fromEntries(files),
          bytesSaved: 0,
          fromCache: 0,
        };
      }

      // Check if diff is worth it (if >50% files changed, just send all)
      const changedCount = Object.keys(diff.changedFiles).length + diff.deletedFiles.length;
      const totalFiles = files.size;

      if (changedCount > totalFiles * 0.5) {
        // Too many changes, create fresh cache
        await this.invalidateCache(projectId);
        const freshCache = await this.getOrCreateCache(projectId, files, systemPrompt);

        return {
          useCaching: freshCache.success,
          cacheId: freshCache.cacheId || null,
          files: Object.fromEntries(files),
          bytesSaved: 0,
          fromCache: 0,
        };
      }

      logger.debug(
        `Context cache optimization: ${diff.unchangedCount} files from cache, ` +
          `${changedCount} changed, ${this.formatBytes(diff.bytesSaved)} saved`
      );

      return {
        useCaching: true,
        cacheId: cacheResult.cacheId,
        files: diff.changedFiles,
        bytesSaved: diff.bytesSaved,
        fromCache: diff.unchangedCount,
      };
    } catch (error) {
      logger.error('Error preparing context:', error);
      return {
        useCaching: false,
        cacheId: null,
        files: Object.fromEntries(files),
        bytesSaved: 0,
        fromCache: 0,
      };
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const contextCacheService = new ContextCacheService();

// Export hash function for external use
export { computeHash, computeFileHashes };
