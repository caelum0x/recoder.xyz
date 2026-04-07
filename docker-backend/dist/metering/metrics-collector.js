"use strict";
/**
 * Metrics Collector
 * Collects usage metrics from Docker containers and projects
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = void 0;
exports.getMetricsCollector = getMetricsCollector;
exports.resetMetricsCollector = resetMetricsCollector;
const uuid_1 = require("uuid");
const events_1 = require("events");
const types_js_1 = require("./types.js");
// ==================== Metrics Collector ====================
class MetricsCollector extends events_1.EventEmitter {
    docker;
    config;
    state;
    trackedContainers = new Map();
    metricsBuffer = [];
    containerStatsInterval;
    storageStatsInterval;
    flushInterval;
    apiCallCounts = new Map(); // userId -> count
    bandwidthCounts = new Map(); // containerId -> bytes
    constructor(docker, config = {}) {
        super();
        this.docker = docker;
        this.config = { ...types_js_1.DEFAULT_METERING_CONFIG, ...config };
        this.state = {
            isRunning: false,
            lastCollectionTime: 0,
            totalMetricsCollected: 0,
            errors: 0,
        };
    }
    // ==================== Lifecycle ====================
    /**
     * Start the metrics collector
     */
    start() {
        if (this.state.isRunning) {
            console.log('[MetricsCollector] Already running');
            return;
        }
        console.log('[MetricsCollector] Starting metrics collection');
        this.state.isRunning = true;
        // Start container stats collection
        this.containerStatsInterval = setInterval(() => this.collectContainerStats(), this.config.containerStatsInterval);
        // Start storage stats collection
        this.storageStatsInterval = setInterval(() => this.collectStorageStats(), this.config.storageStatsInterval);
        // Start buffer flush interval
        this.flushInterval = setInterval(() => this.flushMetricsBuffer(), this.config.flushInterval);
        // Initial collection
        this.collectContainerStats().catch(console.error);
    }
    /**
     * Stop the metrics collector
     */
    stop() {
        console.log('[MetricsCollector] Stopping metrics collection');
        this.state.isRunning = false;
        if (this.containerStatsInterval) {
            clearInterval(this.containerStatsInterval);
            this.containerStatsInterval = undefined;
        }
        if (this.storageStatsInterval) {
            clearInterval(this.storageStatsInterval);
            this.storageStatsInterval = undefined;
        }
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = undefined;
        }
        // Flush remaining metrics
        this.flushMetricsBuffer();
    }
    /**
     * Get collector state
     */
    getState() {
        return { ...this.state };
    }
    // ==================== Container Tracking ====================
    /**
     * Register a container for tracking
     */
    trackContainer(containerId, projectId, userId) {
        this.trackedContainers.set(containerId, {
            containerId,
            projectId,
            userId,
            startTime: new Date(),
        });
        console.log(`[MetricsCollector] Tracking container ${containerId} for user ${userId}`);
    }
    /**
     * Unregister a container from tracking
     */
    untrackContainer(containerId) {
        const info = this.trackedContainers.get(containerId);
        if (info) {
            // Record final container uptime
            const uptime = (Date.now() - info.startTime.getTime()) / 1000;
            this.recordMetric({
                userId: info.userId,
                projectId: info.projectId,
                containerId: info.containerId,
                metricType: types_js_1.MetricType.COMPUTE_SECONDS,
                value: uptime,
            });
        }
        this.trackedContainers.delete(containerId);
        this.bandwidthCounts.delete(containerId);
        console.log(`[MetricsCollector] Untracked container ${containerId}`);
    }
    /**
     * Get tracked container info
     */
    getTrackedContainers() {
        return Array.from(this.trackedContainers.values());
    }
    // ==================== Container Stats Collection ====================
    /**
     * Collect stats from all tracked containers
     */
    async collectContainerStats() {
        if (!this.state.isRunning)
            return;
        const startTime = Date.now();
        let collected = 0;
        let errors = 0;
        for (const [containerId, info] of this.trackedContainers) {
            try {
                const stats = await this.getContainerStats(containerId, info);
                if (stats) {
                    this.processContainerStats(stats, info);
                    collected++;
                }
            }
            catch (error) {
                if (error.statusCode !== 404) {
                    console.error(`[MetricsCollector] Error collecting stats for ${containerId}:`, error.message);
                    errors++;
                }
                else {
                    // Container no longer exists
                    this.untrackContainer(containerId);
                }
            }
        }
        this.state.lastCollectionTime = startTime;
        this.state.totalMetricsCollected += collected;
        this.state.errors += errors;
        if (collected > 0) {
            this.emit('statsCollected', { collected, errors, duration: Date.now() - startTime });
        }
    }
    /**
     * Get stats for a single container
     */
    async getContainerStats(containerId, info) {
        try {
            const container = this.docker.getContainer(containerId);
            const stats = await container.stats({ stream: false });
            // Calculate CPU percentage
            const cpuDelta = stats.cpu_stats.cpu_usage.total_usage -
                (stats.precpu_stats?.cpu_usage?.total_usage || 0);
            const systemDelta = stats.cpu_stats.system_cpu_usage -
                (stats.precpu_stats?.system_cpu_usage || 0);
            const cpuPercent = systemDelta > 0
                ? (cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus || 1) * 100
                : 0;
            // Calculate memory percentage
            const memoryUsage = stats.memory_stats.usage || 0;
            const memoryLimit = stats.memory_stats.limit || 1;
            const memoryPercent = (memoryUsage / memoryLimit) * 100;
            // Network stats
            const networks = stats.networks || {};
            let rxBytes = 0;
            let txBytes = 0;
            let rxPackets = 0;
            let txPackets = 0;
            for (const iface of Object.values(networks)) {
                rxBytes += iface.rx_bytes || 0;
                txBytes += iface.tx_bytes || 0;
                rxPackets += iface.rx_packets || 0;
                txPackets += iface.tx_packets || 0;
            }
            // Block I/O
            const blkioStats = stats.blkio_stats?.io_service_bytes_recursive || [];
            let readBytes = 0;
            let writeBytes = 0;
            for (const entry of blkioStats) {
                if (entry.op === 'Read' || entry.op === 'read') {
                    readBytes += entry.value || 0;
                }
                else if (entry.op === 'Write' || entry.op === 'write') {
                    writeBytes += entry.value || 0;
                }
            }
            return {
                containerId,
                projectId: info.projectId,
                userId: info.userId,
                timestamp: new Date(),
                cpu: {
                    usagePercent: cpuPercent,
                    totalUsage: stats.cpu_stats.cpu_usage.total_usage,
                    systemUsage: stats.cpu_stats.system_cpu_usage,
                    onlineCpus: stats.cpu_stats.online_cpus || 1,
                },
                memory: {
                    usage: memoryUsage,
                    limit: memoryLimit,
                    usagePercent: memoryPercent,
                    maxUsage: stats.memory_stats.max_usage || memoryUsage,
                },
                network: {
                    rxBytes,
                    txBytes,
                    rxPackets,
                    txPackets,
                },
                blockIO: {
                    readBytes,
                    writeBytes,
                },
                pids: stats.pids_stats?.current || 0,
            };
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Process container stats and emit metrics
     */
    processContainerStats(stats, info) {
        // CPU/Compute time (approximate based on CPU usage percentage)
        const computeSeconds = (this.config.containerStatsInterval / 1000) * (stats.cpu.usagePercent / 100);
        if (computeSeconds > 0) {
            this.recordMetric({
                userId: info.userId,
                projectId: info.projectId,
                containerId: info.containerId,
                metricType: types_js_1.MetricType.COMPUTE_SECONDS,
                value: computeSeconds,
                metadata: { cpuPercent: stats.cpu.usagePercent },
            });
        }
        // Memory usage (record peak)
        this.recordMetric({
            userId: info.userId,
            projectId: info.projectId,
            containerId: info.containerId,
            metricType: types_js_1.MetricType.MEMORY_BYTES,
            value: stats.memory.maxUsage,
            metadata: {
                current: stats.memory.usage,
                limit: stats.memory.limit,
                percent: stats.memory.usagePercent,
            },
        });
        // Bandwidth tracking (delta from last collection)
        const prevBandwidth = this.bandwidthCounts.get(info.containerId);
        if (prevBandwidth) {
            const rxDelta = stats.network.rxBytes - prevBandwidth.rx;
            const txDelta = stats.network.txBytes - prevBandwidth.tx;
            if (rxDelta > 0 || txDelta > 0) {
                this.recordMetric({
                    userId: info.userId,
                    projectId: info.projectId,
                    containerId: info.containerId,
                    metricType: types_js_1.MetricType.BANDWIDTH_BYTES,
                    value: rxDelta + txDelta,
                    metadata: { rx: rxDelta, tx: txDelta },
                });
            }
        }
        this.bandwidthCounts.set(info.containerId, {
            rx: stats.network.rxBytes,
            tx: stats.network.txBytes,
        });
        // Emit container stats event
        this.emit('containerStats', stats);
    }
    // ==================== Storage Stats Collection ====================
    /**
     * Collect storage stats for all users
     */
    async collectStorageStats() {
        if (!this.state.isRunning)
            return;
        // Group containers by user
        const userProjects = new Map();
        for (const info of this.trackedContainers.values()) {
            const projects = userProjects.get(info.userId) || new Set();
            projects.add(info.projectId);
            userProjects.set(info.userId, projects);
        }
        for (const [userId, projects] of userProjects) {
            for (const projectId of projects) {
                try {
                    await this.collectProjectStorageStats(userId, projectId);
                }
                catch (error) {
                    console.error(`[MetricsCollector] Error collecting storage for ${projectId}:`, error.message);
                }
            }
        }
    }
    /**
     * Collect storage stats for a specific project
     */
    async collectProjectStorageStats(userId, projectId) {
        const info = Array.from(this.trackedContainers.values())
            .find(c => c.projectId === projectId);
        if (!info)
            return null;
        try {
            const container = this.docker.getContainer(info.containerId);
            // Execute du command to get directory size
            const exec = await container.exec({
                Cmd: ['sh', '-c', 'du -sb /app 2>/dev/null || echo "0"'],
                AttachStdout: true,
                AttachStderr: true,
            });
            const stream = await exec.start({ Detach: false });
            return new Promise((resolve) => {
                let output = '';
                stream.on('data', (chunk) => {
                    output += chunk.toString();
                });
                stream.on('end', () => {
                    const match = output.match(/(\d+)/);
                    const totalBytes = match ? parseInt(match[1], 10) : 0;
                    const stats = {
                        projectId,
                        userId,
                        timestamp: new Date(),
                        totalBytes,
                        fileCount: 0, // Would need additional command to count files
                        largestFiles: [],
                    };
                    // Record storage metric
                    this.recordMetric({
                        userId,
                        projectId,
                        metricType: types_js_1.MetricType.STORAGE_BYTES,
                        value: totalBytes,
                    });
                    this.emit('storageStats', stats);
                    resolve(stats);
                });
                stream.on('error', () => {
                    resolve(null);
                });
            });
        }
        catch (error) {
            return null;
        }
    }
    // ==================== API Call Tracking ====================
    /**
     * Record an API call for a user
     */
    recordApiCall(userId, endpoint) {
        const currentCount = this.apiCallCounts.get(userId) || 0;
        this.apiCallCounts.set(userId, currentCount + 1);
        this.recordMetric({
            userId,
            metricType: types_js_1.MetricType.API_CALLS,
            value: 1,
            metadata: { endpoint },
        });
    }
    /**
     * Get API call count for a user
     */
    getApiCallCount(userId) {
        return this.apiCallCounts.get(userId) || 0;
    }
    /**
     * Reset API call counts (called at period end)
     */
    resetApiCallCounts() {
        this.apiCallCounts.clear();
    }
    // ==================== Manual Metric Recording ====================
    /**
     * Record a metric directly
     */
    recordMetric(params) {
        const metric = {
            id: (0, uuid_1.v4)(),
            userId: params.userId,
            projectId: params.projectId,
            containerId: params.containerId,
            metricType: params.metricType,
            value: params.value,
            unit: types_js_1.METRIC_UNITS[params.metricType],
            timestamp: new Date(),
            metadata: params.metadata,
        };
        this.metricsBuffer.push(metric);
        this.emit('metric', metric);
        // Auto-flush if buffer is full
        if (this.metricsBuffer.length >= this.config.batchSize) {
            this.flushMetricsBuffer();
        }
        return metric;
    }
    /**
     * Record terminal usage
     */
    recordTerminalUsage(userId, projectId, durationSeconds) {
        this.recordMetric({
            userId,
            projectId,
            metricType: types_js_1.MetricType.TERMINAL_MINUTES,
            value: durationSeconds / 60,
        });
    }
    /**
     * Record build time
     */
    recordBuildTime(userId, projectId, durationSeconds) {
        this.recordMetric({
            userId,
            projectId,
            metricType: types_js_1.MetricType.BUILD_MINUTES,
            value: durationSeconds / 60,
        });
    }
    /**
     * Record container uptime
     */
    recordContainerUptime(userId, projectId, containerId, hours) {
        this.recordMetric({
            userId,
            projectId,
            containerId,
            metricType: types_js_1.MetricType.CONTAINER_HOURS,
            value: hours,
        });
    }
    // ==================== Buffer Management ====================
    /**
     * Flush metrics buffer and emit for storage
     */
    flushMetricsBuffer() {
        if (this.metricsBuffer.length === 0)
            return [];
        const metrics = [...this.metricsBuffer];
        this.metricsBuffer = [];
        this.emit('metricsFlush', metrics);
        return metrics;
    }
    /**
     * Get current buffer size
     */
    getBufferSize() {
        return this.metricsBuffer.length;
    }
    // ==================== Event Handlers ====================
    /**
     * Register a handler for metric events
     */
    onMetric(handler) {
        this.on('metric', handler);
    }
    /**
     * Register a handler for metrics flush events
     */
    onMetricsFlush(handler) {
        this.on('metricsFlush', handler);
    }
    /**
     * Register a handler for container stats events
     */
    onContainerStats(handler) {
        this.on('containerStats', handler);
    }
    /**
     * Register a handler for storage stats events
     */
    onStorageStats(handler) {
        this.on('storageStats', handler);
    }
}
exports.MetricsCollector = MetricsCollector;
// ==================== Singleton Factory ====================
let collectorInstance = null;
/**
 * Get or create the metrics collector singleton
 */
function getMetricsCollector(docker, config) {
    if (!collectorInstance && docker) {
        collectorInstance = new MetricsCollector(docker, config);
    }
    if (!collectorInstance) {
        throw new Error('MetricsCollector not initialized. Call with Docker instance first.');
    }
    return collectorInstance;
}
/**
 * Reset the metrics collector (for testing)
 */
function resetMetricsCollector() {
    if (collectorInstance) {
        collectorInstance.stop();
        collectorInstance = null;
    }
}
exports.default = MetricsCollector;
