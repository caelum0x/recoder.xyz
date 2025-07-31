/**
 * Production Monitoring System for Recoder.xyz Ecosystem
 * 
 * Comprehensive monitoring, analytics, and alerting across CLI, Web, and Extension
 */

import { EventEmitter } from 'events';

export interface MetricData {
  name: string; 
  value: number;
  unit: string;
  timestamp: number;
  platform: 'cli' | 'web' | 'extension';
  dimensions?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  duration: number; // milliseconds
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: string[];
  enabled: boolean;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical';
  services: {
    cli: ServiceHealth;
    web: ServiceHealth;
    extension: ServiceHealth;
    aiProviders: Record<string, ServiceHealth>;
  };
  metrics: {
    uptime: number;
    responseTime: number;
    errorRate: number;
    activeUsers: number;
    codeGenerations: number;
  };
  lastUpdated: number;
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  responseTime: number;
  errorRate: number;
  lastCheck: number;
  issues: string[];
}

export class ProductionMonitoring extends EventEmitter {
  private static instance: ProductionMonitoring;
  private metrics: Map<string, MetricData[]> = new Map();
  private alerts: Map<string, AlertRule> = new Map();
  private healthChecks: Map<string, () => Promise<ServiceHealth>> = new Map();
  private isMonitoring: boolean = false;
  private monitoringInterval?: NodeJS.Timeout;

  private constructor() {
    super();
    this.initializeDefaultAlerts();
    this.initializeHealthChecks();
  }

  static getInstance(): ProductionMonitoring {
    if (!ProductionMonitoring.instance) {
      ProductionMonitoring.instance = new ProductionMonitoring();
    }
    return ProductionMonitoring.instance;
  }

  /**
   * Start monitoring system
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    
    // Start periodic health checks
    this.monitoringInterval = setInterval(() => {
      this.performHealthChecks();
    }, 30000); // Every 30 seconds

    // Start metric collection
    this.startMetricCollection();

    this.emit('monitoring:started');
    console.log('🔍 Production monitoring started');
  }

  /**
   * Stop monitoring system
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.emit('monitoring:stopped');
    console.log('🔍 Production monitoring stopped');
  }

  /**
   * Record a metric
   */
  recordMetric(metric: Omit<MetricData, 'timestamp'>): void {
    const metricData: MetricData = {
      ...metric,
      timestamp: Date.now()
    };

    // Store metric
    const key = `${metric.platform}:${metric.name}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const metrics = this.metrics.get(key)!;
    metrics.push(metricData);

    // Keep only last 1000 metrics per key
    if (metrics.length > 1000) {
      metrics.splice(0, metrics.length - 1000);
    }

    // Check alerts
    this.checkAlerts(metricData);

    // Emit metric event
    this.emit('metric:recorded', metricData);

    // Send to external monitoring services
    this.sendToExternalServices(metricData);
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultAlerts(): void {
    const defaultAlerts: AlertRule[] = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        metric: 'error_rate',
        condition: 'gt',
        threshold: 5, // 5%
        duration: 300000, // 5 minutes
        severity: 'high',
        channels: ['slack', 'email'],
        enabled: true
      },
      {
        id: 'slow_response_time',
        name: 'Slow Response Time',
        metric: 'response_time',
        condition: 'gt',
        threshold: 5000, // 5 seconds
        duration: 180000, // 3 minutes
        severity: 'medium',
        channels: ['slack'],
        enabled: true
      },
      {
        id: 'low_ai_provider_success',
        name: 'Low AI Provider Success Rate',
        metric: 'ai_success_rate',
        condition: 'lt',
        threshold: 90, // 90%
        duration: 600000, // 10 minutes
        severity: 'high',
        channels: ['slack', 'email', 'pagerduty'],
        enabled: true
      },
      {
        id: 'high_token_usage',
        name: 'High Token Usage',
        metric: 'token_usage_per_hour',
        condition: 'gt',
        threshold: 1000000, // 1M tokens per hour
        duration: 0, // Immediate
        severity: 'medium',
        channels: ['slack'],
        enabled: true
      },
      {
        id: 'low_system_uptime',
        name: 'Low System Uptime',
        metric: 'uptime_percentage',
        condition: 'lt',
        threshold: 99.5, // 99.5%
        duration: 900000, // 15 minutes
        severity: 'critical',
        channels: ['slack', 'email', 'pagerduty', 'sms'],
        enabled: true
      }
    ];

    defaultAlerts.forEach(alert => {
      this.alerts.set(alert.id, alert);
    });
  }

  /**
   * Initialize health check functions
   */
  private initializeHealthChecks(): void {
    // CLI health check
    this.healthChecks.set('cli', async (): Promise<ServiceHealth> => {
      try {
        // Check if CLI is responding
        const startTime = Date.now();
        
        // This would make an actual health check request
        // For now, we'll simulate
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const responseTime = Date.now() - startTime;
        
        return {
          status: 'healthy',
          uptime: this.calculateUptime('cli'),
          responseTime,
          errorRate: this.calculateErrorRate('cli'),
          lastCheck: Date.now(),
          issues: []
        };
      } catch (error) {
        return {
          status: 'critical',
          uptime: 0,
          responseTime: -1,
          errorRate: 100,
          lastCheck: Date.now(),
          issues: [error instanceof Error ? error.message : 'Unknown error']
        };
      }
    });

    // Web platform health check
    this.healthChecks.set('web', async (): Promise<ServiceHealth> => {
      try {
        const startTime = Date.now();
        
        // Check web platform health endpoint
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch('https://web.recoder.xyz/api/health', {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        const responseTime = Date.now() - startTime;
        
        if (response.ok) {
          return {
            status: 'healthy',
            uptime: this.calculateUptime('web'),
            responseTime,
            errorRate: this.calculateErrorRate('web'),
            lastCheck: Date.now(),
            issues: []
          };
        } else {
          return {
            status: 'degraded',
            uptime: this.calculateUptime('web'),
            responseTime,
            errorRate: this.calculateErrorRate('web'),
            lastCheck: Date.now(),
            issues: [`HTTP ${response.status}: ${response.statusText}`]
          };
        }
      } catch (error) {
        return {
          status: 'critical',
          uptime: 0,
          responseTime: -1,
          errorRate: 100,
          lastCheck: Date.now(),
          issues: [error instanceof Error ? error.message : 'Network error']
        };
      }
    });

    // AI providers health checks
    const aiProviders = ['claude', 'groq', 'gemini', 'ollama'];
    aiProviders.forEach(provider => {
      this.healthChecks.set(`ai:${provider}`, async (): Promise<ServiceHealth> => {
        return this.checkAIProviderHealth(provider);
      });
    });
  }

  /**
   * Check AI provider health
   */
  private async checkAIProviderHealth(provider: string): Promise<ServiceHealth> {
    try {
      const startTime = Date.now();
      
      // Make a simple test request to the AI provider
      let isHealthy = false;
      let responseTime = 0;
      
      switch (provider) {
        case 'claude':
          // Test Claude API
          if (process.env.ANTHROPIC_API_KEY) {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
              },
              body: JSON.stringify({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'ping' }]
              })
            });
            isHealthy = response.ok;
            responseTime = Date.now() - startTime;
          }
          break;
          
        case 'groq':
          // Test Groq API
          if (process.env.GROQ_API_KEY) {
            const response = await fetch('https://api.groq.com/openai/v1/models', {
              headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
              }
            });
            isHealthy = response.ok;
            responseTime = Date.now() - startTime;
          }
          break;
          
        case 'ollama':
          // Test Ollama
          if (process.env.OLLAMA_BASE_URL) {
            const response = await fetch(`${process.env.OLLAMA_BASE_URL}/api/tags`);
            isHealthy = response.ok;
            responseTime = Date.now() - startTime;
          }
          break;
          
        default:
          isHealthy = false;
      }
      
      return {
        status: isHealthy ? 'healthy' : 'degraded',
        uptime: this.calculateUptime(`ai:${provider}`),
        responseTime,
        errorRate: this.calculateErrorRate(`ai:${provider}`),
        lastCheck: Date.now(),
        issues: isHealthy ? [] : ['API not responding or not configured']
      };
      
    } catch (error) {
      return {
        status: 'critical',
        uptime: 0,
        responseTime: -1,
        errorRate: 100,
        lastCheck: Date.now(),
        issues: [error instanceof Error ? error.message : 'Connection failed']
      };
    }
  }

  /**
   * Perform health checks
   */
  private async performHealthChecks(): Promise<void> {
    const healthPromises = Array.from(this.healthChecks.entries()).map(
      async ([service, check]) => {
        try {
          const health = await check();
          this.emit('health:checked', service, health);
          return { service, health };
        } catch (error) {
          const errorHealth: ServiceHealth = {
            status: 'critical',
            uptime: 0,
            responseTime: -1,
            errorRate: 100,
            lastCheck: Date.now(),
            issues: [error instanceof Error ? error.message : 'Health check failed']
          };
          this.emit('health:checked', service, errorHealth);
          return { service, health: errorHealth };
        }
      }
    );

    const results = await Promise.all(healthPromises);
    
    // Calculate overall system health
    const systemHealth = this.calculateSystemHealth(results);
    this.emit('system:health', systemHealth);
  }

  /**
   * Calculate overall system health
   */
  private calculateSystemHealth(healthResults: Array<{ service: string; health: ServiceHealth }>): SystemHealth {
    const services: SystemHealth['services'] = {
      cli: healthResults.find(r => r.service === 'cli')?.health || this.getDefaultHealth(),
      web: healthResults.find(r => r.service === 'web')?.health || this.getDefaultHealth(),
      extension: this.getDefaultHealth(), // Extension health would be reported separately
      aiProviders: {}
    };

    // Add AI provider health
    healthResults
      .filter(r => r.service.startsWith('ai:'))
      .forEach(r => {
        const provider = r.service.replace('ai:', '');
        services.aiProviders[provider] = r.health;
      });

    // Calculate overall status
    const allStatuses = [
      services.cli.status,
      services.web.status,
      ...Object.values(services.aiProviders).map(h => h.status)
    ];

    let overall: SystemHealth['overall'] = 'healthy';
    if (allStatuses.some(s => s === 'critical')) {
      overall = 'critical';
    } else if (allStatuses.some(s => s === 'degraded')) {
      overall = 'degraded';
    }

    return {
      overall,
      services,
      metrics: {
        uptime: this.calculateAverageUptime(),
        responseTime: this.calculateAverageResponseTime(),
        errorRate: this.calculateAverageErrorRate(),
        activeUsers: this.getActiveUsers(),
        codeGenerations: this.getCodeGenerations()
      },
      lastUpdated: Date.now()
    };
  }

  /**
   * Start metric collection
   */
  private startMetricCollection(): void {
    // Collect system metrics every minute
    setInterval(() => {
      this.collectSystemMetrics();
    }, 60000);

    // Collect usage metrics every 5 minutes
    setInterval(() => {
      this.collectUsageMetrics();
    }, 300000);
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    // CPU usage
    const cpuUsage = process.cpuUsage();
    this.recordMetric({
      name: 'cpu_usage',
      value: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      unit: 'seconds',
      platform: 'cli'
    });

    // Memory usage
    const memUsage = process.memoryUsage();
    this.recordMetric({
      name: 'memory_usage',
      value: memUsage.heapUsed / 1024 / 1024, // Convert to MB
      unit: 'MB',
      platform: 'cli'
    });

    // Process uptime
    this.recordMetric({
      name: 'process_uptime',
      value: process.uptime(),
      unit: 'seconds',
      platform: 'cli'
    });
  }

  /**
   * Collect usage metrics
   */
  private collectUsageMetrics(): void {
    // These would be collected from actual usage data
    this.recordMetric({
      name: 'active_users',
      value: this.getActiveUsers(),
      unit: 'count',
      platform: 'web'
    });

    this.recordMetric({
      name: 'code_generations',
      value: this.getCodeGenerations(),
      unit: 'count',
      platform: 'cli'
    });
  }

  /**
   * Check alerts for a metric
   */
  private checkAlerts(metric: MetricData): void {
    for (const alert of this.alerts.values()) {
      if (!alert.enabled) continue;
      
      if (alert.metric === metric.name) {
        const shouldAlert = this.evaluateAlertCondition(alert, metric.value);
        
        if (shouldAlert) {
          this.triggerAlert(alert, metric);
        }
      }
    }
  }

  /**
   * Evaluate alert condition
   */
  private evaluateAlertCondition(alert: AlertRule, value: number): boolean {
    switch (alert.condition) {
      case 'gt': return value > alert.threshold;
      case 'gte': return value >= alert.threshold;
      case 'lt': return value < alert.threshold;
      case 'lte': return value <= alert.threshold;
      case 'eq': return value === alert.threshold;
      default: return false;
    }
  }

  /**
   * Trigger alert
   */
  private triggerAlert(alert: AlertRule, metric: MetricData): void {
    const alertEvent = {
      alert,
      metric,
      timestamp: Date.now(),
      message: `Alert: ${alert.name} - ${metric.name} is ${metric.value} ${metric.unit} (threshold: ${alert.threshold})`
    };

    this.emit('alert:triggered', alertEvent);

    // Send to alert channels
    alert.channels.forEach(channel => {
      this.sendAlert(channel, alertEvent);
    });
  }

  /**
   * Send alert to channel
   */
  private sendAlert(channel: string, alertEvent: any): void {
    switch (channel) {
      case 'slack':
        this.sendSlackAlert(alertEvent);
        break;
      case 'email':
        this.sendEmailAlert(alertEvent);
        break;
      case 'pagerduty':
        this.sendPagerDutyAlert(alertEvent);
        break;
      case 'sms':
        this.sendSMSAlert(alertEvent);
        break;
      default:
        console.warn(`Unknown alert channel: ${channel}`);
    }
  }

  /**
   * Send alert to Slack
   */
  private async sendSlackAlert(alertEvent: any): Promise<void> {
    if (!process.env.SLACK_WEBHOOK_URL) return;

    try {
      const payload = {
        text: `🚨 Recoder.xyz Alert`,
        attachments: [
          {
            color: this.getAlertColor(alertEvent.alert.severity),
            fields: [
              {
                title: 'Alert',
                value: alertEvent.alert.name,
                short: true
              },
              {
                title: 'Metric',
                value: `${alertEvent.metric.name}: ${alertEvent.metric.value} ${alertEvent.metric.unit}`,
                short: true
              },
              {
                title: 'Threshold',
                value: `${alertEvent.alert.condition} ${alertEvent.alert.threshold}`,
                short: true
              },
              {
                title: 'Platform',
                value: alertEvent.metric.platform,
                short: true
              }
            ],
            ts: Math.floor(alertEvent.timestamp / 1000)
          }
        ]
      };

      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }

  /**
   * Send to external monitoring services
   */
  private sendToExternalServices(metric: MetricData): void {
    // Send to DataDog
    this.sendToDataDog(metric);
    
    // Send to New Relic
    this.sendToNewRelic(metric);
    
    // Send to Prometheus
    this.sendToPrometheus(metric);
  }

  /**
   * Send metric to DataDog
   */
  private async sendToDataDog(metric: MetricData): Promise<void> {
    if (!process.env.DATADOG_API_KEY) return;

    try {
      const payload = {
        series: [
          {
            metric: `recoder.${metric.platform}.${metric.name}`,
            points: [[Math.floor(metric.timestamp / 1000), metric.value]],
            tags: [
              `platform:${metric.platform}`,
              ...(metric.dimensions ? Object.entries(metric.dimensions).map(([k, v]) => `${k}:${v}`) : [])
            ]
          }
        ]
      };

      await fetch('https://api.datadoghq.com/api/v1/series', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': process.env.DATADOG_API_KEY
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Failed to send metric to DataDog:', error);
    }
  }

  // Helper methods
  private getAlertColor(severity: string): string {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return '#ff9900';
      case 'low': return 'good';
      default: return '#cccccc';
    }
  }

  private calculateUptime(service: string): number {
    // Calculate uptime percentage based on historical data
    return 99.5; // Placeholder
  }

  private calculateErrorRate(service: string): number {
    // Calculate error rate based on historical data
    return 0.1; // Placeholder
  }

  private calculateAverageUptime(): number {
    return 99.5; // Placeholder
  }

  private calculateAverageResponseTime(): number {
    return 250; // Placeholder
  }

  private calculateAverageErrorRate(): number {
    return 0.1; // Placeholder
  }

  private getActiveUsers(): number {
    return 1247; // Placeholder - would come from actual analytics
  }

  private getCodeGenerations(): number {
    return 3521; // Placeholder - would come from actual usage data
  }

  private getDefaultHealth(): ServiceHealth {
    return {
      status: 'healthy',
      uptime: 99.5,
      responseTime: 200,
      errorRate: 0.1,
      lastCheck: Date.now(),
      issues: []
    };
  }

  private async sendEmailAlert(alertEvent: any): Promise<void> {
    // Email alert implementation
  }

  private async sendPagerDutyAlert(alertEvent: any): Promise<void> {
    // PagerDuty alert implementation
  }

  private async sendSMSAlert(alertEvent: any): Promise<void> {
    // SMS alert implementation
  }

  private async sendToNewRelic(metric: MetricData): Promise<void> {
    // New Relic integration
  }

  private async sendToPrometheus(metric: MetricData): Promise<void> {
    // Prometheus integration
  }
}

// Export singleton instance
export const productionMonitoring = ProductionMonitoring.getInstance();

export default ProductionMonitoring;