"use strict";
/**
 * Performance Profiling Service
 *
 * Request tracing and performance monitoring:
 * - Request latency tracking
 * - Slow query detection
 * - Memory usage monitoring
 * - CPU profiling
 * - Bottleneck identification
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceProfiler = exports.performanceProfiler = void 0;
exports.performanceMiddleware = performanceMiddleware;
const perf_hooks_1 = require("perf_hooks");
const v8_1 = __importDefault(require("v8"));
const os_1 = __importDefault(require("os"));
const persistence_js_1 = require("../persistence.js");
const DEFAULT_CONFIG = {
    tracingEnabled: true,
    slowRequestThresholdMs: 1000,
    maxTraces: 5000,
    memoryWarningPercent: 80,
    cpuWarningPercent: 80,
    eventLoopLagThresholdMs: 100,
    samplingRate: 0.1, // 10% sampling
};
function loadProfilerStore() {
    return (0, persistence_js_1.loadStore)('performance-profiler', {
        slowRequests: [],
        alerts: [],
        aggregatedStats: {
            totalRequests: 0,
            totalDuration: 0,
            durations: [],
        },
    });
}
function saveProfilerStore(data) {
    (0, persistence_js_1.debouncedSave)('performance-profiler', data);
}
// ==================== Performance Profiler ====================
class PerformanceProfiler {
    config;
    traces = [];
    slowRequests = [];
    alerts = [];
    aggregatedStats;
    activeSpans = new Map();
    lastCpuUsage;
    gcStats = { totalCollections: 0, totalDuration: 0, lastCollection: undefined };
    eventLoopLag = 0;
    monitoringInterval;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        // Load persisted state
        const stored = loadProfilerStore();
        this.slowRequests = stored.slowRequests.slice(-100);
        this.alerts = stored.alerts.slice(-1000);
        this.aggregatedStats = stored.aggregatedStats;
        // Setup GC observer (if available)
        this.setupGCObserver();
        console.log(`[Profiler] Initialized (sampling: ${this.config.samplingRate * 100}%)`);
    }
    // ==================== Request Tracing ====================
    /**
     * Start tracing a request
     */
    startTrace(id, method, path) {
        if (!this.config.tracingEnabled)
            return;
        if (Math.random() > this.config.samplingRate)
            return;
        const trace = {
            id,
            method,
            path,
            startedAt: perf_hooks_1.performance.now(),
            duration: 0,
            spans: [],
        };
        this.traces.push(trace);
        this.activeSpans.set(id, []);
        // Trim traces if too many
        if (this.traces.length > this.config.maxTraces) {
            this.traces = this.traces.slice(-this.config.maxTraces);
        }
    }
    /**
     * Start a span within a trace
     */
    startSpan(traceId, spanName) {
        const spans = this.activeSpans.get(traceId);
        if (!spans)
            return;
        spans.push({
            name: spanName,
            startedAt: perf_hooks_1.performance.now(),
        });
    }
    /**
     * End a span within a trace
     */
    endSpan(traceId, spanName, metadata) {
        const spans = this.activeSpans.get(traceId);
        if (!spans)
            return;
        const spanIndex = spans.findIndex((s) => s.name === spanName);
        if (spanIndex === -1)
            return;
        const span = spans[spanIndex];
        const duration = perf_hooks_1.performance.now() - span.startedAt;
        const trace = this.traces.find((t) => t.id === traceId);
        if (trace) {
            trace.spans.push({
                name: spanName,
                startedAt: span.startedAt,
                duration,
                metadata,
            });
        }
        spans.splice(spanIndex, 1);
    }
    /**
     * End a request trace
     */
    endTrace(id, statusCode, error, metadata) {
        const trace = this.traces.find((t) => t.id === id);
        if (!trace)
            return undefined;
        trace.duration = perf_hooks_1.performance.now() - trace.startedAt;
        trace.statusCode = statusCode;
        trace.error = error;
        trace.metadata = metadata;
        // Update aggregated stats
        this.aggregatedStats.totalRequests++;
        this.aggregatedStats.totalDuration += trace.duration;
        this.aggregatedStats.durations.push(trace.duration);
        // Keep durations array manageable (last 10000)
        if (this.aggregatedStats.durations.length > 10000) {
            this.aggregatedStats.durations = this.aggregatedStats.durations.slice(-10000);
        }
        // Check for slow request
        if (trace.duration > this.config.slowRequestThresholdMs) {
            const percentile = this.calculatePercentile(trace.duration);
            this.recordSlowRequest(trace, percentile);
        }
        // Cleanup
        this.activeSpans.delete(id);
        // Persist periodically
        if (this.aggregatedStats.totalRequests % 100 === 0) {
            this.persist();
        }
        return trace;
    }
    // ==================== Metrics ====================
    /**
     * Get current performance metrics
     */
    getMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = this.getCpuUsage();
        const now = Date.now();
        const fiveMinutesAgo = now - 5 * 60 * 1000;
        // Calculate request metrics
        const recentTraces = this.traces.filter((t) => t.startedAt >= fiveMinutesAgo);
        const durations = this.aggregatedStats.durations;
        return {
            requests: {
                total: this.aggregatedStats.totalRequests,
                last5Minutes: recentTraces.length,
                avgDuration: durations.length > 0
                    ? this.aggregatedStats.totalDuration / this.aggregatedStats.totalRequests
                    : 0,
                p50Duration: this.getPercentileValue(durations, 50),
                p95Duration: this.getPercentileValue(durations, 95),
                p99Duration: this.getPercentileValue(durations, 99),
                slowRequests: this.slowRequests.length,
            },
            memory: {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                rss: memUsage.rss,
                heapUsedPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
            },
            cpu: {
                usage: cpuUsage,
                loadAverage: os_1.default.loadavg(),
            },
            gc: this.gcStats.totalCollections > 0 ? this.gcStats : undefined,
            eventLoop: {
                lag: this.eventLoopLag,
                utilization: this.getEventLoopUtilization(),
            },
        };
    }
    /**
     * Get slow requests
     */
    getSlowRequests(limit = 50) {
        return this.slowRequests.slice(-limit).reverse();
    }
    /**
     * Get performance alerts
     */
    getAlerts(limit = 100) {
        return this.alerts.slice(-limit).reverse();
    }
    /**
     * Get recent traces
     */
    getTraces(limit = 100) {
        return this.traces.slice(-limit).reverse();
    }
    /**
     * Get V8 heap statistics
     */
    getHeapStats() {
        return v8_1.default.getHeapStatistics();
    }
    // ==================== Monitoring ====================
    /**
     * Start background monitoring
     */
    startMonitoring() {
        if (this.monitoringInterval) {
            console.log('[Profiler] Monitoring already running');
            return;
        }
        console.log('[Profiler] Starting performance monitoring');
        this.monitoringInterval = setInterval(() => {
            this.checkHealth();
        }, 10000); // Every 10 seconds
        // Start event loop lag monitoring
        this.monitorEventLoopLag();
    }
    /**
     * Stop background monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
            console.log('[Profiler] Monitoring stopped');
        }
    }
    // ==================== Private Methods ====================
    setupGCObserver() {
        try {
            const obs = new perf_hooks_1.PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'gc') {
                        this.gcStats.totalCollections++;
                        this.gcStats.totalDuration += entry.duration;
                        this.gcStats.lastCollection = {
                            type: entry.detail?.kind || 'unknown',
                            duration: entry.duration,
                            timestamp: Date.now(),
                        };
                        // Alert on long GC pause
                        if (entry.duration > 100) {
                            this.createAlert('gc_pressure', 'warning', `Long GC pause: ${entry.duration.toFixed(2)}ms`, entry.duration, 100);
                        }
                    }
                }
            });
            obs.observe({ entryTypes: ['gc'] });
        }
        catch {
            // GC observation not supported in all environments
        }
    }
    monitorEventLoopLag() {
        let lastCheck = perf_hooks_1.performance.now();
        const check = () => {
            const now = perf_hooks_1.performance.now();
            const expectedInterval = 100; // We schedule every 100ms
            const actualInterval = now - lastCheck;
            this.eventLoopLag = Math.max(0, actualInterval - expectedInterval);
            lastCheck = now;
            if (this.eventLoopLag > this.config.eventLoopLagThresholdMs) {
                this.createAlert('event_loop_lag', this.eventLoopLag > 500 ? 'critical' : 'warning', `Event loop lag: ${this.eventLoopLag.toFixed(2)}ms`, this.eventLoopLag, this.config.eventLoopLagThresholdMs);
            }
            setTimeout(check, 100);
        };
        setTimeout(check, 100);
    }
    getCpuUsage() {
        const cpus = os_1.default.cpus();
        let totalIdle = 0;
        let totalTick = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        }
        return ((totalTick - totalIdle) / totalTick) * 100;
    }
    getEventLoopUtilization() {
        try {
            const elu = perf_hooks_1.performance.eventLoopUtilization?.();
            return elu?.utilization ?? 0;
        }
        catch {
            return 0;
        }
    }
    getPercentileValue(values, percentile) {
        if (values.length === 0)
            return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }
    calculatePercentile(duration) {
        const sorted = [...this.aggregatedStats.durations].sort((a, b) => a - b);
        const index = sorted.findIndex((d) => d >= duration);
        return index === -1 ? 100 : (index / sorted.length) * 100;
    }
    recordSlowRequest(trace, percentile) {
        this.slowRequests.push({
            trace,
            threshold: this.config.slowRequestThresholdMs,
            percentile,
        });
        // Keep last 100 slow requests
        if (this.slowRequests.length > 100) {
            this.slowRequests = this.slowRequests.slice(-100);
        }
        // Create alert for very slow requests
        if (trace.duration > this.config.slowRequestThresholdMs * 3) {
            this.createAlert('slow_request', 'critical', `Very slow request: ${trace.method} ${trace.path} (${trace.duration.toFixed(2)}ms)`, trace.duration, this.config.slowRequestThresholdMs);
        }
    }
    checkHealth() {
        const metrics = this.getMetrics();
        // Check memory
        if (metrics.memory.heapUsedPercent > this.config.memoryWarningPercent) {
            this.createAlert('high_memory', metrics.memory.heapUsedPercent > 90 ? 'critical' : 'warning', `High memory usage: ${metrics.memory.heapUsedPercent.toFixed(1)}%`, metrics.memory.heapUsedPercent, this.config.memoryWarningPercent);
        }
        // Check CPU
        if (metrics.cpu.usage > this.config.cpuWarningPercent) {
            this.createAlert('high_cpu', metrics.cpu.usage > 90 ? 'critical' : 'warning', `High CPU usage: ${metrics.cpu.usage.toFixed(1)}%`, metrics.cpu.usage, this.config.cpuWarningPercent);
        }
    }
    createAlert(type, severity, message, value, threshold) {
        // Deduplicate alerts (same type within 60 seconds)
        const recentSimilar = this.alerts.find((a) => a.type === type && Date.now() - a.timestamp < 60000);
        if (recentSimilar)
            return recentSimilar;
        const alert = {
            id: crypto_1.default.randomUUID(),
            type,
            severity,
            message,
            value,
            threshold,
            timestamp: Date.now(),
        };
        this.alerts.push(alert);
        // Keep last 1000 alerts
        if (this.alerts.length > 1000) {
            this.alerts = this.alerts.slice(-1000);
        }
        console.warn(`[Profiler] ${severity.toUpperCase()}: ${message}`);
        this.persist();
        return alert;
    }
    persist() {
        saveProfilerStore({
            slowRequests: this.slowRequests,
            alerts: this.alerts,
            aggregatedStats: this.aggregatedStats,
        });
    }
}
exports.PerformanceProfiler = PerformanceProfiler;
// ==================== Singleton Export ====================
exports.performanceProfiler = new PerformanceProfiler();
const crypto_1 = __importDefault(require("crypto"));
/**
 * Express middleware for request tracing
 */
function performanceMiddleware(req, res, next) {
    const traceId = crypto_1.default.randomUUID();
    req.traceId = traceId;
    exports.performanceProfiler.startTrace(traceId, req.method, req.path);
    const originalEnd = res.end;
    res.end = function (chunk, encoding, cb) {
        exports.performanceProfiler.endTrace(traceId, res.statusCode);
        return originalEnd.call(this, chunk, encoding, cb);
    };
    next();
}
