/**
 * Usage Metering Types
 * Comprehensive type definitions for sandbox-as-a-service metering
 */

// ==================== Metric Types ====================

/**
 * Types of usage metrics tracked
 */
export enum MetricType {
  COMPUTE_SECONDS = 'compute_seconds',     // Container CPU time
  MEMORY_BYTES = 'memory_bytes',           // Peak memory usage
  STORAGE_BYTES = 'storage_bytes',         // Project storage
  API_CALLS = 'api_calls',                 // API request count
  BANDWIDTH_BYTES = 'bandwidth_bytes',     // Network I/O
  CONTAINER_HOURS = 'container_hours',     // Container uptime
  BUILD_MINUTES = 'build_minutes',         // Build/install time
  TERMINAL_MINUTES = 'terminal_minutes',   // Terminal session time
}

/**
 * Granularity of aggregation
 */
export enum AggregationPeriod {
  MINUTE = 'minute',
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

/**
 * Alert types
 */
export enum AlertType {
  APPROACHING_LIMIT = 'approaching_limit',
  LIMIT_EXCEEDED = 'limit_exceeded',
  ANOMALY_DETECTED = 'anomaly_detected',
  BILLING_THRESHOLD = 'billing_threshold',
}

// ==================== Core Types ====================

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

// ==================== Quota Types ====================

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
  [MetricType.COMPUTE_SECONDS]: number;    // Per month
  [MetricType.MEMORY_BYTES]: number;       // Peak allowed
  [MetricType.STORAGE_BYTES]: number;      // Total storage
  [MetricType.API_CALLS]: number;          // Per month
  [MetricType.BANDWIDTH_BYTES]: number;    // Per month
  [MetricType.CONTAINER_HOURS]: number;    // Per month
  [MetricType.BUILD_MINUTES]: number;      // Per month
  [MetricType.TERMINAL_MINUTES]: number;   // Per month
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
  retention: number; // Days of data retention
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

// ==================== Container Stats Types ====================

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

// ==================== Billing Types ====================

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

// ==================== Event Types ====================

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

// ==================== Configuration Types ====================

/**
 * Metering configuration
 */
export interface MeteringConfig {
  // Collection intervals
  containerStatsInterval: number;    // ms
  storageStatsInterval: number;      // ms
  aggregationInterval: number;       // ms

  // Alert thresholds
  warningThreshold: number;          // percentage (e.g., 80)
  criticalThreshold: number;         // percentage (e.g., 90)
  blockingThreshold: number;         // percentage (e.g., 100)

  // Data retention
  rawDataRetention: number;          // days
  aggregatedDataRetention: number;   // days

  // Batching
  batchSize: number;
  flushInterval: number;             // ms
}

/**
 * Default metering configuration
 */
export const DEFAULT_METERING_CONFIG: MeteringConfig = {
  containerStatsInterval: 10000,     // 10 seconds
  storageStatsInterval: 300000,      // 5 minutes
  aggregationInterval: 60000,        // 1 minute

  warningThreshold: 80,
  criticalThreshold: 90,
  blockingThreshold: 100,

  rawDataRetention: 7,               // 7 days
  aggregatedDataRetention: 365,      // 1 year

  batchSize: 100,
  flushInterval: 5000,               // 5 seconds
};

// ==================== Predefined Quota Tiers ====================

/**
 * Free tier limits
 */
export const FREE_TIER: QuotaTier = {
  name: 'free',
  limits: {
    [MetricType.COMPUTE_SECONDS]: 36000,      // 10 hours/month
    [MetricType.MEMORY_BYTES]: 512 * 1024 * 1024,  // 512 MB
    [MetricType.STORAGE_BYTES]: 1024 * 1024 * 1024, // 1 GB
    [MetricType.API_CALLS]: 10000,
    [MetricType.BANDWIDTH_BYTES]: 5 * 1024 * 1024 * 1024, // 5 GB
    [MetricType.CONTAINER_HOURS]: 10,
    [MetricType.BUILD_MINUTES]: 100,
    [MetricType.TERMINAL_MINUTES]: 300,       // 5 hours
  },
  features: {
    maxConcurrentContainers: 1,
    maxProjects: 3,
    customDomains: false,
    prioritySupport: false,
    advancedAnalytics: false,
    teamMembers: 1,
    retention: 7,
  },
};

/**
 * Pro tier limits
 */
export const PRO_TIER: QuotaTier = {
  name: 'pro',
  limits: {
    [MetricType.COMPUTE_SECONDS]: 360000,     // 100 hours/month
    [MetricType.MEMORY_BYTES]: 2 * 1024 * 1024 * 1024,  // 2 GB
    [MetricType.STORAGE_BYTES]: 10 * 1024 * 1024 * 1024, // 10 GB
    [MetricType.API_CALLS]: 100000,
    [MetricType.BANDWIDTH_BYTES]: 50 * 1024 * 1024 * 1024, // 50 GB
    [MetricType.CONTAINER_HOURS]: 100,
    [MetricType.BUILD_MINUTES]: 1000,
    [MetricType.TERMINAL_MINUTES]: 3000,      // 50 hours
  },
  features: {
    maxConcurrentContainers: 3,
    maxProjects: 20,
    customDomains: true,
    prioritySupport: true,
    advancedAnalytics: true,
    teamMembers: 5,
    retention: 30,
  },
  pricing: {
    basePrice: 1900,  // $19.00
    overageRates: {
      [MetricType.COMPUTE_SECONDS]: 0.0001,   // per second
      [MetricType.STORAGE_BYTES]: 0.00000001, // per byte
      [MetricType.API_CALLS]: 0.001,          // per call
      [MetricType.BANDWIDTH_BYTES]: 0.00000001, // per byte
    },
    currency: 'USD',
  },
};

/**
 * Enterprise tier limits
 */
export const ENTERPRISE_TIER: QuotaTier = {
  name: 'enterprise',
  limits: {
    [MetricType.COMPUTE_SECONDS]: -1,         // Unlimited
    [MetricType.MEMORY_BYTES]: 8 * 1024 * 1024 * 1024,  // 8 GB
    [MetricType.STORAGE_BYTES]: 100 * 1024 * 1024 * 1024, // 100 GB
    [MetricType.API_CALLS]: -1,               // Unlimited
    [MetricType.BANDWIDTH_BYTES]: -1,         // Unlimited
    [MetricType.CONTAINER_HOURS]: -1,         // Unlimited
    [MetricType.BUILD_MINUTES]: -1,           // Unlimited
    [MetricType.TERMINAL_MINUTES]: -1,        // Unlimited
  },
  features: {
    maxConcurrentContainers: 10,
    maxProjects: -1,  // Unlimited
    customDomains: true,
    prioritySupport: true,
    advancedAnalytics: true,
    teamMembers: -1,  // Unlimited
    retention: 365,
  },
  pricing: {
    basePrice: 9900,  // $99.00
    overageRates: {},
    currency: 'USD',
  },
};

/**
 * Map of all tiers
 */
export const QUOTA_TIERS: Record<string, QuotaTier> = {
  free: FREE_TIER,
  pro: PRO_TIER,
  enterprise: ENTERPRISE_TIER,
};

// ==================== Utility Types ====================

/**
 * Unit conversions
 */
export const METRIC_UNITS: Record<MetricType, string> = {
  [MetricType.COMPUTE_SECONDS]: 'seconds',
  [MetricType.MEMORY_BYTES]: 'bytes',
  [MetricType.STORAGE_BYTES]: 'bytes',
  [MetricType.API_CALLS]: 'calls',
  [MetricType.BANDWIDTH_BYTES]: 'bytes',
  [MetricType.CONTAINER_HOURS]: 'hours',
  [MetricType.BUILD_MINUTES]: 'minutes',
  [MetricType.TERMINAL_MINUTES]: 'minutes',
};

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
