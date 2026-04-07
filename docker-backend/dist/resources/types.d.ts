/**
 * Resource Management Types
 * Defines resource limits, usage tracking, and tier configurations
 */
/**
 * Subscription tiers matching the enterprise billing module
 */
export declare enum SubscriptionTier {
    FREE = "free",
    PRO = "pro",
    ENTERPRISE = "enterprise"
}
/**
 * Container resource limits
 */
export interface ResourceLimits {
    /** CPU cores (e.g., 0.5, 1, 2, 4) */
    cpu: number;
    /** Memory in bytes */
    memory: number;
    /** Memory in human-readable format */
    memoryMB: number;
    /** Storage limit in bytes */
    storage: number;
    /** Storage in human-readable format */
    storageGB: number;
    /** Network bandwidth limit in Mbps */
    networkBandwidth: number;
    /** Maximum number of processes */
    pidsLimit: number;
    /** Execution time limit per day in minutes (0 = unlimited) */
    dailyExecutionMinutes: number;
    /** Monthly execution time limit in hours (0 = unlimited) */
    monthlyExecutionHours: number;
    /** Maximum concurrent sandboxes per user */
    maxConcurrentSandboxes: number;
    /** Whether to allow background dev server */
    allowBackgroundDevServer: boolean;
}
/**
 * Tier limits mapping - maps subscription tier to resource limits
 */
export type TierLimits = Record<SubscriptionTier, ResourceLimits>;
/**
 * Resource usage tracking for a single container/project
 */
export interface ResourceUsage {
    /** Project ID */
    projectId: string;
    /** User ID */
    userId: string;
    /** Container ID */
    containerId?: string;
    /** CPU usage percentage (0-100 per core) */
    cpuPercent: number;
    /** Memory usage in bytes */
    memoryBytes: number;
    /** Storage used in bytes */
    storageBytes: number;
    /** Network bytes sent */
    networkBytesSent: number;
    /** Network bytes received */
    networkBytesReceived: number;
    /** Container started at */
    startedAt: Date;
    /** Total execution time in seconds */
    executionSeconds: number;
    /** Last updated timestamp */
    lastUpdated: Date;
}
/**
 * User resource usage summary
 */
export interface UserResourceSummary {
    /** User ID */
    userId: string;
    /** User's subscription tier */
    tier: SubscriptionTier;
    /** Current active sandboxes count */
    activeSandboxes: number;
    /** Maximum allowed concurrent sandboxes */
    maxSandboxes: number;
    /** Total storage used across all projects (bytes) */
    totalStorageBytes: number;
    /** Storage limit (bytes) */
    storageLimit: number;
    /** Today's execution time in minutes */
    dailyExecutionMinutes: number;
    /** Daily limit in minutes (0 = unlimited) */
    dailyExecutionLimit: number;
    /** This month's execution time in hours */
    monthlyExecutionHours: number;
    /** Monthly limit in hours (0 = unlimited) */
    monthlyExecutionLimit: number;
    /** Individual project usage */
    projectUsage: ResourceUsage[];
    /** Last updated */
    lastUpdated: Date;
}
/**
 * Storage quota information for a project
 */
export interface StorageQuota {
    /** Project ID */
    projectId: string;
    /** User ID */
    userId: string;
    /** Current storage used in bytes */
    usedBytes: number;
    /** Storage limit in bytes */
    limitBytes: number;
    /** Usage percentage (0-100) */
    usagePercent: number;
    /** Warning threshold reached */
    warningThreshold: boolean;
    /** Critical threshold reached (approaching limit) */
    criticalThreshold: boolean;
    /** Last checked timestamp */
    lastChecked: Date;
}
/**
 * Execution time limits for a user
 */
export interface ExecutionLimits {
    /** User ID */
    userId: string;
    /** Tier */
    tier: SubscriptionTier;
    /** Today's used minutes */
    dailyUsedMinutes: number;
    /** Daily limit (0 = unlimited) */
    dailyLimitMinutes: number;
    /** Daily remaining minutes (-1 = unlimited) */
    dailyRemainingMinutes: number;
    /** This month's used hours */
    monthlyUsedHours: number;
    /** Monthly limit (0 = unlimited) */
    monthlyLimitHours: number;
    /** Monthly remaining hours (-1 = unlimited) */
    monthlyRemainingHours: number;
    /** Whether user is currently paused due to limit */
    isPaused: boolean;
    /** Pause reason if paused */
    pauseReason?: 'daily_limit' | 'monthly_limit';
    /** When limits reset */
    dailyResetAt: Date;
    monthlyResetAt: Date;
}
/**
 * Concurrent sandbox limit status
 */
export interface ConcurrentLimitStatus {
    /** User ID */
    userId: string;
    /** Current active sandboxes */
    activeSandboxes: number;
    /** Maximum allowed */
    maxAllowed: number;
    /** Whether limit is reached */
    limitReached: boolean;
    /** Active project IDs */
    activeProjectIds: string[];
    /** Queue position if queued (null if not queued) */
    queuePosition: number | null;
}
/**
 * Docker container configuration with resource limits
 */
export interface ContainerResourceConfig {
    /** CPU period (default: 100000) */
    CpuPeriod: number;
    /** CPU quota (CpuPeriod * cpu cores) */
    CpuQuota: number;
    /** Memory limit in bytes */
    Memory: number;
    /** Memory + Swap limit (same as Memory to disable swap) */
    MemorySwap: number;
    /** Process limit */
    PidsLimit: number;
    /** ulimits */
    Ulimits: Array<{
        Name: string;
        Soft: number;
        Hard: number;
    }>;
    /** tmpfs mounts with size limits */
    Tmpfs: Record<string, string>;
}
/**
 * Resource limit enforcement result
 */
export interface LimitEnforcementResult {
    /** Whether the operation is allowed */
    allowed: boolean;
    /** Reason for denial if not allowed */
    reason?: string;
    /** Suggested action */
    suggestedAction?: 'upgrade' | 'wait' | 'cleanup' | 'pause';
    /** Time until limit resets (if applicable) */
    resetIn?: number;
    /** Current usage details */
    usage?: {
        current: number;
        limit: number;
        unit: string;
    };
}
/**
 * Resource alert types
 */
export type ResourceAlertType = 'storage_warning' | 'storage_critical' | 'execution_warning' | 'execution_limit' | 'memory_warning' | 'concurrent_limit';
/**
 * Resource alert
 */
export interface ResourceAlert {
    /** Alert ID */
    id: string;
    /** User ID */
    userId: string;
    /** Project ID (if applicable) */
    projectId?: string;
    /** Alert type */
    type: ResourceAlertType;
    /** Alert severity */
    severity: 'warning' | 'critical' | 'error';
    /** Alert message */
    message: string;
    /** Additional details */
    details?: Record<string, unknown>;
    /** When the alert was created */
    createdAt: Date;
    /** Whether the alert has been acknowledged */
    acknowledged: boolean;
}
