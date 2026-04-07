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
export interface RequestMetric {
    endpoint: string;
    method: string;
    statusCode: number;
    durationMs: number;
    timestamp: number;
}
export interface FileOperationMetric {
    operation: 'read' | 'write' | 'delete' | 'rename' | 'batch_write';
    projectId: string;
    success: boolean;
    durationMs: number;
    timestamp: number;
    fileCount?: number;
}
export interface ErrorMetric {
    type: string;
    message: string;
    endpoint?: string;
    statusCode?: number;
    timestamp: number;
}
export interface MetricsSummary {
    uptime: number;
    uptimeHuman: string;
    timestamp: string;
    requests: {
        total: number;
        byEndpoint: Record<string, number>;
        byMethod: Record<string, number>;
        byStatusCode: Record<string, number>;
        responseTimes: {
            p50: number;
            p95: number;
            p99: number;
            avg: number;
            min: number;
            max: number;
        };
    };
    fileOperations: {
        total: number;
        byOperation: Record<string, number>;
        successCount: number;
        errorCount: number;
        avgDurationMs: number;
    };
    errors: {
        total: number;
        byType: Record<string, number>;
        recent: Array<{
            type: string;
            message: string;
            timestamp: string;
        }>;
    };
    memory: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
        heapUsedMB: number;
        heapTotalMB: number;
        rssMB: number;
    };
}
declare class MetricsCollector {
    private startTime;
    private requestSamples;
    private requestCounts;
    private fileOpSamples;
    private fileOpCounts;
    private errors;
    private errorCounts;
    private cleanupInterval;
    constructor();
    /**
     * Record a completed request
     */
    recordRequest(metric: Omit<RequestMetric, 'timestamp'>): void;
    /**
     * Normalize endpoint for grouping (remove dynamic IDs)
     */
    private normalizeEndpoint;
    /**
     * Record a file operation
     */
    recordFileOperation(metric: Omit<FileOperationMetric, 'timestamp'>): void;
    /**
     * Record an error
     */
    recordError(metric: Omit<ErrorMetric, 'timestamp'>): void;
    /**
     * Calculate percentile from sorted array
     */
    private percentile;
    /**
     * Get response time percentiles
     */
    private getResponseTimeStats;
    /**
     * Get comprehensive metrics summary
     */
    getSummary(): MetricsSummary;
    /**
     * Get metrics in Prometheus text format
     */
    getPrometheusFormat(): string;
    /**
     * Start periodic cleanup of old data
     */
    private startCleanup;
    /**
     * Clean up old error data
     */
    private cleanup;
    /**
     * Reset all metrics (useful for testing)
     */
    reset(): void;
    /**
     * Shutdown cleanup
     */
    shutdown(): void;
}
import type { Request, Response, NextFunction } from 'express';
/**
 * Express middleware to track request metrics
 * Adds response time tracking and records metrics on response finish
 */
export declare function metricsMiddleware(collector: MetricsCollector): (req: Request, res: Response, next: NextFunction) => void;
export declare const metricsCollector: MetricsCollector;
export default metricsCollector;
