/**
 * Type exports for the deploy-workflow service
 */

// Re-export all deployment types
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
  type DeploymentStatusResponse
} from './deployment';

// Re-export all queue types
export {
  type QueueMessageMetadata,
  type QueueDeploymentParams,
  type QueueMessage,
  type QueueBatch,
  type QueueProcessingResult,
  type QueueBatchResult,
  type QueueProducerOptions,
  type DLQMessage,
  type LocalQueue
} from './queue';

/**
 * Health check response
 */
export interface HealthResponse {
  status: string;
  timestamp: string;
  service?: string;
  version?: string;
  queues?: {
    deployment: {
      status: string;
      backlog?: number;
    };
    dlq: {
      status: string;
      backlog?: number;
    };
  };
}

/**
 * Service info response
 */
export interface ServiceInfoResponse {
  message: string;
  endpoints: string[];
  timestamp: string;
  service?: string;
  version?: string;
}
