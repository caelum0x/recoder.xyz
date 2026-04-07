"use strict";
/**
 * Usage Metering Types
 * Comprehensive type definitions for sandbox-as-a-service metering
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.METRIC_UNITS = exports.QUOTA_TIERS = exports.ENTERPRISE_TIER = exports.PRO_TIER = exports.FREE_TIER = exports.DEFAULT_METERING_CONFIG = exports.AlertType = exports.AlertSeverity = exports.AggregationPeriod = exports.MetricType = void 0;
exports.formatBytes = formatBytes;
exports.formatDuration = formatDuration;
// ==================== Metric Types ====================
/**
 * Types of usage metrics tracked
 */
var MetricType;
(function (MetricType) {
    MetricType["COMPUTE_SECONDS"] = "compute_seconds";
    MetricType["MEMORY_BYTES"] = "memory_bytes";
    MetricType["STORAGE_BYTES"] = "storage_bytes";
    MetricType["API_CALLS"] = "api_calls";
    MetricType["BANDWIDTH_BYTES"] = "bandwidth_bytes";
    MetricType["CONTAINER_HOURS"] = "container_hours";
    MetricType["BUILD_MINUTES"] = "build_minutes";
    MetricType["TERMINAL_MINUTES"] = "terminal_minutes";
})(MetricType || (exports.MetricType = MetricType = {}));
/**
 * Granularity of aggregation
 */
var AggregationPeriod;
(function (AggregationPeriod) {
    AggregationPeriod["MINUTE"] = "minute";
    AggregationPeriod["HOUR"] = "hour";
    AggregationPeriod["DAY"] = "day";
    AggregationPeriod["WEEK"] = "week";
    AggregationPeriod["MONTH"] = "month";
})(AggregationPeriod || (exports.AggregationPeriod = AggregationPeriod = {}));
/**
 * Alert severity levels
 */
var AlertSeverity;
(function (AlertSeverity) {
    AlertSeverity["INFO"] = "info";
    AlertSeverity["WARNING"] = "warning";
    AlertSeverity["CRITICAL"] = "critical";
})(AlertSeverity || (exports.AlertSeverity = AlertSeverity = {}));
/**
 * Alert types
 */
var AlertType;
(function (AlertType) {
    AlertType["APPROACHING_LIMIT"] = "approaching_limit";
    AlertType["LIMIT_EXCEEDED"] = "limit_exceeded";
    AlertType["ANOMALY_DETECTED"] = "anomaly_detected";
    AlertType["BILLING_THRESHOLD"] = "billing_threshold";
})(AlertType || (exports.AlertType = AlertType = {}));
/**
 * Default metering configuration
 */
exports.DEFAULT_METERING_CONFIG = {
    containerStatsInterval: 10000, // 10 seconds
    storageStatsInterval: 300000, // 5 minutes
    aggregationInterval: 60000, // 1 minute
    warningThreshold: 80,
    criticalThreshold: 90,
    blockingThreshold: 100,
    rawDataRetention: 7, // 7 days
    aggregatedDataRetention: 365, // 1 year
    batchSize: 100,
    flushInterval: 5000, // 5 seconds
};
// ==================== Predefined Quota Tiers ====================
/**
 * Free tier limits
 */
exports.FREE_TIER = {
    name: 'free',
    limits: {
        [MetricType.COMPUTE_SECONDS]: 36000, // 10 hours/month
        [MetricType.MEMORY_BYTES]: 512 * 1024 * 1024, // 512 MB
        [MetricType.STORAGE_BYTES]: 1024 * 1024 * 1024, // 1 GB
        [MetricType.API_CALLS]: 10000,
        [MetricType.BANDWIDTH_BYTES]: 5 * 1024 * 1024 * 1024, // 5 GB
        [MetricType.CONTAINER_HOURS]: 10,
        [MetricType.BUILD_MINUTES]: 100,
        [MetricType.TERMINAL_MINUTES]: 300, // 5 hours
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
exports.PRO_TIER = {
    name: 'pro',
    limits: {
        [MetricType.COMPUTE_SECONDS]: 360000, // 100 hours/month
        [MetricType.MEMORY_BYTES]: 2 * 1024 * 1024 * 1024, // 2 GB
        [MetricType.STORAGE_BYTES]: 10 * 1024 * 1024 * 1024, // 10 GB
        [MetricType.API_CALLS]: 100000,
        [MetricType.BANDWIDTH_BYTES]: 50 * 1024 * 1024 * 1024, // 50 GB
        [MetricType.CONTAINER_HOURS]: 100,
        [MetricType.BUILD_MINUTES]: 1000,
        [MetricType.TERMINAL_MINUTES]: 3000, // 50 hours
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
        basePrice: 1900, // $19.00
        overageRates: {
            [MetricType.COMPUTE_SECONDS]: 0.0001, // per second
            [MetricType.STORAGE_BYTES]: 0.00000001, // per byte
            [MetricType.API_CALLS]: 0.001, // per call
            [MetricType.BANDWIDTH_BYTES]: 0.00000001, // per byte
        },
        currency: 'USD',
    },
};
/**
 * Enterprise tier limits
 */
exports.ENTERPRISE_TIER = {
    name: 'enterprise',
    limits: {
        [MetricType.COMPUTE_SECONDS]: -1, // Unlimited
        [MetricType.MEMORY_BYTES]: 8 * 1024 * 1024 * 1024, // 8 GB
        [MetricType.STORAGE_BYTES]: 100 * 1024 * 1024 * 1024, // 100 GB
        [MetricType.API_CALLS]: -1, // Unlimited
        [MetricType.BANDWIDTH_BYTES]: -1, // Unlimited
        [MetricType.CONTAINER_HOURS]: -1, // Unlimited
        [MetricType.BUILD_MINUTES]: -1, // Unlimited
        [MetricType.TERMINAL_MINUTES]: -1, // Unlimited
    },
    features: {
        maxConcurrentContainers: 10,
        maxProjects: -1, // Unlimited
        customDomains: true,
        prioritySupport: true,
        advancedAnalytics: true,
        teamMembers: -1, // Unlimited
        retention: 365,
    },
    pricing: {
        basePrice: 9900, // $99.00
        overageRates: {},
        currency: 'USD',
    },
};
/**
 * Map of all tiers
 */
exports.QUOTA_TIERS = {
    free: exports.FREE_TIER,
    pro: exports.PRO_TIER,
    enterprise: exports.ENTERPRISE_TIER,
};
// ==================== Utility Types ====================
/**
 * Unit conversions
 */
exports.METRIC_UNITS = {
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
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
/**
 * Format seconds to human-readable string
 */
function formatDuration(seconds) {
    if (seconds < 60)
        return `${seconds}s`;
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}
