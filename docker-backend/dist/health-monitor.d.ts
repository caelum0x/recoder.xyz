/**
 * Health Monitor - Advanced container health checks and monitoring
 *
 * Features:
 * - Deep health checks (HTTP, TCP, exec)
 * - Resource usage monitoring (CPU, memory, disk)
 * - Automatic unhealthy container detection
 * - Health history tracking
 * - Alerting callbacks
 *
 * Inspired by patterns from libra deployment workflow and open-lovable sandbox management
 */
import { EventEmitter } from 'events';
export interface HealthStatus {
    containerId: string;
    projectId?: string;
    status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
    checks: HealthCheckResult[];
    resources: ResourceUsage;
    lastChecked: number;
    uptimeMs: number;
    consecutiveFailures: number;
}
export interface HealthCheckResult {
    name: string;
    type: 'http' | 'tcp' | 'exec' | 'resource';
    passed: boolean;
    durationMs: number;
    message?: string;
    details?: Record<string, unknown>;
}
export interface ResourceUsage {
    cpuPercent: number;
    memoryUsedBytes: number;
    memoryLimitBytes: number;
    memoryPercent: number;
    networkRxBytes: number;
    networkTxBytes: number;
    blockReadBytes: number;
    blockWriteBytes: number;
    pidsCount: number;
}
export interface HealthCheckConfig {
    httpEndpoints?: HttpHealthCheck[];
    tcpPorts?: TcpHealthCheck[];
    execCommands?: ExecHealthCheck[];
    resourceThresholds?: ResourceThresholds;
}
export interface HttpHealthCheck {
    name: string;
    path: string;
    port: number;
    expectedStatus?: number;
    timeoutMs?: number;
}
export interface TcpHealthCheck {
    name: string;
    port: number;
    timeoutMs?: number;
}
export interface ExecHealthCheck {
    name: string;
    command: string[];
    expectedExitCode?: number;
    timeoutMs?: number;
}
export interface ResourceThresholds {
    maxCpuPercent?: number;
    maxMemoryPercent?: number;
    maxPids?: number;
}
export interface HealthMonitorConfig {
    checkIntervalMs: number;
    unhealthyThreshold: number;
    degradedThreshold: number;
    historySize: number;
    defaultTimeoutMs: number;
}
export interface ContainerHealthHistory {
    containerId: string;
    checks: Array<{
        timestamp: number;
        status: HealthStatus['status'];
        checks: HealthCheckResult[];
    }>;
}
export declare class HealthMonitor extends EventEmitter {
    private config;
    private containerConfigs;
    private healthHistory;
    private currentStatus;
    private monitoringInterval?;
    private isMonitoring;
    constructor(config?: Partial<HealthMonitorConfig>);
    /**
     * Start monitoring containers
     */
    start(): void;
    /**
     * Stop monitoring
     */
    stop(): void;
    /**
     * Register a container for health monitoring
     */
    registerContainer(containerId: string, config?: HealthCheckConfig): void;
    /**
     * Unregister a container from health monitoring
     */
    unregisterContainer(containerId: string): void;
    /**
     * Get current health status for a container
     */
    getHealthStatus(containerId: string): HealthStatus | null;
    /**
     * Get health history for a container
     */
    getHealthHistory(containerId: string): ContainerHealthHistory | null;
    /**
     * Get all unhealthy containers
     */
    getUnhealthyContainers(): HealthStatus[];
    /**
     * Get all degraded containers
     */
    getDegradedContainers(): HealthStatus[];
    /**
     * Run health check for a specific container immediately
     */
    checkContainer(containerId: string): Promise<HealthStatus>;
    /**
     * Run health checks for all registered containers
     */
    private runHealthChecks;
    /**
     * Perform comprehensive health check on a container
     */
    private performHealthCheck;
    /**
     * Get container resource usage
     */
    private getResourceUsage;
    /**
     * HTTP health check
     */
    private checkHttpEndpoint;
    /**
     * TCP port health check
     */
    private checkTcpPort;
    /**
     * Exec command health check
     */
    private checkExecCommand;
    /**
     * Resource threshold check
     */
    private checkResourceThresholds;
    /**
     * Create unhealthy status
     */
    private createUnhealthyStatus;
    /**
     * Update status and emit events
     */
    private updateStatus;
    /**
     * Record status in history
     */
    private recordHistory;
    /**
     * Get monitoring statistics
     */
    getStats(): {
        isMonitoring: boolean;
        registeredContainers: number;
        healthyContainers: number;
        degradedContainers: number;
        unhealthyContainers: number;
        unknownContainers: number;
        config: HealthMonitorConfig;
    };
    /**
     * Get all current statuses
     */
    getAllStatuses(): HealthStatus[];
    /**
     * Get recovery history - containers that transitioned from unhealthy/degraded back to healthy
     */
    getRecoveryHistory(): Array<{
        containerId: string;
        projectId?: string;
        recoveredAt: number;
        previousStatus: string;
        downtimeMs: number;
    }>;
}
export declare const healthMonitor: HealthMonitor;
export default healthMonitor;
