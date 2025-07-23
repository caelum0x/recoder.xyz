/**
 * Alert Management & Orchestration System
 * 
 * Central alert management with intelligent routing, deduplication,
 * escalation policies, and multi-channel notifications.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';
import { NotificationService } from './notification-service';
import { EscalationPolicies } from './escalation-policies';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  source: string;           // Which component generated the alert
  modelName?: string;
  provider?: string;
  timestamp: Date;
  data?: Record<string, any>; // Additional context data
  tags: string[];
  fingerprint: string;      // For deduplication
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNote?: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  suppressedUntil?: Date;
}

export enum AlertType {
  AVAILABILITY = 'availability',
  LATENCY = 'latency',
  ERROR_RATE = 'error_rate',
  COST = 'cost',
  BUDGET = 'budget',
  PREDICTIVE = 'predictive',
  CIRCUIT_BREAKER = 'circuit_breaker',
  HEALTH_DEGRADATION = 'health_degradation',
  PATTERN_DETECTION = 'pattern_detection',
  SYSTEM = 'system'
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  type: AlertType;
  severity: AlertSeverity;
  enabled: boolean;
  conditions: AlertCondition[];
  suppressions: AlertSuppression[];
  escalationPolicyId?: string;
  notificationChannels: string[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'contains' | 'matches';
  threshold: number | string;
  duration: number;         // How long condition must be true (seconds)
  aggregation?: 'avg' | 'sum' | 'max' | 'min' | 'count';
}

export interface AlertSuppression {
  type: 'time_window' | 'dependency' | 'maintenance' | 'manual';
  startTime?: Date;
  endTime?: Date;
  dependsOn?: string[];     // Alert IDs this depends on
  reason?: string;
}

export interface AlertStatistics {
  total: number;
  byType: Record<AlertType, number>;
  bySeverity: Record<AlertSeverity, number>;
  resolved: number;
  acknowledged: number;
  avgResolutionTime: number; // minutes
  timeframe: string;
  topSources: Array<{
    source: string;
    count: number;
  }>;
}

export class AlertManager extends EventEmitter {
  private alerts: Map<string, Alert> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private alertHistory: Alert[] = [];
  private notificationService: NotificationService;
  private escalationPolicies: EscalationPolicies;
  
  private config = {
    maxActiveAlerts: 1000,
    maxHistorySize: 10000,
    deduplicationWindow: 300000,  // 5 minutes
    autoResolveTimeout: 3600000,  // 1 hour
    escalationCheckInterval: 60000, // 1 minute
  };

  private escalationTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.notificationService = new NotificationService();
    this.escalationPolicies = new EscalationPolicies();
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'model_availability_critical',
        name: 'Model Availability Critical',
        description: 'Alert when model availability drops below 90%',
        type: AlertType.AVAILABILITY,
        severity: AlertSeverity.CRITICAL,
        enabled: true,
        conditions: [{
          metric: 'availability',
          operator: 'lt',
          threshold: 0.9,
          duration: 300, // 5 minutes
          aggregation: 'avg'
        }],
        suppressions: [],
        escalationPolicyId: 'default_critical',
        notificationChannels: ['slack_alerts', 'email_oncall'],
        tags: ['availability', 'critical'],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'high_latency_warning',
        name: 'High Latency Warning',
        description: 'Alert when P95 latency exceeds 10 seconds',
        type: AlertType.LATENCY,
        severity: AlertSeverity.HIGH,
        enabled: true,
        conditions: [{
          metric: 'latency_p95',
          operator: 'gt',
          threshold: 10000,
          duration: 180, // 3 minutes
          aggregation: 'avg'
        }],
        suppressions: [],
        escalationPolicyId: 'default_high',
        notificationChannels: ['slack_alerts'],
        tags: ['latency', 'performance'],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'error_rate_spike',
        name: 'Error Rate Spike',
        description: 'Alert when error rate exceeds 5%',
        type: AlertType.ERROR_RATE,
        severity: AlertSeverity.HIGH,
        enabled: true,
        conditions: [{
          metric: 'error_rate',
          operator: 'gt',
          threshold: 0.05,
          duration: 120, // 2 minutes
          aggregation: 'avg'
        }],
        suppressions: [],
        escalationPolicyId: 'default_high',
        notificationChannels: ['slack_alerts', 'email_oncall'],
        tags: ['errors', 'reliability'],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'budget_exceeded',
        name: 'Budget Exceeded',
        description: 'Alert when daily budget is exceeded',
        type: AlertType.BUDGET,
        severity: AlertSeverity.CRITICAL,
        enabled: true,
        conditions: [{
          metric: 'budget_usage',
          operator: 'gte',
          threshold: 1.0,
          duration: 0, // Immediate
        }],
        suppressions: [],
        escalationPolicyId: 'default_budget',
        notificationChannels: ['email_billing', 'slack_alerts'],
        tags: ['budget', 'cost'],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    defaultRules.forEach(rule => {
      this.alertRules.set(rule.id, rule);
    });

    Logger.info(`Initialized ${defaultRules.length} default alert rules`);
  }

  /**
   * Start alert management system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Alert manager is already running');
      return;
    }

    Logger.info('Starting alert management system...');

    // Start notification service
    await this.notificationService.start();

    // Start escalation policies
    await this.escalationPolicies.start();

    // Start escalation check timer
    this.escalationTimer = setInterval(() => {
      this.checkEscalations();
    }, this.config.escalationCheckInterval);

    this.isRunning = true;
    this.emit('alertManagerStarted');

    Logger.info('Alert management system started successfully');
  }

  /**
   * Stop alert management system
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping alert management system...');

    if (this.escalationTimer) {
      clearInterval(this.escalationTimer);
      this.escalationTimer = null;
    }

    await this.notificationService.stop();
    await this.escalationPolicies.stop();

    this.isRunning = false;
    this.emit('alertManagerStopped');

    Logger.info('Alert management system stopped');
  }

  /**
   * Process an incoming alert
   */
  async processAlert(alertData: {
    type: AlertType;
    severity: AlertSeverity;
    title?: string;
    message: string;
    source: string;
    modelName?: string;
    provider?: string;
    data?: Record<string, any>;
    tags?: string[];
  }): Promise<string> {
    const fingerprint = this.generateFingerprint(alertData);
    
    // Check for existing alert with same fingerprint (deduplication)
    const existingAlert = this.findExistingAlert(fingerprint);
    
    if (existingAlert && !this.shouldCreateNewAlert(existingAlert)) {
      Logger.debug(`Deduplicated alert: ${fingerprint}`);
      return existingAlert.id;
    }

    // Create new alert
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: alertData.type,
      severity: alertData.severity,
      title: alertData.title || this.generateTitle(alertData),
      message: alertData.message,
      source: alertData.source,
      modelName: alertData.modelName,
      provider: alertData.provider,
      timestamp: new Date(),
      data: alertData.data || {},
      tags: alertData.tags || [],
      fingerprint,
      acknowledged: false
    };

    // Store the alert
    this.alerts.set(alert.id, alert);

    // Apply alert rules and suppressions
    const shouldNotify = await this.shouldSendNotification(alert);
    
    if (shouldNotify) {
      await this.sendNotifications(alert);
    }

    // Start escalation if needed
    await this.startEscalation(alert);

    this.emit('alertCreated', alert);
    Logger.info(`Created alert: ${alert.type} - ${alert.title}`);

    // Cleanup if we have too many alerts
    await this.cleanupOldAlerts();

    return alert.id;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string, note?: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    if (alert.acknowledged) {
      Logger.warn(`Alert ${alertId} is already acknowledged`);
      return;
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();
    
    if (note) {
      alert.resolutionNote = note;
    }

    this.alerts.set(alertId, alert);
    
    // Stop escalation
    await this.escalationPolicies.stopEscalation(alertId);

    this.emit('alertAcknowledged', alert);
    Logger.info(`Alert ${alertId} acknowledged by ${acknowledgedBy}`);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, resolvedBy: string, note?: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    if (alert.resolvedAt) {
      Logger.warn(`Alert ${alertId} is already resolved`);
      return;
    }

    alert.resolvedAt = new Date();
    alert.resolvedBy = resolvedBy;
    
    if (note) {
      alert.resolutionNote = note;
    }

    // Move to history
    this.alertHistory.push(alert);
    this.alerts.delete(alertId);

    // Stop escalation
    await this.escalationPolicies.stopEscalation(alertId);

    // Send resolution notification
    await this.sendResolutionNotification(alert);

    this.emit('alertResolved', alert);
    Logger.info(`Alert ${alertId} resolved by ${resolvedBy}`);
  }

  /**
   * Suppress alerts matching criteria
   */
  async suppressAlerts(
    criteria: {
      type?: AlertType;
      severity?: AlertSeverity;
      source?: string;
      modelName?: string;
      tags?: string[];
    },
    suppressionOptions: {
      duration?: number; // minutes
      reason: string;
      suppressedBy: string;
    }
  ): Promise<number> {
    const suppressUntil = suppressionOptions.duration 
      ? new Date(Date.now() + suppressionOptions.duration * 60000)
      : undefined;

    let suppressedCount = 0;

    for (const [alertId, alert] of this.alerts) {
      if (this.alertMatchesCriteria(alert, criteria)) {
        alert.suppressedUntil = suppressUntil;
        suppressedCount++;
      }
    }

    Logger.info(`Suppressed ${suppressedCount} alerts: ${suppressionOptions.reason}`);
    return suppressedCount;
  }

  /**
   * Get active alerts with optional filtering
   */
  getActiveAlerts(filters?: {
    type?: AlertType;
    severity?: AlertSeverity;
    source?: string;
    acknowledged?: boolean;
  }): Alert[] {
    let alerts = Array.from(this.alerts.values());

    if (filters) {
      alerts = alerts.filter(alert => {
        if (filters.type && alert.type !== filters.type) return false;
        if (filters.severity && alert.severity !== filters.severity) return false;
        if (filters.source && alert.source !== filters.source) return false;
        if (filters.acknowledged !== undefined && alert.acknowledged !== filters.acknowledged) return false;
        return true;
      });
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get alert statistics
   */
  getAlertStatistics(timeframe: string = '24h'): AlertStatistics {
    const cutoff = this.getTimeframeCutoff(timeframe);
    const recentAlerts = this.alertHistory.filter(alert => alert.timestamp >= cutoff);
    const activeAlerts = Array.from(this.alerts.values());
    const allAlerts = [...recentAlerts, ...activeAlerts];

    const byType = allAlerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {} as Record<AlertType, number>);

    const bySeverity = allAlerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<AlertSeverity, number>);

    const resolvedAlerts = recentAlerts.filter(alert => alert.resolvedAt);
    const avgResolutionTime = resolvedAlerts.length > 0
      ? resolvedAlerts.reduce((sum, alert) => {
          const resolutionTime = alert.resolvedAt!.getTime() - alert.timestamp.getTime();
          return sum + resolutionTime;
        }, 0) / (resolvedAlerts.length * 60000) // Convert to minutes
      : 0;

    const sourceCounts = new Map<string, number>();
    allAlerts.forEach(alert => {
      sourceCounts.set(alert.source, (sourceCounts.get(alert.source) || 0) + 1);
    });

    const topSources = Array.from(sourceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([source, count]) => ({ source, count }));

    return {
      total: allAlerts.length,
      byType,
      bySeverity,
      resolved: resolvedAlerts.length,
      acknowledged: allAlerts.filter(alert => alert.acknowledged).length,
      avgResolutionTime,
      timeframe,
      topSources
    };
  }

  /**
   * Create or update an alert rule
   */
  async setAlertRule(rule: AlertRule): Promise<void> {
    this.alertRules.set(rule.id, { ...rule, updatedAt: new Date() });
    Logger.info(`${this.alertRules.has(rule.id) ? 'Updated' : 'Created'} alert rule: ${rule.name}`);
  }

  /**
   * Get all alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  // Private helper methods

  private generateFingerprint(alertData: any): string {
    // Create a fingerprint for deduplication
    const key = `${alertData.type}_${alertData.source}_${alertData.modelName || 'global'}_${alertData.message.substring(0, 50)}`;
    return Buffer.from(key).toString('base64');
  }

  private findExistingAlert(fingerprint: string): Alert | undefined {
    for (const alert of this.alerts.values()) {
      if (alert.fingerprint === fingerprint) {
        return alert;
      }
    }
    return undefined;
  }

  private shouldCreateNewAlert(existingAlert: Alert): boolean {
    const now = Date.now();
    const timeSinceCreated = now - existingAlert.timestamp.getTime();
    
    // Create new alert if the existing one is older than deduplication window
    return timeSinceCreated > this.config.deduplicationWindow;
  }

  private generateTitle(alertData: any): string {
    const modelPrefix = alertData.modelName ? `[${alertData.modelName}] ` : '';
    
    switch (alertData.type) {
      case AlertType.AVAILABILITY:
        return `${modelPrefix}Model Availability Alert`;
      case AlertType.LATENCY:
        return `${modelPrefix}High Latency Detected`;
      case AlertType.ERROR_RATE:
        return `${modelPrefix}Error Rate Spike`;
      case AlertType.COST:
        return `${modelPrefix}Cost Alert`;
      case AlertType.BUDGET:
        return `${modelPrefix}Budget Alert`;
      default:
        return `${modelPrefix}System Alert`;
    }
  }

  private async shouldSendNotification(alert: Alert): boolean {
    // Check if alert is suppressed
    if (alert.suppressedUntil && new Date() < alert.suppressedUntil) {
      return false;
    }

    // Check alert rules for matching suppressions
    for (const rule of this.alertRules.values()) {
      if (rule.type === alert.type && !rule.enabled) {
        return false;
      }
    }

    return true;
  }

  private async sendNotifications(alert: Alert): Promise<void> {
    try {
      // Find matching rule to get notification channels
      const matchingRule = Array.from(this.alertRules.values())
        .find(rule => rule.type === alert.type);

      const channels = matchingRule?.notificationChannels || ['default'];
      
      await this.notificationService.sendAlert(alert, channels);
      
      Logger.debug(`Sent notifications for alert ${alert.id} to channels: ${channels.join(', ')}`);
    } catch (error) {
      Logger.error(`Failed to send notifications for alert ${alert.id}:`, error);
    }
  }

  private async sendResolutionNotification(alert: Alert): Promise<void> {
    try {
      const matchingRule = Array.from(this.alertRules.values())
        .find(rule => rule.type === alert.type);

      const channels = matchingRule?.notificationChannels || ['default'];
      
      await this.notificationService.sendResolution(alert, channels);
      
      Logger.debug(`Sent resolution notification for alert ${alert.id}`);
    } catch (error) {
      Logger.error(`Failed to send resolution notification for alert ${alert.id}:`, error);
    }
  }

  private async startEscalation(alert: Alert): Promise<void> {
    const matchingRule = Array.from(this.alertRules.values())
      .find(rule => rule.type === alert.type);

    if (matchingRule?.escalationPolicyId) {
      await this.escalationPolicies.startEscalation(alert.id, matchingRule.escalationPolicyId);
    }
  }

  private async checkEscalations(): Promise<void> {
    // Check for alerts that need escalation
    for (const alert of this.alerts.values()) {
      if (!alert.acknowledged && !alert.resolvedAt) {
        await this.escalationPolicies.checkEscalation(alert.id);
      }
    }
  }

  private alertMatchesCriteria(alert: Alert, criteria: any): boolean {
    if (criteria.type && alert.type !== criteria.type) return false;
    if (criteria.severity && alert.severity !== criteria.severity) return false;
    if (criteria.source && alert.source !== criteria.source) return false;
    if (criteria.modelName && alert.modelName !== criteria.modelName) return false;
    if (criteria.tags && !criteria.tags.some((tag: string) => alert.tags.includes(tag))) return false;
    
    return true;
  }

  private getTimeframeCutoff(timeframe: string): Date {
    const now = new Date();
    const match = timeframe.match(/^(\d+)([mhd])$/);
    
    if (!match) return new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default 24h

    const value = parseInt(match[1]);
    const unit = match[2];
    let milliseconds = 0;

    switch (unit) {
      case 'm': milliseconds = value * 60 * 1000; break;
      case 'h': milliseconds = value * 60 * 60 * 1000; break;
      case 'd': milliseconds = value * 24 * 60 * 60 * 1000; break;
    }

    return new Date(now.getTime() - milliseconds);
  }

  private async cleanupOldAlerts(): Promise<void> {
    // Move old resolved alerts to history
    const oldAlerts = Array.from(this.alerts.values())
      .filter(alert => {
        const age = Date.now() - alert.timestamp.getTime();
        return alert.resolvedAt && age > this.config.autoResolveTimeout;
      });

    oldAlerts.forEach(alert => {
      this.alertHistory.push(alert);
      this.alerts.delete(alert.id);
    });

    // Limit history size
    if (this.alertHistory.length > this.config.maxHistorySize) {
      this.alertHistory.splice(0, this.alertHistory.length - this.config.maxHistorySize);
    }

    // Remove very old unresolved alerts (auto-resolve)
    const veryOldAlerts = Array.from(this.alerts.values())
      .filter(alert => {
        const age = Date.now() - alert.timestamp.getTime();
        return !alert.resolvedAt && age > this.config.autoResolveTimeout * 3; // 3 hours
      });

    for (const alert of veryOldAlerts) {
      await this.resolveAlert(alert.id, 'system', 'Auto-resolved due to age');
    }

    if (oldAlerts.length > 0 || veryOldAlerts.length > 0) {
      Logger.debug(`Cleaned up ${oldAlerts.length + veryOldAlerts.length} old alerts`);
    }
  }
}

// Export singleton instance
export const alertManager = new AlertManager();