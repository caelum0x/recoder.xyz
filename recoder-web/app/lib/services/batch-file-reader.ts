/**
 * Batch File Reader Service
 *
 * Reads multiple files concurrently with controlled concurrency.
 * Inspired by December's batch reading pattern in /backend/src/services/file.ts
 *
 * Features:
 * - Concurrent file reading with configurable limit (default: 50)
 * - Queue system for large file sets
 * - Progress tracking with callbacks
 * - Retry mechanism for failed reads
 * - Aggregate results with error tracking
 * - Integration with file loading store
 *
 * Usage:
 * ```typescript
 * const reader = new BatchFileReader(projectId);
 * const results = await reader.readFiles(filePaths, {
 *   concurrency: 50,
 *   onProgress: (progress) => console.log(`${progress.percentage}% complete`),
 * });
 * ```
 */

import { atom, map, computed, type WritableAtom, type MapStore } from 'nanostores';
import { dockerReadFile, DOCKER_URL, withDockerCredentials } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('BatchFileReader');

// ============================================================================
// TYPES
// ============================================================================

export interface FileReadResult {
  path: string;
  content: string | null;
  success: boolean;
  error?: string;
  readTime: number;
  size: number;
}

export interface BatchReadProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  percentage: number;
  currentFiles: string[];
  estimatedTimeRemaining?: number;
}

export interface BatchReadResult {
  success: boolean;
  totalFiles: number;
  successCount: number;
  failedCount: number;
  results: Map<string, FileReadResult>;
  failedFiles: Array<{ path: string; error: string }>;
  duration: number;
  averageReadTime: number;
  totalSize: number;
}

export interface BatchReaderConfig {
  /** Maximum concurrent reads */
  concurrency: number;
  /** Timeout per file read (ms) */
  fileTimeout: number;
  /** Number of retries for failed reads */
  maxRetries: number;
  /** Delay between retries (ms) */
  retryDelay: number;
  /** Skip files larger than this size (bytes), 0 = no limit */
  maxFileSize: number;
  /** Progress callback */
  onProgress?: (progress: BatchReadProgress) => void;
  /** Called when a file is read successfully */
  onFileRead?: (path: string, content: string) => void;
  /** Called when a file read fails */
  onFileError?: (path: string, error: string) => void;
  /** Filter function to skip certain files */
  filter?: (path: string) => boolean;
}

const DEFAULT_CONFIG: BatchReaderConfig = {
  concurrency: 50,
  fileTimeout: 15000,
  maxRetries: 2,
  retryDelay: 500,
  maxFileSize: 10 * 1024 * 1024, // 10MB max
};

export type BatchReadStatus =
  | 'idle'
  | 'reading'
  | 'complete'
  | 'error'
  | 'cancelled';

// ============================================================================
// STORES (for reactive state tracking)
// ============================================================================

/** Current batch read status */
export const batchReadStatus: WritableAtom<BatchReadStatus> = atom<BatchReadStatus>('idle');

/** Current batch read progress */
export const batchReadProgress: WritableAtom<BatchReadProgress> = atom<BatchReadProgress>({
  total: 0,
  completed: 0,
  failed: 0,
  inProgress: 0,
  percentage: 0,
  currentFiles: [],
});

/** File read results cache */
export const fileReadCache: MapStore<Record<string, FileReadResult>> = map({});

/** Is currently reading files */
export const isReading = computed(batchReadStatus, (status) => status === 'reading');

// ============================================================================
// QUEUE IMPLEMENTATION
// ============================================================================

interface QueueItem {
  path: string;
  resolve: (result: FileReadResult) => void;
  retryCount: number;
}

class ConcurrencyQueue {
  private queue: QueueItem[] = [];
  private activeCount = 0;
  private readonly maxConcurrency: number;
  private readonly processor: (item: QueueItem) => Promise<FileReadResult>;
  private cancelled = false;

  constructor(
    maxConcurrency: number,
    processor: (item: QueueItem) => Promise<FileReadResult>
  ) {
    this.maxConcurrency = maxConcurrency;
    this.processor = processor;
  }

  add(path: string, retryCount = 0): Promise<FileReadResult> {
    return new Promise((resolve) => {
      this.queue.push({ path, resolve, retryCount });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.cancelled) return;
    if (this.activeCount >= this.maxConcurrency) return;
    if (this.queue.length === 0) return;

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;

    try {
      const result = await this.processor(item);
      item.resolve(result);
    } catch (error) {
      item.resolve({
        path: item.path,
        content: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        readTime: 0,
        size: 0,
      });
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.queue = [];
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get activeTaskCount(): number {
    return this.activeCount;
  }
}

// ============================================================================
// BATCH FILE READER CLASS
// ============================================================================

export class BatchFileReader {
  private projectId: string;
  private config: BatchReaderConfig;
  private queue: ConcurrencyQueue | null = null;
  private startTime = 0;
  private totalSize = 0;
  private completedCount = 0;
  private failedCount = 0;
  private currentFiles = new Set<string>();
  private readTimes: number[] = [];

  constructor(projectId: string, config: Partial<BatchReaderConfig> = {}) {
    this.projectId = projectId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Read multiple files with controlled concurrency
   */
  async readFiles(
    filePaths: string[],
    options: Partial<BatchReaderConfig> = {}
  ): Promise<BatchReadResult> {
    const config = { ...this.config, ...options };

    // Filter files if filter function provided
    const filteredPaths = config.filter
      ? filePaths.filter(config.filter)
      : filePaths;

    if (filteredPaths.length === 0) {
      return {
        success: true,
        totalFiles: 0,
        successCount: 0,
        failedCount: 0,
        results: new Map(),
        failedFiles: [],
        duration: 0,
        averageReadTime: 0,
        totalSize: 0,
      };
    }

    // Reset state
    this.startTime = Date.now();
    this.totalSize = 0;
    this.completedCount = 0;
    this.failedCount = 0;
    this.currentFiles.clear();
    this.readTimes = [];

    // Update stores
    batchReadStatus.set('reading');
    this.updateProgress(filteredPaths.length);

    logger.info(`Starting batch read of ${filteredPaths.length} files (concurrency: ${config.concurrency})`);

    // Create queue with concurrency control
    this.queue = new ConcurrencyQueue(
      config.concurrency,
      (item) => this.readSingleFile(item.path, item.retryCount, config)
    );

    // Start all reads
    const results = new Map<string, FileReadResult>();
    const failedFiles: Array<{ path: string; error: string }> = [];

    try {
      // Add all files to queue and wait for results
      const promises = filteredPaths.map(async (path) => {
        this.currentFiles.add(path);
        this.updateProgress(filteredPaths.length);

        const result = await this.queue!.add(path);

        this.currentFiles.delete(path);
        results.set(path, result);

        // Cache the result
        fileReadCache.setKey(path, result);

        if (result.success) {
          this.completedCount++;
          this.totalSize += result.size;
          this.readTimes.push(result.readTime);
          config.onFileRead?.(path, result.content || '');
        } else {
          this.failedCount++;
          failedFiles.push({ path, error: result.error || 'Unknown error' });
          config.onFileError?.(path, result.error || 'Unknown error');
        }

        this.updateProgress(filteredPaths.length);
        config.onProgress?.(batchReadProgress.get());
      });

      await Promise.all(promises);

      const duration = Date.now() - this.startTime;
      const averageReadTime = this.readTimes.length > 0
        ? this.readTimes.reduce((a, b) => a + b, 0) / this.readTimes.length
        : 0;

      const batchResult: BatchReadResult = {
        success: this.failedCount === 0,
        totalFiles: filteredPaths.length,
        successCount: this.completedCount,
        failedCount: this.failedCount,
        results,
        failedFiles,
        duration,
        averageReadTime,
        totalSize: this.totalSize,
      };

      logger.info(
        `Batch read complete: ${this.completedCount}/${filteredPaths.length} files, ` +
        `${this.failedCount} failed, ${duration}ms total, ${Math.round(averageReadTime)}ms avg`
      );

      batchReadStatus.set(this.failedCount > 0 ? 'error' : 'complete');
      return batchResult;

    } catch (error) {
      logger.error('Batch read failed:', error);
      batchReadStatus.set('error');
      throw error;
    }
  }

  /**
   * Read a single file with timeout and retry
   */
  private async readSingleFile(
    path: string,
    retryCount: number,
    config: BatchReaderConfig
  ): Promise<FileReadResult> {
    const startTime = Date.now();

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Read timeout')), config.fileTimeout);
      });

      // Read file with timeout
      const content = await Promise.race([
        this.fetchFileContent(path),
        timeoutPromise,
      ]);

      const readTime = Date.now() - startTime;
      const size = content?.length || 0;

      // Check file size limit
      if (config.maxFileSize > 0 && size > config.maxFileSize) {
        return {
          path,
          content: null,
          success: false,
          error: `File too large (${Math.round(size / 1024)}KB > ${Math.round(config.maxFileSize / 1024)}KB)`,
          readTime,
          size,
        };
      }

      return {
        path,
        content,
        success: true,
        readTime,
        size,
      };

    } catch (error) {
      const readTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Retry if under retry limit
      if (retryCount < config.maxRetries) {
        logger.debug(`Retrying read for ${path} (attempt ${retryCount + 1}/${config.maxRetries})`);
        await this.delay(config.retryDelay);
        return this.readSingleFile(path, retryCount + 1, config);
      }

      return {
        path,
        content: null,
        success: false,
        error: errorMessage,
        readTime,
        size: 0,
      };
    }
  }

  /**
   * Fetch file content from docker backend
   */
  private async fetchFileContent(path: string): Promise<string> {
    // Normalize path - remove leading /workspace/ or /
    let normalizedPath = path;
    if (normalizedPath.startsWith('/workspace/')) {
      normalizedPath = normalizedPath.substring('/workspace/'.length);
    } else if (normalizedPath.startsWith('/')) {
      normalizedPath = normalizedPath.substring(1);
    }

    try {
      return await dockerReadFile(this.projectId, normalizedPath);
    } catch (error) {
      // Fallback to direct fetch if dockerReadFile fails
      const url = `${DOCKER_URL}/api/file/${this.projectId}?path=${encodeURIComponent(normalizedPath)}`;
      const response = await fetch(url, withDockerCredentials());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    }
  }

  /**
   * Cancel ongoing batch read
   */
  cancel(): void {
    if (this.queue) {
      this.queue.cancel();
      batchReadStatus.set('cancelled');
      logger.info('Batch read cancelled');
    }
  }

  /**
   * Update progress state
   */
  private updateProgress(total: number): void {
    const completed = this.completedCount + this.failedCount;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Estimate time remaining based on average read time
    let estimatedTimeRemaining: number | undefined;
    if (this.readTimes.length > 0 && completed < total) {
      const avgTime = this.readTimes.reduce((a, b) => a + b, 0) / this.readTimes.length;
      estimatedTimeRemaining = Math.round((total - completed) * avgTime);
    }

    batchReadProgress.set({
      total,
      completed: this.completedCount,
      failed: this.failedCount,
      inProgress: this.currentFiles.size,
      percentage,
      currentFiles: Array.from(this.currentFiles),
      estimatedTimeRemaining,
    });
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current progress
   */
  getProgress(): BatchReadProgress {
    return batchReadProgress.get();
  }

  /**
   * Check if currently reading
   */
  isReading(): boolean {
    return batchReadStatus.get() === 'reading';
  }
}

// ============================================================================
// SINGLETON READER
// ============================================================================

let defaultReader: BatchFileReader | null = null;

/**
 * Get or create the default batch file reader
 */
export function getBatchFileReader(projectId: string): BatchFileReader {
  if (!defaultReader || (defaultReader as any).projectId !== projectId) {
    defaultReader = new BatchFileReader(projectId);
  }
  return defaultReader;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Read multiple files with batch reader (convenience function)
 */
export async function readFilesBatch(
  projectId: string,
  filePaths: string[],
  options: Partial<BatchReaderConfig> = {}
): Promise<BatchReadResult> {
  const reader = new BatchFileReader(projectId, options);
  return reader.readFiles(filePaths, options);
}

/**
 * Read files with progress updates via callback
 */
export async function readFilesWithProgress(
  projectId: string,
  filePaths: string[],
  onProgress: (progress: BatchReadProgress) => void,
  options: Partial<BatchReaderConfig> = {}
): Promise<BatchReadResult> {
  return readFilesBatch(projectId, filePaths, {
    ...options,
    onProgress,
  });
}

/**
 * Get cached file content (if previously read)
 */
export function getCachedFileContent(path: string): string | null {
  const cached = fileReadCache.get()[path];
  return cached?.success ? cached.content : null;
}

/**
 * Clear file read cache
 */
export function clearFileReadCache(): void {
  fileReadCache.set({});
}

/**
 * Clear cache for a specific file
 */
export function invalidateFileCache(path: string): void {
  const cache = fileReadCache.get();
  if (cache[path]) {
    // TypeScript workaround for deleting from map store
    const newCache = { ...cache };
    delete newCache[path];
    fileReadCache.set(newCache);
  }
}

/**
 * Reset batch reader state
 */
export function resetBatchReaderState(): void {
  batchReadStatus.set('idle');
  batchReadProgress.set({
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
    percentage: 0,
    currentFiles: [],
  });
}

export default BatchFileReader;
