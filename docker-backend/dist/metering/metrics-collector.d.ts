/**
 * Metrics Collector
 * Collects usage metrics from Docker containers and projects
 */
import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { MetricType, UsageMetric, ContainerStats, StorageStats, MeteringConfig, MetricEventHandler } from './types.js';
interface ContainerInfo {
    containerId: string;
    projectId: string;
    userId: string;
    startTime: Date;
}
interface CollectorState {
    isRunning: boolean;
    lastCollectionTime: number;
    totalMetricsCollected: number;
    errors: number;
}
export declare class MetricsCollector extends EventEmitter {
    private docker;
    private config;
    private state;
    private trackedContainers;
    private metricsBuffer;
    private containerStatsInterval?;
    private storageStatsInterval?;
    private flushInterval?;
    private apiCallCounts;
    private bandwidthCounts;
    constructor(docker: Docker, config?: Partial<MeteringConfig>);
    /**
     * Start the metrics collector
     */
    start(): void;
    /**
     * Stop the metrics collector
     */
    stop(): void;
    /**
     * Get collector state
     */
    getState(): CollectorState;
    /**
     * Register a container for tracking
     */
    trackContainer(containerId: string, projectId: string, userId: string): void;
    /**
     * Unregister a container from tracking
     */
    untrackContainer(containerId: string): void;
    /**
     * Get tracked container info
     */
    getTrackedContainers(): ContainerInfo[];
    /**
     * Collect stats from all tracked containers
     */
    private collectContainerStats;
    /**
     * Get stats for a single container
     */
    private getContainerStats;
    /**
     * Process container stats and emit metrics
     */
    private processContainerStats;
    /**
     * Collect storage stats for all users
     */
    private collectStorageStats;
    /**
     * Collect storage stats for a specific project
     */
    collectProjectStorageStats(userId: string, projectId: string): Promise<StorageStats | null>;
    /**
     * Record an API call for a user
     */
    recordApiCall(userId: string, endpoint?: string): void;
    /**
     * Get API call count for a user
     */
    getApiCallCount(userId: string): number;
    /**
     * Reset API call counts (called at period end)
     */
    resetApiCallCounts(): void;
    /**
     * Record a metric directly
     */
    recordMetric(params: {
        userId: string;
        projectId?: string;
        containerId?: string;
        metricType: MetricType;
        value: number;
        metadata?: Record<string, unknown>;
    }): UsageMetric;
    /**
     * Record terminal usage
     */
    recordTerminalUsage(userId: string, projectId: string, durationSeconds: number): void;
    /**
     * Record build time
     */
    recordBuildTime(userId: string, projectId: string, durationSeconds: number): void;
    /**
     * Record container uptime
     */
    recordContainerUptime(userId: string, projectId: string, containerId: string, hours: number): void;
    /**
     * Flush metrics buffer and emit for storage
     */
    flushMetricsBuffer(): UsageMetric[];
    /**
     * Get current buffer size
     */
    getBufferSize(): number;
    /**
     * Register a handler for metric events
     */
    onMetric(handler: MetricEventHandler): void;
    /**
     * Register a handler for metrics flush events
     */
    onMetricsFlush(handler: (metrics: UsageMetric[]) => void): void;
    /**
     * Register a handler for container stats events
     */
    onContainerStats(handler: (stats: ContainerStats) => void): void;
    /**
     * Register a handler for storage stats events
     */
    onStorageStats(handler: (stats: StorageStats) => void): void;
}
/**
 * Get or create the metrics collector singleton
 */
export declare function getMetricsCollector(docker?: Docker, config?: Partial<MeteringConfig>): MetricsCollector;
/**
 * Reset the metrics collector (for testing)
 */
export declare function resetMetricsCollector(): void;
export default MetricsCollector;
