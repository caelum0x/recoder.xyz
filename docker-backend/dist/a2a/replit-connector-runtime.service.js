"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplitConnectorRuntime = void 0;
exports.getReplitConnectorRuntime = getReplitConnectorRuntime;
exports.resetReplitConnectorRuntime = resetReplitConnectorRuntime;
exports.getReplitConnectorIdentity = getReplitConnectorIdentity;
const events_1 = require("events");
const rest_adapter_1 = require("./adapters/rest-adapter");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const agent_registry_service_1 = require("./agent-registry.service");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('replit-connector-runtime');
// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
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
const REPLIT_CONNECTOR_IDENTITY = {
    id: 'replit-connector',
    name: 'Replit Agent Connector',
    platform: 'replit',
};
// ---------------------------------------------------------------------------
// Remote agent identity (the Replit endpoint we talk to)
// ---------------------------------------------------------------------------
const REPLIT_REMOTE_IDENTITY = {
    id: 'replit-agent',
    name: 'Replit Agent',
    platform: 'replit',
};
// ---------------------------------------------------------------------------
// ReplitConnectorRuntime
// ---------------------------------------------------------------------------
class ReplitConnectorRuntime extends events_1.EventEmitter {
    config;
    adapter = null;
    status = 'stopped';
    lastHealthCheck = null;
    lastActivity = null;
    lastError = null;
    healthCheckTimer = null;
    _pendingRequests = 0;
    /** Implements ConnectorProcess.connectorId */
    connectorId = 'replit';
    /** Implements ConnectorProcess.platform */
    platform = 'replit';
    constructor(config) {
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
    get processRef() {
        return null;
    }
    isRunning() {
        return this.status === 'running';
    }
    getState() {
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
    getPid() {
        return null;
    }
    getHealth() {
        const now = new Date().toISOString();
        if (this.status === 'running') {
            return {
                status: 'healthy',
                pid: null,
                uptime: 0,
                lastCheckedAt: now,
            };
        }
        return {
            status: (this.status === 'error' ? 'unhealthy' : 'unknown'),
            pid: null,
            uptime: 0,
            lastCheckedAt: now,
            message: this.lastError || `Connector is ${this.status}`,
        };
    }
    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------
    async start() {
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
            const auth = this.config.apiKey
                ? { type: 'bearer', token: this.config.apiKey }
                : { type: 'none' };
            // Create the RestAdapter instance
            const adapterConfig = {
                adapterId: 'replit-connector-adapter',
                baseUrl: this.config.baseUrl,
                auth,
                timeoutMs: this.config.requestTimeoutMs,
                maxRetries: this.config.maxRetries,
                retryDelayMs: 1_000,
                maxRetryDelayMs: 16_000,
                localIdentity: REPLIT_CONNECTOR_IDENTITY,
            };
            this.adapter = new rest_adapter_1.RestAdapter(adapterConfig);
            // Verify connectivity via health check
            const healthResult = await this.adapter.checkHealth();
            this.lastHealthCheck = healthResult.checkedAt;
            if (!healthResult.reachable) {
                throw new Error(`Replit API health check failed: ${healthResult.error || `HTTP ${healthResult.statusCode}`}`);
            }
            // Start periodic health checks
            this.startHealthCheckTimer();
            this.status = 'running';
            this.emit('started', { baseUrl: this.config.baseUrl });
            logger.info({ baseUrl: this.config.baseUrl }, 'Replit connector started');
        }
        catch (err) {
            this.status = 'error';
            this.lastError = err instanceof Error ? err.message : String(err);
            this.adapter = null;
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
            throw err;
        }
    }
    async stop() {
        if (this.status === 'stopped')
            return;
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
    async restart() {
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
    async executeTask(input) {
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
            const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
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
                const responseBody = adapterResult.body;
                const responseArtifacts = Array.isArray(responseBody?.artifacts)
                    ? responseBody.artifacts
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
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            // Transition task to 'failed'
            try {
                const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
                lifecycle.transitionTask({
                    taskId: input.taskId,
                    targetState: 'failed',
                    agent: {
                        agent_id: REPLIT_CONNECTOR_IDENTITY.id,
                        platform: REPLIT_CONNECTOR_IDENTITY.platform,
                    },
                    message: errMsg,
                });
            }
            catch { /* best effort */ }
            return {
                taskId: input.taskId,
                success: false,
                error: errMsg,
            };
        }
        finally {
            this._pendingRequests--;
        }
    }
    // -------------------------------------------------------------------------
    // Health check management
    // -------------------------------------------------------------------------
    startHealthCheckTimer() {
        if (this.healthCheckTimer)
            return;
        this.healthCheckTimer = setInterval(async () => {
            if (!this.adapter || this.status !== 'running')
                return;
            try {
                const result = await this.adapter.checkHealth();
                this.lastHealthCheck = result.checkedAt;
                if (!result.reachable && this.config.autoReconnect) {
                    logger.warn({ error: result.error }, 'Replit health check failed, attempting reconnect');
                    this.emit('health-failed', result);
                    // Attempt reconnect
                    try {
                        await this.restart();
                    }
                    catch (reconnectErr) {
                        logger.error({ err: reconnectErr }, 'Replit auto-reconnect failed');
                    }
                }
            }
            catch (err) {
                logger.error({ err }, 'Error during Replit health check');
            }
        }, this.config.healthCheckIntervalMs);
    }
    stopHealthCheckTimer() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }
    // -------------------------------------------------------------------------
    // Agent registry integration
    // -------------------------------------------------------------------------
    registerWithAgentRegistry() {
        try {
            const registry = (0, agent_registry_service_1.getAgentRegistryService)();
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
        }
        catch (err) {
            logger.warn({ err }, 'Failed to register Replit connector with agent registry');
        }
    }
}
exports.ReplitConnectorRuntime = ReplitConnectorRuntime;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let instance = null;
function getReplitConnectorRuntime(config) {
    if (!instance) {
        instance = new ReplitConnectorRuntime(config);
    }
    return instance;
}
function resetReplitConnectorRuntime() {
    if (instance?.isRunning()) {
        instance.stop().catch(() => { });
    }
    instance = null;
}
function getReplitConnectorIdentity() {
    return { ...REPLIT_CONNECTOR_IDENTITY };
}
