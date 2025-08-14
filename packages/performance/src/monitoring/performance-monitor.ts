/**
 * Real-time Performance Monitor for Recoder.xyz
 * Tracks system metrics, response times, throughput, and alerts
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import * as os from 'os';

export interface PerformanceMetrics {
  responseTime: {
    avg: number;
    p95: number;
    p99: number;
    current: number;
  };
  throughput: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    totalRequests: number;
  };
  system: SystemMetrics;
  errors: ErrorMetrics;
  timestamp: Date;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    heap: {
      used: number;
      total: number;
    };
  };
  uptime: number;
  eventLoopLag: number;
}

export interface ErrorMetrics {
  total: number;
  rate: number;
  byCode: Record<string, number>;
  recent: Array<{
    code: string;
    message: string;
    timestamp: Date;
  }>;
}

export interface PerformanceAlert {
  type: 'cpu' | 'memory' | 'response_time' | 'error_rate' | 'throughput';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export class PerformanceMonitor extends EventEmitter {
  private isRunning = false;
  private interval: NodeJS.Timeout | null = null;
  private responseTimes: number[] = [];
  private requestCount = 0;
  private errorCount = 0;
  private errors: ErrorMetrics['recent'] = [];
  private errorsByCode: Record<string, number> = {};
  private startTime = Date.now();
  private lastRequestTime = Date.now();

  private config = {
    interval: 5000, // 5 seconds
    enableAlerts: true,
    retentionPeriod: 300000, // 5 minutes
    thresholds: {
      cpuUsage: 80,
      memoryUsage: 85,
      responseTime: 1000,
      errorRate: 5,
      eventLoopLag: 100
    }
  };

  constructor(config?: Partial<typeof PerformanceMonitor.prototype.config>) {
    super();
    this.config = { ...this.config, ...config };
  }

  /**
   * Start performance monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    
    // Start monitoring interval
    this.interval = setInterval(() => {
      this.collectMetrics();
    }, this.config.interval);

    console.log(`📊 Performance Monitor started (interval: ${this.config.interval}ms)`);
    this.emit('started');
  }

  /**
   * Stop performance monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    console.log('📊 Performance Monitor stopped');
    this.emit('stopped');
  }

  /**
   * Record request performance
   */
  recordRequest(responseTime: number): void {
    this.requestCount++;
    this.responseTimes.push(responseTime);
    this.lastRequestTime = Date.now();

    // Keep only recent response times
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.responseTimes = this.responseTimes.slice(-1000); // Keep last 1000 responses

    // Check for response time alerts
    if (this.config.enableAlerts && responseTime > this.config.thresholds.responseTime) {
      this.emitAlert('response_time', 'warning', 
        `High response time: ${responseTime}ms`, 
        responseTime, this.config.thresholds.responseTime);
    }
  }

  /**
   * Record error occurrence
   */
  recordError(code: string, message?: string): void {
    this.errorCount++;
    this.errorsByCode[code] = (this.errorsByCode[code] || 0) + 1;
    
    this.errors.push({
      code,
      message: message || 'Unknown error',
      timestamp: new Date()
    });

    // Keep only recent errors
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-50);
    }

    // Calculate error rate and check threshold
    const recentRequests = this.getRecentRequestCount();
    const errorRate = recentRequests > 0 ? (this.errors.length / recentRequests) * 100 : 0;
    
    if (this.config.enableAlerts && errorRate > this.config.thresholds.errorRate) {
      this.emitAlert('error_rate', 'critical',
        `High error rate: ${errorRate.toFixed(2)}%`,
        errorRate, this.config.thresholds.errorRate);
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const systemMetrics = this.getSystemMetrics();
    const responseTimes = this.responseTimes.slice(-100); // Last 100 responses
    
    return {
      responseTime: {
        avg: this.calculateAverage(responseTimes),
        p95: this.calculatePercentile(responseTimes, 95),
        p99: this.calculatePercentile(responseTimes, 99),
        current: responseTimes[responseTimes.length - 1] || 0
      },
      throughput: {
        requestsPerSecond: this.calculateRequestsPerSecond(),
        requestsPerMinute: this.calculateRequestsPerMinute(),
        totalRequests: this.requestCount
      },
      system: systemMetrics,
      errors: {
        total: this.errorCount,
        rate: this.calculateErrorRate(),
        byCode: { ...this.errorsByCode },
        recent: this.errors.slice(-10)
      },
      timestamp: new Date()
    };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const metrics = this.getMetrics();
    let score = 100;
    let status: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent';
    let activeAlerts = 0;

    // Calculate performance score
    if (metrics.system.cpu.usage > 80) { score -= 20; activeAlerts++; }
    if (metrics.system.memory.percentage > 85) { score -= 20; activeAlerts++; }
    if (metrics.responseTime.avg > 500) { score -= 15; activeAlerts++; }
    if (metrics.errors.rate > 2) { score -= 25; activeAlerts++; }

    if (score >= 90) status = 'excellent';
    else if (score >= 70) status = 'good';
    else if (score >= 50) status = 'warning';
    else status = 'critical';

    return {
      status,
      score: Math.max(0, score),
      activeAlerts,
      uptime: Date.now() - this.startTime,
      summary: {
        avgResponseTime: Math.round(metrics.responseTime.avg),
        requestsPerSecond: Math.round(metrics.throughput.requestsPerSecond),
        errorRate: Math.round(metrics.errors.rate * 100) / 100,
        cpuUsage: Math.round(metrics.system.cpu.usage),
        memoryUsage: Math.round(metrics.system.memory.percentage)
      }
    };
  }

  /**
   * Get health status
   */
  async getHealth() {
    return {
      status: this.isRunning ? 'healthy' : 'stopped',
      uptime: Date.now() - this.startTime,
      monitoring: this.isRunning,
      lastUpdate: new Date(),
      alertsEnabled: this.config.enableAlerts
    };
  }

  // Private methods

  private collectMetrics(): void {
    const metrics = this.getMetrics();
    
    // Emit metrics event
    this.emit('metrics', metrics);

    // Check system thresholds
    if (this.config.enableAlerts) {
      this.checkSystemAlerts(metrics.system);
    }
  }

  private checkSystemAlerts(system: SystemMetrics): void {
    if (system.cpu.usage > this.config.thresholds.cpuUsage) {
      this.emitAlert('cpu', 'warning',
        `High CPU usage: ${system.cpu.usage.toFixed(1)}%`,
        system.cpu.usage, this.config.thresholds.cpuUsage);
    }

    if (system.memory.percentage > this.config.thresholds.memoryUsage) {
      this.emitAlert('memory', 'critical',
        `High memory usage: ${system.memory.percentage.toFixed(1)}%`,
        system.memory.percentage, this.config.thresholds.memoryUsage);
    }

    if (system.eventLoopLag > this.config.thresholds.eventLoopLag) {
      this.emitAlert('throughput', 'warning',
        `High event loop lag: ${system.eventLoopLag.toFixed(1)}ms`,
        system.eventLoopLag, this.config.thresholds.eventLoopLag);
    }
  }

  private emitAlert(type: PerformanceAlert['type'], severity: PerformanceAlert['severity'], 
                   message: string, value: number, threshold: number): void {
    const alert: PerformanceAlert = {
      type,
      severity,
      message,
      value,
      threshold,
      timestamp: new Date()
    };
    
    this.emit('alert', alert);
  }

  private getSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Simple event loop lag measurement
    const start = performance.now();
    setImmediate(() => {
      const lag = performance.now() - start;
      this.emit('eventLoopLag', lag);
    });

    return {
      cpu: {
        usage: this.getCpuUsage(),
        loadAverage: os.loadavg()
      },
      memory: {
        used: usedMem,
        total: totalMem,
        percentage: (usedMem / totalMem) * 100,
        heap: {
          used: memUsage.heapUsed,
          total: memUsage.heapTotal
        }
      },
      uptime: process.uptime(),
      eventLoopLag: 0 // Will be updated asynchronously
    };
  }

  private getCpuUsage(): number {
    // Simple CPU usage estimation based on load average
    const cpus = os.cpus();
    const load = os.loadavg()[0];
    return Math.min(100, (load / cpus.length) * 100);
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private calculateRequestsPerSecond(): number {
    const timeWindow = 60000; // 1 minute
    const now = Date.now();
    const cutoff = now - timeWindow;
    
    // This is simplified - in production you'd track timestamps
    const recentRequests = this.getRecentRequestCount();
    return recentRequests / 60;
  }

  private calculateRequestsPerMinute(): number {
    return this.calculateRequestsPerSecond() * 60;
  }

  private calculateErrorRate(): number {
    const recentRequests = this.getRecentRequestCount();
    if (recentRequests === 0) return 0;
    return (this.errors.length / recentRequests) * 100;
  }

  private getRecentRequestCount(): number {
    // Simplified calculation - in production this would be more accurate
    return Math.max(1, this.responseTimes.length);
  }
}