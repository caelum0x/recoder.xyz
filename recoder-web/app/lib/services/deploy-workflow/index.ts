/**
 * Deploy Workflow Service
 *
 * A complete deployment orchestration system with:
 * - Queue-based async processing
 * - Build process management
 * - Artifact handling
 * - Deployment state machine
 *
 * Adapted from libra/apps/deploy for use in recoder-web
 */

// Types
export {
  DeploymentStatus,
  type DeploymentParams,
  type DeploymentContext,
  type DeploymentEnvironment,
  type Logger,
  type DeploymentState,
  type DeploymentStepResult,
  type ValidationResult,
  type SandboxResult,
  type SyncResult,
  type BuildResult,
  type DeployResult,
  type CleanupResult,
  type DeploymentResult,
  type DeploymentRequest,
  type DeploymentResponse,
  type DeploymentStatusResponse,
  type QueueMessage,
  type QueueMessageMetadata,
  type QueueDeploymentParams,
  type QueueBatch,
  type QueueProcessingResult,
  type QueueBatchResult,
  type QueueProducerOptions,
  type DLQMessage,
  type LocalQueue,
  type HealthResponse,
  type ServiceInfoResponse
} from './types';

// Utilities
export {
  ErrorCodes,
  type ErrorCode,
  DeploymentError,
  CommonErrors,
  handleAsyncError,
  retryWithBackoff,
  validateRequiredFields,
  safeJsonParse,
  tryCatch,
  LogLevel,
  type LogEntry,
  Logger as DeploymentLogger,
  createLogger,
  logStep,
  PerformanceTimer,
  createTimer,
  loggedOperation,
  isExcludedFile,
  generateDeploymentId,
  generateRequestId,
  generateBatchId,
  isValidProjectId,
  isValidOrganizationId,
  isValidUserId,
  sanitizeFilePath,
  formatDuration,
  formatBytes,
  sleep,
  retry,
  truncateString,
  deepClone,
  isEmpty,
  parseBoolean,
  parseInteger,
  DEPLOYMENT_CONFIG
} from './utils';

// Deployment
export {
  DeploymentStateManager,
  InMemoryStateStorage,
  createStateManager,
  type StateStorage,
  type StateChangeCallback,
  DeploymentWorkflow,
  createDeploymentWorkflow,
  executeDeployment,
  validateAndPrepare,
  createSandbox,
  connectToSandbox,
  terminateSandbox,
  sandboxRegistry,
  MockSandbox,
  syncFiles,
  buildProject,
  deployToCloudflare,
  deployToAlternativePlatform,
  updateDatabaseAndCleanup,
  cleanupOnFailure,
  type ISandbox,
  type SandboxProvider,
  type DeploymentDatabaseRecord
} from './deployment';

// Queue
export {
  createQueueMessage,
  sendToQueue,
  enqueueDeployment,
  sendBatchToQueue,
  sendPriorityMessage,
  sendDelayedMessage,
  sendToDLQ,
  getQueueStats,
  getPendingMessages,
  getDLQMessages,
  clearAllQueues,
  deploymentQueue,
  deadLetterQueue,
  processBatch,
  startConsumer,
  processNextMessage,
  processAllPending
} from './queue';

// Import for internal use in createDeploymentService
import { createLogger as _createLogger } from './utils/logger';
import { generateDeploymentId as _generateDeploymentId } from './utils/common';
import { DeploymentStateManager as _DeploymentStateManager } from './deployment/state';
import { DeploymentWorkflow as _DeploymentWorkflow } from './deployment/workflow';
import { enqueueDeployment as _enqueueDeployment } from './queue/producer';
import { startConsumer as _startConsumer, processNextMessage as _processNextMessage } from './queue/consumer';
import { getQueueStats as _getQueueStats } from './queue/producer';
import type { DeploymentParams, DeploymentState, DeploymentEnvironment, DeploymentResult } from './types';
import type { StateChangeCallback } from './deployment/state';

/**
 * Create and configure a complete deployment service
 */
export function createDeploymentService(env: DeploymentEnvironment) {
  const logger = _createLogger(env);
  const stateManager = new _DeploymentStateManager(env);
  const workflow = new _DeploymentWorkflow(env, stateManager, logger);

  return {
    /**
     * Execute a deployment synchronously
     */
    async deploy(params: DeploymentParams): Promise<DeploymentResult> {
      const deploymentId = _generateDeploymentId();
      return workflow.execute(deploymentId, params);
    },

    /**
     * Queue a deployment for async processing
     */
    async queueDeployment(params: DeploymentParams, options?: {
      priority?: number;
      delaySeconds?: number;
    }): Promise<{ deploymentId: string }> {
      const { deploymentId } = await _enqueueDeployment(params, options);
      return { deploymentId };
    },

    /**
     * Get deployment status
     */
    async getStatus(deploymentId: string): Promise<DeploymentState | null> {
      return stateManager.getDeploymentState(deploymentId);
    },

    /**
     * Subscribe to deployment state changes
     */
    subscribe(deploymentId: string, callback: StateChangeCallback): () => void {
      return stateManager.subscribe(deploymentId, callback);
    },

    /**
     * Start the queue consumer
     */
    startQueueConsumer(options?: { pollInterval?: number; batchSize?: number }) {
      return _startConsumer(env, options);
    },

    /**
     * Process next pending deployment
     */
    async processNext() {
      return _processNextMessage(env);
    },

    /**
     * Get queue statistics
     */
    getQueueStats() {
      return _getQueueStats();
    },

    /**
     * Access to internal components for advanced usage
     */
    _internal: {
      logger,
      stateManager,
      workflow
    }
  };
}
