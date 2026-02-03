/**
 * Quota Enforcer
 * Enforces usage quotas with graceful degradation
 */

import { EventEmitter } from 'events';
import {
  MetricType,
  QuotaStatus,
  QuotaLimits,
  QuotaTier,
  QUOTA_TIERS,
  FREE_TIER,
  AlertSeverity,
  AlertType,
  UsageAlert,
  MeteringConfig,
  DEFAULT_METERING_CONFIG,
  formatBytes,
  formatDuration,
  METRIC_UNITS,
} from './types.js';
import { UsageAggregator, getUsageAggregator } from './usage-aggregator.js';
import { v4 as uuid } from 'uuid';
import { AppError, ErrorCode } from '../errors/index.js';
import { loadStore, debouncedSave } from '../persistence.js';

// ==================== Types ====================

interface UserQuotaConfig {
  userId: string;
  tier: string;
  customLimits?: Partial<QuotaLimits>;
  overrideExpiry?: Date;
}

export enum EnforcementAction {
  ALLOW = 'allow',
  WARN = 'warn',
  THROTTLE = 'throttle',
  BLOCK = 'block',
}

interface EnforcementResult {
  action: EnforcementAction;
  metricType: MetricType;
  currentUsage: number;
  limit: number;
  percentage: number;
  message?: string;
  retryAfter?: number; // seconds
}

// ==================== Quota Enforcer ====================

export class QuotaEnforcer extends EventEmitter {
  private config: MeteringConfig;
  private aggregator: UsageAggregator;
  private userConfigs: Map<string, UserQuotaConfig> = new Map();
  private throttledUsers: Map<string, { until: number; factor: number }> = new Map();
  private alerts: UsageAlert[] = [];
  private alertCooldowns: Map<string, number> = new Map(); // Alert key -> last alert time

  private readonly ALERT_COOLDOWN = 3600000; // 1 hour between duplicate alerts
  private readonly THROTTLE_DURATION = 300000; // 5 minute throttle
  private readonly THROTTLE_FACTOR = 0.5; // Reduce to 50% capacity

  constructor(aggregator: UsageAggregator, config: Partial<MeteringConfig> = {}) {
    super();
    this.aggregator = aggregator;
    this.config = { ...DEFAULT_METERING_CONFIG, ...config };

    // Load persisted data
    const stored = loadStore<{
      userConfigs: [string, UserQuotaConfig][];
      alerts: UsageAlert[];
    }>('quota-enforcer', { userConfigs: [], alerts: [] });

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

  private saveQuotaStore(): void {
    debouncedSave('quota-enforcer', {
      userConfigs: Array.from(this.userConfigs.entries()),
      alerts: this.alerts,
    });
  }

  // ==================== User Configuration ====================

  /**
   * Set user's quota tier
   */
  setUserTier(userId: string, tier: string, customLimits?: Partial<QuotaLimits>): void {
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
  getUserTier(userId: string): string {
    return this.userConfigs.get(userId)?.tier || 'free';
  }

  /**
   * Get effective limits for a user
   */
  getUserLimits(userId: string): QuotaLimits {
    const config = this.userConfigs.get(userId);
    const tierName = config?.tier || 'free';
    const tier = QUOTA_TIERS[tierName] || FREE_TIER;

    // Merge custom limits with tier limits
    if (config?.customLimits) {
      return { ...tier.limits, ...config.customLimits };
    }

    return { ...tier.limits };
  }

  /**
   * Set custom limit override for a user
   */
  setCustomLimit(userId: string, metricType: MetricType, limit: number, expiry?: Date): void {
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
  checkQuota(
    userId: string,
    metricType: MetricType,
    additionalUsage: number = 0
  ): EnforcementResult {
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
      this.createAlert(userId, metricType, AlertType.LIMIT_EXCEEDED, AlertSeverity.CRITICAL, percentage);
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
      this.createAlert(userId, metricType, AlertType.APPROACHING_LIMIT, AlertSeverity.CRITICAL, percentage);
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
      this.createAlert(userId, metricType, AlertType.APPROACHING_LIMIT, AlertSeverity.WARNING, percentage);
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
  enforceQuota(
    userId: string,
    metricType: MetricType,
    additionalUsage: number = 0
  ): EnforcementResult {
    const result = this.checkQuota(userId, metricType, additionalUsage);

    if (result.action === EnforcementAction.BLOCK) {
      throw new AppError(
        ErrorCode.QUOTA_EXCEEDED,
        result.message || `${metricType} quota exceeded`,
        {
          details: {
            metricType,
            currentUsage: result.currentUsage,
            limit: result.limit,
            percentage: result.percentage,
          },
          canRetry: true,
          retryAfter: this.getSecondsUntilReset(),
        }
      );
    }

    return result;
  }

  /**
   * Check multiple quotas at once
   */
  checkMultipleQuotas(
    userId: string,
    checks: Array<{ metricType: MetricType; additionalUsage?: number }>
  ): EnforcementResult[] {
    return checks.map(check => this.checkQuota(userId, check.metricType, check.additionalUsage || 0));
  }

  /**
   * Enforce multiple quotas - throws on first block
   */
  enforceMultipleQuotas(
    userId: string,
    checks: Array<{ metricType: MetricType; additionalUsage?: number }>
  ): EnforcementResult[] {
    return checks.map(check => this.enforceQuota(userId, check.metricType, check.additionalUsage || 0));
  }

  // ==================== Quota Status ====================

  /**
   * Get complete quota status for a user
   */
  getQuotaStatus(userId: string): QuotaStatus {
    const tier = this.getUserTier(userId);
    const limits = this.getUserLimits(userId);
    const usage: Partial<Record<MetricType, number>> = {};
    const percentages: Partial<Record<MetricType, number>> = {};
    const remaining: Partial<Record<MetricType, number>> = {};
    const alerts: UsageAlert[] = [];

    // Calculate usage for each metric
    for (const metricType of Object.values(MetricType)) {
      const current = this.aggregator.getCurrentMonthUsage(userId, metricType);
      const limit = limits[metricType];

      usage[metricType] = current;

      if (limit === -1) {
        percentages[metricType] = 0;
        remaining[metricType] = -1; // Unlimited
      } else {
        percentages[metricType] = Math.round((current / limit) * 10000) / 100;
        remaining[metricType] = Math.max(0, limit - current);
      }
    }

    // Get user's alerts
    const userAlerts = this.alerts.filter(
      a => a.userId === userId && !a.acknowledged
    );
    alerts.push(...userAlerts);

    // Determine overall status
    let status: QuotaStatus['status'] = 'healthy';
    const maxPercentage = Math.max(...Object.values(percentages).filter(p => p !== undefined) as number[]);

    if (maxPercentage >= this.config.blockingThreshold) {
      status = 'blocked';
    } else if (this.throttledUsers.has(userId)) {
      status = 'throttled';
    } else if (maxPercentage >= this.config.warningThreshold) {
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
  private applyThrottle(userId: string): void {
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
  removeThrottle(userId: string): void {
    this.throttledUsers.delete(userId);
    console.log(`[QuotaEnforcer] Removed throttle from user ${userId}`);
  }

  /**
   * Check if user is throttled
   */
  isThrottled(userId: string): boolean {
    const throttle = this.throttledUsers.get(userId);
    if (!throttle) return false;

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
  private createAlert(
    userId: string,
    metricType: MetricType,
    type: AlertType,
    severity: AlertSeverity,
    percentage: number
  ): UsageAlert | null {
    // Check cooldown
    const alertKey = `${userId}:${metricType}:${type}`;
    const lastAlert = this.alertCooldowns.get(alertKey);

    if (lastAlert && Date.now() - lastAlert < this.ALERT_COOLDOWN) {
      return null;
    }

    const limits = this.getUserLimits(userId);
    const currentValue = this.aggregator.getCurrentMonthUsage(userId, metricType);

    const alert: UsageAlert = {
      id: uuid(),
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
  private getThresholdForType(type: AlertType): number {
    switch (type) {
      case AlertType.LIMIT_EXCEEDED:
        return this.config.blockingThreshold;
      case AlertType.APPROACHING_LIMIT:
        return this.config.warningThreshold;
      default:
        return 0;
    }
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
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
  getAlerts(userId: string): UsageAlert[] {
    return this.alerts.filter(a => a.userId === userId && !a.acknowledged);
  }

  /**
   * Mark alert as notification sent
   */
  markAlertNotified(alertId: string): boolean {
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
  private formatQuotaMessage(
    metricType: MetricType,
    current: number,
    limit: number,
    level: 'warning' | 'critical' | 'exceeded'
  ): string {
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
  private formatAlertMessage(
    metricType: MetricType,
    current: number,
    limit: number,
    type: AlertType,
    percentage: number
  ): string {
    const formattedCurrent = this.formatMetricValue(metricType, current);
    const formattedLimit = this.formatMetricValue(metricType, limit);

    switch (type) {
      case AlertType.APPROACHING_LIMIT:
        return `Your ${this.formatMetricName(metricType)} usage is at ${Math.round(percentage)}% (${formattedCurrent} of ${formattedLimit}). Consider upgrading your plan.`;
      case AlertType.LIMIT_EXCEEDED:
        return `Your ${this.formatMetricName(metricType)} limit has been exceeded. Some operations may be blocked until your quota resets.`;
      default:
        return `${this.formatMetricName(metricType)}: ${formattedCurrent} of ${formattedLimit} (${Math.round(percentage)}%)`;
    }
  }

  /**
   * Format metric value for display
   */
  private formatMetricValue(metricType: MetricType, value: number): string {
    switch (metricType) {
      case MetricType.STORAGE_BYTES:
      case MetricType.MEMORY_BYTES:
      case MetricType.BANDWIDTH_BYTES:
        return formatBytes(value);
      case MetricType.COMPUTE_SECONDS:
        return formatDuration(value);
      case MetricType.CONTAINER_HOURS:
        return `${value.toFixed(1)} hours`;
      case MetricType.BUILD_MINUTES:
      case MetricType.TERMINAL_MINUTES:
        return `${value.toFixed(1)} minutes`;
      case MetricType.API_CALLS:
        return `${value.toLocaleString()} calls`;
      default:
        return `${value} ${METRIC_UNITS[metricType]}`;
    }
  }

  /**
   * Format metric name for display
   */
  private formatMetricName(metricType: MetricType): string {
    const names: Record<MetricType, string> = {
      [MetricType.COMPUTE_SECONDS]: 'Compute time',
      [MetricType.MEMORY_BYTES]: 'Memory',
      [MetricType.STORAGE_BYTES]: 'Storage',
      [MetricType.API_CALLS]: 'API calls',
      [MetricType.BANDWIDTH_BYTES]: 'Bandwidth',
      [MetricType.CONTAINER_HOURS]: 'Container hours',
      [MetricType.BUILD_MINUTES]: 'Build minutes',
      [MetricType.TERMINAL_MINUTES]: 'Terminal time',
    };
    return names[metricType] || metricType;
  }

  /**
   * Get seconds until quota reset
   */
  private getSecondsUntilReset(): number {
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
  cleanupOldAlerts(maxAge: number = 30 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAge;
    const originalCount = this.alerts.length;

    this.alerts = this.alerts.filter(
      a => a.createdAt.getTime() > cutoff || !a.acknowledged
    );

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
  resetMonthlyQuotas(): void {
    // Clear throttles
    this.throttledUsers.clear();

    // Clear alert cooldowns
    this.alertCooldowns.clear();

    console.log('[QuotaEnforcer] Reset monthly quotas');
    this.emit('quotaReset');
  }
}

// ==================== Singleton Factory ====================

let enforcerInstance: QuotaEnforcer | null = null;

/**
 * Get or create the quota enforcer singleton
 */
export function getQuotaEnforcer(config?: Partial<MeteringConfig>): QuotaEnforcer {
  if (!enforcerInstance) {
    const aggregator = getUsageAggregator(config);
    enforcerInstance = new QuotaEnforcer(aggregator, config);
  }
  return enforcerInstance;
}

/**
 * Reset the quota enforcer (for testing)
 */
export function resetQuotaEnforcer(): void {
  enforcerInstance = null;
}

export default QuotaEnforcer;
