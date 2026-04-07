/**
 * Resource Optimizer - Auto-scale resources based on usage patterns
 *
 * Features:
 * - Dynamic resource allocation based on usage
 * - Automatic scaling of memory and CPU limits
 * - Resource usage prediction
 * - Cost optimization recommendations
 * - Load balancing across containers
 *
 * Inspired by patterns from libra deployment workflow and dyad performance monitoring
 */
import { EventEmitter } from 'events';
export interface ResourceProfile {
    containerId: string;
    projectId?: string;
    samples: ResourceSample[];
    predictions: ResourcePrediction;
    recommendations: ResourceRecommendation[];
    lastOptimized: number;
}
export interface ResourceSample {
    timestamp: number;
    cpuPercent: number;
    memoryPercent: number;
    memoryUsedBytes: number;
    networkRxBytesPerSec: number;
    networkTxBytesPerSec: number;
    pidsCount: number;
}
export interface ResourcePrediction {
    peakCpuPercent: number;
    peakMemoryPercent: number;
    avgCpuPercent: number;
    avgMemoryPercent: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    confidence: number;
}
export interface ResourceRecommendation {
    type: 'scale-up' | 'scale-down' | 'optimize' | 'warning';
    resource: 'cpu' | 'memory' | 'pids' | 'network';
    currentValue: number;
    recommendedValue: number;
    reason: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    estimatedSavings?: number;
}
export interface ScalingPolicy {
    minMemoryBytes: number;
    maxMemoryBytes: number;
    minCpuQuota: number;
    maxCpuQuota: number;
    scaleUpThreshold: number;
    scaleDownThreshold: number;
    cooldownPeriodMs: number;
    scaleStepPercent: number;
}
export interface OptimizerConfig {
    sampleIntervalMs: number;
    sampleRetentionMs: number;
    optimizationIntervalMs: number;
    predictionWindowMs: number;
    defaultPolicy: ScalingPolicy;
}
export interface OptimizationResult {
    containerId: string;
    action: 'scaled-up' | 'scaled-down' | 'no-change';
    changes: Array<{
        resource: string;
        previousValue: number;
        newValue: number;
    }>;
    reason: string;
}
declare class ResourceOptimizer extends EventEmitter {
    private config;
    private profiles;
    private policies;
    private lastScalingAction;
    private sampleInterval?;
    private optimizationInterval?;
    private isRunning;
    private previousNetworkStats;
    constructor(config?: Partial<OptimizerConfig>);
    /**
     * Start the resource optimizer
     */
    start(): void;
    /**
     * Stop the resource optimizer
     */
    stop(): void;
    /**
     * Register a container for optimization
     */
    registerContainer(containerId: string, policy?: Partial<ScalingPolicy>): void;
    /**
     * Unregister a container
     */
    unregisterContainer(containerId: string): void;
    /**
     * Get resource profile for a container
     */
    getProfile(containerId: string): ResourceProfile | null;
    /**
     * Get recommendations for a container
     */
    getRecommendations(containerId: string): ResourceRecommendation[];
    /**
     * Manually trigger optimization for a container
     */
    optimize(containerId: string): Promise<OptimizationResult>;
    /**
     * Collect resource samples from all registered containers
     */
    private collectSamples;
    /**
     * Get a resource sample from a container
     */
    private getSample;
    /**
     * Add a sample to a container's profile
     */
    private addSample;
    /**
     * Process health status from health monitor
     */
    private processHealthStatus;
    /**
     * Update predictions based on samples
     */
    private updatePredictions;
    /**
     * Calculate slope for trend detection
     */
    private calculateSlope;
    /**
     * Calculate variance
     */
    private calculateVariance;
    /**
     * Run optimization for all registered containers
     */
    private runOptimization;
    /**
     * Generate recommendations for a container
     */
    private generateRecommendations;
    /**
     * Optimize a container based on policy and recommendations
     */
    private optimizeContainer;
    /**
     * Get optimizer statistics
     */
    getStats(): {
        isRunning: boolean;
        registeredContainers: number;
        totalSamples: number;
        totalRecommendations: number;
        config: OptimizerConfig;
    };
    /**
     * Get all profiles
     */
    getAllProfiles(): ResourceProfile[];
}
export declare const resourceOptimizer: ResourceOptimizer;
export default resourceOptimizer;
