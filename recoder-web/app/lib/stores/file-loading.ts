/**
 * File Loading Store
 *
 * Tracks file loading progress, caches loaded files, and handles invalidation.
 * Uses nanostores for reactive state management.
 *
 * Features:
 * - Track file loading progress across the application
 * - Cache loaded file contents with TTL
 * - Invalidate cache on file changes (integrates with file watcher)
 * - Memory-efficient LRU cache for large file sets
 * - Computed stores for loading states
 */

import { atom, map, computed, type WritableAtom, type MapStore, type ReadableAtom } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('FileLoadingStore');

// ============================================================================
// TYPES
// ============================================================================

export interface CachedFile {
  content: string;
  loadedAt: number;
  size: number;
  hash?: string;
  /** Time-to-live in ms (0 = never expires) */
  ttl: number;
}

export interface FileLoadingState {
  path: string;
  status: 'pending' | 'loading' | 'loaded' | 'error';
  progress?: number; // 0-100
  error?: string;
  startedAt?: number;
}

export interface LoadingProgress {
  total: number;
  loaded: number;
  loading: number;
  failed: number;
  percentage: number;
}

export interface FileTreeLoadState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  fileCount: number;
  loadedCount: number;
  lastLoaded?: number;
  error?: string;
}

// Cache configuration
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 500; // Max files in cache
const MAX_CACHE_MEMORY = 50 * 1024 * 1024; // 50MB max memory

// ============================================================================
// STORES
// ============================================================================

/** Map of file path -> cached content */
export const fileCache: MapStore<Record<string, CachedFile>> = map({});

/** Map of file path -> loading state */
export const fileLoadingStates: MapStore<Record<string, FileLoadingState>> = map({});

/** Current project's file tree loading state */
export const fileTreeLoadState: WritableAtom<FileTreeLoadState> = atom<FileTreeLoadState>({
  status: 'idle',
  fileCount: 0,
  loadedCount: 0,
});

/** Set of paths currently being loaded */
export const loadingPaths: WritableAtom<Set<string>> = atom<Set<string>>(new Set());

/** Total cache memory usage in bytes */
export const cacheMemoryUsage: WritableAtom<number> = atom<number>(0);

// ============================================================================
// COMPUTED STORES
// ============================================================================

/** Overall loading progress */
export const loadingProgress: ReadableAtom<LoadingProgress> = computed(
  fileLoadingStates,
  (states) => {
    const values = Object.values(states);
    const total = values.length;
    const loaded = values.filter((s) => s.status === 'loaded').length;
    const loading = values.filter((s) => s.status === 'loading').length;
    const failed = values.filter((s) => s.status === 'error').length;

    return {
      total,
      loaded,
      loading,
      failed,
      percentage: total > 0 ? Math.round((loaded / total) * 100) : 0,
    };
  }
);

/** Is any file currently loading */
export const isLoadingAnyFile: ReadableAtom<boolean> = computed(
  loadingPaths,
  (paths) => paths.size > 0
);

/** Number of cached files */
export const cachedFileCount: ReadableAtom<number> = computed(
  fileCache,
  (cache) => Object.keys(cache).length
);

/** Is file tree loading */
export const isFileTreeLoading: ReadableAtom<boolean> = computed(
  fileTreeLoadState,
  (state) => state.status === 'loading'
);

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Get cached file content if valid
 */
export function getCachedContent(path: string): string | null {
  const cached = fileCache.get()[path];

  if (!cached) {
    return null;
  }

  // Check if expired
  if (cached.ttl > 0 && Date.now() - cached.loadedAt > cached.ttl) {
    // Expired - remove from cache
    invalidateCache(path);
    return null;
  }

  return cached.content;
}

/**
 * Set cached file content
 */
export function setCachedContent(
  path: string,
  content: string,
  options: { ttl?: number; hash?: string } = {}
): void {
  const { ttl = DEFAULT_CACHE_TTL, hash } = options;
  const size = content.length;

  // Check if we need to evict entries
  const currentMemory = cacheMemoryUsage.get();
  const currentCount = Object.keys(fileCache.get()).length;

  if (currentCount >= MAX_CACHE_SIZE || currentMemory + size > MAX_CACHE_MEMORY) {
    evictOldestEntries(size);
  }

  fileCache.setKey(path, {
    content,
    loadedAt: Date.now(),
    size,
    hash,
    ttl,
  });

  // Update memory usage
  cacheMemoryUsage.set(currentMemory + size);
}

/**
 * Invalidate cache for a specific path
 */
export function invalidateCache(path: string): void {
  const cached = fileCache.get()[path];

  if (cached) {
    // Update memory usage
    const currentMemory = cacheMemoryUsage.get();
    cacheMemoryUsage.set(Math.max(0, currentMemory - cached.size));

    // Remove from cache (using setKey with undefined to delete)
    const cache = { ...fileCache.get() };
    delete cache[path];
    fileCache.set(cache);

    logger.debug(`Cache invalidated: ${path}`);
  }
}

/**
 * Invalidate cache for multiple paths
 */
export function invalidateCacheBatch(paths: string[]): void {
  const cache = { ...fileCache.get() };
  let freedMemory = 0;

  for (const path of paths) {
    const cached = cache[path];
    if (cached) {
      freedMemory += cached.size;
      delete cache[path];
    }
  }

  fileCache.set(cache);
  cacheMemoryUsage.set(Math.max(0, cacheMemoryUsage.get() - freedMemory));

  if (paths.length > 0) {
    logger.debug(`Cache invalidated for ${paths.length} files`);
  }
}

/**
 * Invalidate cache for a directory (all files under path)
 */
export function invalidateCacheDirectory(dirPath: string): void {
  const normalizedDir = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
  const cache = fileCache.get();
  const pathsToInvalidate = Object.keys(cache).filter(
    (path) => path.startsWith(normalizedDir) || path === dirPath.replace(/\/$/, '')
  );

  invalidateCacheBatch(pathsToInvalidate);
}

/**
 * Clear entire cache
 */
export function clearCache(): void {
  fileCache.set({});
  cacheMemoryUsage.set(0);
  logger.info('File cache cleared');
}

/**
 * Evict oldest entries to make room for new content
 */
function evictOldestEntries(neededSpace: number): void {
  const cache = fileCache.get();
  const entries = Object.entries(cache);

  // Sort by loadedAt (oldest first)
  entries.sort((a, b) => a[1].loadedAt - b[1].loadedAt);

  let freedSpace = 0;
  const toRemove: string[] = [];

  for (const [path, cached] of entries) {
    if (freedSpace >= neededSpace && toRemove.length < entries.length - MAX_CACHE_SIZE + 1) {
      break;
    }
    toRemove.push(path);
    freedSpace += cached.size;
  }

  if (toRemove.length > 0) {
    invalidateCacheBatch(toRemove);
    logger.debug(`Evicted ${toRemove.length} entries from cache (${Math.round(freedSpace / 1024)}KB freed)`);
  }
}

// ============================================================================
// LOADING STATE MANAGEMENT
// ============================================================================

/**
 * Mark a file as loading
 */
export function markFileLoading(path: string): void {
  fileLoadingStates.setKey(path, {
    path,
    status: 'loading',
    startedAt: Date.now(),
  });

  const paths = new Set(loadingPaths.get());
  paths.add(path);
  loadingPaths.set(paths);
}

/**
 * Mark multiple files as loading
 */
export function markFilesLoading(paths: string[]): void {
  const loadingSet = new Set(loadingPaths.get());

  for (const path of paths) {
    fileLoadingStates.setKey(path, {
      path,
      status: 'loading',
      startedAt: Date.now(),
    });
    loadingSet.add(path);
  }

  loadingPaths.set(loadingSet);
}

/**
 * Mark a file as loaded
 */
export function markFileLoaded(path: string, content?: string): void {
  const state = fileLoadingStates.get()[path];
  const startedAt = state?.startedAt || Date.now();

  fileLoadingStates.setKey(path, {
    path,
    status: 'loaded',
    startedAt,
  });

  const paths = new Set(loadingPaths.get());
  paths.delete(path);
  loadingPaths.set(paths);

  // Cache content if provided
  if (content !== undefined) {
    setCachedContent(path, content);
  }
}

/**
 * Mark a file as failed
 */
export function markFileFailed(path: string, error: string): void {
  fileLoadingStates.setKey(path, {
    path,
    status: 'error',
    error,
  });

  const paths = new Set(loadingPaths.get());
  paths.delete(path);
  loadingPaths.set(paths);
}

/**
 * Update loading progress for a file
 */
export function updateFileProgress(path: string, progress: number): void {
  const state = fileLoadingStates.get()[path];

  if (state) {
    fileLoadingStates.setKey(path, {
      ...state,
      progress: Math.min(100, Math.max(0, progress)),
    });
  }
}

/**
 * Clear loading states
 */
export function clearLoadingStates(): void {
  fileLoadingStates.set({});
  loadingPaths.set(new Set());
}

/**
 * Get loading state for a file
 */
export function getFileLoadingState(path: string): FileLoadingState | undefined {
  return fileLoadingStates.get()[path];
}

/**
 * Is a specific file loading
 */
export function isFileLoading(path: string): boolean {
  return loadingPaths.get().has(path);
}

// ============================================================================
// FILE TREE LOADING
// ============================================================================

/**
 * Mark file tree as loading
 */
export function markFileTreeLoading(fileCount: number): void {
  fileTreeLoadState.set({
    status: 'loading',
    fileCount,
    loadedCount: 0,
  });
}

/**
 * Update file tree loading progress
 */
export function updateFileTreeProgress(loadedCount: number): void {
  const state = fileTreeLoadState.get();
  fileTreeLoadState.set({
    ...state,
    loadedCount,
  });
}

/**
 * Mark file tree as loaded
 */
export function markFileTreeLoaded(): void {
  const state = fileTreeLoadState.get();
  fileTreeLoadState.set({
    ...state,
    status: 'loaded',
    loadedCount: state.fileCount,
    lastLoaded: Date.now(),
  });
}

/**
 * Mark file tree loading as failed
 */
export function markFileTreeFailed(error: string): void {
  const state = fileTreeLoadState.get();
  fileTreeLoadState.set({
    ...state,
    status: 'error',
    error,
  });
}

/**
 * Reset file tree loading state
 */
export function resetFileTreeLoadState(): void {
  fileTreeLoadState.set({
    status: 'idle',
    fileCount: 0,
    loadedCount: 0,
  });
}

// ============================================================================
// FILE CHANGE HANDLERS
// ============================================================================

/**
 * Handle file created - no cache invalidation needed
 */
export function onFileCreated(path: string): void {
  // New files don't need cache invalidation
  logger.debug(`File created: ${path}`);
}

/**
 * Handle file modified - invalidate cache
 */
export function onFileModified(path: string): void {
  invalidateCache(path);
  logger.debug(`File modified, cache invalidated: ${path}`);
}

/**
 * Handle file deleted - invalidate cache
 */
export function onFileDeleted(path: string): void {
  invalidateCache(path);
  // Also clear loading state if any
  const states = { ...fileLoadingStates.get() };
  delete states[path];
  fileLoadingStates.set(states);
  logger.debug(`File deleted, cache invalidated: ${path}`);
}

/**
 * Handle file renamed/moved - update cache key
 */
export function onFileRenamed(oldPath: string, newPath: string): void {
  const cached = fileCache.get()[oldPath];

  if (cached) {
    // Move to new path
    fileCache.setKey(newPath, {
      ...cached,
      loadedAt: Date.now(), // Reset TTL on rename
    });
    invalidateCache(oldPath);
  }

  logger.debug(`File renamed: ${oldPath} -> ${newPath}`);
}

/**
 * Handle batch file changes from file watcher
 */
export function onFileChanges(
  changes: Array<{ type: 'create' | 'modify' | 'delete'; path: string }>
): void {
  const pathsToInvalidate: string[] = [];

  for (const change of changes) {
    switch (change.type) {
      case 'create':
        onFileCreated(change.path);
        break;
      case 'modify':
        pathsToInvalidate.push(change.path);
        break;
      case 'delete':
        pathsToInvalidate.push(change.path);
        break;
    }
  }

  if (pathsToInvalidate.length > 0) {
    invalidateCacheBatch(pathsToInvalidate);
  }
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  fileCount: number;
  memoryUsage: number;
  memoryUsageMB: string;
  hitRate?: number;
  oldestEntry?: number;
  newestEntry?: number;
} {
  const cache = fileCache.get();
  const entries = Object.values(cache);
  const memoryUsage = cacheMemoryUsage.get();

  let oldest = Infinity;
  let newest = 0;

  for (const entry of entries) {
    if (entry.loadedAt < oldest) oldest = entry.loadedAt;
    if (entry.loadedAt > newest) newest = entry.loadedAt;
  }

  return {
    fileCount: entries.length,
    memoryUsage,
    memoryUsageMB: `${(memoryUsage / (1024 * 1024)).toFixed(2)}MB`,
    oldestEntry: oldest !== Infinity ? oldest : undefined,
    newestEntry: newest !== 0 ? newest : undefined,
  };
}

/**
 * Get loading statistics
 */
export function getLoadingStats(): {
  currentlyLoading: number;
  totalTracked: number;
  loadedCount: number;
  failedCount: number;
} {
  const states = fileLoadingStates.get();
  const values = Object.values(states);

  return {
    currentlyLoading: loadingPaths.get().size,
    totalTracked: values.length,
    loadedCount: values.filter((s) => s.status === 'loaded').length,
    failedCount: values.filter((s) => s.status === 'error').length,
  };
}

// ============================================================================
// FILE WATCHER INTEGRATION
// ============================================================================

let fileWatcherListenerInitialized = false;

/**
 * Initialize file watcher listener for cache invalidation.
 * Safe to call multiple times - only initializes once.
 */
export function initFileWatcherListener(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (fileWatcherListenerInitialized) {
    return () => {};
  }

  const handleFileChanges = (event: CustomEvent<{
    changes: Array<{ type: 'create' | 'modify' | 'delete'; path: string }>
  }>) => {
    const { changes } = event.detail;
    if (changes && changes.length > 0) {
      onFileChanges(changes);
    }
  };

  window.addEventListener('recoder:file-changed', handleFileChanges as EventListener);
  window.addEventListener('recoder:refresh-files', handleFileChanges as EventListener);
  fileWatcherListenerInitialized = true;

  logger.debug('File watcher listener initialized for cache invalidation');

  return () => {
    window.removeEventListener('recoder:file-changed', handleFileChanges as EventListener);
    window.removeEventListener('recoder:refresh-files', handleFileChanges as EventListener);
    fileWatcherListenerInitialized = false;
  };
}

/**
 * Prefetch files into cache for faster subsequent access.
 * Useful for preloading files that are likely to be needed.
 */
export async function prefetchFiles(
  projectId: string,
  filePaths: string[],
  options?: {
    onProgress?: (loaded: number, total: number) => void;
    skipCached?: boolean;
  }
): Promise<void> {
  const { onProgress, skipCached = true } = options || {};

  // Filter out already cached files if requested
  const pathsToFetch = skipCached
    ? filePaths.filter((path) => getCachedContent(path) === null)
    : filePaths;

  if (pathsToFetch.length === 0) {
    onProgress?.(filePaths.length, filePaths.length);
    return;
  }

  // Import batch reader dynamically to avoid circular dependencies
  const { readFilesBatch } = await import('~/lib/services/batch-file-reader');

  const result = await readFilesBatch(projectId, pathsToFetch, {
    onProgress: (progress) => {
      const cachedCount = filePaths.length - pathsToFetch.length;
      onProgress?.(progress.completed + cachedCount, filePaths.length);
    },
    onFileRead: (path, content) => {
      setCachedContent(path, content);
    },
  });

  logger.debug(
    `Prefetched ${result.successCount}/${pathsToFetch.length} files, ` +
    `${result.failedCount} failed`
  );
}
