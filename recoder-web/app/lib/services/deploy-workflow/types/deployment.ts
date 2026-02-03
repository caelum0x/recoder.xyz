/**
 * Deployment types for the deploy-workflow service
 * Adapted from libra/apps/deploy
 */

/**
 * Deployment status enumeration
 */
export enum DeploymentStatus {
  PENDING = 'pending',
  VALIDATING = 'validating',
  CREATING_SANDBOX = 'creating_sandbox',
  SYNCING_FILES = 'syncing_files',
  BUILDING = 'building',
  DEPLOYING = 'deploying',
  UPDATING_DATABASE = 'updating_database',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Deployment parameters passed from queue message
 */
export interface DeploymentParams {
  projectId: string;
  customDomain?: string;
  orgId: string;
  userId: string;
  initFiles?: Record<string, any>;
  historyMessages?: any[];
}

/**
 * Deployment context for step execution
 */
export interface DeploymentContext {
  /** Unique deployment identifier */
  deploymentId: string;
  /** Environment configuration */
  env: DeploymentEnvironment;
  /** Deployment parameters */
  params: DeploymentParams;
  /** Current deployment state */
  state: DeploymentState;
  /** Logger instance */
  logger: Logger;
}

/**
 * Deployment environment configuration
 */
export interface DeploymentEnvironment {
  // Cloudflare API credentials
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;

  // Dispatch namespace configuration
  DISPATCH_NAMESPACE_NAME?: string;

  // Sandbox provider configuration
  E2B_API_KEY?: string;
  DAYTONA_API_KEY?: string;
  SANDBOX_BUILDER_DEFAULT_PROVIDER?: string;

  // Database connection
  DATABASE_URL?: string;

  // Environment variables
  LOG_LEVEL?: string;
  ENVIRONMENT?: string;
  NODE_ENV?: string;
}

/**
 * Logger interface for deployment workflow
 */
export interface Logger {
  debug(message: string, data?: Record<string, any>): void;
  info(message: string, data?: Record<string, any>): void;
  warn(message: string, data?: Record<string, any>): void;
  error(message: string, data?: Record<string, any>): void;
  step(stepName: string, message: string, data?: Record<string, any>): void;
  workflow(event: string, deploymentId: string, data?: Record<string, any>): void;
}

/**
 * Deployment state for persistence
 */
export interface DeploymentState {
  /** Deployment ID */
  id: string;
  /** Current status */
  status: DeploymentStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current stage description */
  stage: string;
  /** Deployment start time */
  startedAt: string;
  /** Deployment completion time */
  completedAt?: string;
  /** Error message if failed */
  error?: string;
  /** Step-specific results */
  stepResults: {
    validation?: ValidationResult;
    sandbox?: SandboxResult;
    sync?: SyncResult;
    build?: BuildResult;
    deploy?: DeployResult;
    cleanup?: CleanupResult;
  };
  /** Deployment configuration */
  config: {
    projectId: string;
    workerName: string;
    customDomain?: string;
    template: string;
    timeout: number;
  };
  /** Metadata */
  metadata: {
    userId: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
    version: string;
  };
}

/**
 * Generic deployment step result
 */
export interface DeploymentStepResult {
  /** Whether the step was successful */
  success: boolean;
  /** Step execution duration in milliseconds */
  duration: number;
  /** Error message if step failed */
  error?: string;
  /** Step-specific data */
  data?: any;
  /** Logs from step execution */
  logs?: string[];
}

/**
 * Validation step result
 */
export interface ValidationResult extends DeploymentStepResult {
  data?: {
    projectData: any;
    deploymentConfig: {
      projectId: string;
      workerName: string;
      customDomain?: string;
      template: string;
      timeout: number;
    };
    initFiles: any;
    historyMessages: any[];
  };
}

/**
 * Sandbox creation step result
 */
export interface SandboxResult extends DeploymentStepResult {
  data?: {
    sandboxId: string;
    sandboxInfo: any;
    provider: string;
  };
}

/**
 * File sync step result
 */
export interface SyncResult extends DeploymentStepResult {
  data?: {
    filesSynced: number;
    buildReady: boolean;
    syncedFiles: string[];
  };
}

/**
 * Build step result
 */
export interface BuildResult extends DeploymentStepResult {
  data?: {
    buildSuccess: boolean;
    buildOutput: string;
    artifacts: string[];
  };
}

/**
 * Deploy step result
 */
export interface DeployResult extends DeploymentStepResult {
  data?: {
    workerUrl: string;
    deploymentSuccess: boolean;
    workerName: string;
  };
}

/**
 * Cleanup step result
 */
export interface CleanupResult extends DeploymentStepResult {
  data?: {
    databaseUpdated: boolean;
    sandboxCleaned: boolean;
    artifactsStored: boolean;
  };
}

/**
 * Final deployment result
 */
export interface DeploymentResult {
  /** Whether deployment was successful */
  success: boolean;
  /** Deployment ID */
  deploymentId: string;
  /** Final worker URL if successful */
  workerUrl?: string;
  /** Error message if failed */
  error?: string;
  /** Success message */
  message?: string;
  /** Deployment duration in milliseconds */
  duration: number;
  /** Final deployment state */
  state: DeploymentState;
}

/**
 * Deployment request body for HTTP API
 */
export interface DeploymentRequest {
  projectId: string;
  customDomain?: string;
  orgId: string;
  userId: string;
  initFiles?: Record<string, any>;
  historyMessages?: any[];
}

/**
 * Deployment response for HTTP API
 */
export interface DeploymentResponse {
  success: boolean;
  deploymentId?: string;
  message?: string;
  error?: string;
  estimatedDuration?: number;
}

/**
 * Deployment status response for HTTP API
 */
export interface DeploymentStatusResponse {
  deploymentId: string;
  status: DeploymentStatus;
  progress: number;
  stage: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  workerUrl?: string;
  duration?: number;
}
