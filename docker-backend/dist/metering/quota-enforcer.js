"use strict";
/**
 * Quota Enforcer
 * Enforces usage quotas with graceful degradation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuotaEnforcer = exports.EnforcementAction = void 0;
exports.getQuotaEnforcer = getQuotaEnforcer;
exports.resetQuotaEnforcer = resetQuotaEnforcer;
const events_1 = require("events");
const types_js_1 = require("./types.js");
const usage_aggregator_js_1 = require("./usage-aggregator.js");
const uuid_1 = require("uuid");
const index_js_1 = require("../errors/index.js");
const persistence_js_1 = require("../persistence.js");
var EnforcementAction;
(function (EnforcementAction) {
    EnforcementAction["ALLOW"] = "allow";
    EnforcementAction["WARN"] = "warn";
    EnforcementAction["THROTTLE"] = "throttle";
    EnforcementAction["BLOCK"] = "block";
})(EnforcementAction || (exports.EnforcementAction = EnforcementAction = {}));
// ==================== Quota Enforcer ====================
class QuotaEnforcer extends events_1.EventEmitter {
    config;
    aggregator;
    userConfigs = new Map();
    throttledUsers = new Map();
    alerts = [];
    alertCooldowns = new Map(); // Alert key -> last alert time
    ALERT_COOLDOWN = 3600000; // 1 hour between duplicate alerts
    THROTTLE_DURATION = 300000; // 5 minute throttle
    THROTTLE_FACTOR = 0.5; // Reduce to 50% capacity
    constructor(aggregator, config = {}) {
        super();
        this.aggregator = aggregator;
        this.config = { ...types_js_1.DEFAULT_METERING_CONFIG, ...config };
        // Load persisted data
        const stored = (0, persistence_js_1.loadStore)('quota-enforcer', { userConfigs: [], alerts: [] });
        if (stored.userConfigs.length > 0) {
            this.userConfigs = new Map(stored.userConfigs);
            console.log(`[QuotaEnforcer] Loaded ${this.userConfigs.size} persisted user configs`);
        }
        if (stored.alerts.length > 0) {
            // Restore Date objects from serialized strings
            this.alerts = stored.alerts.map(a => ({
                ...a,
                createdAt: new Date(a.createdAt),
                acknowledgedAt: a.acknowledgedAt ? new Date(a.acknowledgedAt) : undefined,
                notificationSentAt: a.notificationSentAt ? new Date(a.notificationSentAt) : undefined,
            }));
            console.log(`[QuotaEnforcer] Loaded ${this.alerts.length} persisted alerts`);
        }
    }
    saveQuotaStore() {
        (0, persistence_js_1.debouncedSave)('quota-enforcer', {
            userConfigs: Array.from(this.userConfigs.entries()),
            alerts: this.alerts,
        });
    }
    // ==================== User Configuration ====================
    /**
     * Set user's quota tier
     */
    setUserTier(userId, tier, customLimits) {
        const existing = this.userConfigs.get(userId);
        this.userConfigs.set(userId, {
            userId,
            tier,
            customLimits: customLimits || existing?.customLimits,
        });
        this.saveQuotaStore();
        console.log(`[QuotaEnforcer] Set tier '${tier}' for user ${userId}`);
    }
    /**
     * Get user's current tier
     */
    getUserTier(userId) {
        return this.userConfigs.get(userId)?.tier || 'free';
    }
    /**
     * Get effective limits for a user
     */
    getUserLimits(userId) {
        const config = this.userConfigs.get(userId);
        const tierName = config?.tier || 'free';
        const tier = types_js_1.QUOTA_TIERS[tierName] || types_js_1.FREE_TIER;
        // Merge custom limits with tier limits
        if (config?.customLimits) {
            return { ...tier.limits, ...config.customLimits };
        }
        return { ...tier.limits };
    }
    /**
     * Set custom limit override for a user
     */
    setCustomLimit(userId, metricType, limit, expiry) {
        const config = this.userConfigs.get(userId) || {
            userId,
            tier: 'free',
        };
        config.customLimits = config.customLimits || {};
        config.customLimits[metricType] = limit;
        if (expiry) {
            config.overrideExpiry = expiry;
        }
        this.userConfigs.set(userId, config);
        this.saveQuotaStore();
        console.log(`[QuotaEnforcer] Set custom limit for ${metricType}: ${limit} for user ${userId}`);
    }
    // ==================== Quota Checking ====================
    /**
     * Check if operation is allowed based on quota
     */
    checkQuota(userId, metricType, additionalUsage = 0) {
        const limits = this.getUserLimits(userId);
        const limit = limits[metricType];
        // Unlimited (-1) means always allow
        if (limit === -1) {
            return {
                action: EnforcementAction.ALLOW,
                metricType,
                currentUsage: 0,
                limit: -1,
                percentage: 0,
            };
        }
        const currentUsage = this.aggregator.getCurrentMonthUsage(userId, metricType);
        const projectedUsage = currentUsage + additionalUsage;
        const percentage = (projectedUsage / limit) * 100;
        // Check for throttling
        const throttle = this.throttledUsers.get(userId);
        if (throttle && Date.now() < throttle.until) {
            const effectiveLimit = limit * throttle.factor;
            if (projectedUsage > effectiveLimit) {
                return {
                    action: EnforcementAction.THROTTLE,
                    metricType,
                    currentUsage,
                    limit,
                    percentage,
                    message: `Rate limited. Usage will be restored at ${new Date(throttle.until).toISOString()}`,
                    retryAfter: Math.ceil((throttle.until - Date.now()) / 1000),
                };
            }
        }
        // Check thresholds
        if (percentage >= this.config.blockingThreshold) {
            this.createAlert(userId, metricType, types_js_1.AlertType.LIMIT_EXCEEDED, types_js_1.AlertSeverity.CRITICAL, percentage);
            return {
                action: EnforcementAction.BLOCK,
                metricType,
                currentUsage,
                limit,
                percentage,
                message: this.formatQuotaMessage(metricType, currentUsage, limit, 'exceeded'),
            };
        }
        if (percentage >= this.config.criticalThreshold) {
            this.applyThrottle(userId);
            this.createAlert(userId, metricType, types_js_1.AlertType.APPROACHING_LIMIT, types_js_1.AlertSeverity.CRITICAL, percentage);
            return {
                action: EnforcementAction.THROTTLE,
                metricType,
                currentUsage,
                limit,
                percentage,
                message: this.formatQuotaMessage(metricType, currentUsage, limit, 'critical'),
                retryAfter: Math.ceil(this.THROTTLE_DURATION / 1000),
            };
        }
        if (percentage >= this.config.warningThreshold) {
            this.createAlert(userId, metricType, types_js_1.AlertType.APPROACHING_LIMIT, types_js_1.AlertSeverity.WARNING, percentage);
            return {
                action: EnforcementAction.WARN,
                metricType,
                currentUsage,
                limit,
                percentage,
                message: this.formatQuotaMessage(metricType, currentUsage, limit, 'warning'),
            };
        }
        return {
            action: EnforcementAction.ALLOW,
            metricType,
            currentUsage,
            limit,
            percentage,
        };
    }
    /**
     * Enforce quota - throws error if blocked
     */
    enforceQuota(userId, metricType, additionalUsage = 0) {
        const result = this.checkQuota(userId, metricType, additionalUsage);
        if (result.action === EnforcementAction.BLOCK) {
            throw new index_js_1.AppError(index_js_1.ErrorCode.QUOTA_EXCEEDED, result.message || `${metricType} quota exceeded`, {
                details: {
                    metricType,
                    currentUsage: result.currentUsage,
                    limit: result.limit,
                    percentage: result.percentage,
                },
                canRetry: true,
                retryAfter: this.getSecondsUntilReset(),
            });
        }
        return result;
    }
    /**
     * Check multiple quotas at once
     */
    checkMultipleQuotas(userId, checks) {
        return checks.map(check => this.checkQuota(userId, check.metricType, check.additionalUsage || 0));
    }
    /**
     * Enforce multiple quotas - throws on first block
     */
    enforceMultipleQuotas(userId, checks) {
        return checks.map(check => this.enforceQuota(userId, check.metricType, check.additionalUsage || 0));
    }
    // ==================== Quota Status ====================
    /**
     * Get complete quota status for a user
     */
    getQuotaStatus(userId) {
        const tier = this.getUserTier(userId);
        const limits = this.getUserLimits(userId);
        const usage = {};
        const percentages = {};
        const remaining = {};
        const alerts = [];
        // Calculate usage for each metric
        for (const metricType of Object.values(types_js_1.MetricType)) {
            const current = this.aggregator.getCurrentMonthUsage(userId, metricType);
            const limit = limits[metricType];
            usage[metricType] = current;
            if (limit === -1) {
                percentages[metricType] = 0;
                remaining[metricType] = -1; // Unlimited
            }
            else {
                percentages[metricType] = Math.round((current / limit) * 10000) / 100;
                remaining[metricType] = Math.max(0, limit - current);
            }
        }
        // Get user's alerts
        const userAlerts = this.alerts.filter(a => a.userId === userId && !a.acknowledged);
        alerts.push(...userAlerts);
        // Determine overall status
        let status = 'healthy';
        const maxPercentage = Math.max(...Object.values(percentages).filter(p => p !== undefined));
        if (maxPercentage >= this.config.blockingThreshold) {
            status = 'blocked';
        }
        else if (this.throttledUsers.has(userId)) {
            status = 'throttled';
        }
        else if (maxPercentage >= this.config.warningThreshold) {
            status = 'warning';
        }
        // Calculate reset date (first of next month)
        const resetDate = new Date();
        resetDate.setMonth(resetDate.getMonth() + 1);
        resetDate.setDate(1);
        resetDate.setHours(0, 0, 0, 0);
        return {
            userId,
            tier,
            limits,
            usage,
            percentages,
            remaining,
            resetDate,
            alerts,
            status,
        };
        this.emit('quotaStatus', status);
    }
    // ==================== Throttling ====================
    /**
     * Apply throttling to a user
     */
    applyThrottle(userId) {
        const existing = this.throttledUsers.get(userId);
        if (!existing || Date.now() >= existing.until) {
            this.throttledUsers.set(userId, {
                until: Date.now() + this.THROTTLE_DURATION,
                factor: this.THROTTLE_FACTOR,
            });
            console.log(`[QuotaEnforcer] Applied throttle to user ${userId}`);
            this.emit('throttle', { userId, duration: this.THROTTLE_DURATION });
        }
    }
    /**
     * Remove throttle from a user
     */
    removeThrottle(userId) {
        this.throttledUsers.delete(userId);
        console.log(`[QuotaEnforcer] Removed throttle from user ${userId}`);
    }
    /**
     * Check if user is throttled
     */
    isThrottled(userId) {
        const throttle = this.throttledUsers.get(userId);
        if (!throttle)
            return false;
        if (Date.now() >= throttle.until) {
            this.throttledUsers.delete(userId);
            return false;
        }
        return true;
    }
    // ==================== Alerts ====================
    /**
     * Create a usage alert
     */
    createAlert(userId, metricType, type, severity, percentage) {
        // Check cooldown
        const alertKey = `${userId}:${metricType}:${type}`;
        const lastAlert = this.alertCooldowns.get(alertKey);
        if (lastAlert && Date.now() - lastAlert < this.ALERT_COOLDOWN) {
            return null;
        }
        const limits = this.getUserLimits(userId);
        const currentValue = this.aggregator.getCurrentMonthUsage(userId, metricType);
        const alert = {
            id: (0, uuid_1.v4)(),
            userId,
            type,
            severity,
            metricType,
            threshold: this.getThresholdForType(type),
            currentValue,
            percentage,
            message: this.formatAlertMessage(metricType, currentValue, limits[metricType], type, percentage),
            createdAt: new Date(),
            acknowledged: false,
            notificationSent: false,
        };
        this.alerts.push(alert);
        this.alertCooldowns.set(alertKey, Date.now());
        this.saveQuotaStore();
        this.emit('alert', alert);
        console.log(`[QuotaEnforcer] Created ${severity} alert for user ${userId}: ${alert.message}`);
        return alert;
    }
    /**
     * Get threshold percentage for alert type
     */
    getThresholdForType(type) {
        switch (type) {
            case types_js_1.AlertType.LIMIT_EXCEEDED:
                return this.config.blockingThreshold;
            case types_js_1.AlertType.APPROACHING_LIMIT:
                return this.config.warningThreshold;
            default:
                return 0;
        }
    }
    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = new Date();
            this.saveQuotaStore();
            return true;
        }
        return false;
    }
    /**
     * Get unacknowledged alerts for a user
     */
    getAlerts(userId) {
        return this.alerts.filter(a => a.userId === userId && !a.acknowledged);
    }
    /**
     * Mark alert as notification sent
     */
    markAlertNotified(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.notificationSent = true;
            alert.notificationSentAt = new Date();
            this.saveQuotaStore();
            return true;
        }
        return false;
    }
    // ==================== Utility Methods ====================
    /**
     * Format quota message
     */
    formatQuotaMessage(metricType, current, limit, level) {
        const formattedCurrent = this.formatMetricValue(metricType, current);
        const formattedLimit = this.formatMetricValue(metricType, limit);
        const percentage = Math.round((current / limit) * 100);
        switch (level) {
            case 'warning':
                return `${this.formatMetricName(metricType)} usage at ${percentage}% (${formattedCurrent} of ${formattedLimit})`;
            case 'critical':
                return `${this.formatMetricName(metricType)} usage critical at ${percentage}% - operations may be throttled`;
            case 'exceeded':
                return `${this.formatMetricName(metricType)} limit exceeded (${formattedCurrent} / ${formattedLimit})`;
        }
    }
    /**
     * Format alert message
     */
    formatAlertMessage(metricType, current, limit, type, percentage) {
        const formattedCurrent = this.formatMetricValue(metricType, current);
        const formattedLimit = this.formatMetricValue(metricType, limit);
        switch (type) {
            case types_js_1.AlertType.APPROACHING_LIMIT:
                return `Your ${this.formatMetricName(metricType)} usage is at ${Math.round(percentage)}% (${formattedCurrent} of ${formattedLimit}). Consider upgrading your plan.`;
            case types_js_1.AlertType.LIMIT_EXCEEDED:
                return `Your ${this.formatMetricName(metricType)} limit has been exceeded. Some operations may be blocked until your quota resets.`;
            default:
                return `${this.formatMetricName(metricType)}: ${formattedCurrent} of ${formattedLimit} (${Math.round(percentage)}%)`;
        }
    }
    /**
     * Format metric value for display
     */
    formatMetricValue(metricType, value) {
        switch (metricType) {
            case types_js_1.MetricType.STORAGE_BYTES:
            case types_js_1.MetricType.MEMORY_BYTES:
            case types_js_1.MetricType.BANDWIDTH_BYTES:
                return (0, types_js_1.formatBytes)(value);
            case types_js_1.MetricType.COMPUTE_SECONDS:
                return (0, types_js_1.formatDuration)(value);
            case types_js_1.MetricType.CONTAINER_HOURS:
                return `${value.toFixed(1)} hours`;
            case types_js_1.MetricType.BUILD_MINUTES:
            case types_js_1.MetricType.TERMINAL_MINUTES:
                return `${value.toFixed(1)} minutes`;
            case types_js_1.MetricType.API_CALLS:
                return `${value.toLocaleString()} calls`;
            default:
                return `${value} ${types_js_1.METRIC_UNITS[metricType]}`;
        }
    }
    /**
     * Format metric name for display
     */
    formatMetricName(metricType) {
        const names = {
            [types_js_1.MetricType.COMPUTE_SECONDS]: 'Compute time',
            [types_js_1.MetricType.MEMORY_BYTES]: 'Memory',
            [types_js_1.MetricType.STORAGE_BYTES]: 'Storage',
            [types_js_1.MetricType.API_CALLS]: 'API calls',
            [types_js_1.MetricType.BANDWIDTH_BYTES]: 'Bandwidth',
            [types_js_1.MetricType.CONTAINER_HOURS]: 'Container hours',
            [types_js_1.MetricType.BUILD_MINUTES]: 'Build minutes',
            [types_js_1.MetricType.TERMINAL_MINUTES]: 'Terminal time',
        };
        return names[metricType] || metricType;
    }
    /**
     * Get seconds until quota reset
     */
    getSecondsUntilReset() {
        const now = new Date();
        const reset = new Date(now);
        reset.setMonth(reset.getMonth() + 1);
        reset.setDate(1);
        reset.setHours(0, 0, 0, 0);
        return Math.ceil((reset.getTime() - now.getTime()) / 1000);
    }
    // ==================== Cleanup ====================
    /**
     * Clean up old alerts
     */
    cleanupOldAlerts(maxAge = 30 * 24 * 60 * 60 * 1000) {
        const cutoff = Date.now() - maxAge;
        const originalCount = this.alerts.length;
        this.alerts = this.alerts.filter(a => a.createdAt.getTime() > cutoff || !a.acknowledged);
        const removedCount = originalCount - this.alerts.length;
        if (removedCount > 0) {
            console.log(`[QuotaEnforcer] Cleaned up ${removedCount} old alerts`);
            this.saveQuotaStore();
        }
        return removedCount;
    }
    /**
     * Reset monthly quotas (called at start of new billing period)
     */
    resetMonthlyQuotas() {
        // Clear throttles
        this.throttledUsers.clear();
        // Clear alert cooldowns
        this.alertCooldowns.clear();
        console.log('[QuotaEnforcer] Reset monthly quotas');
        this.emit('quotaReset');
    }
}
exports.QuotaEnforcer = QuotaEnforcer;
// ==================== Singleton Factory ====================
let enforcerInstance = null;
/**
 * Get or create the quota enforcer singleton
 */
function getQuotaEnforcer(config) {
    if (!enforcerInstance) {
        const aggregator = (0, usage_aggregator_js_1.getUsageAggregator)(config);
        enforcerInstance = new QuotaEnforcer(aggregator, config);
    }
    return enforcerInstance;
}
/**
 * Reset the quota enforcer (for testing)
 */
function resetQuotaEnforcer() {
    enforcerInstance = null;
}
exports.default = QuotaEnforcer;
