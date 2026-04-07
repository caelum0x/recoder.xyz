"use strict";
/**
 * Metrics Collector - Lightweight in-memory metrics tracking
 *
 * Features:
 * - Request counts by endpoint and method
 * - Response time percentiles (p50, p95, p99)
 * - Error counts by type
 * - File operation statistics
 * - Periodic cleanup of old data
 * - Optional Prometheus-compatible format output
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsCollector = void 0;
exports.metricsMiddleware = metricsMiddleware;
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('metrics');
// ==================== CONFIGURATION ====================
const CONFIG = {
    // Rolling window size for percentile calculations
    maxSamples: 1000,
    // Keep errors for 1 hour
    errorRetentionMs: 60 * 60 * 1000,
    // Max recent errors to keep for summary
    maxRecentErrors: 20,
    // Cleanup interval (5 minutes)
    cleanupIntervalMs: 5 * 60 * 1000,
};
// ==================== METRICS COLLECTOR ====================
class MetricsCollector {
    startTime = Date.now();
    // Request metrics (rolling window)
    requestSamples = [];
    requestCounts = {
        total: 0,
        byEndpoint: new Map(),
        byMethod: new Map(),
        byStatusCode: new Map(),
    };
    // File operation metrics (rolling window)
    fileOpSamples = [];
    fileOpCounts = {
        total: 0,
        byOperation: new Map(),
        success: 0,
        errors: 0,
    };
    // Error metrics
    errors = [];
    errorCounts = {
        total: 0,
        byType: new Map(),
    };
    // Cleanup interval handle
    cleanupInterval = null;
    constructor() {
        this.startCleanup();
    }
    // ==================== REQUEST TRACKING ====================
    /**
     * Record a completed request
     */
    recordRequest(metric) {
        const fullMetric = {
            ...metric,
            timestamp: Date.now(),
        };
        // Add to rolling window
        this.requestSamples.push(fullMetric);
        if (this.requestSamples.length > CONFIG.maxSamples) {
            this.requestSamples.shift();
        }
        // Update counts
        this.requestCounts.total++;
        const endpointKey = this.normalizeEndpoint(metric.endpoint);
        this.requestCounts.byEndpoint.set(endpointKey, (this.requestCounts.byEndpoint.get(endpointKey) || 0) + 1);
        this.requestCounts.byMethod.set(metric.method, (this.requestCounts.byMethod.get(metric.method) || 0) + 1);
        const statusKey = String(metric.statusCode);
        this.requestCounts.byStatusCode.set(statusKey, (this.requestCounts.byStatusCode.get(statusKey) || 0) + 1);
    }
    /**
     * Normalize endpoint for grouping (remove dynamic IDs)
     */
    normalizeEndpoint(endpoint) {
        const safeEndpoint = endpoint && endpoint.length > 0 ? endpoint : '/unknown';
        return safeEndpoint
            // Replace UUIDs with :id
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
            // Replace numeric IDs with :id
            .replace(/\/\d+(?=\/|$)/g, '/:id')
            // Clean up double slashes
            .replace(/\/+/g, '/');
    }
    // ==================== FILE OPERATION TRACKING ====================
    /**
     * Record a file operation
     */
    recordFileOperation(metric) {
        const fullMetric = {
            ...metric,
            timestamp: Date.now(),
        };
        // Add to rolling window
        this.fileOpSamples.push(fullMetric);
        if (this.fileOpSamples.length > CONFIG.maxSamples) {
            this.fileOpSamples.shift();
        }
        // Update counts
        this.fileOpCounts.total++;
        this.fileOpCounts.byOperation.set(metric.operation, (this.fileOpCounts.byOperation.get(metric.operation) || 0) + 1);
        if (metric.success) {
            this.fileOpCounts.success++;
        }
        else {
            this.fileOpCounts.errors++;
        }
    }
    // ==================== ERROR TRACKING ====================
    /**
     * Record an error
     */
    recordError(metric) {
        const fullMetric = {
            ...metric,
            timestamp: Date.now(),
        };
        this.errors.push(fullMetric);
        this.errorCounts.total++;
        this.errorCounts.byType.set(metric.type, (this.errorCounts.byType.get(metric.type) || 0) + 1);
    }
    // ==================== PERCENTILE CALCULATIONS ====================
    /**
     * Calculate percentile from sorted array
     */
    percentile(sortedArr, p) {
        if (sortedArr.length === 0)
            return 0;
        const index = Math.ceil((p / 100) * sortedArr.length) - 1;
        return sortedArr[Math.max(0, index)];
    }
    /**
     * Get response time percentiles
     */
    getResponseTimeStats() {
        if (this.requestSamples.length === 0) {
            return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
        }
        const durations = this.requestSamples
            .map(r => r.durationMs)
            .sort((a, b) => a - b);
        const sum = durations.reduce((a, b) => a + b, 0);
        return {
            p50: Math.round(this.percentile(durations, 50)),
            p95: Math.round(this.percentile(durations, 95)),
            p99: Math.round(this.percentile(durations, 99)),
            avg: Math.round(sum / durations.length),
            min: durations[0],
            max: durations[durations.length - 1],
        };
    }
    // ==================== SUMMARY GENERATION ====================
    /**
     * Get comprehensive metrics summary
     */
    getSummary() {
        const now = Date.now();
        const uptimeMs = now - this.startTime;
        // Format uptime as human-readable string
        const uptimeSeconds = Math.floor(uptimeMs / 1000);
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        const uptimeHuman = days > 0
            ? `${days}d ${hours}h ${minutes}m ${seconds}s`
            : hours > 0
                ? `${hours}h ${minutes}m ${seconds}s`
                : minutes > 0
                    ? `${minutes}m ${seconds}s`
                    : `${seconds}s`;
        // Memory usage
        const memUsage = process.memoryUsage();
        // Average file operation duration
        const avgFileOpDuration = this.fileOpSamples.length > 0
            ? Math.round(this.fileOpSamples.reduce((sum, op) => sum + op.durationMs, 0) /
                this.fileOpSamples.length)
            : 0;
        // Recent errors (last N)
        const recentErrors = this.errors
            .slice(-CONFIG.maxRecentErrors)
            .reverse()
            .map(e => ({
            type: e.type,
            message: e.message.substring(0, 200), // Truncate long messages
            timestamp: new Date(e.timestamp).toISOString(),
        }));
        return {
            uptime: uptimeMs,
            uptimeHuman,
            timestamp: new Date().toISOString(),
            requests: {
                total: this.requestCounts.total,
                byEndpoint: Object.fromEntries(this.requestCounts.byEndpoint),
                byMethod: Object.fromEntries(this.requestCounts.byMethod),
                byStatusCode: Object.fromEntries(this.requestCounts.byStatusCode),
                responseTimes: this.getResponseTimeStats(),
            },
            fileOperations: {
                total: this.fileOpCounts.total,
                byOperation: Object.fromEntries(this.fileOpCounts.byOperation),
                successCount: this.fileOpCounts.success,
                errorCount: this.fileOpCounts.errors,
                avgDurationMs: avgFileOpDuration,
            },
            errors: {
                total: this.errorCounts.total,
                byType: Object.fromEntries(this.errorCounts.byType),
                recent: recentErrors,
            },
            memory: {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                rss: memUsage.rss,
                heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
                heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
                rssMB: Math.round(memUsage.rss / 1024 / 1024),
            },
        };
    }
    // ==================== PROMETHEUS FORMAT ====================
    /**
     * Get metrics in Prometheus text format
     */
    getPrometheusFormat() {
        const summary = this.getSummary();
        const lines = [];
        // Helper to format metric name
        const formatName = (name) => `recoder_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        // Uptime
        lines.push(`# HELP ${formatName('uptime_seconds')} Server uptime in seconds`);
        lines.push(`# TYPE ${formatName('uptime_seconds')} gauge`);
        lines.push(`${formatName('uptime_seconds')} ${Math.floor(summary.uptime / 1000)}`);
        lines.push('');
        // Request counts
        lines.push(`# HELP ${formatName('requests_total')} Total number of requests`);
        lines.push(`# TYPE ${formatName('requests_total')} counter`);
        lines.push(`${formatName('requests_total')} ${summary.requests.total}`);
        lines.push('');
        // Requests by endpoint
        lines.push(`# HELP ${formatName('requests_by_endpoint')} Requests by endpoint`);
        lines.push(`# TYPE ${formatName('requests_by_endpoint')} counter`);
        for (const [endpoint, count] of Object.entries(summary.requests.byEndpoint)) {
            const safeEndpoint = endpoint.replace(/"/g, '\\"');
            lines.push(`${formatName('requests_by_endpoint')}{endpoint="${safeEndpoint}"} ${count}`);
        }
        lines.push('');
        // Requests by method
        lines.push(`# HELP ${formatName('requests_by_method')} Requests by HTTP method`);
        lines.push(`# TYPE ${formatName('requests_by_method')} counter`);
        for (const [method, count] of Object.entries(summary.requests.byMethod)) {
            lines.push(`${formatName('requests_by_method')}{method="${method}"} ${count}`);
        }
        lines.push('');
        // Requests by status code
        lines.push(`# HELP ${formatName('requests_by_status')} Requests by HTTP status code`);
        lines.push(`# TYPE ${formatName('requests_by_status')} counter`);
        for (const [status, count] of Object.entries(summary.requests.byStatusCode)) {
            lines.push(`${formatName('requests_by_status')}{status="${status}"} ${count}`);
        }
        lines.push('');
        // Response time percentiles
        lines.push(`# HELP ${formatName('response_time_ms')} Response time in milliseconds`);
        lines.push(`# TYPE ${formatName('response_time_ms')} summary`);
        lines.push(`${formatName('response_time_ms')}{quantile="0.5"} ${summary.requests.responseTimes.p50}`);
        lines.push(`${formatName('response_time_ms')}{quantile="0.95"} ${summary.requests.responseTimes.p95}`);
        lines.push(`${formatName('response_time_ms')}{quantile="0.99"} ${summary.requests.responseTimes.p99}`);
        lines.push('');
        // File operations
        lines.push(`# HELP ${formatName('file_operations_total')} Total file operations`);
        lines.push(`# TYPE ${formatName('file_operations_total')} counter`);
        lines.push(`${formatName('file_operations_total')} ${summary.fileOperations.total}`);
        lines.push('');
        lines.push(`# HELP ${formatName('file_operations_success')} Successful file operations`);
        lines.push(`# TYPE ${formatName('file_operations_success')} counter`);
        lines.push(`${formatName('file_operations_success')} ${summary.fileOperations.successCount}`);
        lines.push('');
        lines.push(`# HELP ${formatName('file_operations_errors')} Failed file operations`);
        lines.push(`# TYPE ${formatName('file_operations_errors')} counter`);
        lines.push(`${formatName('file_operations_errors')} ${summary.fileOperations.errorCount}`);
        lines.push('');
        // File operations by type
        lines.push(`# HELP ${formatName('file_operations_by_type')} File operations by type`);
        lines.push(`# TYPE ${formatName('file_operations_by_type')} counter`);
        for (const [op, count] of Object.entries(summary.fileOperations.byOperation)) {
            lines.push(`${formatName('file_operations_by_type')}{operation="${op}"} ${count}`);
        }
        lines.push('');
        // Errors
        lines.push(`# HELP ${formatName('errors_total')} Total errors`);
        lines.push(`# TYPE ${formatName('errors_total')} counter`);
        lines.push(`${formatName('errors_total')} ${summary.errors.total}`);
        lines.push('');
        // Errors by type
        lines.push(`# HELP ${formatName('errors_by_type')} Errors by type`);
        lines.push(`# TYPE ${formatName('errors_by_type')} counter`);
        for (const [type, count] of Object.entries(summary.errors.byType)) {
            const safeType = type.replace(/"/g, '\\"');
            lines.push(`${formatName('errors_by_type')}{type="${safeType}"} ${count}`);
        }
        lines.push('');
        // Memory
        lines.push(`# HELP ${formatName('memory_heap_used_bytes')} Heap memory used`);
        lines.push(`# TYPE ${formatName('memory_heap_used_bytes')} gauge`);
        lines.push(`${formatName('memory_heap_used_bytes')} ${summary.memory.heapUsed}`);
        lines.push('');
        lines.push(`# HELP ${formatName('memory_heap_total_bytes')} Total heap memory`);
        lines.push(`# TYPE ${formatName('memory_heap_total_bytes')} gauge`);
        lines.push(`${formatName('memory_heap_total_bytes')} ${summary.memory.heapTotal}`);
        lines.push('');
        lines.push(`# HELP ${formatName('memory_rss_bytes')} Resident set size`);
        lines.push(`# TYPE ${formatName('memory_rss_bytes')} gauge`);
        lines.push(`${formatName('memory_rss_bytes')} ${summary.memory.rss}`);
        return lines.join('\n');
    }
    // ==================== CLEANUP ====================
    /**
     * Start periodic cleanup of old data
     */
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, CONFIG.cleanupIntervalMs);
    }
    /**
     * Clean up old error data
     */
    cleanup() {
        const cutoff = Date.now() - CONFIG.errorRetentionMs;
        // Remove old errors
        const originalLength = this.errors.length;
        this.errors = this.errors.filter(e => e.timestamp > cutoff);
        if (this.errors.length < originalLength) {
            logger.info({ removed: originalLength - this.errors.length }, 'Cleaned up old errors');
        }
    }
    /**
     * Reset all metrics (useful for testing)
     */
    reset() {
        this.startTime = Date.now();
        this.requestSamples = [];
        this.requestCounts = {
            total: 0,
            byEndpoint: new Map(),
            byMethod: new Map(),
            byStatusCode: new Map(),
        };
        this.fileOpSamples = [];
        this.fileOpCounts = {
            total: 0,
            byOperation: new Map(),
            success: 0,
            errors: 0,
        };
        this.errors = [];
        this.errorCounts = {
            total: 0,
            byType: new Map(),
        };
    }
    /**
     * Shutdown cleanup
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}
/**
 * Express middleware to track request metrics
 * Adds response time tracking and records metrics on response finish
 */
function metricsMiddleware(collector) {
    return (req, res, next) => {
        const startTime = Date.now();
        // Hook into response finish event
        res.on('finish', () => {
            const durationMs = Date.now() - startTime;
            const endpoint = req.originalUrl || req.url || req.path || '/unknown';
            collector.recordRequest({
                endpoint,
                method: req.method,
                statusCode: res.statusCode,
                durationMs,
            });
            // Record errors for 4xx and 5xx responses
            if (res.statusCode >= 400) {
                collector.recordError({
                    type: res.statusCode >= 500 ? 'server_error' : 'client_error',
                    message: `${req.method} ${endpoint} returned ${res.statusCode}`,
                    endpoint,
                    statusCode: res.statusCode,
                });
            }
        });
        next();
    };
}
// ==================== SINGLETON INSTANCE ====================
exports.metricsCollector = new MetricsCollector();
exports.default = exports.metricsCollector;
