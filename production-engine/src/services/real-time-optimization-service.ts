/**
 * Real-Time Service Optimization Engine
 * Performance optimization and intelligent routing for Recoder.xyz
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import WebSocket from 'ws';

interface ServiceMetrics {
  service: string;
  endpoint: string;
  responseTime: number;
  errorRate: number;
  throughput: number;
  cpuUsage: number;
  memoryUsage: number;
  timestamp: number;
}

interface OptimizationRule {
  id: string;
  condition: string;
  action: string;
  priority: number;
  enabled: boolean;
}

export class RealTimeOptimizationService extends EventEmitter {
  private redis: Redis;
  private wsServer: WebSocket.Server;
  private metricsCache: Map<string, ServiceMetrics[]> = new Map();
  private optimizationRules: OptimizationRule[] = [];
  private alertThresholds = {
    responseTime: 2000,
    errorRate: 0.05,
    cpuUsage: 0.8,
    memoryUsage: 0.9
  };

  constructor() {
    super();
    this.redis = new Redis(process.env.REDIS_URL);
    this.wsServer = new WebSocket.Server({ port: 8081 });
    
    this.initializeOptimizationRules();
    this.startMetricsCollection();
    this.setupWebSocketHandlers();
  }

  private initializeOptimizationRules() {
    this.optimizationRules = [
      {
        id: 'high-response-time-scale',
        condition: 'responseTime > 1000 && throughput > 100',
        action: 'scale-up',
        priority: 1,
        enabled: true
      },
      {
        id: 'high-error-rate-circuit-breaker',
        condition: 'errorRate > 0.1',
        action: 'circuit-breaker',
        priority: 2,
        enabled: true
      },
      {
        id: 'low-usage-scale-down',
        condition: 'cpuUsage < 0.2 && memoryUsage < 0.3 && throughput < 10',
        action: 'scale-down',
        priority: 3,
        enabled: true
      },
      {
        id: 'ai-provider-optimization',
        condition: 'service === "ai-hub" && responseTime > 3000',
        action: 'switch-ai-provider',
        priority: 1,
        enabled: true
      },
      {
        id: 'cache-optimization',
        condition: 'endpoint.includes("/api/") && responseTime > 500',
        action: 'increase-cache-ttl',
        priority: 4,
        enabled: true
      }
    ];
  }

  private startMetricsCollection() {
    // Collect metrics every 10 seconds
    setInterval(async () => {
      await this.collectSystemMetrics();
      await this.analyzeAndOptimize();
    }, 10000);

    // Cleanup old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000);
  }

  private async collectSystemMetrics() {
    const services = ['backend', 'production-engine', 'chat-platform', 'ai-hub'];
    
    for (const service of services) {
      try {
        const metrics = await this.fetchServiceMetrics(service);
        
        if (!this.metricsCache.has(service)) {
          this.metricsCache.set(service, []);
        }
        
        const serviceMetrics = this.metricsCache.get(service)!;
        serviceMetrics.push(metrics);
        
        // Keep only last 100 metrics per service
        if (serviceMetrics.length > 100) {
          serviceMetrics.splice(0, serviceMetrics.length - 100);
        }

        // Emit real-time metrics
        this.emit('metrics-update', { service, metrics });
        this.broadcastMetrics(service, metrics);

      } catch (error) {
        console.error(`Failed to collect metrics for ${service}:`, error);
      }
    }
  }

  private async fetchServiceMetrics(service: string): Promise<ServiceMetrics> {
    // Simulate fetching real metrics from service endpoints
    const baseUrls = {
      'backend': 'http://backend:3001',
      'production-engine': 'http://production-engine:3002', 
      'chat-platform': 'http://chat-platform:3003',
      'ai-hub': 'http://ai-hub:3004'
    };

    const baseUrl = baseUrls[service as keyof typeof baseUrls];
    
    try {
      const startTime = Date.now();
      const response = await fetch(`${baseUrl}/metrics`, { timeout: 5000 });
      const responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      return {
        service,
        endpoint: '/metrics',
        responseTime,
        errorRate: data.errorRate || 0,
        throughput: data.requestsPerSecond || 0,
        cpuUsage: data.cpu?.usage || 0,
        memoryUsage: data.memory?.usage || 0,
        timestamp: Date.now()
      };

    } catch (error) {
      // Return error metrics
      return {
        service,
        endpoint: '/metrics',
        responseTime: 5000,
        errorRate: 1.0,
        throughput: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        timestamp: Date.now()
      };
    }
  }

  private async analyzeAndOptimize() {
    for (const [service, metricsArray] of this.metricsCache.entries()) {
      if (metricsArray.length === 0) continue;

      const latestMetrics = metricsArray[metricsArray.length - 1];
      const averageMetrics = this.calculateAverageMetrics(metricsArray.slice(-10)); // Last 10 metrics

      // Check optimization rules
      for (const rule of this.optimizationRules.filter(r => r.enabled)) {
        if (await this.evaluateRule(rule, latestMetrics, averageMetrics)) {
          await this.executeOptimizationAction(rule, service, latestMetrics);
        }
      }

      // Check alert thresholds
      await this.checkAlertThresholds(service, latestMetrics, averageMetrics);
    }
  }

  private async evaluateRule(
    rule: OptimizationRule, 
    current: ServiceMetrics, 
    average: ServiceMetrics
  ): Promise<boolean> {
    try {
      // Create evaluation context
      const context = {
        service: current.service,
        endpoint: current.endpoint,
        responseTime: current.responseTime,
        errorRate: current.errorRate,
        throughput: current.throughput,
        cpuUsage: current.cpuUsage,
        memoryUsage: current.memoryUsage,
        avgResponseTime: average.responseTime,
        avgErrorRate: average.errorRate,
        avgThroughput: average.throughput,
        avgCpuUsage: average.cpuUsage,
        avgMemoryUsage: average.memoryUsage
      };

      // Evaluate condition (simplified - in production use a proper expression evaluator)
      return this.evaluateCondition(rule.condition, context);

    } catch (error) {
      console.error(`Failed to evaluate rule ${rule.id}:`, error);
      return false;
    }
  }

  private evaluateCondition(condition: string, context: any): boolean {
    try {
      // Replace variables in condition with actual values
      let evaluateCondition = condition;
      
      for (const [key, value] of Object.entries(context)) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        evaluateCondition = evaluateCondition.replace(regex, String(value));
      }

      // Simple evaluation (in production, use a safer expression evaluator)
      return Function(`"use strict"; return (${evaluateCondition})`)();

    } catch (error) {
      console.error('Condition evaluation error:', error);
      return false;
    }
  }

  private async executeOptimizationAction(
    rule: OptimizationRule, 
    service: string, 
    metrics: ServiceMetrics
  ) {
    console.log(`🔧 Executing optimization action: ${rule.action} for ${service}`);

    try {
      switch (rule.action) {
        case 'scale-up':
          await this.scaleUpService(service);
          break;

        case 'scale-down':
          await this.scaleDownService(service);
          break;

        case 'circuit-breaker':
          await this.activateCircuitBreaker(service);
          break;

        case 'switch-ai-provider':
          await this.switchAIProvider();
          break;

        case 'increase-cache-ttl':
          await this.increaseCacheTTL(service);
          break;

        default:
          console.warn(`Unknown optimization action: ${rule.action}`);
      }

      // Log optimization action
      await this.logOptimizationAction(rule, service, metrics);

    } catch (error) {
      console.error(`Failed to execute optimization action ${rule.action}:`, error);
    }
  }

  private async scaleUpService(service: string) {
    console.log(`📈 Scaling up ${service}`);
    
    // Kubernetes scaling command
    try {
      const { exec } = require('child_process');
      const command = `kubectl scale deployment ${service} --replicas=5`;
      
      exec(command, (error: any, stdout: string, stderr: string) => {
        if (error) {
          console.error(`Scale up error: ${error}`);
          return;
        }
        console.log(`✅ Successfully scaled up ${service}: ${stdout}`);
      });

    } catch (error) {
      console.error(`Failed to scale up ${service}:`, error);
    }
  }

  private async scaleDownService(service: string) {
    console.log(`📉 Scaling down ${service}`);
    
    try {
      const { exec } = require('child_process');
      const command = `kubectl scale deployment ${service} --replicas=2`;
      
      exec(command, (error: any, stdout: string, stderr: string) => {
        if (error) {
          console.error(`Scale down error: ${error}`);
          return;
        }
        console.log(`✅ Successfully scaled down ${service}: ${stdout}`);
      });

    } catch (error) {
      console.error(`Failed to scale down ${service}:`, error);
    }
  }

  private async activateCircuitBreaker(service: string) {
    console.log(`🔴 Activating circuit breaker for ${service}`);
    
    // Set circuit breaker state in Redis
    await this.redis.setex(`circuit-breaker:${service}`, 300, 'OPEN'); // 5 minutes
    
    // Notify API gateway
    this.emit('circuit-breaker', { service, state: 'OPEN' });
  }

  private async switchAIProvider() {
    console.log('🤖 Switching AI provider for better performance');
    
    // Get current provider performance
    const providers = ['anthropic', 'groq', 'gemini', 'ollama'];
    const providerMetrics: any = {};

    for (const provider of providers) {
      const metrics = await this.redis.hgetall(`ai-provider:${provider}:metrics`);
      providerMetrics[provider] = {
        responseTime: parseInt(metrics.responseTime || '0'),
        errorRate: parseFloat(metrics.errorRate || '0'),
        availability: parseFloat(metrics.availability || '1')
      };
    }

    // Select best performing provider
    const bestProvider = providers.reduce((best, current) => {
      const currentMetrics = providerMetrics[current];
      const bestMetrics = providerMetrics[best];
      
      if (currentMetrics.availability > bestMetrics.availability) return current;
      if (currentMetrics.responseTime < bestMetrics.responseTime) return current;
      return best;
    });

    // Update AI provider preference
    await this.redis.set('ai-hub:preferred-provider', bestProvider);
    console.log(`✅ Switched to AI provider: ${bestProvider}`);
  }

  private async increaseCacheTTL(service: string) {
    console.log(`⚡ Increasing cache TTL for ${service}`);
    
    const currentTTL = await this.redis.get(`cache-config:${service}:ttl`);
    const newTTL = Math.min(3600, (parseInt(currentTTL || '300')) * 2); // Max 1 hour
    
    await this.redis.set(`cache-config:${service}:ttl`, newTTL);
    console.log(`✅ Cache TTL for ${service} increased to ${newTTL}s`);
  }

  private async checkAlertThresholds(service: string, current: ServiceMetrics, average: ServiceMetrics) {
    const alerts = [];

    if (current.responseTime > this.alertThresholds.responseTime) {
      alerts.push({
        type: 'HIGH_RESPONSE_TIME',
        service,
        value: current.responseTime,
        threshold: this.alertThresholds.responseTime
      });
    }

    if (current.errorRate > this.alertThresholds.errorRate) {
      alerts.push({
        type: 'HIGH_ERROR_RATE',
        service,
        value: current.errorRate,
        threshold: this.alertThresholds.errorRate
      });
    }

    if (current.cpuUsage > this.alertThresholds.cpuUsage) {
      alerts.push({
        type: 'HIGH_CPU_USAGE',
        service,
        value: current.cpuUsage,
        threshold: this.alertThresholds.cpuUsage
      });
    }

    if (current.memoryUsage > this.alertThresholds.memoryUsage) {
      alerts.push({
        type: 'HIGH_MEMORY_USAGE',
        service,
        value: current.memoryUsage,
        threshold: this.alertThresholds.memoryUsage
      });
    }

    // Send alerts
    for (const alert of alerts) {
      await this.sendAlert(alert);
    }
  }

  private async sendAlert(alert: any) {
    console.log(`🚨 ALERT: ${alert.type} for ${alert.service} - ${alert.value} exceeds ${alert.threshold}`);
    
    // Store alert in Redis
    await this.redis.lpush('system-alerts', JSON.stringify({
      ...alert,
      timestamp: new Date().toISOString(),
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }));

    // Keep only last 1000 alerts
    await this.redis.ltrim('system-alerts', 0, 999);

    // Emit alert event
    this.emit('alert', alert);

    // Broadcast alert to WebSocket clients
    this.broadcastAlert(alert);
  }

  private calculateAverageMetrics(metricsArray: ServiceMetrics[]): ServiceMetrics {
    if (metricsArray.length === 0) {
      throw new Error('No metrics to calculate average');
    }

    const sum = metricsArray.reduce((acc, metrics) => ({
      service: metrics.service,
      endpoint: metrics.endpoint,
      responseTime: acc.responseTime + metrics.responseTime,
      errorRate: acc.errorRate + metrics.errorRate,
      throughput: acc.throughput + metrics.throughput,
      cpuUsage: acc.cpuUsage + metrics.cpuUsage,
      memoryUsage: acc.memoryUsage + metrics.memoryUsage,
      timestamp: Date.now()
    }), {
      service: metricsArray[0].service,
      endpoint: metricsArray[0].endpoint,
      responseTime: 0,
      errorRate: 0,
      throughput: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      timestamp: 0
    });

    const count = metricsArray.length;
    return {
      service: sum.service,
      endpoint: sum.endpoint,
      responseTime: sum.responseTime / count,
      errorRate: sum.errorRate / count,
      throughput: sum.throughput / count,
      cpuUsage: sum.cpuUsage / count,
      memoryUsage: sum.memoryUsage / count,
      timestamp: Date.now()
    };
  }

  private cleanupOldMetrics() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

    for (const [service, metrics] of this.metricsCache.entries()) {
      const filteredMetrics = metrics.filter(m => m.timestamp > cutoffTime);
      this.metricsCache.set(service, filteredMetrics);
    }
  }

  private setupWebSocketHandlers() {
    this.wsServer.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection for real-time monitoring');

      ws.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);
          this.handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
      });

      // Send initial system status
      ws.send(JSON.stringify({
        type: 'system-status',
        data: this.getSystemStatus(),
        timestamp: Date.now()
      }));
    });
  }

  private handleWebSocketMessage(ws: WebSocket, message: any) {
    switch (message.type) {
      case 'subscribe-metrics':
        // Client wants to subscribe to metrics updates
        ws.send(JSON.stringify({
          type: 'subscription-confirmed',
          service: message.service,
          timestamp: Date.now()
        }));
        break;

      case 'get-optimization-rules':
        ws.send(JSON.stringify({
          type: 'optimization-rules',
          data: this.optimizationRules,
          timestamp: Date.now()
        }));
        break;

      case 'update-optimization-rule':
        this.updateOptimizationRule(message.rule);
        break;

      default:
        console.warn('Unknown WebSocket message type:', message.type);
    }
  }

  private updateOptimizationRule(rule: OptimizationRule) {
    const index = this.optimizationRules.findIndex(r => r.id === rule.id);
    if (index >= 0) {
      this.optimizationRules[index] = rule;
      console.log(`Updated optimization rule: ${rule.id}`);
    }
  }

  private broadcastMetrics(service: string, metrics: ServiceMetrics) {
    const message = JSON.stringify({
      type: 'metrics-update',
      service,
      data: metrics,
      timestamp: Date.now()
    });

    this.wsServer.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private broadcastAlert(alert: any) {
    const message = JSON.stringify({
      type: 'alert',
      data: alert,
      timestamp: Date.now()
    });

    this.wsServer.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private getSystemStatus() {
    const status: any = {};
    
    for (const [service, metrics] of this.metricsCache.entries()) {
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        const average = this.calculateAverageMetrics(metrics.slice(-10));
        
        status[service] = {
          current: latest,
          average: average,
          health: this.assessServiceHealth(latest),
          trend: this.calculateTrend(metrics.slice(-20))
        };
      }
    }

    return status;
  }

  private assessServiceHealth(metrics: ServiceMetrics): string {
    if (metrics.errorRate > 0.1) return 'critical';
    if (metrics.responseTime > 2000) return 'warning';
    if (metrics.cpuUsage > 0.8 || metrics.memoryUsage > 0.9) return 'warning';
    return 'healthy';
  }

  private calculateTrend(metrics: ServiceMetrics[]): string {
    if (metrics.length < 2) return 'stable';

    const recent = metrics.slice(-5).map(m => m.responseTime);
    const older = metrics.slice(-10, -5).map(m => m.responseTime);

    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;

    if (recentAvg > olderAvg * 1.1) return 'degrading';
    if (recentAvg < olderAvg * 0.9) return 'improving';
    return 'stable';
  }

  private async logOptimizationAction(rule: OptimizationRule, service: string, metrics: ServiceMetrics) {
    const logEntry = {
      ruleId: rule.id,
      action: rule.action,
      service,
      metrics,
      timestamp: new Date().toISOString()
    };

    await this.redis.lpush('optimization-log', JSON.stringify(logEntry));
    await this.redis.ltrim('optimization-log', 0, 999); // Keep last 1000 entries
  }

  public start() {
    console.log('🔧 Real-Time Optimization Service started');
    console.log(`📊 Collecting metrics every 10 seconds`);
    console.log(`🔄 WebSocket server running on port 8081`);
    console.log(`📋 ${this.optimizationRules.length} optimization rules loaded`);
  }
}

export default RealTimeOptimizationService;