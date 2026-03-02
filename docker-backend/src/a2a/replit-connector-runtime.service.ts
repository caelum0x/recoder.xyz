/**
 * @module replit-connector-runtime.service
 *
 * Runtime service that manages communication with the Replit agent API.
 *
 * Unlike child-process-based connectors (Claude, Codex, Cursor), Replit
 * exposes a REST HTTP API. This service wraps the generic RestAdapter from
 * the adapters directory to provide a connector-shaped interface:
 *
 * 1. **Creates** a RestAdapter instance targeting the Replit agent API.
 * 2. **Verifies** connectivity via the adapter's health check on start.
 * 3. **Executes** tasks by delegating to `adapter.executeTask()`.
 * 4. **Monitors** health via periodic health check pings.
 * 5. **Manages** lifecycle: start, stop, restart, auto-reconnect.
 * 6. **Emits** status events via EventEmitter.
 *
 * Consumed by: replit-connector.routes.ts, server.ts
 */

import { EventEmitter } from 'events';
import type {
  RecoderAgentIdentity,
} from '@recoder/shared/a2a';
import {
  RestAdapter,
  type RestAdapterConfig,
  type RestAdapterHealthResult,
  type RestAuthMethod,
} from './adapters/rest-adapter';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { getAgentRegistryService } from './agent-registry.service';
import { createLogger } from '../logger';

const logger = createLogger('replit-connector-runtime');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReplitConnectorStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

export interface ReplitConnectorConfig {
  /** Base URL for the Replit agent API. */
  baseUrl: string;
  /** API key for authentication. */
  apiKey?: string;
  /** Request timeout in ms. */
  requestTimeoutMs: number;
  /** Health check interval in ms. */
  healthCheckIntervalMs: number;
  /** Max retries for requests. */
  maxRetries: number;
  /** Whether to auto-reconnect on health check failure. */
  autoReconnect: boolean;
}

export interface ReplitConnectorState {
  status: ReplitConnectorStatus;
  baseUrl: string;
  lastHealthCheck: string | null;
  lastActivity: string | null;
  pendingRequests: number;
  error: string | null;
}

export interface ReplitExecuteInput {
  taskId: string;
  prompt: string;
  requester: { id: string; name: string; platform: string };
  metadata?: Record<string, unknown>;
  artifacts?: Array<{ filename: string; content: string }>;
}

export interface ReplitExecuteResult {
  taskId: string;
  success: boolean;
  resultText?: string;
  error?: string;
  raw?: unknown;
  artifacts?: Array<{ filename: string; content: string }>;
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ReplitConnectorConfig = {
  baseUrl: process.env.REPLIT_API_URL || '',
  apiKey: process.env.REPLIT_API_KEY || undefined,
  requestTimeoutMs: Number(process.env.REPLIT_CONNECTOR_REQUEST_TIMEOUT_MS || 30_000),
  healthCheckIntervalMs: Number(process.env.REPLIT_CONNECTOR_HEALTH_CHECK_INTERVAL_MS || 60_000),
  maxRetries: Number(process.env.REPLIT_CONNECTOR_MAX_RETRIES || 3),
  autoReconnect: process.env.REPLIT_CONNECTOR_AUTO_RECONNECT !== 'false',
};

// ---------------------------------------------------------------------------
// Agent identity for the Replit connector
// ---------------------------------------------------------------------------

const REPLIT_CONNECTOR_IDENTITY: RecoderAgentIdentity = {
  id: 'replit-connector',
  name: 'Replit Agent Connector',
  platform: 'replit',
};

// ---------------------------------------------------------------------------
// Remote agent identity (the Replit endpoint we talk to)
// ---------------------------------------------------------------------------

const REPLIT_REMOTE_IDENTITY: RecoderAgentIdentity = {
  id: 'replit-agent',
  name: 'Replit Agent',
  platform: 'replit',
};

// ---------------------------------------------------------------------------
// ReplitConnectorRuntime
// ---------------------------------------------------------------------------

export class ReplitConnectorRuntime extends EventEmitter {
  private config: ReplitConnectorConfig;
  private adapter: RestAdapter | null = null;
  private status: ReplitConnectorStatus = 'stopped';
  private lastHealthCheck: string | null = null;
  private lastActivity: string | null = null;
  private lastError: string | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _pendingRequests = 0;

  /** Implements ConnectorProcess.connectorId */
  readonly connectorId = 'replit';
  /** Implements ConnectorProcess.platform */
  readonly platform = 'replit' as const;

  constructor(config?: Partial<ReplitConnectorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * REST-based connector has no child process.
   * Returns null to satisfy the ConnectorProcess interface shape.
   */
  get processRef(): null {
    return null;
  }

  isRunning(): boolean {
    return this.status === 'running';
  }

  getState(): ReplitConnectorState {
    return {
      status: this.status,
      baseUrl: this.config.baseUrl,
      lastHealthCheck: this.lastHealthCheck,
      lastActivity: this.lastActivity,
      pendingRequests: this._pendingRequests,
      error: this.lastError,
    };
  }

  /**
   * REST-based connector has no PID.
   */
  getPid(): null {
    return null;
  }

  getHealth() {
    const now = new Date().toISOString();

    if (this.status === 'running') {
      return {
        status: 'healthy' as const,
        pid: null,
        uptime: 0,
        lastCheckedAt: now,
      };
    }

    return {
      status: (this.status === 'error' ? 'unhealthy' : 'unknown') as 'unhealthy' | 'unknown',
      pid: null,
      uptime: 0,
      lastCheckedAt: now,
      message: this.lastError || `Connector is ${this.status}`,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.status === 'running') {
      logger.warn('Replit connector is already running');
      return;
    }

    if (!this.config.baseUrl) {
      throw new Error('Replit connector requires a baseUrl (set REPLIT_API_URL)');
    }

    this.status = 'starting';
    this.lastError = null;
    this.emit('starting');

    try {
      // Build auth config
      const auth: RestAuthMethod = this.config.apiKey
        ? { type: 'bearer', token: this.config.apiKey }
        : { type: 'none' };

      // Create the RestAdapter instance
      const adapterConfig: RestAdapterConfig = {
        adapterId: 'replit-connector-adapter',
        baseUrl: this.config.baseUrl,
        auth,
        timeoutMs: this.config.requestTimeoutMs,
        maxRetries: this.config.maxRetries,
        retryDelayMs: 1_000,
        maxRetryDelayMs: 16_000,
        localIdentity: REPLIT_CONNECTOR_IDENTITY,
      };

      this.adapter = new RestAdapter(adapterConfig);

      // Verify connectivity via health check
      const healthResult = await this.adapter.checkHealth();
      this.lastHealthCheck = healthResult.checkedAt;

      if (!healthResult.reachable) {
        throw new Error(
          `Replit API health check failed: ${healthResult.error || `HTTP ${healthResult.statusCode}`}`,
        );
      }

      // Start periodic health checks
      this.startHealthCheckTimer();

      this.status = 'running';
      this.emit('started', { baseUrl: this.config.baseUrl });
      logger.info({ baseUrl: this.config.baseUrl }, 'Replit connector started');
    } catch (err) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.adapter = null;
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.status === 'stopped') return;

    this.status = 'stopping';
    this.emit('stopping');

    // Stop health check timer
    this.stopHealthCheckTimer();

    // Clean up the adapter
    this.adapter = null;

    this.status = 'stopped';
    this.emit('stopped');
    logger.info('Replit connector stopped');
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  // -------------------------------------------------------------------------
  // Task execution
  // -------------------------------------------------------------------------

  /**
   * Execute a task via the Replit agent REST API.
   *
   * Delegates to the RestAdapter's executeTask method which handles
   * envelope construction, HTTP communication, retries, and timeouts.
   */
  async executeTask(input: ReplitExecuteInput): Promise<ReplitExecuteResult> {
    if (!this.isRunning() || !this.adapter) {
      return {
        taskId: input.taskId,
        success: false,
        error: 'Replit connector is not running',
      };
    }

    this.lastActivity = new Date().toISOString();
    this._pendingRequests++;

    try {
      // Transition task to 'working' state
      const lifecycle = getTaskLifecycleService();
      lifecycle.transitionTask({
        taskId: input.taskId,
        targetState: 'working',
        agent: {
          agent_id: REPLIT_CONNECTOR_IDENTITY.id,
          platform: REPLIT_CONNECTOR_IDENTITY.platform,
        },
      });

      // Send request via RestAdapter
      const adapterResult = await this.adapter.executeTask({
        targetAgent: REPLIT_REMOTE_IDENTITY,
        taskId: input.taskId,
        prompt: input.prompt,
        intent: 'execute',
        metadata: {
          ...input.metadata,
          requester: input.requester,
          ...(input.artifacts?.length ? { artifacts: input.artifacts } : {}),
        },
      });

      if (adapterResult.success) {
        // Transition task to 'succeeded'
        lifecycle.transitionTask({
          taskId: input.taskId,
          targetState: 'succeeded',
          agent: {
            agent_id: REPLIT_CONNECTOR_IDENTITY.id,
            platform: REPLIT_CONNECTOR_IDENTITY.platform,
          },
        });

        // Extract artifacts from adapter response if present
        const responseBody = adapterResult.body as Record<string, unknown> | undefined;
        const responseArtifacts = Array.isArray(responseBody?.artifacts)
          ? (responseBody.artifacts as Array<{ filename: string; content: string }>)
          : undefined;

        return {
          taskId: input.taskId,
          success: true,
          resultText: adapterResult.resultText,
          raw: adapterResult.body,
          artifacts: responseArtifacts,
        };
      }

      // Adapter returned failure
      lifecycle.transitionTask({
        taskId: input.taskId,
        targetState: 'failed',
        agent: {
          agent_id: REPLIT_CONNECTOR_IDENTITY.id,
          platform: REPLIT_CONNECTOR_IDENTITY.platform,
        },
        message: adapterResult.error,
      });

      return {
        taskId: input.taskId,
        success: false,
        error: adapterResult.error || 'Replit API request failed',
        raw: adapterResult.body,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Transition task to 'failed'
      try {
        const lifecycle = getTaskLifecycleService();
        lifecycle.transitionTask({
          taskId: input.taskId,
          targetState: 'failed',
          agent: {
            agent_id: REPLIT_CONNECTOR_IDENTITY.id,
            platform: REPLIT_CONNECTOR_IDENTITY.platform,
          },
          message: errMsg,
        });
      } catch { /* best effort */ }

      return {
        taskId: input.taskId,
        success: false,
        error: errMsg,
      };
    } finally {
      this._pendingRequests--;
    }
  }

  // -------------------------------------------------------------------------
  // Health check management
  // -------------------------------------------------------------------------

  private startHealthCheckTimer(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(async () => {
      if (!this.adapter || this.status !== 'running') return;

      try {
        const result = await this.adapter.checkHealth();
        this.lastHealthCheck = result.checkedAt;

        if (!result.reachable && this.config.autoReconnect) {
          logger.warn(
            { error: result.error },
            'Replit health check failed, attempting reconnect',
          );
          this.emit('health-failed', result);

          // Attempt reconnect
          try {
            await this.restart();
          } catch (reconnectErr) {
            logger.error({ err: reconnectErr }, 'Replit auto-reconnect failed');
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error during Replit health check');
      }
    }, this.config.healthCheckIntervalMs);
  }

  private stopHealthCheckTimer(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Agent registry integration
  // -------------------------------------------------------------------------

  registerWithAgentRegistry(): void {
    try {
      const registry = getAgentRegistryService();
      registry.registerAgent({
        agent_id: REPLIT_CONNECTOR_IDENTITY.id,
        name: REPLIT_CONNECTOR_IDENTITY.name,
        platform: 'replit',
        capabilities: ['execute', 'code-edit'],
        url: this.config.baseUrl,
        metadata: {
          connector_type: 'rest-adapter',
          tier: 'tier-2',
          status: 'pilot',
        },
      });
      logger.info('Replit connector registered with agent registry');
    } catch (err) {
      logger.warn({ err }, 'Failed to register Replit connector with agent registry');
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: ReplitConnectorRuntime | null = null;

export function getReplitConnectorRuntime(config?: Partial<ReplitConnectorConfig>): ReplitConnectorRuntime {
  if (!instance) {
    instance = new ReplitConnectorRuntime(config);
  }
  return instance;
}

export function resetReplitConnectorRuntime(): void {
  if (instance?.isRunning()) {
    instance.stop().catch(() => { /* best effort */ });
  }
  instance = null;
}

export function getReplitConnectorIdentity(): RecoderAgentIdentity {
  return { ...REPLIT_CONNECTOR_IDENTITY };
}
