/**
 * File Batcher Service
 *
 * Batches multiple file operations together for improved performance.
 * Inspired by December's implementation - reduces WebSocket/HTTP overhead
 * by collecting file writes and sending them in batches.
 *
 * Features:
 * - Debounced batching of file operations
 * - Single request for multiple files
 * - Partial failure handling with individual retries
 * - Progress callbacks for batch operations
 * - Nanostores for state management
 */

import { atom, map, computed, type WritableAtom, type MapStore } from 'nanostores';
import { dockerPost, DOCKER_URL, withDockerCredentials } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('FileBatcher');

// ============================================================================
// TYPES
// ============================================================================

export interface FileOperation {
  id: string;
  path: string;
  content: string;
  addedAt: number;
  status: FileOperationStatus;
  error?: string;
  retryCount: number;
}

export type FileOperationStatus =
  | 'pending'     // Waiting in batch
  | 'batched'     // Added to current batch
  | 'sending'     // Batch is being sent
  | 'success'     // Completed successfully
  | 'failed'      // Failed (may retry)
  | 'retrying';   // Retrying individually

export type BatchStatus =
  | 'idle'        // No pending operations
  | 'collecting'  // Collecting operations
  | 'sending'     // Sending batch
  | 'complete'    // Batch complete
  | 'error';      // Batch error

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  percentage: number;
}

export interface BatchResult {
  success: boolean;
  totalFiles: number;
  successCount: number;
  failedCount: number;
  failedFiles: Array<{ path: string; error: string }>;
  duration: number;
}

export interface BatcherConfig {
  /** Debounce delay before sending batch (ms) */
  debounceMs: number;
  /** Maximum files per batch */
  maxBatchSize: number;
  /** Maximum time to wait before forcing batch send (ms) */
  maxWaitMs: number;
  /** Number of retries for failed operations */
  maxRetries: number;
  /** Timeout for batch request (ms) */
  timeoutMs: number;
  /** Callback on batch progress */
  onProgress?: (progress: BatchProgress) => void;
  /** Callback on batch complete */
  onComplete?: (result: BatchResult) => void;
  /** Callback on individual file success */
  onFileSuccess?: (path: string) => void;
  /** Callback on individual file failure */
  onFileFailure?: (path: string, error: string) => void;
}

const DEFAULT_CONFIG: BatcherConfig = {
  debounceMs: 100,       // 100ms debounce
  maxBatchSize: 50,      // Max 50 files per batch
  maxWaitMs: 2000,       // Max 2s wait before forcing send
  maxRetries: 2,         // Retry failed files twice
  timeoutMs: 30000,      // 30s timeout for batch request
};

// ============================================================================
// STORES
// ============================================================================

/** Current batch status */
export const batchStatus: WritableAtom<BatchStatus> = atom<BatchStatus>('idle');

/** All pending file operations */
export const pendingOperations: MapStore<Record<string, FileOperation>> = map({});

/** Current batch progress */
export const batchProgress: WritableAtom<BatchProgress> = atom<BatchProgress>({
  total: 0,
  completed: 0,
  failed: 0,
  inProgress: 0,
  percentage: 0,
});

/** Failed operations that need retry */
export const failedOperations: WritableAtom<FileOperation[]> = atom<FileOperation[]>([]);

/** Computed: number of pending operations */
export const pendingCount = computed(pendingOperations, (ops) => {
  return Object.values(ops).filter(op => op.status === 'pending' || op.status === 'batched').length;
});

/** Computed: has pending operations */
export const hasPendingOperations = computed(pendingCount, (count) => count > 0);

// ============================================================================
// BATCHER CLASS
// ============================================================================

class FileBatcher {
  private projectId: string | null = null;
  private config: BatcherConfig = { ...DEFAULT_CONFIG };
  private debounceTimer: NodeJS.Timeout | null = null;
  private maxWaitTimer: NodeJS.Timeout | null = null;
  private batchStartTime: number = 0;
  private isSending: boolean = false;
  private operationIdCounter: number = 0;

  /**
   * Configure the batcher
   */
  configure(config: Partial<BatcherConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set the project ID for file operations
   */
  setProjectId(projectId: string): void {
    this.projectId = projectId;
    logger.debug(`File batcher configured for project: ${projectId}`);
  }

  /**
   * Get current project ID
   */
  getProjectId(): string | null {
    return this.projectId;
  }

  /**
   * Add a file operation to the batch
   */
  addFile(path: string, content: string): string {
    const id = `op-${++this.operationIdCounter}-${Date.now()}`;

    const operation: FileOperation = {
      id,
      path,
      content,
      addedAt: Date.now(),
      status: 'pending',
      retryCount: 0,
    };

    // Add to pending operations
    pendingOperations.setKey(id, operation);

    // Start batch timer if this is the first operation
    if (Object.keys(pendingOperations.get()).length === 1) {
      this.batchStartTime = Date.now();
      this.startMaxWaitTimer();
    }

    // Update status
    batchStatus.set('collecting');

    // Schedule batch send (debounced)
    this.scheduleBatchSend();

    logger.debug(`Added file to batch: ${path} (id: ${id})`);

    return id;
  }

  /**
   * Add multiple files at once
   */
  addFiles(files: Array<{ path: string; content: string }>): string[] {
    const ids: string[] = [];

    for (const file of files) {
      ids.push(this.addFile(file.path, file.content));
    }

    return ids;
  }

  /**
   * Schedule batch send with debounce
   */
  private scheduleBatchSend(): void {
    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Check if we've hit max batch size
    const ops = pendingOperations.get();
    const pendingOps = Object.values(ops).filter(op => op.status === 'pending');

    if (pendingOps.length >= this.config.maxBatchSize) {
      // Batch is full, send immediately
      this.sendBatch();
      return;
    }

    // Set debounce timer
    this.debounceTimer = setTimeout(() => {
      this.sendBatch();
    }, this.config.debounceMs);
  }

  /**
   * Start max wait timer
   */
  private startMaxWaitTimer(): void {
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
    }

    this.maxWaitTimer = setTimeout(() => {
      logger.debug('Max wait time reached, forcing batch send');
      this.sendBatch();
    }, this.config.maxWaitMs);
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
  }

  /**
   * Force flush the batch immediately
   */
  async flush(): Promise<BatchResult> {
    this.clearTimers();
    return this.sendBatch();
  }

  /**
   * Send the current batch
   */
  private async sendBatch(): Promise<BatchResult> {
    // If already sending, schedule a follow-up batch after current one completes
    if (this.isSending) {
      logger.debug('Batch send in progress, will retry after current batch completes');
      if (!this.debounceTimer) {
        this.debounceTimer = setTimeout(() => {
          this.sendBatch();
        }, 500);
      }
      return {
        success: true,
        totalFiles: 0,
        successCount: 0,
        failedCount: 0,
        failedFiles: [],
        duration: 0,
      };
    }

    this.clearTimers();

    const ops = pendingOperations.get();
    const pendingOps = Object.values(ops).filter(op => op.status === 'pending');

    if (pendingOps.length === 0) {
      batchStatus.set('idle');
      return {
        success: true,
        totalFiles: 0,
        successCount: 0,
        failedCount: 0,
        failedFiles: [],
        duration: 0,
      };
    }

    if (!this.projectId) {
      logger.error('Cannot send batch: no project ID configured');
      return {
        success: false,
        totalFiles: pendingOps.length,
        successCount: 0,
        failedCount: pendingOps.length,
        failedFiles: pendingOps.map(op => ({ path: op.path, error: 'No project ID' })),
        duration: 0,
      };
    }

    this.isSending = true;
    batchStatus.set('sending');
    const startTime = Date.now();

    // Mark all operations as batched
    for (const op of pendingOps) {
      pendingOperations.setKey(op.id, { ...op, status: 'batched' });
    }

    // Update progress
    this.updateProgress(pendingOps.length, 0, 0, pendingOps.length);

    try {
      // Prepare files for batch request
      const files = pendingOps.map(op => ({
        path: op.path,
        content: op.content,
      }));

      logger.info(`Sending batch of ${files.length} files to project ${this.projectId}`);

      // Send batch request
      const response = await this.sendBatchRequest(files);

      const duration = Date.now() - startTime;

      if (response.success) {
        const failedList = response.failedFiles || [];
        if (failedList.length > 0) {
          // Partial failures: mark successes, then retry only failed files
          const failedMap = new Map(failedList.map((f) => [f.path, f.error || 'Batch write failed']));
          const failedOps = pendingOps.filter((op) => failedMap.has(op.path));
          let successCount = 0;

          for (const op of pendingOps) {
            if (!failedMap.has(op.path)) {
              pendingOperations.setKey(op.id, { ...op, status: 'success' });
              this.config.onFileSuccess?.(op.path);
              successCount++;
            }
          }

          const retryResult = await this.handleBatchFailure(failedOps, 'Batch partial failure', duration);
          const result: BatchResult = {
            success: retryResult.failedCount === 0,
            totalFiles: pendingOps.length,
            successCount: successCount + retryResult.successCount,
            failedCount: retryResult.failedCount,
            failedFiles: retryResult.failedFiles,
            duration,
          };

          logger.info(`Batch complete (partial): ${result.successCount}/${result.totalFiles} files in ${duration}ms`);
          this.config.onComplete?.(result);
          batchStatus.set(result.failedCount > 0 ? 'error' : 'complete');
          this.cleanup();
          return result;
        }

        // All files succeeded
        for (const op of pendingOps) {
          pendingOperations.setKey(op.id, { ...op, status: 'success' });
          this.config.onFileSuccess?.(op.path);
        }

        this.updateProgress(pendingOps.length, pendingOps.length, 0, 0);

        const result: BatchResult = {
          success: true,
          totalFiles: pendingOps.length,
          successCount: pendingOps.length,
          failedCount: 0,
          failedFiles: [],
          duration,
        };

        logger.info(`Batch complete: ${result.successCount}/${result.totalFiles} files in ${duration}ms`);
        this.config.onComplete?.(result);

        batchStatus.set('complete');
        this.cleanup();

        return result;
      } else {
        // Batch failed - handle individual failures
        return await this.handleBatchFailure(pendingOps, response.error || 'Batch failed', duration);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Batch send failed: ${errorMessage}`);

      return await this.handleBatchFailure(pendingOps, errorMessage, duration);
    } finally {
      this.isSending = false;
    }
  }

  /**
   * Send batch request to docker-backend
   */
  private async sendBatchRequest(
    files: Array<{ path: string; content: string }>
  ): Promise<{ success: boolean; count?: number; failedFiles?: Array<{ path: string; error?: string }>; error?: string }> {
    const endpoint = `/api/files/${this.projectId}/batch`;

    try {
      const response = await dockerPost<{ success: boolean; count?: number; failedFiles?: Array<{ path: string; error?: string }> }>(
        endpoint,
        { files },
        { timeout: this.config.timeoutMs }
      );

      return {
        success: response?.success !== false,
        count: response?.count || files.length,
        failedFiles: response?.failedFiles,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle batch failure - retry failed files individually
   */
  private async handleBatchFailure(
    operations: FileOperation[],
    error: string,
    duration: number
  ): Promise<BatchResult> {
    const failedFiles: Array<{ path: string; error: string }> = [];
    let successCount = 0;

    // Try each file individually
    for (const op of operations) {
      if (op.retryCount >= this.config.maxRetries) {
        // Max retries reached
        pendingOperations.setKey(op.id, { ...op, status: 'failed', error });
        failedFiles.push({ path: op.path, error: `Max retries (${this.config.maxRetries}) exceeded` });
        this.config.onFileFailure?.(op.path, error);
        continue;
      }

      // Retry individually
      pendingOperations.setKey(op.id, {
        ...op,
        status: 'retrying',
        retryCount: op.retryCount + 1,
      });

      try {
        await this.writeFileSingle(op.path, op.content);
        pendingOperations.setKey(op.id, { ...op, status: 'success' });
        successCount++;
        this.config.onFileSuccess?.(op.path);
        logger.debug(`Retry successful for: ${op.path}`);
      } catch (retryError) {
        const retryErrorMsg = retryError instanceof Error ? retryError.message : String(retryError);
        pendingOperations.setKey(op.id, {
          ...op,
          status: 'failed',
          error: retryErrorMsg,
        });
        failedFiles.push({ path: op.path, error: retryErrorMsg });
        this.config.onFileFailure?.(op.path, retryErrorMsg);
        logger.warn(`Retry failed for ${op.path}: ${retryErrorMsg}`);
      }

      this.updateProgress(
        operations.length,
        successCount,
        failedFiles.length,
        operations.length - successCount - failedFiles.length
      );
    }

    // Update failed operations store
    const allFailed = Object.values(pendingOperations.get()).filter(op => op.status === 'failed');
    failedOperations.set(allFailed);

    const result: BatchResult = {
      success: failedFiles.length === 0,
      totalFiles: operations.length,
      successCount,
      failedCount: failedFiles.length,
      failedFiles,
      duration: duration + (Date.now() - (duration + Date.now())), // Approximate
    };

    logger.info(`Batch complete with retries: ${successCount}/${operations.length} succeeded, ${failedFiles.length} failed`);
    this.config.onComplete?.(result);

    batchStatus.set(failedFiles.length > 0 ? 'error' : 'complete');
    this.cleanup();

    return result;
  }

  /**
   * Write a single file (for individual retries)
   */
  private async writeFileSingle(path: string, content: string): Promise<void> {
    const endpoint = `/api/file/${this.projectId}`;

    // Remove leading /workspace/ or / for the API
    let relativePath = path;
    if (relativePath.startsWith('/workspace/')) {
      relativePath = relativePath.substring('/workspace/'.length);
    } else if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }

    const response = await fetch(`${DOCKER_URL}${endpoint}`, withDockerCredentials({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: relativePath, content }),
    }));

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error((error as { error?: string }).error || 'Write failed');
    }
  }

  /**
   * Update progress state
   */
  private updateProgress(total: number, completed: number, failed: number, inProgress: number): void {
    const progress: BatchProgress = {
      total,
      completed,
      failed,
      inProgress,
      percentage: total > 0 ? Math.round(((completed + failed) / total) * 100) : 0,
    };

    batchProgress.set(progress);
    this.config.onProgress?.(progress);
  }

  /**
   * Cleanup after batch complete
   */
  private cleanup(): void {
    // Remove successful operations after a delay
    setTimeout(() => {
      const ops = pendingOperations.get();
      for (const [id, op] of Object.entries(ops)) {
        if (op.status === 'success') {
          pendingOperations.setKey(id, undefined as any);
        }
      }
    }, 1000);
  }

  /**
   * Retry all failed operations
   */
  async retryFailed(): Promise<BatchResult> {
    const failed = failedOperations.get();

    if (failed.length === 0) {
      return {
        success: true,
        totalFiles: 0,
        successCount: 0,
        failedCount: 0,
        failedFiles: [],
        duration: 0,
      };
    }

    logger.info(`Retrying ${failed.length} failed operations`);

    // Reset and re-add to pending
    for (const op of failed) {
      pendingOperations.setKey(op.id, {
        ...op,
        status: 'pending',
        error: undefined,
        retryCount: 0, // Reset retry count for manual retry
      });
    }

    failedOperations.set([]);

    // Flush immediately
    return this.flush();
  }

  /**
   * Clear all pending operations
   */
  clear(): void {
    this.clearTimers();
    pendingOperations.set({});
    failedOperations.set([]);
    batchStatus.set('idle');
    batchProgress.set({
      total: 0,
      completed: 0,
      failed: 0,
      inProgress: 0,
      percentage: 0,
    });
    this.isSending = false;
  }

  /**
   * Get batch statistics
   */
  getStats(): {
    pending: number;
    sending: number;
    completed: number;
    failed: number;
    status: BatchStatus;
  } {
    const ops = Object.values(pendingOperations.get());
    return {
      pending: ops.filter(op => op.status === 'pending').length,
      sending: ops.filter(op => op.status === 'batched' || op.status === 'sending').length,
      completed: ops.filter(op => op.status === 'success').length,
      failed: ops.filter(op => op.status === 'failed').length,
      status: batchStatus.get(),
    };
  }

  /**
   * Check if currently sending
   */
  isBatching(): boolean {
    return this.isSending || batchStatus.get() === 'sending';
  }

  /**
   * Wait for current batch to complete
   */
  async waitForCompletion(): Promise<void> {
    if (!this.isSending && Object.keys(pendingOperations.get()).length === 0) {
      return;
    }

    return new Promise((resolve) => {
      const unsubscribe = batchStatus.subscribe((status) => {
        if (status === 'idle' || status === 'complete' || status === 'error') {
          unsubscribe();
          resolve();
        }
      });
    });
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const fileBatcher = new FileBatcher();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Queue a file write operation (batched)
 */
export function queueFileWrite(path: string, content: string): string {
  return fileBatcher.addFile(path, content);
}

/**
 * Queue multiple file writes (batched)
 */
export function queueFileWrites(files: Array<{ path: string; content: string }>): string[] {
  return fileBatcher.addFiles(files);
}

/**
 * Flush all pending file writes
 */
export async function flushFileWrites(): Promise<BatchResult> {
  return fileBatcher.flush();
}

/**
 * Configure the file batcher
 */
export function configureFileBatcher(config: Partial<BatcherConfig>): void {
  fileBatcher.configure(config);
}

/**
 * Set project ID for file batcher
 */
export function setFileBatcherProject(projectId: string): void {
  fileBatcher.setProjectId(projectId);
}

/**
 * Wait for batch completion
 */
export async function waitForBatchCompletion(): Promise<void> {
  return fileBatcher.waitForCompletion();
}

/**
 * Clear all pending file operations
 */
export function clearPendingFiles(): void {
  fileBatcher.clear();
}

/**
 * Retry failed file operations
 */
export async function retryFailedFiles(): Promise<BatchResult> {
  return fileBatcher.retryFailed();
}

/**
 * Get batcher statistics
 */
export function getFileBatcherStats() {
  return fileBatcher.getStats();
}

export default fileBatcher;
