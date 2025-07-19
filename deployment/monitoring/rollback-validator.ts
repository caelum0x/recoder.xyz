/**
 * Rollback validation and release health monitoring service
 * Monitors release health and automatically triggers rollbacks when issues are detected
 */

import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import { execSync } from 'child_process';
import { Logger } from '@recoder/shared';

export interface HealthCheck {
  name: string;
  type: 'http' | 'command' | 'metric' | 'custom';
  endpoint?: string;
  command?: string;
  metricName?: string;
  threshold?: number;
  timeout: number;
  retries: number;
  critical: boolean;
  description: string;
}

export interface ReleaseValidation {
  version: string;
  environment: 'staging' | 'production';
  startTime: number;
  endTime?: number;
  status: 'running' | 'passed' | 'failed' | 'rolled_back';
  healthChecks: HealthCheckResult[];
  metrics: ValidationMetrics;
  rollbackTriggered?: boolean;
  rollbackReason?: string;
}

export interface HealthCheckResult {
  check: HealthCheck;
  timestamp: number;
  status: 'passed' | 'failed' | 'timeout';
  duration: number;
  response?: any;
  error?: string;
}

export interface ValidationMetrics {
  errorRate: number;
  responseTime: number;
  throughput: number;
  availabilityPercent: number;
  userSatisfaction: number;
}

export interface RollbackConfig {
  enabled: boolean;
  autoRollback: boolean;
  thresholds: {
    errorRatePercent: number;
    responseTimeMs: number;
    availabilityPercent: number;
    failedHealthChecks: number;
  };
  validationPeriodMinutes: number;
  rollbackTimeoutMinutes: number;
  notificationChannels: string[];
}

export class RollbackValidator {
  private readonly logger = new Logger('RollbackValidator');
  private validations = new Map<string, ReleaseValidation>();
  private isMonitoring = false;

  constructor(
    private readonly config: RollbackConfig,
    private readonly healthChecks: HealthCheck[]
  ) {}

  /**
   * Start release validation
   */
  async startValidation(version: string, environment: 'staging' | 'production'): Promise<string> {
    const validationId = `${version}-${environment}-${Date.now()}`;
    
    const validation: ReleaseValidation = {
      version,
      environment,
      startTime: Date.now(),
      status: 'running',
      healthChecks: [],
      metrics: {
        errorRate: 0,
        responseTime: 0,
        throughput: 0,
        availabilityPercent: 100,
        userSatisfaction: 100,
      },
    };

    this.validations.set(validationId, validation);
    
    this.logger.info(`Started validation for ${version} in ${environment} (ID: ${validationId})`);
    
    // Start monitoring
    this.startMonitoring(validationId);
    
    return validationId;
  }

  /**
   * Stop release validation
   */
  async stopValidation(validationId: string, status: 'passed' | 'failed'): Promise<void> {
    const validation = this.validations.get(validationId);
    if (!validation) {
      throw new Error(`Validation ${validationId} not found`);
    }

    validation.status = status;
    validation.endTime = Date.now();
    
    this.logger.info(`Validation ${validationId} completed with status: ${status}`);
    
    // Save validation results
    await this.saveValidationResults(validation);
    
    // Clean up
    this.validations.delete(validationId);
  }

  /**
   * Start continuous monitoring
   */
  private async startMonitoring(validationId: string): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    
    const validation = this.validations.get(validationId);
    if (!validation) {
      return;
    }

    const validationPeriod = this.config.validationPeriodMinutes * 60 * 1000;
    const checkInterval = 30000; // 30 seconds
    const endTime = validation.startTime + validationPeriod;

    this.logger.info(`Monitoring release for ${this.config.validationPeriodMinutes} minutes`);

    const monitoringInterval = setInterval(async () => {
      try {
        const now = Date.now();
        
        // Check if validation period has ended
        if (now >= endTime) {
          clearInterval(monitoringInterval);
          this.isMonitoring = false;
          await this.stopValidation(validationId, 'passed');
          return;
        }

        // Run health checks
        await this.runHealthChecks(validationId);
        
        // Check if rollback is needed
        const shouldRollback = await this.shouldTriggerRollback(validationId);
        if (shouldRollback.trigger) {
          clearInterval(monitoringInterval);
          this.isMonitoring = false;
          await this.triggerRollback(validationId, shouldRollback.reason);
          return;
        }

      } catch (error) {
        this.logger.error('Monitoring error:', error);
      }
    }, checkInterval);
  }

  /**
   * Run all health checks
   */
  private async runHealthChecks(validationId: string): Promise<void> {
    const validation = this.validations.get(validationId);
    if (!validation) {
      return;
    }

    const results = await Promise.allSettled(
      this.healthChecks.map(check => this.runHealthCheck(check))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const check = this.healthChecks[i];
      
      if (result.status === 'fulfilled') {
        validation.healthChecks.push(result.value);
      } else {
        validation.healthChecks.push({
          check,
          timestamp: Date.now(),
          status: 'failed',
          duration: 0,
          error: result.reason?.message || 'Unknown error',
        });
      }
    }

    // Update metrics
    await this.updateValidationMetrics(validationId);
  }

  /**
   * Run individual health check
   */
  private async runHealthCheck(check: HealthCheck): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      let response: any;
      
      switch (check.type) {
        case 'http':
          response = await this.runHttpCheck(check);
          break;
        case 'command':
          response = await this.runCommandCheck(check);
          break;
        case 'metric':
          response = await this.runMetricCheck(check);
          break;
        case 'custom':
          response = await this.runCustomCheck(check);
          break;
        default:
          throw new Error(`Unknown check type: ${check.type}`);
      }

      return {
        check,
        timestamp: Date.now(),
        status: 'passed',
        duration: Date.now() - startTime,
        response,
      };

    } catch (error) {
      return {
        check,
        timestamp: Date.now(),
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run HTTP health check
   */
  private async runHttpCheck(check: HealthCheck): Promise<any> {
    if (!check.endpoint) {
      throw new Error('HTTP check requires endpoint');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), check.timeout);

    try {
      const response = await fetch(check.endpoint, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'CodeCraft-RollbackValidator/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return {
        status: response.status,
        statusText: response.statusText,
        responseTime: Date.now(),
      };

    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Run command health check
   */
  private async runCommandCheck(check: HealthCheck): Promise<any> {
    if (!check.command) {
      throw new Error('Command check requires command');
    }

    try {
      const output = execSync(check.command, {
        timeout: check.timeout,
        encoding: 'utf8',
      });

      return {
        output: output.trim(),
        exitCode: 0,
      };

    } catch (error: any) {
      throw new Error(`Command failed: ${error.message}`);
    }
  }

  /**
   * Run metric health check
   */
  private async runMetricCheck(check: HealthCheck): Promise<any> {
    if (!check.metricName) {
      throw new Error('Metric check requires metricName');
    }

    // Fetch metric from monitoring system (Prometheus, CloudWatch, etc.)
    const metricValue = await this.fetchMetric(check.metricName);
    
    if (check.threshold !== undefined && metricValue > check.threshold) {
      throw new Error(`Metric ${check.metricName} (${metricValue}) exceeds threshold (${check.threshold})`);
    }

    return {
      metricName: check.metricName,
      value: metricValue,
      threshold: check.threshold,
    };
  }

  /**
   * Run custom health check
   */
  private async runCustomCheck(check: HealthCheck): Promise<any> {
    // Implement custom check logic based on check.name
    // This is a placeholder for extensible custom checks
    return { status: 'custom_check_passed' };
  }

  /**
   * Fetch metric from monitoring system
   */
  private async fetchMetric(metricName: string): Promise<number> {
    // This would integrate with your monitoring system
    // For now, return a placeholder value
    return Math.random() * 100;
  }

  /**
   * Update validation metrics
   */
  private async updateValidationMetrics(validationId: string): Promise<void> {
    const validation = this.validations.get(validationId);
    if (!validation) {
      return;
    }

    const recentChecks = validation.healthChecks.slice(-10); // Last 10 checks
    const failedChecks = recentChecks.filter(check => check.status === 'failed');
    
    // Calculate error rate
    validation.metrics.errorRate = recentChecks.length > 0 
      ? (failedChecks.length / recentChecks.length) * 100 
      : 0;
    
    // Calculate average response time
    const responseTimes = recentChecks
      .filter(check => check.status === 'passed')
      .map(check => check.duration);
    
    validation.metrics.responseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;
    
    // Calculate availability
    validation.metrics.availabilityPercent = recentChecks.length > 0
      ? ((recentChecks.length - failedChecks.length) / recentChecks.length) * 100
      : 100;

    // Update throughput and user satisfaction from external metrics
    validation.metrics.throughput = await this.fetchMetric('requests_per_second') || 0;
    validation.metrics.userSatisfaction = await this.fetchMetric('user_satisfaction_score') || 100;
  }

  /**
   * Determine if rollback should be triggered
   */
  private async shouldTriggerRollback(validationId: string): Promise<{ trigger: boolean; reason?: string }> {
    if (!this.config.autoRollback) {
      return { trigger: false };
    }

    const validation = this.validations.get(validationId);
    if (!validation) {
      return { trigger: false };
    }

    const { metrics } = validation;
    const { thresholds } = this.config;
    
    // Check error rate threshold
    if (metrics.errorRate > thresholds.errorRatePercent) {
      return {
        trigger: true,
        reason: `Error rate ${metrics.errorRate.toFixed(2)}% exceeds threshold ${thresholds.errorRatePercent}%`,
      };
    }

    // Check response time threshold
    if (metrics.responseTime > thresholds.responseTimeMs) {
      return {
        trigger: true,
        reason: `Response time ${metrics.responseTime.toFixed(0)}ms exceeds threshold ${thresholds.responseTimeMs}ms`,
      };
    }

    // Check availability threshold
    if (metrics.availabilityPercent < thresholds.availabilityPercent) {
      return {
        trigger: true,
        reason: `Availability ${metrics.availabilityPercent.toFixed(2)}% below threshold ${thresholds.availabilityPercent}%`,
      };
    }

    // Check failed health checks
    const recentChecks = validation.healthChecks.slice(-10);
    const criticalFailures = recentChecks.filter(
      check => check.status === 'failed' && check.check.critical
    );

    if (criticalFailures.length >= thresholds.failedHealthChecks) {
      return {
        trigger: true,
        reason: `${criticalFailures.length} critical health check failures exceed threshold ${thresholds.failedHealthChecks}`,
      };
    }

    return { trigger: false };
  }

  /**
   * Trigger rollback
   */
  private async triggerRollback(validationId: string, reason: string): Promise<void> {
    const validation = this.validations.get(validationId);
    if (!validation) {
      return;
    }

    this.logger.error(`Triggering rollback for ${validation.version}: ${reason}`);
    
    validation.rollbackTriggered = true;
    validation.rollbackReason = reason;
    validation.status = 'rolled_back';
    validation.endTime = Date.now();

    try {
      // Execute rollback
      await this.executeRollback(validation);
      
      // Send notifications
      await this.sendRollbackNotifications(validation, reason);
      
      this.logger.info(`Rollback completed for ${validation.version}`);

    } catch (error) {
      this.logger.error('Rollback execution failed:', error);
      await this.sendRollbackFailureNotifications(validation, error);
    }

    // Save results
    await this.saveValidationResults(validation);
  }

  /**
   * Execute rollback process
   */
  private async executeRollback(validation: ReleaseValidation): Promise<void> {
    const environment = validation.environment;
    
    this.logger.info(`Executing rollback in ${environment} environment`);

    if (environment === 'production') {
      // Production rollback
      await this.rollbackProduction(validation);
    } else {
      // Staging rollback
      await this.rollbackStaging(validation);
    }
  }

  /**
   * Rollback production deployment
   */
  private async rollbackProduction(validation: ReleaseValidation): Promise<void> {
    // Get previous stable version
    const previousVersion = await this.getPreviousStableVersion();
    
    // Kubernetes rollback
    execSync(`kubectl rollout undo deployment/codecraft-cli -n codecraft-production`, {
      timeout: this.config.rollbackTimeoutMinutes * 60 * 1000,
    });
    
    // Wait for rollback to complete
    execSync(`kubectl rollout status deployment/codecraft-cli -n codecraft-production --timeout=600s`);
    
    // Update load balancer to route traffic to previous version
    await this.updateLoadBalancer(previousVersion);
    
    // Verify rollback
    await this.verifyRollback(previousVersion);
  }

  /**
   * Rollback staging deployment
   */
  private async rollbackStaging(validation: ReleaseValidation): Promise<void> {
    // Similar to production but for staging environment
    execSync(`kubectl rollout undo deployment/codecraft-cli -n codecraft-staging`, {
      timeout: this.config.rollbackTimeoutMinutes * 60 * 1000,
    });
    
    execSync(`kubectl rollout status deployment/codecraft-cli -n codecraft-staging --timeout=600s`);
  }

  /**
   * Get previous stable version
   */
  private async getPreviousStableVersion(): Promise<string> {
    // Query deployment history or version registry
    const output = execSync('kubectl rollout history deployment/codecraft-cli -n codecraft-production', {
      encoding: 'utf8',
    });
    
    // Parse and return previous version
    // This is a simplified implementation
    return '1.0.0'; // Placeholder
  }

  /**
   * Update load balancer configuration
   */
  private async updateLoadBalancer(version: string): Promise<void> {
    // Update load balancer, CDN, or ingress configuration
    // This would integrate with your infrastructure
  }

  /**
   * Verify rollback was successful
   */
  private async verifyRollback(expectedVersion: string): Promise<void> {
    // Run basic health checks to verify rollback
    const healthCheck: HealthCheck = {
      name: 'rollback-verification',
      type: 'http',
      endpoint: 'https://cli.codecraft.dev/health',
      timeout: 10000,
      retries: 3,
      critical: true,
      description: 'Verify rollback completed successfully',
    };

    const result = await this.runHealthCheck(healthCheck);
    
    if (result.status !== 'passed') {
      throw new Error(`Rollback verification failed: ${result.error}`);
    }
  }

  /**
   * Send rollback notifications
   */
  private async sendRollbackNotifications(validation: ReleaseValidation, reason: string): Promise<void> {
    const message = {
      title: `🚨 Automatic Rollback Triggered`,
      text: `Version ${validation.version} has been automatically rolled back in ${validation.environment}`,
      fields: [
        { name: 'Version', value: validation.version, inline: true },
        { name: 'Environment', value: validation.environment, inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Timestamp', value: new Date().toISOString(), inline: true },
      ],
      color: 'danger',
    };

    // Send to configured notification channels
    for (const channel of this.config.notificationChannels) {
      try {
        await this.sendNotification(channel, message);
      } catch (error) {
        this.logger.error(`Failed to send notification to ${channel}:`, error);
      }
    }
  }

  /**
   * Send rollback failure notifications
   */
  private async sendRollbackFailureNotifications(validation: ReleaseValidation, error: any): Promise<void> {
    const message = {
      title: `🆘 Rollback Failed`,
      text: `Automatic rollback for ${validation.version} failed in ${validation.environment}`,
      fields: [
        { name: 'Version', value: validation.version, inline: true },
        { name: 'Environment', value: validation.environment, inline: true },
        { name: 'Error', value: error.message, inline: false },
        { name: 'Action Required', value: 'Manual intervention needed', inline: false },
      ],
      color: 'danger',
    };

    for (const channel of this.config.notificationChannels) {
      try {
        await this.sendNotification(channel, message);
      } catch (notifyError) {
        this.logger.error(`Failed to send failure notification to ${channel}:`, notifyError);
      }
    }
  }

  /**
   * Send notification to external service
   */
  private async sendNotification(channel: string, message: any): Promise<void> {
    if (channel.startsWith('slack://')) {
      await this.sendSlackNotification(channel, message);
    } else if (channel.startsWith('discord://')) {
      await this.sendDiscordNotification(channel, message);
    } else if (channel.startsWith('email://')) {
      await this.sendEmailNotification(channel, message);
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(webhookUrl: string, message: any): Promise<void> {
    const url = webhookUrl.replace('slack://', 'https://hooks.slack.com/');
    
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message.title,
        attachments: [
          {
            color: message.color,
            text: message.text,
            fields: message.fields,
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      }),
    });
  }

  /**
   * Send Discord notification
   */
  private async sendDiscordNotification(webhookUrl: string, message: any): Promise<void> {
    const url = webhookUrl.replace('discord://', 'https://discord.com/api/webhooks/');
    
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: message.title,
            description: message.text,
            color: message.color === 'danger' ? 15158332 : 3066993,
            fields: message.fields,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(emailConfig: string, message: any): Promise<void> {
    // Implement email notification
    // This would integrate with your email service
  }

  /**
   * Save validation results
   */
  private async saveValidationResults(validation: ReleaseValidation): Promise<void> {
    const fileName = `validation-${validation.version}-${validation.environment}-${validation.startTime}.json`;
    const filePath = `./data/validations/${fileName}`;
    
    await fs.mkdir('./data/validations', { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(validation, null, 2));
    
    this.logger.info(`Validation results saved to ${filePath}`);
  }
}