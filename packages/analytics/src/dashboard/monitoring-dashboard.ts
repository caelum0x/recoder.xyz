/**
 * Real-time Monitoring Dashboard for Recoder.xyz Ecosystem
 * 
 * Provides live monitoring across CLI, Web Platform, and VS Code Extension
 */

import { EventEmitter } from 'events';
import { productionMonitoring, SystemHealth, MetricData } from '../monitoring/production-monitoring';

export interface DashboardMetrics {
  overview: {
    totalUsers: number;
    activeUsers: number;
    codeGenerations: number;
    uptime: number;
    responseTime: number;
    errorRate: number;
  };
  platforms: {
    cli: PlatformMetrics;
    web: PlatformMetrics;
    extension: PlatformMetrics;
  };
  aiProviders: {
    claude: AIProviderMetrics;
    groq: AIProviderMetrics;
    gemini: AIProviderMetrics;
    ollama: AIProviderMetrics;
  };
  realTime: {
    activeGenerations: number;
    queuedRequests: number;
    averageResponseTime: number;
    tokensPerMinute: number;
  };
}

export interface PlatformMetrics {
  status: 'healthy' | 'degraded' | 'critical';
  users: number;
  requests: number;
  errors: number;
  uptime: number;
  version: string;
}

export interface AIProviderMetrics {
  status: 'healthy' | 'degraded' | 'critical';
  requestsPerMinute: number;
  successRate: number;
  averageTokens: number;
  responseTime: number;
  cost: number;
}

export class MonitoringDashboard extends EventEmitter {
  private static instance: MonitoringDashboard;
  private metrics: DashboardMetrics;
  private updateInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  private constructor() {
    super();
    this.metrics = this.initializeMetrics();
    this.setupEventListeners();
  }

  static getInstance(): MonitoringDashboard {
    if (!MonitoringDashboard.instance) {
      MonitoringDashboard.instance = new MonitoringDashboard();
    }
    return MonitoringDashboard.instance;
  }

  /**
   * Start dashboard monitoring
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    
    // Start production monitoring
    productionMonitoring.startMonitoring();
    
    // Update dashboard every 5 seconds
    this.updateInterval = setInterval(() => {
      this.updateMetrics();
    }, 5000);

    this.emit('dashboard:started');
    console.log('📊 Monitoring dashboard started');
  }

  /**
   * Stop dashboard monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }

    productionMonitoring.stopMonitoring();
    this.emit('dashboard:stopped');
    console.log('📊 Monitoring dashboard stopped');
  }

  /**
   * Get current metrics
   */
  getMetrics(): DashboardMetrics {
    return { ...this.metrics };
  }

  /**
   * Get metrics for specific platform
   */
  getPlatformMetrics(platform: 'cli' | 'web' | 'extension'): PlatformMetrics {
    return { ...this.metrics.platforms[platform] };
  }

  /**
   * Get AI provider metrics
   */
  getAIProviderMetrics(provider: 'claude' | 'groq' | 'gemini' | 'ollama'): AIProviderMetrics {
    return { ...this.metrics.aiProviders[provider] };
  }

  /**
   * Generate dashboard report
   */
  generateReport(): DashboardReport {
    const now = Date.now();
    
    return {
      timestamp: now,
      summary: {
        overallHealth: this.calculateOverallHealth(),
        totalUsers: this.metrics.overview.totalUsers,
        codeGenerations: this.metrics.overview.codeGenerations,
        uptime: this.metrics.overview.uptime,
        keyMetrics: this.getKeyMetrics()
      },
      platforms: this.metrics.platforms,
      aiProviders: this.metrics.aiProviders,
      alerts: this.getActiveAlerts(),
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Initialize default metrics
   */
  private initializeMetrics(): DashboardMetrics {
    return {
      overview: {
        totalUsers: 0,
        activeUsers: 0,
        codeGenerations: 0,
        uptime: 99.5,
        responseTime: 250,
        errorRate: 0.1
      },
      platforms: {
        cli: {
          status: 'healthy',
          users: 0,
          requests: 0,
          errors: 0,
          uptime: 99.5,
          version: '1.0.0'
        },
        web: {
          status: 'healthy',
          users: 0,
          requests: 0,
          errors: 0,
          uptime: 99.5,
          version: '1.0.0'
        },
        extension: {
          status: 'healthy',
          users: 0,
          requests: 0,
          errors: 0,
          uptime: 99.5,
          version: '1.0.0'
        }
      },
      aiProviders: {
        claude: {
          status: 'healthy',
          requestsPerMinute: 0,
          successRate: 99.5,
          averageTokens: 1200,
          responseTime: 2500,
          cost: 0
        },
        groq: {
          status: 'healthy',
          requestsPerMinute: 0,
          successRate: 99.8,
          averageTokens: 800,
          responseTime: 400,
          cost: 0
        },
        gemini: {
          status: 'healthy',
          requestsPerMinute: 0,
          successRate: 99.2,
          averageTokens: 1000,
          responseTime: 1800,
          cost: 0
        },
        ollama: {
          status: 'healthy',
          requestsPerMinute: 0,
          successRate: 98.5,
          averageTokens: 600,
          responseTime: 5000,
          cost: 0
        }
      },
      realTime: {
        activeGenerations: 0,
        queuedRequests: 0,
        averageResponseTime: 250,
        tokensPerMinute: 0
      }
    };
  }

  /**
   * Setup event listeners for monitoring updates
   */
  private setupEventListeners(): void {
    productionMonitoring.on('system:health', (health: SystemHealth) => {
      this.updateFromSystemHealth(health);
    });

    productionMonitoring.on('metric:recorded', (metric: MetricData) => {
      this.updateFromMetric(metric);
    });

    productionMonitoring.on('alert:triggered', (alert: any) => {
      this.emit('dashboard:alert', alert);
    });
  }

  /**
   * Update metrics from system health data
   */
  private updateFromSystemHealth(health: SystemHealth): void {
    // Update overview metrics
    this.metrics.overview.uptime = health.metrics.uptime;
    this.metrics.overview.responseTime = health.metrics.responseTime;
    this.metrics.overview.errorRate = health.metrics.errorRate;
    this.metrics.overview.activeUsers = health.metrics.activeUsers;
    this.metrics.overview.codeGenerations = health.metrics.codeGenerations;

    // Update platform metrics
    this.metrics.platforms.cli.status = health.services.cli.status;
    this.metrics.platforms.cli.uptime = health.services.cli.uptime;
    
    this.metrics.platforms.web.status = health.services.web.status;
    this.metrics.platforms.web.uptime = health.services.web.uptime;

    this.metrics.platforms.extension.status = health.services.extension.status;
    this.metrics.platforms.extension.uptime = health.services.extension.uptime;

    // Update AI provider metrics
    for (const [provider, providerHealth] of Object.entries(health.services.aiProviders)) {
      if (provider in this.metrics.aiProviders) {
        this.metrics.aiProviders[provider as keyof typeof this.metrics.aiProviders].status = providerHealth.status;
        this.metrics.aiProviders[provider as keyof typeof this.metrics.aiProviders].responseTime = providerHealth.responseTime;
      }
    }

    this.emit('dashboard:updated', this.metrics);
  }

  /**
   * Update metrics from individual metric data
   */
  private updateFromMetric(metric: MetricData): void {
    switch (metric.name) {
      case 'active_users':
        this.metrics.overview.activeUsers = metric.value;
        if (metric.platform in this.metrics.platforms) {
          this.metrics.platforms[metric.platform as keyof typeof this.metrics.platforms].users = metric.value;
        }
        break;

      case 'code_generations':
        this.metrics.overview.codeGenerations += metric.value;
        break;

      case 'response_time':
        this.metrics.overview.responseTime = metric.value;
        this.metrics.realTime.averageResponseTime = metric.value;
        break;

      case 'error_rate':
        this.metrics.overview.errorRate = metric.value;
        break;

      case 'tokens_per_minute':
        this.metrics.realTime.tokensPerMinute = metric.value;
        break;

      case 'active_generations':
        this.metrics.realTime.activeGenerations = metric.value;
        break;

      case 'queued_requests':
        this.metrics.realTime.queuedRequests = metric.value;
        break;
    }
  }

  /**
   * Update all metrics
   */
  private updateMetrics(): void {
    // Simulate real-time updates (would be replaced with actual data sources)
    this.metrics.realTime.activeGenerations = Math.floor(Math.random() * 50);
    this.metrics.realTime.queuedRequests = Math.floor(Math.random() * 10);
    this.metrics.realTime.tokensPerMinute = Math.floor(Math.random() * 10000) + 5000;
    
    // Update AI provider request rates
    Object.keys(this.metrics.aiProviders).forEach(provider => {
      this.metrics.aiProviders[provider as keyof typeof this.metrics.aiProviders].requestsPerMinute = 
        Math.floor(Math.random() * 100) + 20;
    });

    this.emit('dashboard:updated', this.metrics);
  }

  private calculateOverallHealth(): 'healthy' | 'degraded' | 'critical' {
    const platformStatuses = Object.values(this.metrics.platforms).map(p => p.status);
    const aiProviderStatuses = Object.values(this.metrics.aiProviders).map(p => p.status);
    const allStatuses = [...platformStatuses, ...aiProviderStatuses];

    if (allStatuses.some(s => s === 'critical')) {
      return 'critical';
    } else if (allStatuses.some(s => s === 'degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  private getKeyMetrics() {
    return {
      averageResponseTime: this.metrics.overview.responseTime,
      successRate: 100 - this.metrics.overview.errorRate,
      throughput: this.metrics.realTime.tokensPerMinute,
      concurrentUsers: this.metrics.overview.activeUsers
    };
  }

  private getActiveAlerts(): any[] {
    // Would integrate with alerting system
    return [];
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    if (this.metrics.overview.responseTime > 5000) {
      recommendations.push('Consider optimizing AI provider selection for better response times');
    }

    // Capacity recommendations
    if (this.metrics.realTime.queuedRequests > 50) {
      recommendations.push('High request queue detected - consider scaling infrastructure');
    }

    // Cost optimization
    const totalCost = Object.values(this.metrics.aiProviders).reduce((sum, p) => sum + p.cost, 0);
    if (totalCost > 1000) {
      recommendations.push('Monthly AI costs are high - review provider usage optimization');
    }

    return recommendations;
  }
}

export interface DashboardReport {
  timestamp: number;
  summary: {
    overallHealth: 'healthy' | 'degraded' | 'critical';
    totalUsers: number;
    codeGenerations: number;
    uptime: number;
    keyMetrics: {
      averageResponseTime: number;
      successRate: number;
      throughput: number;
      concurrentUsers: number;
    };
  };
  platforms: DashboardMetrics['platforms'];
  aiProviders: DashboardMetrics['aiProviders'];
  alerts: any[];
  recommendations: string[];
}

// Export singleton instance
export const monitoringDashboard = MonitoringDashboard.getInstance();

export default MonitoringDashboard;