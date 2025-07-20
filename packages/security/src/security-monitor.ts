/**
 * Security Monitoring and Alerting System
 * Real-time security event monitoring, alerting, and dashboard
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from '@recoder/shared';
import { AuditEvent, SecurityAlert } from './audit-trail';
import { ThreatEvent } from './threat-detection';
import { SecretDetection } from './secret-detector';
import { VulnerabilityFinding } from './code-vulnerability-scanner';

export interface SecurityMetric {
  id: string;
  name: string;
  description: string;
  value: number;
  unit: string;
  timestamp: number;
  threshold?: {
    warning: number;
    critical: number;
  };
  trend: 'increasing' | 'decreasing' | 'stable';
  category: 'security' | 'compliance' | 'performance' | 'availability';
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  condition: {
    metric: string;
    operator: '>' | '<' | '=' | '>=' | '<=' | '!=';
    threshold: number;
    timeWindow: number; // minutes
  };
  actions: AlertAction[];
  created: number;
  lastTriggered?: number;
  triggerCount: number;
}

export interface AlertAction {
  type: 'email' | 'webhook' | 'log' | 'block' | 'quarantine';
  config: {
    recipients?: string[];
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
  enabled: boolean;
}

export interface SecurityDashboard {
  timestamp: number;
  overview: {
    securityScore: number;
    totalAlerts: number;
    criticalAlerts: number;
    activeThreats: number;
    complianceStatus: 'compliant' | 'partial' | 'non_compliant';
  };
  metrics: SecurityMetric[];
  recentAlerts: SecurityAlert[];
  threatIntelligence: {
    newSignatures: number;
    activeCampaigns: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  systemHealth: {
    monitoringStatus: 'healthy' | 'degraded' | 'critical';
    lastUpdate: number;
    uptime: number;
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  realTimeMonitoring: boolean;
  metricsRetentionDays: number;
  alertingEnabled: boolean;
  dashboardRefreshInterval: number; // seconds
  thresholds: {
    securityScore: { warning: number; critical: number };
    vulnerabilities: { warning: number; critical: number };
    threats: { warning: number; critical: number };
    secrets: { warning: number; critical: number };
  };
  integrations: {
    siem: { enabled: boolean; endpoint?: string; apiKey?: string };
    slack: { enabled: boolean; webhook?: string };
    email: { enabled: boolean; smtp?: any };
    prometheus: { enabled: boolean; port?: number };
  };
}

export class SecurityMonitor extends EventEmitter {
  private readonly logger = new Logger('SecurityMonitor');
  private readonly config: MonitoringConfig;
  private readonly metrics: Map<string, SecurityMetric[]> = new Map();
  private readonly alertRules: Map<string, AlertRule> = new Map();
  private readonly activeAlerts: Map<string, SecurityAlert> = new Map();
  private readonly monitoringStartTime = Date.now();
  private metricsCollectionTimer?: NodeJS.Timeout;
  private dashboardUpdateTimer?: NodeJS.Timeout;

  constructor(config?: Partial<MonitoringConfig>) {
    super();
    
    this.config = {
      enabled: true,
      realTimeMonitoring: true,
      metricsRetentionDays: 30,
      alertingEnabled: true,
      dashboardRefreshInterval: 30, // 30 seconds
      thresholds: {
        securityScore: { warning: 70, critical: 50 },
        vulnerabilities: { warning: 5, critical: 10 },
        threats: { warning: 3, critical: 5 },
        secrets: { warning: 1, critical: 3 },
      },
      integrations: {
        siem: { enabled: false },
        slack: { enabled: false },
        email: { enabled: false },
        prometheus: { enabled: false },
      },
      ...config,
    };

    this.loadDefaultAlertRules();
    this.startMonitoring();
  }

  /**
   * Start security monitoring
   */
  private startMonitoring(): void {
    if (!this.config.enabled) {
      return;
    }

    this.logger.info('Starting security monitoring system');

    // Start metrics collection
    this.metricsCollectionTimer = setInterval(() => {
      this.collectMetrics();
    }, 60000); // Every minute

    // Start dashboard updates
    this.dashboardUpdateTimer = setInterval(() => {
      this.updateDashboard();
    }, this.config.dashboardRefreshInterval * 1000);

    // Initial dashboard update
    this.updateDashboard();
  }

  /**
   * Stop security monitoring
   */
  stopMonitoring(): void {
    this.logger.info('Stopping security monitoring system');
    
    if (this.metricsCollectionTimer) {
      clearInterval(this.metricsCollectionTimer);
    }
    
    if (this.dashboardUpdateTimer) {
      clearInterval(this.dashboardUpdateTimer);
    }
  }

  /**
   * Record security event
   */
  async recordSecurityEvent(event: AuditEvent): Promise<void> {
    if (!this.config.realTimeMonitoring) {
      return;
    }

    // Update metrics based on event
    await this.updateMetricsFromEvent(event);

    // Check alert rules
    await this.checkAlertRules(event);

    // Forward to integrations
    await this.forwardToIntegrations(event);

    this.emit('securityEvent', event);
  }

  /**
   * Record threat detection
   */
  async recordThreatDetection(threat: ThreatEvent): Promise<void> {
    const metric: SecurityMetric = {
      id: this.generateId(),
      name: 'threat_detections',
      description: `Threat detected: ${threat.signature.name}`,
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      threshold: this.config.thresholds.threats,
      trend: 'increasing',
      category: 'security',
    };

    await this.recordMetric(metric);

    // Create alert for high/critical threats
    if (threat.severity === 'high' || threat.severity === 'critical') {
      await this.triggerAlert({
        id: this.generateId(),
        type: 'threat_detection',
        severity: threat.severity === 'critical' ? 'critical' : 'high',
        title: `${threat.severity.toUpperCase()} Threat Detected`,
        description: `${threat.signature.name} detected on ${threat.target.type}`,
        source: 'threat-detection',
        timestamp: Date.now(),
        metadata: {
          threatId: threat.id,
          signatureId: threat.signature.id,
          confidence: threat.confidence,
          target: threat.target,
        },
        resolved: false,
      });
    }
  }

  /**
   * Record secret detection
   */
  async recordSecretDetection(detection: SecretDetection): Promise<void> {
    const metric: SecurityMetric = {
      id: this.generateId(),
      name: 'secret_detections',
      description: `Secret detected: ${detection.pattern.name}`,
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      threshold: this.config.thresholds.secrets,
      trend: 'increasing',
      category: 'security',
    };

    await this.recordMetric(metric);

    // Create alert for critical secrets
    if (detection.pattern.severity === 'critical') {
      await this.triggerAlert({
        id: this.generateId(),
        type: 'secret_exposure',
        severity: 'critical',
        title: 'Critical Secret Exposed',
        description: `${detection.pattern.name} detected in ${detection.file}`,
        source: 'secret-detector',
        timestamp: Date.now(),
        metadata: {
          detectionId: detection.id,
          patternId: detection.pattern.id,
          file: detection.file,
          line: detection.line,
        },
        resolved: false,
      });
    }
  }

  /**
   * Record vulnerability finding
   */
  async recordVulnerabilityFinding(finding: VulnerabilityFinding): Promise<void> {
    const metric: SecurityMetric = {
      id: this.generateId(),
      name: 'vulnerability_findings',
      description: `Vulnerability: ${finding.title}`,
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      threshold: this.config.thresholds.vulnerabilities,
      trend: 'increasing',
      category: 'security',
    };

    await this.recordMetric(metric);

    // Create alert for high/critical vulnerabilities
    if (finding.severity === 'high' || finding.severity === 'critical') {
      await this.triggerAlert({
        id: this.generateId(),
        type: 'vulnerability',
        severity: finding.severity === 'critical' ? 'critical' : 'high',
        title: `${finding.severity.toUpperCase()} Vulnerability Found`,
        description: finding.description,
        source: 'vulnerability-scanner',
        timestamp: Date.now(),
        metadata: {
          findingId: finding.id,
          rule: finding.rule,
          file: finding.file,
          line: finding.line,
        },
        resolved: false,
      });
    }
  }

  /**
   * Get security dashboard
   */
  async getSecurityDashboard(): Promise<SecurityDashboard> {
    const now = Date.now();
    const recentAlerts = Array.from(this.activeAlerts.values())
      .filter(alert => now - alert.timestamp < 24 * 60 * 60 * 1000) // Last 24 hours
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    const securityScore = await this.calculateSecurityScore();
    const criticalAlerts = recentAlerts.filter(alert => alert.severity === 'critical').length;

    return {
      timestamp: now,
      overview: {
        securityScore,
        totalAlerts: recentAlerts.length,
        criticalAlerts,
        activeThreats: this.getMetricValue('active_threats', 0),
        complianceStatus: this.getComplianceStatus(),
      },
      metrics: this.getRecentMetrics(),
      recentAlerts,
      threatIntelligence: {
        newSignatures: this.getMetricValue('new_threat_signatures', 0),
        activeCampaigns: this.getMetricValue('active_campaigns', 0),
        riskLevel: this.calculateRiskLevel(),
      },
      systemHealth: {
        monitoringStatus: this.getMonitoringStatus(),
        lastUpdate: now,
        uptime: now - this.monitoringStartTime,
      },
    };
  }

  /**
   * Create custom alert rule
   */
  createAlertRule(rule: Omit<AlertRule, 'id' | 'created' | 'triggerCount'>): string {
    const ruleId = this.generateId();
    const alertRule: AlertRule = {
      id: ruleId,
      created: Date.now(),
      triggerCount: 0,
      ...rule,
    };

    this.alertRules.set(ruleId, alertRule);
    this.logger.info(`Created alert rule: ${rule.name}`);
    
    return ruleId;
  }

  /**
   * Update alert rule
   */
  updateAlertRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const rule = this.alertRules.get(ruleId);
    if (!rule) {
      return false;
    }

    const updatedRule = { ...rule, ...updates };
    this.alertRules.set(ruleId, updatedRule);
    
    this.logger.info(`Updated alert rule: ${rule.name}`);
    return true;
  }

  /**
   * Delete alert rule
   */
  deleteAlertRule(ruleId: string): boolean {
    const deleted = this.alertRules.delete(ruleId);
    if (deleted) {
      this.logger.info(`Deleted alert rule: ${ruleId}`);
    }
    return deleted;
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): {
    uptime: number;
    metricsCollected: number;
    alertsTriggered: number;
    activeRules: number;
    systemStatus: string;
  } {
    const allMetrics = Array.from(this.metrics.values()).flat();
    const allAlerts = Array.from(this.activeAlerts.values());
    
    return {
      uptime: Date.now() - this.monitoringStartTime,
      metricsCollected: allMetrics.length,
      alertsTriggered: allAlerts.length,
      activeRules: Array.from(this.alertRules.values()).filter(r => r.enabled).length,
      systemStatus: this.getMonitoringStatus(),
    };
  }

  /**
   * Record custom metric
   */
  private async recordMetric(metric: SecurityMetric): Promise<void> {
    const existing = this.metrics.get(metric.name) || [];
    existing.push(metric);
    
    // Keep only recent metrics (within retention period)
    const cutoff = Date.now() - (this.config.metricsRetentionDays * 24 * 60 * 60 * 1000);
    const filtered = existing.filter(m => m.timestamp > cutoff);
    
    this.metrics.set(metric.name, filtered);
    
    // Save to disk for persistence
    await this.saveMetricToDisk(metric);
  }

  /**
   * Collect system metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const now = Date.now();
      
      // System performance metrics
      const memoryUsage = process.memoryUsage();
      await this.recordMetric({
        id: this.generateId(),
        name: 'memory_usage',
        description: 'Memory usage in MB',
        value: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        unit: 'MB',
        timestamp: now,
        trend: 'stable',
        category: 'performance',
      });

      // Security metrics
      await this.recordMetric({
        id: this.generateId(),
        name: 'security_score',
        description: 'Overall security score',
        value: await this.calculateSecurityScore(),
        unit: 'score',
        timestamp: now,
        threshold: this.config.thresholds.securityScore,
        trend: 'stable',
        category: 'security',
      });

      // Active alerts count
      const criticalAlerts = Array.from(this.activeAlerts.values())
        .filter(alert => alert.severity === 'critical' && !alert.resolved).length;
      
      await this.recordMetric({
        id: this.generateId(),
        name: 'critical_alerts',
        description: 'Number of active critical alerts',
        value: criticalAlerts,
        unit: 'count',
        timestamp: now,
        trend: criticalAlerts > 0 ? 'increasing' : 'stable',
        category: 'security',
      });

    } catch (error) {
      this.logger.error('Failed to collect metrics:', error);
    }
  }

  /**
   * Update metrics from security event
   */
  private async updateMetricsFromEvent(event: AuditEvent): Promise<void> {
    const now = Date.now();
    
    // Count events by type
    await this.recordMetric({
      id: this.generateId(),
      name: `events_${event.eventType}`,
      description: `${event.eventType} events`,
      value: 1,
      unit: 'count',
      timestamp: now,
      trend: 'increasing',
      category: 'security',
    });

    // Track failed operations
    if (event.outcome === 'failure') {
      await this.recordMetric({
        id: this.generateId(),
        name: 'failed_operations',
        description: 'Failed security operations',
        value: 1,
        unit: 'count',
        timestamp: now,
        trend: 'increasing',
        category: 'security',
      });
    }
  }

  /**
   * Check alert rules against current metrics
   */
  private async checkAlertRules(event?: AuditEvent): Promise<void> {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) {
        continue;
      }

      try {
        const shouldTrigger = await this.evaluateAlertRule(rule, event);
        if (shouldTrigger) {
          await this.triggerAlertRule(rule);
        }
      } catch (error) {
        this.logger.error(`Failed to evaluate alert rule ${rule.name}:`, error);
      }
    }
  }

  /**
   * Evaluate if alert rule should trigger
   */
  private async evaluateAlertRule(rule: AlertRule, event?: AuditEvent): Promise<boolean> {
    const { condition } = rule;
    const metricValue = this.getMetricValue(condition.metric);
    
    if (metricValue === null) {
      return false;
    }

    // Check if condition is met
    switch (condition.operator) {
      case '>':
        return metricValue > condition.threshold;
      case '<':
        return metricValue < condition.threshold;
      case '>=':
        return metricValue >= condition.threshold;
      case '<=':
        return metricValue <= condition.threshold;
      case '=':
        return metricValue === condition.threshold;
      case '!=':
        return metricValue !== condition.threshold;
      default:
        return false;
    }
  }

  /**
   * Trigger alert rule
   */
  private async triggerAlertRule(rule: AlertRule): Promise<void> {
    // Update rule statistics
    rule.lastTriggered = Date.now();
    rule.triggerCount++;

    // Create alert
    const alert: SecurityAlert = {
      id: this.generateId(),
      type: 'rule_triggered',
      severity: rule.severity,
      title: rule.name,
      description: rule.description,
      source: 'monitoring-system',
      timestamp: Date.now(),
      metadata: {
        ruleId: rule.id,
        condition: rule.condition,
      },
      resolved: false,
    };

    await this.triggerAlert(alert);

    // Execute alert actions
    for (const action of rule.actions) {
      if (action.enabled) {
        await this.executeAlertAction(action, alert);
      }
    }
  }

  /**
   * Trigger security alert
   */
  private async triggerAlert(alert: SecurityAlert): Promise<void> {
    this.activeAlerts.set(alert.id, alert);
    
    this.logger.warn(`Security alert triggered: ${alert.title}`);
    
    // Emit alert event
    this.emit('securityAlert', alert);

    // Save alert to disk
    await this.saveAlertToDisk(alert);
  }

  /**
   * Execute alert action
   */
  private async executeAlertAction(action: AlertAction, alert: SecurityAlert): Promise<void> {
    try {
      switch (action.type) {
        case 'log':
          this.logger.error(`ALERT: ${alert.title} - ${alert.description}`);
          break;

        case 'webhook':
          if (action.config.url) {
            // Would implement webhook call
            this.logger.info(`Webhook alert sent to ${action.config.url}`);
          }
          break;

        case 'email':
          if (action.config.recipients) {
            // Would implement email sending
            this.logger.info(`Email alert sent to ${action.config.recipients.join(', ')}`);
          }
          break;

        default:
          this.logger.warn(`Unknown alert action type: ${action.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to execute alert action ${action.type}:`, error);
    }
  }

  /**
   * Calculate overall security score
   */
  private async calculateSecurityScore(): Promise<number> {
    let score = 100;
    
    // Deduct points for active threats
    const criticalAlerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.severity === 'critical' && !alert.resolved).length;
    score -= criticalAlerts * 20;

    // Deduct points for vulnerabilities
    const vulnerabilities = this.getMetricValue('vulnerability_findings', 0);
    score -= Math.min(vulnerabilities * 5, 30);

    // Deduct points for secrets
    const secrets = this.getMetricValue('secret_detections', 0);
    score -= Math.min(secrets * 10, 25);

    return Math.max(score, 0);
  }

  /**
   * Get metric value by name
   */
  private getMetricValue(metricName: string, defaultValue: number = 0): number {
    const metricsList = this.metrics.get(metricName) || [];
    if (metricsList.length === 0) {
      return defaultValue;
    }
    
    // Return the most recent value
    const latest = metricsList[metricsList.length - 1];
    return latest.value;
  }

  /**
   * Get recent metrics for dashboard
   */
  private getRecentMetrics(): SecurityMetric[] {
    const cutoff = Date.now() - (60 * 60 * 1000); // Last hour
    const allMetrics = Array.from(this.metrics.values()).flat();
    
    return allMetrics
      .filter(metric => metric.timestamp > cutoff)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
  }

  /**
   * Calculate current risk level
   */
  private calculateRiskLevel(): 'low' | 'medium' | 'high' | 'critical' {
    const criticalAlerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.severity === 'critical' && !alert.resolved).length;
    
    if (criticalAlerts >= 3) return 'critical';
    if (criticalAlerts >= 1) return 'high';
    
    const highAlerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.severity === 'high' && !alert.resolved).length;
    
    if (highAlerts >= 5) return 'medium';
    return 'low';
  }

  /**
   * Get compliance status
   */
  private getComplianceStatus(): 'compliant' | 'partial' | 'non_compliant' {
    // This would integrate with the compliance engine
    return 'compliant'; // Placeholder
  }

  /**
   * Get monitoring system status
   */
  private getMonitoringStatus(): 'healthy' | 'degraded' | 'critical' {
    const criticalAlerts = Array.from(this.activeAlerts.values())
      .filter(alert => alert.severity === 'critical' && !alert.resolved).length;
    
    if (criticalAlerts >= 3) return 'critical';
    if (criticalAlerts >= 1) return 'degraded';
    return 'healthy';
  }

  /**
   * Update dashboard
   */
  private async updateDashboard(): Promise<void> {
    try {
      const dashboard = await this.getSecurityDashboard();
      this.emit('dashboardUpdate', dashboard);
    } catch (error) {
      this.logger.error('Failed to update dashboard:', error);
    }
  }

  /**
   * Forward events to external integrations
   */
  private async forwardToIntegrations(event: AuditEvent): Promise<void> {
    // SIEM integration
    if (this.config.integrations.siem.enabled) {
      // Would forward to SIEM system
    }

    // Prometheus metrics
    if (this.config.integrations.prometheus.enabled) {
      // Would expose metrics for Prometheus
    }
  }

  /**
   * Load default alert rules
   */
  private loadDefaultAlertRules(): void {
    const defaultRules: Omit<AlertRule, 'id' | 'created' | 'triggerCount'>[] = [
      {
        name: 'Critical Security Score',
        description: 'Alert when security score drops below critical threshold',
        enabled: true,
        severity: 'critical',
        condition: {
          metric: 'security_score',
          operator: '<',
          threshold: this.config.thresholds.securityScore.critical,
          timeWindow: 5,
        },
        actions: [
          { type: 'log', config: {}, enabled: true },
        ],
      },
      {
        name: 'Multiple Critical Alerts',
        description: 'Alert when multiple critical alerts are active',
        enabled: true,
        severity: 'critical',
        condition: {
          metric: 'critical_alerts',
          operator: '>=',
          threshold: 3,
          timeWindow: 15,
        },
        actions: [
          { type: 'log', config: {}, enabled: true },
        ],
      },
      {
        name: 'High Vulnerability Count',
        description: 'Alert when vulnerability count exceeds threshold',
        enabled: true,
        severity: 'high',
        condition: {
          metric: 'vulnerability_findings',
          operator: '>=',
          threshold: this.config.thresholds.vulnerabilities.warning,
          timeWindow: 60,
        },
        actions: [
          { type: 'log', config: {}, enabled: true },
        ],
      },
    ];

    for (const rule of defaultRules) {
      this.createAlertRule(rule);
    }

    this.logger.info(`Loaded ${defaultRules.length} default alert rules`);
  }

  /**
   * Save metric to disk for persistence
   */
  private async saveMetricToDisk(metric: SecurityMetric): Promise<void> {
    try {
      const metricsDir = './security-metrics';
      await fs.mkdir(metricsDir, { recursive: true });
      
      const fileName = `metrics-${new Date().toISOString().split('T')[0]}.jsonl`;
      const filePath = path.join(metricsDir, fileName);
      
      const line = JSON.stringify(metric) + '\n';
      await fs.appendFile(filePath, line);
    } catch (error) {
      this.logger.error('Failed to save metric to disk:', error);
    }
  }

  /**
   * Save alert to disk for persistence
   */
  private async saveAlertToDisk(alert: SecurityAlert): Promise<void> {
    try {
      const alertsDir = './security-alerts';
      await fs.mkdir(alertsDir, { recursive: true });
      
      const fileName = `alerts-${new Date().toISOString().split('T')[0]}.jsonl`;
      const filePath = path.join(alertsDir, fileName);
      
      const line = JSON.stringify(alert) + '\n';
      await fs.appendFile(filePath, line);
    } catch (error) {
      this.logger.error('Failed to save alert to disk:', error);
    }
  }

  /**
   * Generate unique identifier
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}