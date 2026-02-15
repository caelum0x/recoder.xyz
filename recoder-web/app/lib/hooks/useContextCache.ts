/**
 * useContextCache Hook
 * Sprint 8-3: Prompt Caching / Context Optimization
 *
 * React hook for integrating server-side context caching with chat requests.
 * Automatically caches project context and sends only diffs to reduce bandwidth.
 *
 * Usage:
 *   const { prepareContext, cacheStats, invalidate } = useContextCache(projectId);
 *
 *   // Before sending a chat message:
 *   const optimizedBody = await prepareContext(codeContext, systemPrompt);
 *   // optimizedBody contains cacheId + only changed files
 */

import { useCallback, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  contextCacheService,
  type CacheDiff,
} from '~/lib/services/context-cache';
import {
  cacheMetrics,
  cacheState,
  recordCacheHit,
  recordCacheMiss,
  setCacheActive,
  setCacheCreating,
  setCacheComputingDiff,
  setCacheError,
  resetCacheState,
  formattedBytesSaved,
  cacheHitRate,
} from '~/lib/stores/context-cache';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useContextCache');

// ============================================================================
// Types
// ============================================================================

export interface ContextCacheResult {
  /** Whether caching was used for this request */
  useCaching: boolean;
  /** Cache ID (null if caching not used) */
  cacheId: string | null;
  /** Optimized files (only changed files if caching, all files otherwise) */
  files: Record<string, string>;
  /** Bytes saved by using cache */
  bytesSaved: number;
  /** Number of files served from cache */
  filesFromCache: number;
  /** Number of files that were changed */
  filesChanged: number;
}

export interface UseContextCacheReturn {
  /** Prepare context for a chat request, using cache when possible */
  prepareContext: (
    files: Map<string, string> | Record<string, string>,
    systemPrompt?: string
  ) => Promise<ContextCacheResult>;

  /** Get current cache state */
  state: typeof cacheState;

  /** Get cache metrics */
  metrics: typeof cacheMetrics;

  /** Formatted bytes saved */
  bytesSaved: string;

  /** Cache hit rate (0-1) */
  hitRate: number;

  /** Invalidate cache for current project */
  invalidate: () => Promise<void>;

  /** Check if caching is active */
  isCachingActive: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useContextCache(projectId: string | null): UseContextCacheReturn {
  const state = useStore(cacheState);
  const metrics = useStore(cacheMetrics);
  const bytesSaved = useStore(formattedBytesSaved);
  const hitRate = useStore(cacheHitRate);

  // Track if we've initialized for this project
  const initializedProjectRef = useRef<string | null>(null);

  // Reset state when project changes
  useEffect(() => {
    if (projectId && projectId !== initializedProjectRef.current) {
      logger.debug(`Project changed to ${projectId}, resetting cache state`);
      resetCacheState();
      initializedProjectRef.current = projectId;
    }
  }, [projectId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetCacheState();
    };
  }, []);

  /**
   * Prepare context for a chat request
   * Uses server-side caching to minimize bandwidth
   */
  const prepareContext = useCallback(
    async (
      files: Map<string, string> | Record<string, string>,
      systemPrompt?: string
    ): Promise<ContextCacheResult> => {
      // Convert to Map if needed
      const fileMap = files instanceof Map ? files : new Map(Object.entries(files));

      // If no project ID, can't use caching
      if (!projectId) {
        logger.debug('No project ID, skipping cache');
        recordCacheMiss();
        return {
          useCaching: false,
          cacheId: null,
          files: Object.fromEntries(fileMap),
          bytesSaved: 0,
          filesFromCache: 0,
          filesChanged: fileMap.size,
        };
      }

      // If no files, nothing to cache
      if (fileMap.size === 0) {
        logger.debug('No files to cache');
        return {
          useCaching: false,
          cacheId: null,
          files: {},
          bytesSaved: 0,
          filesFromCache: 0,
          filesChanged: 0,
        };
      }

      try {
        setCacheCreating(true);
        setCacheError(null);

        // Use the context cache service to prepare optimized context
        const result = await contextCacheService.prepareContextForRequest(
          projectId,
          fileMap,
          systemPrompt
        );

        setCacheCreating(false);

        if (result.useCaching && result.cacheId) {
          // Cache was used
          const filesChanged = Object.keys(result.files).length;

          recordCacheHit(
            result.cacheId,
            result.bytesSaved,
            result.fromCache,
            filesChanged
          );

          setCacheActive(result.cacheId, projectId, fileMap.size);

          logger.info(
            `Context cache hit: ${result.fromCache} files from cache, ` +
              `${filesChanged} changed, ${formatBytes(result.bytesSaved)} saved`
          );

          return {
            useCaching: true,
            cacheId: result.cacheId,
            files: result.files,
            bytesSaved: result.bytesSaved,
            filesFromCache: result.fromCache,
            filesChanged,
          };
        } else {
          // Cache was not used (new cache or error)
          recordCacheMiss();

          if (result.cacheId) {
            setCacheActive(result.cacheId, projectId, fileMap.size);
          }

          logger.debug('Context cache miss, sending full context');

          return {
            useCaching: false,
            cacheId: result.cacheId,
            files: result.files,
            bytesSaved: 0,
            filesFromCache: 0,
            filesChanged: fileMap.size,
          };
        }
      } catch (error) {
        setCacheCreating(false);
        setCacheError(error instanceof Error ? error.message : 'Unknown error');
        logger.error('Context cache error:', error);
        recordCacheMiss();

        // Fall back to full context
        return {
          useCaching: false,
          cacheId: null,
          files: Object.fromEntries(fileMap),
          bytesSaved: 0,
          filesFromCache: 0,
          filesChanged: fileMap.size,
        };
      }
    },
    [projectId]
  );

  /**
   * Invalidate cache for current project
   */
  const invalidate = useCallback(async (): Promise<void> => {
    if (!projectId) return;

    try {
      await contextCacheService.invalidateCache(projectId);
      resetCacheState();
      logger.info(`Cache invalidated for project ${projectId}`);
    } catch (error) {
      logger.error('Failed to invalidate cache:', error);
    }
  }, [projectId]);

  return {
    prepareContext,
    state: cacheState,
    metrics: cacheMetrics,
    bytesSaved,
    hitRate,
    invalidate,
    isCachingActive: state.activeCacheId !== null,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

// ============================================================================
// Export types
// ============================================================================

export type { CacheDiff };
