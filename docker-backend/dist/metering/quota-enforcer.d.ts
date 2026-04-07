/**
 * Quota Enforcer
 * Enforces usage quotas with graceful degradation
 */
import { EventEmitter } from 'events';
import { MetricType, QuotaStatus, QuotaLimits, UsageAlert, MeteringConfig } from './types.js';
import { UsageAggregator } from './usage-aggregator.js';
export declare enum EnforcementAction {
    ALLOW = "allow",
    WARN = "warn",
    THROTTLE = "throttle",
    BLOCK = "block"
}
interface EnforcementResult {
    action: EnforcementAction;
    metricType: MetricType;
    currentUsage: number;
    limit: number;
    percentage: number;
    message?: string;
    retryAfter?: number;
}
export declare class QuotaEnforcer extends EventEmitter {
    private config;
    private aggregator;
    private userConfigs;
    private throttledUsers;
    private alerts;
    private alertCooldowns;
    private readonly ALERT_COOLDOWN;
    private readonly THROTTLE_DURATION;
    private readonly THROTTLE_FACTOR;
    constructor(aggregator: UsageAggregator, config?: Partial<MeteringConfig>);
    private saveQuotaStore;
    /**
     * Set user's quota tier
     */
    setUserTier(userId: string, tier: string, customLimits?: Partial<QuotaLimits>): void;
    /**
     * Get user's current tier
     */
    getUserTier(userId: string): string;
    /**
     * Get effective limits for a user
     */
    getUserLimits(userId: string): QuotaLimits;
    /**
     * Set custom limit override for a user
     */
    setCustomLimit(userId: string, metricType: MetricType, limit: number, expiry?: Date): void;
    /**
     * Check if operation is allowed based on quota
     */
    checkQuota(userId: string, metricType: MetricType, additionalUsage?: number): EnforcementResult;
    /**
     * Enforce quota - throws error if blocked
     */
    enforceQuota(userId: string, metricType: MetricType, additionalUsage?: number): EnforcementResult;
    /**
     * Check multiple quotas at once
     */
    checkMultipleQuotas(userId: string, checks: Array<{
        metricType: MetricType;
        additionalUsage?: number;
    }>): EnforcementResult[];
    /**
     * Enforce multiple quotas - throws on first block
     */
    enforceMultipleQuotas(userId: string, checks: Array<{
        metricType: MetricType;
        additionalUsage?: number;
    }>): EnforcementResult[];
    /**
     * Get complete quota status for a user
     */
    getQuotaStatus(userId: string): QuotaStatus;
    /**
     * Apply throttling to a user
     */
    private applyThrottle;
    /**
     * Remove throttle from a user
     */
    removeThrottle(userId: string): void;
    /**
     * Check if user is throttled
     */
    isThrottled(userId: string): boolean;
    /**
     * Create a usage alert
     */
    private createAlert;
    /**
     * Get threshold percentage for alert type
     */
    private getThresholdForType;
    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId: string): boolean;
    /**
     * Get unacknowledged alerts for a user
     */
    getAlerts(userId: string): UsageAlert[];
    /**
     * Mark alert as notification sent
     */
    markAlertNotified(alertId: string): boolean;
    /**
     * Format quota message
     */
    private formatQuotaMessage;
    /**
     * Format alert message
     */
    private formatAlertMessage;
    /**
     * Format metric value for display
     */
    private formatMetricValue;
    /**
     * Format metric name for display
     */
    private formatMetricName;
    /**
     * Get seconds until quota reset
     */
    private getSecondsUntilReset;
    /**
     * Clean up old alerts
     */
    cleanupOldAlerts(maxAge?: number): number;
    /**
     * Reset monthly quotas (called at start of new billing period)
     */
    resetMonthlyQuotas(): void;
}
/**
 * Get or create the quota enforcer singleton
 */
export declare function getQuotaEnforcer(config?: Partial<MeteringConfig>): QuotaEnforcer;
/**
 * Reset the quota enforcer (for testing)
 */
export declare function resetQuotaEnforcer(): void;
export default QuotaEnforcer;
