/**
 * Context Cache Store
 * Sprint 8-3: Prompt Caching / Context Optimization
 *
 * Nanostores for tracking context cache state and metrics in the UI.
 */

import { atom, computed } from 'nanostores';

// ============================================================================
// Types
// ============================================================================

export interface CacheMetrics {
  // Current session stats
  requestsWithCache: number;
  requestsWithoutCache: number;
  totalBytesSaved: number;
  totalFilesFromCache: number;

  // Last request stats
  lastCacheId: string | null;
  lastBytesSaved: number;
  lastFilesFromCache: number;
  lastFilesChanged: number;

  // Timing
  lastRequestTime: number;
  avgLatencySaved: number; // Estimated ms saved per request
}

export interface CacheState {
  // Current cache info
  activeCacheId: string | null;
  activeProjectId: string | null;
  cachedFileCount: number;

  // Status
  isCreatingCache: boolean;
  isComputingDiff: boolean;
  lastError: string | null;
}

// ============================================================================
// Stores
// ============================================================================

export const cacheMetrics = atom<CacheMetrics>({
  requestsWithCache: 0,
  requestsWithoutCache: 0,
  totalBytesSaved: 0,
  totalFilesFromCache: 0,
  lastCacheId: null,
  lastBytesSaved: 0,
  lastFilesFromCache: 0,
  lastFilesChanged: 0,
  lastRequestTime: 0,
  avgLatencySaved: 0,
});

export const cacheState = atom<CacheState>({
  activeCacheId: null,
  activeProjectId: null,
  cachedFileCount: 0,
  isCreatingCache: false,
  isComputingDiff: false,
  lastError: null,
});

// ============================================================================
// Computed Values
// ============================================================================

export const cacheHitRate = computed(cacheMetrics, (metrics) => {
  const total = metrics.requestsWithCache + metrics.requestsWithoutCache;
  return total > 0 ? metrics.requestsWithCache / total : 0;
});

export const totalRequestsSaved = computed(cacheMetrics, (metrics) => {
  // Estimate: each KB saved = ~0.5ms latency saved (network + parsing)
  const kbSaved = metrics.totalBytesSaved / 1024;
  return Math.round(kbSaved * 0.5);
});

export const formattedBytesSaved = computed(cacheMetrics, (metrics) => {
  const bytes = metrics.totalBytesSaved;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
});

// ============================================================================
// Actions
// ============================================================================

export function recordCacheHit(cacheId: string, bytesSaved: number, filesFromCache: number, filesChanged: number): void {
  const current = cacheMetrics.get();

  cacheMetrics.set({
    ...current,
    requestsWithCache: current.requestsWithCache + 1,
    totalBytesSaved: current.totalBytesSaved + bytesSaved,
    totalFilesFromCache: current.totalFilesFromCache + filesFromCache,
    lastCacheId: cacheId,
    lastBytesSaved: bytesSaved,
    lastFilesFromCache: filesFromCache,
    lastFilesChanged: filesChanged,
    lastRequestTime: Date.now(),
    // Update average latency saved (rough estimate: 1KB = 0.5ms)
    avgLatencySaved: (current.avgLatencySaved * current.requestsWithCache + (bytesSaved / 1024) * 0.5) / (current.requestsWithCache + 1),
  });
}

export function recordCacheMiss(): void {
  const current = cacheMetrics.get();

  cacheMetrics.set({
    ...current,
    requestsWithoutCache: current.requestsWithoutCache + 1,
    lastCacheId: null,
    lastBytesSaved: 0,
    lastFilesFromCache: 0,
    lastFilesChanged: 0,
    lastRequestTime: Date.now(),
  });
}

export function setCacheActive(cacheId: string | null, projectId: string | null, fileCount: number): void {
  cacheState.set({
    ...cacheState.get(),
    activeCacheId: cacheId,
    activeProjectId: projectId,
    cachedFileCount: fileCount,
  });
}

export function setCacheCreating(isCreating: boolean): void {
  cacheState.set({
    ...cacheState.get(),
    isCreatingCache: isCreating,
  });
}

export function setCacheComputingDiff(isComputing: boolean): void {
  cacheState.set({
    ...cacheState.get(),
    isComputingDiff: isComputing,
  });
}

export function setCacheError(error: string | null): void {
  cacheState.set({
    ...cacheState.get(),
    lastError: error,
  });
}

export function resetCacheMetrics(): void {
  cacheMetrics.set({
    requestsWithCache: 0,
    requestsWithoutCache: 0,
    totalBytesSaved: 0,
    totalFilesFromCache: 0,
    lastCacheId: null,
    lastBytesSaved: 0,
    lastFilesFromCache: 0,
    lastFilesChanged: 0,
    lastRequestTime: 0,
    avgLatencySaved: 0,
  });
}

export function resetCacheState(): void {
  cacheState.set({
    activeCacheId: null,
    activeProjectId: null,
    cachedFileCount: 0,
    isCreatingCache: false,
    isComputingDiff: false,
    lastError: null,
  });
}

// ============================================================================
// Debug Helper
// ============================================================================

export function getCacheDebugInfo(): string {
  const state = cacheState.get();
  const metrics = cacheMetrics.get();

  return [
    '=== Context Cache Debug ===',
    `Active Cache: ${state.activeCacheId || 'none'}`,
    `Project: ${state.activeProjectId || 'none'}`,
    `Cached Files: ${state.cachedFileCount}`,
    '',
    '--- Metrics ---',
    `Cache Hits: ${metrics.requestsWithCache}`,
    `Cache Misses: ${metrics.requestsWithoutCache}`,
    `Hit Rate: ${(cacheHitRate.get() * 100).toFixed(1)}%`,
    `Total Bytes Saved: ${formattedBytesSaved.get()}`,
    `Files From Cache: ${metrics.totalFilesFromCache}`,
    `Avg Latency Saved: ${metrics.avgLatencySaved.toFixed(1)}ms`,
    '',
    '--- Last Request ---',
    `Cache ID: ${metrics.lastCacheId || 'none'}`,
    `Bytes Saved: ${metrics.lastBytesSaved}`,
    `Files From Cache: ${metrics.lastFilesFromCache}`,
    `Files Changed: ${metrics.lastFilesChanged}`,
    '',
    '--- State ---',
    `Creating Cache: ${state.isCreatingCache}`,
    `Computing Diff: ${state.isComputingDiff}`,
    `Last Error: ${state.lastError || 'none'}`,
  ].join('\n');
}
