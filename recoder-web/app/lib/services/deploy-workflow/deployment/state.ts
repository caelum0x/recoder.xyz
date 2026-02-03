/**
 * Deployment state management
 * Manages deployment state persistence and retrieval
 */

import {
  type DeploymentState,
  type DeploymentParams,
  type DeploymentStepResult,
  type DeploymentEnvironment,
  DeploymentStatus
} from '../types';
import { createLogger } from '../utils/logger';
import { DEPLOYMENT_CONFIG } from '../utils/common';

// Map deployment statuses to project deployment statuses
const PROJECT_STATUS_MAP: Record<DeploymentStatus, string> = {
  [DeploymentStatus.PENDING]: 'preparing',
  [DeploymentStatus.VALIDATING]: 'preparing',
  [DeploymentStatus.CREATING_SANDBOX]: 'preparing',
  [DeploymentStatus.SYNCING_FILES]: 'deploying',
  [DeploymentStatus.BUILDING]: 'deploying',
  [DeploymentStatus.DEPLOYING]: 'deploying',
  [DeploymentStatus.UPDATING_DATABASE]: 'deploying',
  [DeploymentStatus.COMPLETED]: 'deployed',
  [DeploymentStatus.FAILED]: 'failed',
  [DeploymentStatus.CANCELLED]: 'failed'
};

/**
 * Storage interface for state persistence
 */
export interface StateStorage {
  get(key: string): Promise<DeploymentState | null>;
  set(key: string, state: DeploymentState): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * In-memory state storage implementation
 */
export class InMemoryStateStorage implements StateStorage {
  private states: Map<string, DeploymentState> = new Map();

  async get(key: string): Promise<DeploymentState | null> {
    return this.states.get(key) || null;
  }

  async set(key: string, state: DeploymentState): Promise<void> {
    this.states.set(key, state);
  }

  async delete(key: string): Promise<void> {
    this.states.delete(key);
  }

  /**
   * Get all states (for debugging/monitoring)
   */
  getAll(): Map<string, DeploymentState> {
    return new Map(this.states);
  }

  /**
   * Clear all states
   */
  clear(): void {
    this.states.clear();
  }
}

/**
 * Callback for state change notifications
 */
export type StateChangeCallback = (state: DeploymentState) => void;

/**
 * Deployment state manager
 * Manages deployment state persistence, updates, and notifications
 */
export class DeploymentStateManager {
  private env: DeploymentEnvironment;
  private logger: ReturnType<typeof createLogger>;
  private storage: StateStorage;
  private callbacks: Map<string, StateChangeCallback[]> = new Map();

  constructor(env: DeploymentEnvironment, storage?: StateStorage) {
    this.env = env;
    this.logger = createLogger(env);
    this.storage = storage || new InMemoryStateStorage();
  }

  /**
   * Subscribe to state changes for a deployment
   */
  subscribe(deploymentId: string, callback: StateChangeCallback): () => void {
    const callbacks = this.callbacks.get(deploymentId) || [];
    callbacks.push(callback);
    this.callbacks.set(deploymentId, callbacks);

    // Return unsubscribe function
    return () => {
      const updated = this.callbacks.get(deploymentId) || [];
      const index = updated.indexOf(callback);
      if (index > -1) {
        updated.splice(index, 1);
        this.callbacks.set(deploymentId, updated);
      }
    };
  }

  /**
   * Notify subscribers of state change
   */
  private notifySubscribers(state: DeploymentState): void {
    const callbacks = this.callbacks.get(state.id) || [];
    callbacks.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        this.logger.error('State change callback error', {
          deploymentId: state.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  /**
   * Initialize a new deployment state
   */
  async initializeDeployment(deploymentId: string, params: DeploymentParams): Promise<DeploymentState> {
    const now = new Date().toISOString();

    const state: DeploymentState = {
      id: deploymentId,
      status: DeploymentStatus.PENDING,
      progress: 0,
      stage: 'Initializing deployment',
      startedAt: now,
      stepResults: {},
      config: {
        projectId: params.projectId,
        workerName: `${params.projectId}-worker`,
        customDomain: params.customDomain,
        template: DEPLOYMENT_CONFIG.DEFAULT_TEMPLATE,
        timeout: DEPLOYMENT_CONFIG.TIMEOUT
      },
      metadata: {
        userId: params.userId,
        organizationId: params.orgId,
        createdAt: now,
        updatedAt: now,
        version: '1.0.0'
      }
    };

    await this.storage.set(deploymentId, state);
    this.notifySubscribers(state);

    this.logger.info('Deployment state initialized', {
      deploymentId,
      projectId: params.projectId,
      userId: params.userId
    });

    return state;
  }

  /**
   * Get deployment state by ID
   */
  async getDeploymentState(deploymentId: string): Promise<DeploymentState | null> {
    return this.storage.get(deploymentId);
  }

  /**
   * Get deployment state by project ID
   * Creates a mock state based on project's status if not found
   */
  async getDeploymentStateByProjectId(
    projectId: string,
    deploymentId: string
  ): Promise<DeploymentState | null> {
    // First try to get from storage
    const existingState = await this.storage.get(deploymentId);
    if (existingState) {
      return existingState;
    }

    // Create a new pending state if not found
    const now = new Date().toISOString();
    const state: DeploymentState = {
      id: deploymentId,
      status: DeploymentStatus.PENDING,
      progress: 0,
      stage: 'Initializing',
      startedAt: now,
      stepResults: {},
      config: {
        projectId,
        workerName: `${projectId}-worker`,
        template: DEPLOYMENT_CONFIG.DEFAULT_TEMPLATE,
        timeout: DEPLOYMENT_CONFIG.TIMEOUT
      },
      metadata: {
        userId: '',
        organizationId: '',
        createdAt: now,
        updatedAt: now,
        version: '1.0.0'
      }
    };

    await this.storage.set(deploymentId, state);
    return state;
  }

  /**
   * Save complete deployment state
   */
  async saveDeploymentState(state: DeploymentState): Promise<void> {
    state.metadata.updatedAt = new Date().toISOString();
    await this.storage.set(state.id, state);
    this.notifySubscribers(state);

    this.logger.info('Deployment state saved', {
      deploymentId: state.id,
      status: state.status,
      progress: state.progress
    });
  }

  /**
   * Update deployment status
   */
  async updateDeploymentStatus(
    deploymentId: string,
    status: DeploymentStatus,
    progress?: number,
    stage?: string
  ): Promise<void> {
    const state = await this.storage.get(deploymentId);
    if (!state) {
      this.logger.warn('Deployment state not found for status update', { deploymentId });
      return;
    }

    state.status = status;
    if (progress !== undefined) {
      state.progress = progress;
    }
    if (stage) {
      state.stage = stage;
    }

    if (status === DeploymentStatus.COMPLETED || status === DeploymentStatus.FAILED) {
      state.completedAt = new Date().toISOString();
    }

    await this.saveDeploymentState(state);
  }

  /**
   * Update deployment status by project ID
   */
  async updateDeploymentStatusByProjectId(
    projectId: string,
    status: DeploymentStatus
  ): Promise<void> {
    // Find deployment by project ID
    // In a real implementation, this would query a database
    // For now, we just log the intent
    this.logger.info('Updating deployment status by project ID', {
      projectId,
      status,
      mappedStatus: PROJECT_STATUS_MAP[status]
    });
  }

  /**
   * Save step result to deployment state
   */
  async saveStepResult(
    deploymentId: string,
    stepName: string,
    result: DeploymentStepResult
  ): Promise<void> {
    const state = await this.storage.get(deploymentId);
    if (!state) {
      this.logger.warn('Deployment state not found for step result', { deploymentId, stepName });
      return;
    }

    // Type-safe step result assignment
    const stepKey = stepName as keyof typeof state.stepResults;
    (state.stepResults as any)[stepKey] = result;

    await this.saveDeploymentState(state);

    this.logger.info(`Step ${stepName} result saved`, {
      deploymentId,
      stepName,
      success: result.success,
      duration: result.duration
    });
  }

  /**
   * Mark deployment as failed with error
   */
  async markDeploymentFailed(deploymentId: string, error: string): Promise<void> {
    const state = await this.storage.get(deploymentId);
    if (!state) {
      this.logger.warn('Deployment state not found for failure marking', { deploymentId });
      return;
    }

    state.status = DeploymentStatus.FAILED;
    state.error = error;
    state.completedAt = new Date().toISOString();

    await this.saveDeploymentState(state);

    this.logger.error('Deployment marked as failed', {
      deploymentId,
      error
    });
  }

  /**
   * Mark deployment as completed
   */
  async markDeploymentCompleted(deploymentId: string, workerUrl?: string): Promise<void> {
    const state = await this.storage.get(deploymentId);
    if (!state) {
      this.logger.warn('Deployment state not found for completion marking', { deploymentId });
      return;
    }

    state.status = DeploymentStatus.COMPLETED;
    state.progress = 100;
    state.stage = 'Deployment completed';
    state.completedAt = new Date().toISOString();

    if (workerUrl && state.stepResults.deploy) {
      (state.stepResults.deploy as any).data = {
        ...state.stepResults.deploy.data,
        workerUrl
      };
    }

    await this.saveDeploymentState(state);

    this.logger.info('Deployment marked as completed', {
      deploymentId,
      workerUrl
    });
  }

  /**
   * Delete deployment state
   */
  async deleteDeploymentState(deploymentId: string): Promise<void> {
    await this.storage.delete(deploymentId);
    this.callbacks.delete(deploymentId);

    this.logger.info('Deployment state deleted', { deploymentId });
  }

  /**
   * Get project status from deployment status
   */
  getProjectStatus(status: DeploymentStatus): string {
    return PROJECT_STATUS_MAP[status] || 'preparing';
  }
}

/**
 * Create deployment state manager instance
 */
export function createStateManager(
  env: DeploymentEnvironment,
  storage?: StateStorage
): DeploymentStateManager {
  return new DeploymentStateManager(env, storage);
}
