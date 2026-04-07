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
import v8 from 'v8';
export interface RequestTrace {
    id: string;
    method: string;
    path: string;
    startedAt: number;
    duration: number;
    statusCode?: number;
    error?: string;
    spans: TraceSpan[];
    metadata?: Record<string, unknown>;
}
export interface TraceSpan {
    name: string;
    startedAt: number;
    duration: number;
    metadata?: Record<string, unknown>;
}
export interface PerformanceMetrics {
    requests: {
        total: number;
        last5Minutes: number;
        avgDuration: number;
        p50Duration: number;
        p95Duration: number;
        p99Duration: number;
        slowRequests: number;
    };
    memory: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
        heapUsedPercent: number;
    };
    cpu: {
        usage: number;
        loadAverage: number[];
    };
    gc?: {
        totalCollections: number;
        totalDuration: number;
        lastCollection?: {
            type: string;
            duration: number;
            timestamp: number;
        };
    };
    eventLoop: {
        lag: number;
        utilization: number;
    };
}
export interface SlowRequest {
    trace: RequestTrace;
    threshold: number;
    percentile: number;
}
export interface PerformanceAlert {
    id: string;
    type: 'slow_request' | 'high_memory' | 'high_cpu' | 'gc_pressure' | 'event_loop_lag';
    severity: 'warning' | 'critical';
    message: string;
    value: number;
    threshold: number;
    timestamp: number;
}
interface ProfilerConfig {
    /** Enable request tracing */
    tracingEnabled: boolean;
    /** Slow request threshold (ms) */
    slowRequestThresholdMs: number;
    /** Max traces to keep in memory */
    maxTraces: number;
    /** Memory warning threshold (percentage) */
    memoryWarningPercent: number;
    /** CPU warning threshold (percentage) */
    cpuWarningPercent: number;
    /** Event loop lag threshold (ms) */
    eventLoopLagThresholdMs: number;
    /** Sampling rate for tracing (0-1) */
    samplingRate: number;
}
declare class PerformanceProfiler {
    private config;
    private traces;
    private slowRequests;
    private alerts;
    private aggregatedStats;
    private activeSpans;
    private lastCpuUsage?;
    private gcStats;
    private eventLoopLag;
    private monitoringInterval?;
    constructor(config?: Partial<ProfilerConfig>);
    /**
     * Start tracing a request
     */
    startTrace(id: string, method: string, path: string): void;
    /**
     * Start a span within a trace
     */
    startSpan(traceId: string, spanName: string): void;
    /**
     * End a span within a trace
     */
    endSpan(traceId: string, spanName: string, metadata?: Record<string, unknown>): void;
    /**
     * End a request trace
     */
    endTrace(id: string, statusCode?: number, error?: string, metadata?: Record<string, unknown>): RequestTrace | undefined;
    /**
     * Get current performance metrics
     */
    getMetrics(): PerformanceMetrics;
    /**
     * Get slow requests
     */
    getSlowRequests(limit?: number): SlowRequest[];
    /**
     * Get performance alerts
     */
    getAlerts(limit?: number): PerformanceAlert[];
    /**
     * Get recent traces
     */
    getTraces(limit?: number): RequestTrace[];
    /**
     * Get V8 heap statistics
     */
    getHeapStats(): v8.HeapInfo;
    /**
     * Start background monitoring
     */
    startMonitoring(): void;
    /**
     * Stop background monitoring
     */
    stopMonitoring(): void;
    private setupGCObserver;
    private monitorEventLoopLag;
    private getCpuUsage;
    private getEventLoopUtilization;
    private getPercentileValue;
    private calculatePercentile;
    private recordSlowRequest;
    private checkHealth;
    private createAlert;
    private persist;
}
export declare const performanceProfiler: PerformanceProfiler;
import type { Request, Response, NextFunction } from 'express';
/**
 * Express middleware for request tracing
 */
export declare function performanceMiddleware(req: Request, res: Response, next: NextFunction): void;
export { PerformanceProfiler };
