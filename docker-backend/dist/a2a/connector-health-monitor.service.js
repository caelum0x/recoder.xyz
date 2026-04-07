"use strict";
/**
 * @module connector-health-monitor.service
 *
 * Monitors spawned connector child processes (Codex, Claude, etc.) and
 * provides auto-restart with exponential backoff plus a circuit breaker
 * pattern to prevent restart storms.
 *
 * Responsibilities:
 *
 * 1. **Process monitoring** -- Watches connector child processes for
 *    `exit` and `error` events.
 * 2. **Auto-restart** -- On crash, restarts with exponential backoff
 *    (1s, 2s, 4s, 8s, 16s max by default).
 * 3. **Max restart attempts** -- Configurable max restarts within a
 *    sliding window (default: 5 in 5 minutes).
 * 4. **Circuit breaker** -- After max restarts exhausted:
 *    - Opens circuit (stops restart attempts)
 *    - Emits `circuit.open` event
 *    - After cooldown (default 60s), enters half-open state
 *    - On next successful health check, closes circuit
 * 5. **Health check integration** -- Reports connector health to the
 *    HeartbeatTracker so the SSE/agent health layer sees connector status.
 * 6. **Metrics tracking** -- Per-connector: total starts, total crashes,
 *    uptime, last crash reason, circuit state.
 * 7. **Events** -- Typed events: connector.started, connector.stopped,
 *    connector.crashed, connector.restarting, circuit.open,
 *    circuit.half-open, circuit.closed.
 *
 * P13-008: Connector Health Monitor with Auto-Restart and Circuit Breaker
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectorHealthMonitor = exports.ConnectorHealthEventEmitter = void 0;
exports.getConnectorHealthMonitor = getConnectorHealthMonitor;
exports.setConnectorHealthMonitor = setConnectorHealthMonitor;
exports.resetConnectorHealthMonitor = resetConnectorHealthMonitor;
const events_1 = require("events");
const logger_1 = require("../logger");
const heartbeat_tracker_service_1 = require("./heartbeat-tracker.service");
const connector_process_1 = require("./connector-process");
const slo_metrics_1 = require("./slo-metrics");
const logger = (0, logger_1.createLogger)('a2a-connector-health-monitor');
// ---------------------------------------------------------------------------
// Typed EventEmitter
// ---------------------------------------------------------------------------
class ConnectorHealthEventEmitter extends events_1.EventEmitter {
    emit(event, payload) {
        return super.emit(event, payload);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    off(event, listener) {
        return super.off(event, listener);
    }
}
exports.ConnectorHealthEventEmitter = ConnectorHealthEventEmitter;
// ---------------------------------------------------------------------------
// ConnectorHealthMonitor
// ---------------------------------------------------------------------------
class ConnectorHealthMonitor {
    config;
    events;
    entries = new Map();
    healthCheckTimer = null;
    constructor(config) {
        this.config = { ...connector_process_1.DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG, ...config };
        this.events = new ConnectorHealthEventEmitter();
        this.events.setMaxListeners(0);
    }
    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------
    /**
     * Start the background health check timer.
     * This periodically checks all connectors and reports to HeartbeatTracker.
     */
    start() {
        if (this.healthCheckTimer)
            return;
        logger.info({
            healthCheckIntervalMs: this.config.healthCheckIntervalMs,
            maxRestartAttempts: this.config.maxRestartAttempts,
            circuitCooldownMs: this.config.circuitCooldownMs,
        }, 'connector health monitor started');
        this.healthCheckTimer = setInterval(() => {
            this.runHealthChecks();
        }, this.config.healthCheckIntervalMs);
        // Unref so the timer does not keep the process alive
        if (this.healthCheckTimer && typeof this.healthCheckTimer === 'object' && 'unref' in this.healthCheckTimer) {
            this.healthCheckTimer.unref();
        }
    }
    /** Stop the background health check timer. */
    stop() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        logger.info('connector health monitor stopped');
    }
    /** Stop monitoring and clean up all state. */
    destroy() {
        this.stop();
        for (const entry of this.entries.values()) {
            this.clearEntryTimers(entry);
        }
        this.entries.clear();
        this.events.removeAllListeners();
        logger.info('connector health monitor destroyed');
    }
    // -----------------------------------------------------------------------
    // Connector registration
    // -----------------------------------------------------------------------
    /**
     * Register a connector process for monitoring.
     *
     * Once registered, the monitor will:
     * - Watch for exit/error events on the child process
     * - Auto-restart on crash (if circuit is closed)
     * - Track metrics and report health
     */
    register(connector) {
        const { connectorId } = connector;
        if (this.entries.has(connectorId)) {
            logger.warn({ connectorId }, 'connector already registered, replacing');
            this.unregister(connectorId);
        }
        const entry = {
            connector,
            circuitState: 'closed',
            restartAttemptsInWindow: 0,
            restartTimestamps: [],
            totalStarts: 0,
            totalCrashes: 0,
            startedAt: 0,
            lastCrashReason: null,
            lastCrashAt: null,
            lastCircuitTransitionAt: Date.now(),
            circuitOpenedAt: 0,
            restartTimer: null,
            cooldownTimer: null,
            disposed: false,
        };
        this.entries.set(connectorId, entry);
        // Attach process listeners if the connector is already running
        this.attachProcessListeners(entry);
        logger.info({ connectorId, platform: connector.platform, isRunning: connector.isRunning() }, 'connector registered for monitoring');
    }
    /**
     * Unregister a connector from monitoring.
     * Does NOT stop the connector process -- call connector.stop() separately.
     */
    unregister(connectorId) {
        const entry = this.entries.get(connectorId);
        if (!entry)
            return false;
        entry.disposed = true;
        this.clearEntryTimers(entry);
        this.entries.delete(connectorId);
        logger.info({ connectorId }, 'connector unregistered from monitoring');
        return true;
    }
    // -----------------------------------------------------------------------
    // Start / Stop connector (managed)
    // -----------------------------------------------------------------------
    /**
     * Start a registered connector and begin monitoring it.
     * Throws if the connector is not registered or if the circuit is open.
     */
    async startConnector(connectorId) {
        const entry = this.getEntryOrThrow(connectorId);
        if (entry.circuitState === 'open') {
            throw new Error(`Cannot start connector ${connectorId}: circuit breaker is open. ` +
                `Wait for cooldown or reset the circuit manually.`);
        }
        await this.doStart(entry);
    }
    /**
     * Stop a registered connector gracefully.
     */
    async stopConnector(connectorId) {
        const entry = this.getEntryOrThrow(connectorId);
        entry.disposed = true; // prevent auto-restart
        this.clearEntryTimers(entry);
        if (entry.connector.isRunning()) {
            await entry.connector.stop();
        }
        this.events.emit('connector.stopped', {
            connectorId,
            platform: entry.connector.platform,
            reason: 'manual',
            timestamp: new Date().toISOString(),
        });
        this.reportHealthToTracker(entry);
    }
    /**
     * Manually trigger a restart for a connector.
     * Resets restart counters and re-enables monitoring.
     */
    async restartConnector(connectorId) {
        const entry = this.getEntryOrThrow(connectorId);
        // Clear disposed flag and timers
        entry.disposed = false;
        this.clearEntryTimers(entry);
        // If circuit is open, close it first for a manual restart
        if (entry.circuitState === 'open' || entry.circuitState === 'half-open') {
            this.transitionCircuit(entry, 'closed');
        }
        // Reset restart counters
        entry.restartAttemptsInWindow = 0;
        entry.restartTimestamps = [];
        // Stop if running, then start
        if (entry.connector.isRunning()) {
            await entry.connector.stop();
        }
        await this.doStart(entry);
    }
    // -----------------------------------------------------------------------
    // Circuit breaker management
    // -----------------------------------------------------------------------
    /**
     * Manually reset a connector's circuit breaker to closed state.
     * Also resets restart counters.
     */
    resetCircuit(connectorId) {
        const entry = this.getEntryOrThrow(connectorId);
        this.clearEntryTimers(entry);
        entry.restartAttemptsInWindow = 0;
        entry.restartTimestamps = [];
        entry.disposed = false;
        this.transitionCircuit(entry, 'closed');
        logger.info({ connectorId }, 'circuit breaker manually reset to closed');
    }
    /**
     * Get the circuit breaker status for a connector.
     */
    getCircuitStatus(connectorId) {
        const entry = this.getEntryOrThrow(connectorId);
        return this.buildCircuitStatus(entry);
    }
    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------
    /** Get the list of all registered connector IDs. */
    getRegisteredConnectorIds() {
        return [...this.entries.keys()];
    }
    /** Check whether a connector is registered. */
    isRegistered(connectorId) {
        return this.entries.has(connectorId);
    }
    /** Get health summary for a single connector. */
    getConnectorHealth(connectorId) {
        const entry = this.getEntryOrThrow(connectorId);
        return this.buildHealthSummary(entry);
    }
    /** Get aggregated health for all connectors. */
    getAllConnectorsHealth() {
        const connectors = [];
        let running = 0;
        let stopped = 0;
        let circuitOpen = 0;
        for (const entry of this.entries.values()) {
            const summary = this.buildHealthSummary(entry);
            connectors.push(summary);
            if (summary.isRunning) {
                running++;
            }
            else {
                stopped++;
            }
            if (summary.circuit.state === 'open') {
                circuitOpen++;
            }
        }
        return {
            connectors,
            summary: {
                total: connectors.length,
                running,
                stopped,
                circuitOpen,
            },
            timestamp: new Date().toISOString(),
        };
    }
    /** Get metrics for a single connector. */
    getConnectorMetrics(connectorId) {
        const entry = this.getEntryOrThrow(connectorId);
        return this.buildMetrics(entry);
    }
    // -----------------------------------------------------------------------
    // Internal -- process start
    // -----------------------------------------------------------------------
    async doStart(entry) {
        const { connector } = entry;
        try {
            await connector.start();
            entry.totalStarts++;
            entry.startedAt = Date.now();
            // Attach process listeners for crash detection
            this.attachProcessListeners(entry);
            this.events.emit('connector.started', {
                connectorId: connector.connectorId,
                platform: connector.platform,
                pid: connector.getPid(),
                timestamp: new Date().toISOString(),
            });
            // If we were in half-open state and start succeeded, close circuit
            if (entry.circuitState === 'half-open') {
                this.transitionCircuit(entry, 'closed');
            }
            this.reportHealthToTracker(entry);
            logger.info({
                connectorId: connector.connectorId,
                platform: connector.platform,
                pid: connector.getPid(),
                totalStarts: entry.totalStarts,
            }, 'connector started successfully');
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error({ connectorId: connector.connectorId, error: errorMessage }, 'connector failed to start');
            // Treat a start failure like a crash
            this.handleCrash(entry, null, null, errorMessage);
        }
    }
    // -----------------------------------------------------------------------
    // Internal -- process event listeners
    // -----------------------------------------------------------------------
    attachProcessListeners(entry) {
        const { connector } = entry;
        const proc = connector.processRef;
        if (!proc)
            return;
        // Remove any existing listeners to prevent duplicates
        proc.removeAllListeners('exit');
        proc.removeAllListeners('error');
        proc.on('exit', (code, signal) => {
            if (entry.disposed)
                return; // Intentional stop, do not auto-restart
            logger.warn({
                connectorId: connector.connectorId,
                exitCode: code,
                signal,
            }, 'connector process exited unexpectedly');
            this.handleCrash(entry, code, signal, null);
        });
        proc.on('error', (err) => {
            if (entry.disposed)
                return;
            logger.error({
                connectorId: connector.connectorId,
                error: err.message,
            }, 'connector process error');
            this.handleCrash(entry, null, null, err.message);
        });
    }
    // -----------------------------------------------------------------------
    // Internal -- crash handling and restart logic
    // -----------------------------------------------------------------------
    handleCrash(entry, exitCode, signal, error) {
        const { connector } = entry;
        const now = Date.now();
        entry.totalCrashes++;
        entry.lastCrashReason =
            error ?? (signal ? `signal: ${signal}` : `exit code: ${exitCode}`);
        entry.lastCrashAt = now;
        entry.startedAt = 0;
        this.events.emit('connector.crashed', {
            connectorId: connector.connectorId,
            platform: connector.platform,
            exitCode,
            signal,
            error,
            timestamp: new Date(now).toISOString(),
        });
        this.reportHealthToTracker(entry);
        // Prune old restart timestamps outside the window
        this.pruneRestartWindow(entry, now);
        // Check if we should attempt restart
        if (entry.circuitState === 'open') {
            logger.warn({ connectorId: connector.connectorId }, 'circuit is open, skipping restart');
            return;
        }
        if (entry.restartAttemptsInWindow >= this.config.maxRestartAttempts) {
            // Max restarts exhausted -- open the circuit
            this.transitionCircuit(entry, 'open');
            this.scheduleHalfOpen(entry);
            return;
        }
        // Schedule a restart with exponential backoff
        this.scheduleRestart(entry, now);
    }
    scheduleRestart(entry, now) {
        const { connector } = entry;
        const attempt = entry.restartAttemptsInWindow + 1;
        // Exponential backoff: initialBackoff * multiplier^(attempt-1), capped at maxBackoff
        const delay = Math.min(this.config.initialBackoffMs * Math.pow(this.config.backoffMultiplier, attempt - 1), this.config.maxBackoffMs);
        this.events.emit('connector.restarting', {
            connectorId: connector.connectorId,
            platform: connector.platform,
            attempt,
            delayMs: delay,
            timestamp: new Date(now).toISOString(),
        });
        (0, slo_metrics_1.getA2ASloMetrics)().recordConnectorRestart();
        logger.info({
            connectorId: connector.connectorId,
            attempt,
            delayMs: delay,
            maxAttempts: this.config.maxRestartAttempts,
        }, 'scheduling connector restart');
        // Clear any existing restart timer
        if (entry.restartTimer) {
            clearTimeout(entry.restartTimer);
        }
        entry.restartTimer = setTimeout(async () => {
            entry.restartTimer = null;
            if (entry.disposed)
                return;
            entry.restartAttemptsInWindow++;
            entry.restartTimestamps.push(Date.now());
            try {
                await this.doStart(entry);
            }
            catch (err) {
                // doStart already handles the error via handleCrash
                logger.error({
                    connectorId: connector.connectorId,
                    error: err instanceof Error ? err.message : String(err),
                }, 'restart attempt failed');
            }
        }, delay);
        // Unref so the timer does not keep the process alive
        if (entry.restartTimer && typeof entry.restartTimer === 'object' && 'unref' in entry.restartTimer) {
            entry.restartTimer.unref();
        }
    }
    scheduleHalfOpen(entry) {
        const { connector } = entry;
        if (entry.cooldownTimer) {
            clearTimeout(entry.cooldownTimer);
        }
        logger.info({
            connectorId: connector.connectorId,
            cooldownMs: this.config.circuitCooldownMs,
        }, 'circuit opened, scheduling half-open transition');
        entry.cooldownTimer = setTimeout(() => {
            entry.cooldownTimer = null;
            if (entry.disposed)
                return;
            this.transitionCircuit(entry, 'half-open');
            // In half-open state, attempt a single restart
            entry.restartAttemptsInWindow = 0;
            entry.restartTimestamps = [];
            logger.info({ connectorId: connector.connectorId }, 'circuit half-open, attempting single restart');
            void this.doStart(entry).catch((err) => {
                logger.error({
                    connectorId: connector.connectorId,
                    error: err instanceof Error ? err.message : String(err),
                }, 'half-open restart attempt failed');
            });
        }, this.config.circuitCooldownMs);
        if (entry.cooldownTimer && typeof entry.cooldownTimer === 'object' && 'unref' in entry.cooldownTimer) {
            entry.cooldownTimer.unref();
        }
    }
    // -----------------------------------------------------------------------
    // Internal -- circuit breaker transitions
    // -----------------------------------------------------------------------
    transitionCircuit(entry, newState) {
        const { connector } = entry;
        const oldState = entry.circuitState;
        if (oldState === newState)
            return;
        entry.circuitState = newState;
        entry.lastCircuitTransitionAt = Date.now();
        if (newState === 'open') {
            entry.circuitOpenedAt = Date.now();
        }
        else if (newState === 'closed') {
            entry.circuitOpenedAt = 0;
        }
        const timestamp = new Date().toISOString();
        switch (newState) {
            case 'open':
                (0, slo_metrics_1.getA2ASloMetrics)().recordCircuitOpen();
                this.events.emit('circuit.open', {
                    connectorId: connector.connectorId,
                    platform: connector.platform,
                    failureCount: entry.totalCrashes,
                    cooldownMs: this.config.circuitCooldownMs,
                    timestamp,
                });
                logger.warn({ connectorId: connector.connectorId, from: oldState, to: newState }, 'circuit breaker opened');
                break;
            case 'half-open':
                this.events.emit('circuit.half-open', {
                    connectorId: connector.connectorId,
                    platform: connector.platform,
                    timestamp,
                });
                logger.info({ connectorId: connector.connectorId, from: oldState, to: newState }, 'circuit breaker half-open');
                break;
            case 'closed':
                this.events.emit('circuit.closed', {
                    connectorId: connector.connectorId,
                    platform: connector.platform,
                    timestamp,
                });
                logger.info({ connectorId: connector.connectorId, from: oldState, to: newState }, 'circuit breaker closed');
                break;
        }
    }
    // -----------------------------------------------------------------------
    // Internal -- health check loop
    // -----------------------------------------------------------------------
    /**
     * Run health checks on all registered connectors.
     * Reports status to HeartbeatTracker.
     */
    runHealthChecks() {
        for (const entry of this.entries.values()) {
            this.reportHealthToTracker(entry);
            // If connector is in half-open state and running + healthy, close circuit
            if (entry.circuitState === 'half-open' && entry.connector.isRunning()) {
                const health = entry.connector.getHealth();
                if (health.status === 'healthy') {
                    this.transitionCircuit(entry, 'closed');
                }
            }
        }
    }
    /**
     * Report a connector's health to the HeartbeatTracker.
     */
    reportHealthToTracker(entry) {
        try {
            const tracker = (0, heartbeat_tracker_service_1.getHeartbeatTracker)();
            const { connector } = entry;
            const isRunning = connector.isRunning();
            // Map connector health to heartbeat status
            let heartbeatStatus;
            if (!isRunning) {
                heartbeatStatus = 'unhealthy';
            }
            else {
                const health = connector.getHealth();
                heartbeatStatus = health.status === 'unknown' ? 'degraded' : health.status;
            }
            tracker.recordHeartbeat(`connector:${connector.connectorId}`, heartbeatStatus, {
                connectorId: connector.connectorId,
                platform: connector.platform,
                pid: connector.getPid(),
                circuitState: entry.circuitState,
                totalStarts: entry.totalStarts,
                totalCrashes: entry.totalCrashes,
                uptimeMs: this.computeUptime(entry),
            });
        }
        catch (err) {
            logger.debug({ connectorId: entry.connector.connectorId, error: err.message }, 'failed to report health to tracker (non-fatal)');
        }
    }
    // -----------------------------------------------------------------------
    // Internal -- helpers
    // -----------------------------------------------------------------------
    getEntryOrThrow(connectorId) {
        const entry = this.entries.get(connectorId);
        if (!entry) {
            throw new Error(`Connector not registered: ${connectorId}`);
        }
        return entry;
    }
    clearEntryTimers(entry) {
        if (entry.restartTimer) {
            clearTimeout(entry.restartTimer);
            entry.restartTimer = null;
        }
        if (entry.cooldownTimer) {
            clearTimeout(entry.cooldownTimer);
            entry.cooldownTimer = null;
        }
    }
    /**
     * Prune restart timestamps outside the sliding window.
     */
    pruneRestartWindow(entry, now) {
        const cutoff = now - this.config.restartWindowMs;
        entry.restartTimestamps = entry.restartTimestamps.filter((ts) => ts >= cutoff);
        entry.restartAttemptsInWindow = entry.restartTimestamps.length;
    }
    computeUptime(entry) {
        if (entry.startedAt === 0 || !entry.connector.isRunning())
            return 0;
        return Date.now() - entry.startedAt;
    }
    buildMetrics(entry) {
        return {
            totalStarts: entry.totalStarts,
            totalCrashes: entry.totalCrashes,
            uptimeMs: this.computeUptime(entry),
            lastCrashReason: entry.lastCrashReason,
            lastCrashAt: entry.lastCrashAt ? new Date(entry.lastCrashAt).toISOString() : null,
            circuitState: entry.circuitState,
            restartAttemptsInWindow: entry.restartAttemptsInWindow,
        };
    }
    buildCircuitStatus(entry) {
        let cooldownExpiresAt = null;
        if (entry.circuitState === 'open' && entry.circuitOpenedAt > 0) {
            const expiresAt = entry.circuitOpenedAt + this.config.circuitCooldownMs;
            cooldownExpiresAt = new Date(expiresAt).toISOString();
        }
        return {
            state: entry.circuitState,
            failureCount: entry.totalCrashes,
            lastTransitionAt: new Date(entry.lastCircuitTransitionAt).toISOString(),
            cooldownMs: this.config.circuitCooldownMs,
            cooldownExpiresAt,
        };
    }
    buildHealthSummary(entry) {
        const { connector } = entry;
        let health;
        try {
            health = connector.getHealth();
        }
        catch {
            health = {
                status: 'unknown',
                pid: null,
                uptime: 0,
                lastCheckedAt: new Date().toISOString(),
                message: 'health check unavailable',
            };
        }
        return {
            connectorId: connector.connectorId,
            platform: connector.platform,
            isRunning: connector.isRunning(),
            health,
            circuit: this.buildCircuitStatus(entry),
            metrics: this.buildMetrics(entry),
        };
    }
}
exports.ConnectorHealthMonitor = ConnectorHealthMonitor;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _defaultMonitor = null;
/** Get or create the default singleton ConnectorHealthMonitor. */
function getConnectorHealthMonitor() {
    if (!_defaultMonitor) {
        _defaultMonitor = new ConnectorHealthMonitor();
    }
    return _defaultMonitor;
}
/** Replace or set the singleton (for production config or testing). */
function setConnectorHealthMonitor(monitor) {
    _defaultMonitor = monitor;
}
/** Reset the singleton (for testing). */
function resetConnectorHealthMonitor() {
    if (_defaultMonitor) {
        _defaultMonitor.destroy();
    }
    _defaultMonitor = null;
}
