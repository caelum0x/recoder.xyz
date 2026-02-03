/**
 * Deploy Queue Service
 *
 * Queue-based deployment system with:
 * - Priority queue management
 * - Deployment status tracking
 * - Automatic retries with exponential backoff
 * - Support for multiple deployment targets (Vercel, Netlify, custom)
 * - Webhook support for deployment status updates
 */

import { createScopedLogger } from '~/utils/logger';
import { dockerPost, dockerGet } from '~/lib/services/docker-api';

const logger = createScopedLogger('DeployQueue');

// ============================================================================
// TYPES
// ============================================================================

export type DeploymentTarget = 'vercel' | 'netlify' | 'cloudflare' | 'custom';

export type DeploymentStatus =
  | 'queued'       // Waiting in queue
  | 'preparing'    // Preparing deployment (building)
  | 'uploading'    // Uploading to target
  | 'deploying'    // Deployment in progress
  | 'success'      // Deployment successful
  | 'failed'       // Deployment failed
  | 'cancelled'    // Cancelled by user
  | 'rolling_back' // Rolling back to previous
  | 'rolled_back'; // Rollback completed

export type DeploymentPriority = 'low' | 'normal' | 'high' | 'critical';

export interface DeploymentTargetConfig {
  id: string;
  type: DeploymentTarget;
  name: string;
  projectId?: string;       // Target platform project ID
  teamId?: string;          // Team/org ID
  token?: string;           // API token (stored securely)
  region?: string;          // Deployment region
  buildCommand?: string;    // Custom build command
  outputDir?: string;       // Build output directory
  environment?: 'production' | 'preview' | 'development';
  envVars?: Record<string, string>; // Environment variables
  customDomain?: string;    // Custom domain
  webhookUrl?: string;      // Webhook for status updates
  enabled: boolean;
}

export interface Deployment {
  id: string;
  projectId: string;        // Our project ID
  targetId: string;         // Target config ID
  target: DeploymentTarget;
  status: DeploymentStatus;
  priority: DeploymentPriority;
  url?: string;             // Deployment URL
  previewUrl?: string;      // Preview URL
  commitHash?: string;      // Git commit hash
  branch?: string;          // Git branch
  message?: string;         // Deployment message/description
  error?: string;           // Error message if failed
  logs: DeploymentLog[];    // Deployment logs
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  maxRetries: number;
  previousDeploymentId?: string; // For rollback reference
}

export interface DeploymentLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  details?: Record<string, unknown>;
}

export interface DeploymentResult {
  success: boolean;
  deploymentId: string;
  url?: string;
  previewUrl?: string;
  error?: string;
  logs: DeploymentLog[];
}

export interface DeploymentWebhookPayload {
  deploymentId: string;
  status: DeploymentStatus;
  url?: string;
  timestamp: Date;
  target: DeploymentTarget;
  message?: string;
}

// Queue configuration
export interface DeployQueueConfig {
  maxConcurrent: number;          // Max concurrent deployments
  defaultMaxRetries: number;      // Default retry count
  baseRetryDelay: number;         // Base delay for retries (ms)
  maxRetryDelay: number;          // Max delay between retries (ms)
  statusCheckInterval: number;    // How often to check deployment status (ms)
  buildTimeout: number;           // Build timeout (ms)
  deployTimeout: number;          // Deployment timeout (ms)
}

const DEFAULT_CONFIG: DeployQueueConfig = {
  maxConcurrent: 2,
  defaultMaxRetries: 3,
  baseRetryDelay: 1000,
  maxRetryDelay: 30000,
  statusCheckInterval: 5000,
  buildTimeout: 5 * 60 * 1000,   // 5 minutes
  deployTimeout: 10 * 60 * 1000, // 10 minutes
};

// ============================================================================
// PRIORITY QUEUE
// ============================================================================

const PRIORITY_WEIGHTS: Record<DeploymentPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

class PriorityQueue<T extends { priority: DeploymentPriority; createdAt: Date }> {
  private items: T[] = [];

  enqueue(item: T): void {
    this.items.push(item);
    this.sort();
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  peek(): T | undefined {
    return this.items[0];
  }

  remove(predicate: (item: T) => boolean): T | undefined {
    const index = this.items.findIndex(predicate);
    if (index === -1) return undefined;
    return this.items.splice(index, 1)[0];
  }

  getAll(): T[] {
    return [...this.items];
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }

  private sort(): void {
    this.items.sort((a, b) => {
      // Higher priority first
      const priorityDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      // Earlier creation time first (FIFO for same priority)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }
}

// ============================================================================
// DEPLOY QUEUE CLASS
// ============================================================================

type DeployEventType =
  | 'deployment-queued'
  | 'deployment-started'
  | 'deployment-progress'
  | 'deployment-success'
  | 'deployment-failed'
  | 'deployment-cancelled'
  | 'deployment-rollback'
  | 'queue-empty';

interface DeployEvent {
  type: DeployEventType;
  deployment?: Deployment;
  message?: string;
}

type DeployEventCallback = (event: DeployEvent) => void;

export class DeployQueue {
  private queue = new PriorityQueue<Deployment>();
  private active: Map<string, Deployment> = new Map();
  private history: Deployment[] = [];
  private config: DeployQueueConfig;
  private targets: Map<string, DeploymentTargetConfig> = new Map();
  private isProcessing = false;
  private eventCallbacks: Set<DeployEventCallback> = new Set();
  private statusCheckIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(config: Partial<DeployQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // TARGET MANAGEMENT
  // ============================================================================

  /**
   * Register a deployment target
   */
  registerTarget(config: DeploymentTargetConfig): void {
    this.targets.set(config.id, config);
    logger.info(`Registered deployment target: ${config.name} (${config.type})`);
  }

  /**
   * Update a deployment target
   */
  updateTarget(id: string, updates: Partial<DeploymentTargetConfig>): void {
    const target = this.targets.get(id);
    if (target) {
      this.targets.set(id, { ...target, ...updates });
    }
  }

  /**
   * Remove a deployment target
   */
  removeTarget(id: string): void {
    this.targets.delete(id);
  }

  /**
   * Get all registered targets
   */
  getTargets(): DeploymentTargetConfig[] {
    return Array.from(this.targets.values());
  }

  /**
   * Get a specific target
   */
  getTarget(id: string): DeploymentTargetConfig | undefined {
    return this.targets.get(id);
  }

  // ============================================================================
  // QUEUE OPERATIONS
  // ============================================================================

  /**
   * Queue a new deployment
   */
  async queueDeployment(params: {
    projectId: string;
    targetId: string;
    priority?: DeploymentPriority;
    message?: string;
    branch?: string;
    commitHash?: string;
    maxRetries?: number;
  }): Promise<Deployment> {
    const target = this.targets.get(params.targetId);
    if (!target) {
      throw new Error(`Deployment target not found: ${params.targetId}`);
    }

    if (!target.enabled) {
      throw new Error(`Deployment target is disabled: ${target.name}`);
    }

    const deployment: Deployment = {
      id: this.generateId(),
      projectId: params.projectId,
      targetId: params.targetId,
      target: target.type,
      status: 'queued',
      priority: params.priority || 'normal',
      message: params.message,
      branch: params.branch,
      commitHash: params.commitHash,
      logs: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: params.maxRetries ?? this.config.defaultMaxRetries,
    };

    this.addLog(deployment, 'info', `Deployment queued for ${target.name}`);
    this.queue.enqueue(deployment);
    this.emit({ type: 'deployment-queued', deployment });

    logger.info(`Queued deployment ${deployment.id} for ${target.name}`);

    // Start processing if not already running
    this.processQueue();

    return deployment;
  }

  /**
   * Cancel a queued or active deployment
   */
  cancelDeployment(deploymentId: string): boolean {
    // Check queue first
    const queued = this.queue.remove(d => d.id === deploymentId);
    if (queued) {
      queued.status = 'cancelled';
      queued.completedAt = new Date();
      this.addLog(queued, 'info', 'Deployment cancelled');
      this.history.unshift(queued);
      this.emit({ type: 'deployment-cancelled', deployment: queued });
      return true;
    }

    // Check active deployments
    const active = this.active.get(deploymentId);
    if (active) {
      active.status = 'cancelled';
      active.completedAt = new Date();
      this.addLog(active, 'info', 'Deployment cancelled');
      this.active.delete(deploymentId);
      this.stopStatusCheck(deploymentId);
      this.history.unshift(active);
      this.emit({ type: 'deployment-cancelled', deployment: active });
      return true;
    }

    return false;
  }

  /**
   * Rollback to a previous deployment
   */
  async rollbackDeployment(
    projectId: string,
    targetId: string,
    previousDeploymentId: string
  ): Promise<Deployment> {
    const previousDeployment = this.history.find(d => d.id === previousDeploymentId);
    if (!previousDeployment) {
      throw new Error(`Previous deployment not found: ${previousDeploymentId}`);
    }

    const rollback = await this.queueDeployment({
      projectId,
      targetId,
      priority: 'high',
      message: `Rollback to deployment ${previousDeploymentId.slice(0, 8)}`,
      commitHash: previousDeployment.commitHash,
      branch: previousDeployment.branch,
    });

    rollback.previousDeploymentId = previousDeploymentId;
    this.addLog(rollback, 'info', `Rolling back to deployment ${previousDeploymentId.slice(0, 8)}`);

    return rollback;
  }

  /**
   * Retry a failed deployment
   */
  async retryDeployment(deploymentId: string): Promise<Deployment | null> {
    const failed = this.history.find(d => d.id === deploymentId && d.status === 'failed');
    if (!failed) return null;

    const retry = await this.queueDeployment({
      projectId: failed.projectId,
      targetId: failed.targetId,
      priority: failed.priority,
      message: `Retry of ${deploymentId.slice(0, 8)}`,
      commitHash: failed.commitHash,
      branch: failed.branch,
    });

    retry.previousDeploymentId = deploymentId;
    this.addLog(retry, 'info', `Retrying deployment ${deploymentId.slice(0, 8)}`);

    return retry;
  }

  // ============================================================================
  // QUEUE PROCESSING
  // ============================================================================

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.size() > 0 && this.active.size < this.config.maxConcurrent) {
        const deployment = this.queue.dequeue();
        if (!deployment) break;

        this.active.set(deployment.id, deployment);
        this.executeDeployment(deployment).catch(error => {
          logger.error(`Deployment ${deployment.id} execution error:`, error);
        });
      }

      if (this.queue.size() === 0 && this.active.size === 0) {
        this.emit({ type: 'queue-empty' });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeDeployment(deployment: Deployment): Promise<void> {
    const target = this.targets.get(deployment.targetId);
    if (!target) {
      this.failDeployment(deployment, 'Deployment target not found');
      return;
    }

    try {
      deployment.status = 'preparing';
      deployment.startedAt = new Date();
      this.addLog(deployment, 'info', 'Starting deployment...');
      this.emit({ type: 'deployment-started', deployment });

      // Step 1: Build
      const buildResult = await this.buildProject(deployment, target);
      if (!buildResult.success) {
        throw new Error(buildResult.error || 'Build failed');
      }

      // Step 2: Upload/Deploy
      deployment.status = 'uploading';
      this.addLog(deployment, 'info', 'Uploading to deployment target...');
      this.emit({ type: 'deployment-progress', deployment });

      const deployResult = await this.deployToTarget(deployment, target, buildResult);
      if (!deployResult.success) {
        throw new Error(deployResult.error || 'Deployment failed');
      }

      // Step 3: Wait for deployment to complete
      deployment.status = 'deploying';
      deployment.url = deployResult.url;
      deployment.previewUrl = deployResult.previewUrl;
      this.addLog(deployment, 'info', `Deployment in progress: ${deployResult.url || 'Waiting for URL...'}`);
      this.emit({ type: 'deployment-progress', deployment });

      await this.waitForDeployment(deployment, target);

      // Success!
      deployment.status = 'success';
      deployment.completedAt = new Date();
      this.addLog(deployment, 'info', `Deployment successful: ${deployment.url}`);
      this.emit({ type: 'deployment-success', deployment });

      // Send webhook
      await this.sendWebhook(deployment, target);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if should retry
      if (deployment.retryCount < deployment.maxRetries) {
        deployment.retryCount++;
        const delay = this.calculateRetryDelay(deployment.retryCount);
        this.addLog(deployment, 'warn', `Deployment failed, retrying in ${delay}ms... (attempt ${deployment.retryCount}/${deployment.maxRetries})`);

        await new Promise(r => setTimeout(r, delay));

        // Re-queue with same priority
        deployment.status = 'queued';
        this.active.delete(deployment.id);
        this.queue.enqueue(deployment);
        this.processQueue();
        return;
      }

      this.failDeployment(deployment, errorMessage);
    } finally {
      this.active.delete(deployment.id);
      this.stopStatusCheck(deployment.id);
      this.processQueue();
    }
  }

  private failDeployment(deployment: Deployment, error: string): void {
    deployment.status = 'failed';
    deployment.error = error;
    deployment.completedAt = new Date();
    this.addLog(deployment, 'error', `Deployment failed: ${error}`);
    this.history.unshift(deployment);
    this.emit({ type: 'deployment-failed', deployment });
    logger.error(`Deployment ${deployment.id} failed: ${error}`);
  }

  // ============================================================================
  // DEPLOYMENT TARGETS
  // ============================================================================

  private async buildProject(
    deployment: Deployment,
    target: DeploymentTargetConfig
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    const buildCommand = target.buildCommand || 'npm run build';
    const outputDir = target.outputDir || 'dist';

    this.addLog(deployment, 'info', `Running build: ${buildCommand}`);

    try {
      // Execute build via Docker backend
      const result = await dockerPost<{ success: boolean; output: string; error?: string }>(
        `/api/deploy/${deployment.projectId}/build`,
        {
          command: buildCommand,
          outputDir,
          timeout: this.config.buildTimeout,
        }
      );

      if (!result.success) {
        return { success: false, error: result.error || 'Build failed' };
      }

      this.addLog(deployment, 'info', 'Build completed successfully');
      return { success: true, outputPath: outputDir };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Build failed';
      return { success: false, error: errorMsg };
    }
  }

  private async deployToTarget(
    deployment: Deployment,
    target: DeploymentTargetConfig,
    buildResult: { outputPath?: string }
  ): Promise<DeploymentResult> {
    const outputDir = buildResult.outputPath || target.outputDir || 'dist';

    switch (target.type) {
      case 'vercel':
        return this.deployToVercel(deployment, target, outputDir);
      case 'netlify':
        return this.deployToNetlify(deployment, target, outputDir);
      case 'cloudflare':
        return this.deployToCloudflare(deployment, target, outputDir);
      case 'custom':
        return this.deployToCustom(deployment, target, outputDir);
      default:
        throw new Error(`Unknown deployment target: ${target.type}`);
    }
  }

  private async deployToVercel(
    deployment: Deployment,
    target: DeploymentTargetConfig,
    outputDir: string
  ): Promise<DeploymentResult> {
    this.addLog(deployment, 'info', 'Deploying to Vercel...');

    try {
      const result = await dockerPost<{
        success: boolean;
        url?: string;
        previewUrl?: string;
        deploymentId?: string;
        error?: string;
      }>(`/api/deploy/${deployment.projectId}/vercel`, {
        outputDir,
        projectId: target.projectId,
        teamId: target.teamId,
        token: target.token,
        environment: target.environment || 'preview',
        envVars: target.envVars,
      });

      return {
        success: result.success,
        deploymentId: deployment.id,
        url: result.url,
        previewUrl: result.previewUrl,
        error: result.error,
        logs: deployment.logs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Vercel deployment failed';
      return {
        success: false,
        deploymentId: deployment.id,
        error: errorMsg,
        logs: deployment.logs,
      };
    }
  }

  private async deployToNetlify(
    deployment: Deployment,
    target: DeploymentTargetConfig,
    outputDir: string
  ): Promise<DeploymentResult> {
    this.addLog(deployment, 'info', 'Deploying to Netlify...');

    try {
      const result = await dockerPost<{
        success: boolean;
        url?: string;
        previewUrl?: string;
        deploymentId?: string;
        error?: string;
      }>(`/api/deploy/${deployment.projectId}/netlify`, {
        outputDir,
        siteId: target.projectId,
        token: target.token,
        production: target.environment === 'production',
        envVars: target.envVars,
      });

      return {
        success: result.success,
        deploymentId: deployment.id,
        url: result.url,
        previewUrl: result.previewUrl,
        error: result.error,
        logs: deployment.logs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Netlify deployment failed';
      return {
        success: false,
        deploymentId: deployment.id,
        error: errorMsg,
        logs: deployment.logs,
      };
    }
  }

  private async deployToCloudflare(
    deployment: Deployment,
    target: DeploymentTargetConfig,
    outputDir: string
  ): Promise<DeploymentResult> {
    this.addLog(deployment, 'info', 'Deploying to Cloudflare Pages...');

    try {
      const result = await dockerPost<{
        success: boolean;
        url?: string;
        previewUrl?: string;
        error?: string;
      }>(`/api/deploy/${deployment.projectId}/cloudflare`, {
        outputDir,
        projectName: target.projectId,
        accountId: target.teamId,
        token: target.token,
        branch: deployment.branch || 'main',
        production: target.environment === 'production',
      });

      return {
        success: result.success,
        deploymentId: deployment.id,
        url: result.url,
        previewUrl: result.previewUrl,
        error: result.error,
        logs: deployment.logs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Cloudflare deployment failed';
      return {
        success: false,
        deploymentId: deployment.id,
        error: errorMsg,
        logs: deployment.logs,
      };
    }
  }

  private async deployToCustom(
    deployment: Deployment,
    target: DeploymentTargetConfig,
    outputDir: string
  ): Promise<DeploymentResult> {
    this.addLog(deployment, 'info', 'Deploying to custom target...');

    try {
      const result = await dockerPost<{
        success: boolean;
        url?: string;
        previewUrl?: string;
        error?: string;
      }>(`/api/deploy/${deployment.projectId}/custom`, {
        outputDir,
        config: target,
      });

      return {
        success: result.success,
        deploymentId: deployment.id,
        url: result.url,
        previewUrl: result.previewUrl,
        error: result.error,
        logs: deployment.logs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Custom deployment failed';
      return {
        success: false,
        deploymentId: deployment.id,
        error: errorMsg,
        logs: deployment.logs,
      };
    }
  }

  // ============================================================================
  // STATUS MONITORING
  // ============================================================================

  private async waitForDeployment(
    deployment: Deployment,
    target: DeploymentTargetConfig
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let lastStatus = deployment.status;

      const checkStatus = async () => {
        try {
          const status = await this.checkDeploymentStatus(deployment, target);

          if (status !== lastStatus) {
            lastStatus = status;
            this.addLog(deployment, 'info', `Status: ${status}`);
          }

          if (status === 'success') {
            resolve();
            return;
          }

          if (status === 'failed') {
            reject(new Error('Deployment failed on target platform'));
            return;
          }

          if (Date.now() - startTime > this.config.deployTimeout) {
            reject(new Error('Deployment timed out'));
            return;
          }

          // Continue checking
          setTimeout(checkStatus, this.config.statusCheckInterval);

        } catch (error) {
          if (Date.now() - startTime > this.config.deployTimeout) {
            reject(new Error('Deployment timed out'));
          } else {
            // Retry status check
            setTimeout(checkStatus, this.config.statusCheckInterval);
          }
        }
      };

      // Store interval for cleanup
      this.statusCheckIntervals.set(
        deployment.id,
        setInterval(() => {}, this.config.statusCheckInterval)
      );

      checkStatus();
    });
  }

  private async checkDeploymentStatus(
    deployment: Deployment,
    target: DeploymentTargetConfig
  ): Promise<DeploymentStatus> {
    try {
      const result = await dockerGet<{ status: DeploymentStatus; url?: string }>(
        `/api/deploy/${deployment.projectId}/status/${deployment.id}?target=${target.type}`
      );

      if (result.url && !deployment.url) {
        deployment.url = result.url;
      }

      return result.status;
    } catch {
      return 'deploying'; // Assume still deploying on error
    }
  }

  private stopStatusCheck(deploymentId: string): void {
    const interval = this.statusCheckIntervals.get(deploymentId);
    if (interval) {
      clearInterval(interval);
      this.statusCheckIntervals.delete(deploymentId);
    }
  }

  // ============================================================================
  // WEBHOOKS
  // ============================================================================

  private async sendWebhook(
    deployment: Deployment,
    target: DeploymentTargetConfig
  ): Promise<void> {
    if (!target.webhookUrl) return;

    const payload: DeploymentWebhookPayload = {
      deploymentId: deployment.id,
      status: deployment.status,
      url: deployment.url,
      timestamp: new Date(),
      target: target.type,
      message: deployment.message,
    };

    try {
      await fetch(target.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      this.addLog(deployment, 'debug', 'Webhook sent successfully');
    } catch (error) {
      this.addLog(deployment, 'warn', 'Failed to send webhook');
      logger.warn(`Failed to send webhook for ${deployment.id}:`, error);
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private generateId(): string {
    return `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = this.config.baseRetryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, this.config.maxRetryDelay);
  }

  private addLog(
    deployment: Deployment,
    level: DeploymentLog['level'],
    message: string,
    details?: Record<string, unknown>
  ): void {
    deployment.logs.push({
      timestamp: new Date(),
      level,
      message,
      details,
    });
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  subscribe(callback: DeployEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  private emit(event: DeployEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        logger.error('Event callback error:', error);
      }
    }
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  /**
   * Get all queued deployments
   */
  getQueuedDeployments(): Deployment[] {
    return this.queue.getAll();
  }

  /**
   * Get all active deployments
   */
  getActiveDeployments(): Deployment[] {
    return Array.from(this.active.values());
  }

  /**
   * Get deployment history
   */
  getHistory(limit: number = 50): Deployment[] {
    return this.history.slice(0, limit);
  }

  /**
   * Get a specific deployment
   */
  getDeployment(id: string): Deployment | undefined {
    return (
      this.queue.getAll().find(d => d.id === id) ||
      this.active.get(id) ||
      this.history.find(d => d.id === id)
    );
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queued: number;
    active: number;
    completed: number;
    failed: number;
  } {
    return {
      queued: this.queue.size(),
      active: this.active.size,
      completed: this.history.filter(d => d.status === 'success').length,
      failed: this.history.filter(d => d.status === 'failed').length,
    };
  }

  /**
   * Clear deployment history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get deployments for a project
   */
  getProjectDeployments(projectId: string): Deployment[] {
    return [
      ...this.queue.getAll().filter(d => d.projectId === projectId),
      ...Array.from(this.active.values()).filter(d => d.projectId === projectId),
      ...this.history.filter(d => d.projectId === projectId),
    ];
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let deployQueueInstance: DeployQueue | null = null;

/**
 * Get the deploy queue singleton
 */
export function getDeployQueue(): DeployQueue {
  if (!deployQueueInstance) {
    deployQueueInstance = new DeployQueue();
  }
  return deployQueueInstance;
}

/**
 * Initialize deploy queue with custom config
 */
export function initDeployQueue(config?: Partial<DeployQueueConfig>): DeployQueue {
  deployQueueInstance = new DeployQueue(config);
  return deployQueueInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function queueDeployment(
  projectId: string,
  targetId: string,
  options?: {
    priority?: DeploymentPriority;
    message?: string;
    branch?: string;
  }
): Promise<Deployment> {
  return getDeployQueue().queueDeployment({
    projectId,
    targetId,
    ...options,
  });
}

export function cancelDeployment(deploymentId: string): boolean {
  return getDeployQueue().cancelDeployment(deploymentId);
}

export async function rollbackDeployment(
  projectId: string,
  targetId: string,
  previousDeploymentId: string
): Promise<Deployment> {
  return getDeployQueue().rollbackDeployment(projectId, targetId, previousDeploymentId);
}

export function getDeploymentStatus(deploymentId: string): Deployment | undefined {
  return getDeployQueue().getDeployment(deploymentId);
}

export function registerDeploymentTarget(config: DeploymentTargetConfig): void {
  getDeployQueue().registerTarget(config);
}

export function subscribeToDeployments(
  callback: DeployEventCallback
): () => void {
  return getDeployQueue().subscribe(callback);
}
