/**
 * Usage Metering Types
 * Comprehensive type definitions for sandbox-as-a-service metering
 */
/**
 * Types of usage metrics tracked
 */
export declare enum MetricType {
    COMPUTE_SECONDS = "compute_seconds",// Container CPU time
    MEMORY_BYTES = "memory_bytes",// Peak memory usage
    STORAGE_BYTES = "storage_bytes",// Project storage
    API_CALLS = "api_calls",// API request count
    BANDWIDTH_BYTES = "bandwidth_bytes",// Network I/O
    CONTAINER_HOURS = "container_hours",// Container uptime
    BUILD_MINUTES = "build_minutes",// Build/install time
    TERMINAL_MINUTES = "terminal_minutes"
}
/**
 * Granularity of aggregation
 */
export declare enum AggregationPeriod {
    MINUTE = "minute",
    HOUR = "hour",
    DAY = "day",
    WEEK = "week",
    MONTH = "month"
}
/**
 * Alert severity levels
 */
export declare enum AlertSeverity {
    INFO = "info",
    WARNING = "warning",
    CRITICAL = "critical"
}
/**
 * Alert types
 */
export declare enum AlertType {
    APPROACHING_LIMIT = "approaching_limit",
    LIMIT_EXCEEDED = "limit_exceeded",
    ANOMALY_DETECTED = "anomaly_detected",
    BILLING_THRESHOLD = "billing_threshold"
}
/**
 * Individual usage metric data point
 */
export interface UsageMetric {
    id: string;
    userId: string;
    projectId?: string;
    containerId?: string;
    metricType: MetricType;
    value: number;
    unit: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}
/**
 * Usage record for persistence
 */
export interface UsageRecord {
    id: string;
    userId: string;
    projectId?: string;
    metricType: MetricType;
    value: number;
    periodStart: Date;
    periodEnd: Date;
    aggregationPeriod: AggregationPeriod;
    createdAt: Date;
    metadata?: Record<string, unknown>;
}
/**
 * Aggregated usage summary
 */
export interface UsageSummary {
    userId: string;
    periodStart: Date;
    periodEnd: Date;
    metrics: {
        [K in MetricType]?: {
            total: number;
            average: number;
            peak: number;
            unit: string;
        };
    };
    breakdown: {
        byProject: Map<string, Partial<Record<MetricType, number>>>;
        byDay: Map<string, Partial<Record<MetricType, number>>>;
    };
    estimatedCost?: number;
    currency?: string;
}
/**
 * Usage alert
 */
export interface UsageAlert {
    id: string;
    userId: string;
    projectId?: string;
    type: AlertType;
    severity: AlertSeverity;
    metricType: MetricType;
    threshold: number;
    currentValue: number;
    percentage: number;
    message: string;
    createdAt: Date;
    acknowledged: boolean;
    acknowledgedAt?: Date;
    notificationSent: boolean;
    notificationSentAt?: Date;
}
/**
 * Quota tier configuration
 */
export interface QuotaTier {
    name: string;
    limits: QuotaLimits;
    features: QuotaFeatures;
    pricing?: {
        basePrice: number;
        overageRates: Partial<Record<MetricType, number>>;
        currency: string;
    };
}
/**
 * Quota limits for a user/organization
 */
export interface QuotaLimits {
    [MetricType.COMPUTE_SECONDS]: number;
    [MetricType.MEMORY_BYTES]: number;
    [MetricType.STORAGE_BYTES]: number;
    [MetricType.API_CALLS]: number;
    [MetricType.BANDWIDTH_BYTES]: number;
    [MetricType.CONTAINER_HOURS]: number;
    [MetricType.BUILD_MINUTES]: number;
    [MetricType.TERMINAL_MINUTES]: number;
}
/**
 * Feature flags based on quota tier
 */
export interface QuotaFeatures {
    maxConcurrentContainers: number;
    maxProjects: number;
    customDomains: boolean;
    prioritySupport: boolean;
    advancedAnalytics: boolean;
    teamMembers: number;
    retention: number;
}
/**
 * Current quota status for a user
 */
export interface QuotaStatus {
    userId: string;
    tier: string;
    limits: QuotaLimits;
    usage: Partial<Record<MetricType, number>>;
    percentages: Partial<Record<MetricType, number>>;
    remaining: Partial<Record<MetricType, number>>;
    resetDate: Date;
    alerts: UsageAlert[];
    status: 'healthy' | 'warning' | 'throttled' | 'blocked';
}
/**
 * Docker container statistics
 */
export interface ContainerStats {
    containerId: string;
    projectId: string;
    userId: string;
    timestamp: Date;
    cpu: {
        usagePercent: number;
        totalUsage: number;
        systemUsage: number;
        onlineCpus: number;
    };
    memory: {
        usage: number;
        limit: number;
        usagePercent: number;
        maxUsage: number;
    };
    network: {
        rxBytes: number;
        txBytes: number;
        rxPackets: number;
        txPackets: number;
    };
    blockIO: {
        readBytes: number;
        writeBytes: number;
    };
    pids: number;
}
/**
 * Storage statistics for a project
 */
export interface StorageStats {
    projectId: string;
    userId: string;
    timestamp: Date;
    totalBytes: number;
    fileCount: number;
    largestFiles: Array<{
        path: string;
        size: number;
    }>;
}
/**
 * Billing period summary
 */
export interface BillingPeriod {
    userId: string;
    periodStart: Date;
    periodEnd: Date;
    usage: UsageSummary;
    charges: BillingCharge[];
    totalAmount: number;
    currency: string;
    status: 'pending' | 'invoiced' | 'paid' | 'overdue';
}
/**
 * Individual billing charge
 */
export interface BillingCharge {
    metricType: MetricType;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    amount: number;
    isOverage: boolean;
}
/**
 * Metering event for real-time processing
 */
export interface MeteringEvent {
    type: 'metric' | 'alert' | 'quota_check';
    timestamp: Date;
    data: UsageMetric | UsageAlert | QuotaStatus;
}
/**
 * Callback types for event handling
 */
export type MetricEventHandler = (metric: UsageMetric) => void | Promise<void>;
export type AlertEventHandler = (alert: UsageAlert) => void | Promise<void>;
export type QuotaEventHandler = (status: QuotaStatus) => void | Promise<void>;
/**
 * Metering configuration
 */
export interface MeteringConfig {
    containerStatsInterval: number;
    storageStatsInterval: number;
    aggregationInterval: number;
    warningThreshold: number;
    criticalThreshold: number;
    blockingThreshold: number;
    rawDataRetention: number;
    aggregatedDataRetention: number;
    batchSize: number;
    flushInterval: number;
}
/**
 * Default metering configuration
 */
export declare const DEFAULT_METERING_CONFIG: MeteringConfig;
/**
 * Free tier limits
 */
export declare const FREE_TIER: QuotaTier;
/**
 * Pro tier limits
 */
export declare const PRO_TIER: QuotaTier;
/**
 * Enterprise tier limits
 */
export declare const ENTERPRISE_TIER: QuotaTier;
/**
 * Map of all tiers
 */
export declare const QUOTA_TIERS: Record<string, QuotaTier>;
/**
 * Unit conversions
 */
export declare const METRIC_UNITS: Record<MetricType, string>;
/**
 * Format bytes to human-readable string
 */
export declare function formatBytes(bytes: number): string;
/**
 * Format seconds to human-readable string
 */
export declare function formatDuration(seconds: number): string;
