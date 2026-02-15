/**
 * Performance Profiling Service
 *
 * Request tracing and performance monitoring:
 * - Request latency tracking
 * - Slow query detection
 * - Memory usage monitoring
 * - CPU profiling
 * - Bottleneck identification
 */

import { performance, PerformanceObserver } from 'perf_hooks';
import v8 from 'v8';
import os from 'os';
import { loadStore, debouncedSave } from '../persistence.js';

// ==================== Types ====================

export interface RequestTrace {
  id: string;
  method: string;
  path: string;
  startedAt: number;
  duration: number;
  statusCode?: number;
  error?: string;
  spans: TraceSpan[];
  metadata?: Record<string, unknown>;
}

export interface TraceSpan {
  name: string;
  startedAt: number;
  duration: number;
  metadata?: Record<string, unknown>;
}

export interface PerformanceMetrics {
  requests: {
    total: number;
    last5Minutes: number;
    avgDuration: number;
    p50Duration: number;
    p95Duration: number;
    p99Duration: number;
    slowRequests: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    heapUsedPercent: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  gc?: {
    totalCollections: number;
    totalDuration: number;
    lastCollection?: {
      type: string;
      duration: number;
      timestamp: number;
    };
  };
  eventLoop: {
    lag: number;
    utilization: number;
  };
}

export interface SlowRequest {
  trace: RequestTrace;
  threshold: number;
  percentile: number;
}

export interface PerformanceAlert {
  id: string;
  type: 'slow_request' | 'high_memory' | 'high_cpu' | 'gc_pressure' | 'event_loop_lag';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
}

// ==================== Configuration ====================

interface ProfilerConfig {
  /** Enable request tracing */
  tracingEnabled: boolean;
  /** Slow request threshold (ms) */
  slowRequestThresholdMs: number;
  /** Max traces to keep in memory */
  maxTraces: number;
  /** Memory warning threshold (percentage) */
  memoryWarningPercent: number;
  /** CPU warning threshold (percentage) */
  cpuWarningPercent: number;
  /** Event loop lag threshold (ms) */
  eventLoopLagThresholdMs: number;
  /** Sampling rate for tracing (0-1) */
  samplingRate: number;
}

const DEFAULT_CONFIG: ProfilerConfig = {
  tracingEnabled: true,
  slowRequestThresholdMs: 1000,
  maxTraces: 5000,
  memoryWarningPercent: 80,
  cpuWarningPercent: 80,
  eventLoopLagThresholdMs: 100,
  samplingRate: 0.1, // 10% sampling
};

// ==================== Persistence ====================

interface ProfilerStoreData {
  slowRequests: SlowRequest[];
  alerts: PerformanceAlert[];
  aggregatedStats: {
    totalRequests: number;
    totalDuration: number;
    durations: number[]; // For percentile calculations
  };
}

function loadProfilerStore(): ProfilerStoreData {
  return loadStore<ProfilerStoreData>('performance-profiler', {
    slowRequests: [],
    alerts: [],
    aggregatedStats: {
      totalRequests: 0,
      totalDuration: 0,
      durations: [],
    },
  });
}

function saveProfilerStore(data: ProfilerStoreData): void {
  debouncedSave('performance-profiler', data);
}

// ==================== Performance Profiler ====================

class PerformanceProfiler {
  private config: ProfilerConfig;
  private traces: RequestTrace[] = [];
  private slowRequests: SlowRequest[] = [];
  private alerts: PerformanceAlert[] = [];
  private aggregatedStats: ProfilerStoreData['aggregatedStats'];
  private activeSpans: Map<string, { name: string; startedAt: number }[]> = new Map();
  private lastCpuUsage?: { user: number; system: number; timestamp: number };
  private gcStats = { totalCollections: 0, totalDuration: 0, lastCollection: undefined as any };
  private eventLoopLag = 0;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: Partial<ProfilerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Load persisted state
    const stored = loadProfilerStore();
    this.slowRequests = stored.slowRequests.slice(-100);
    this.alerts = stored.alerts.slice(-1000);
    this.aggregatedStats = stored.aggregatedStats;

    // Setup GC observer (if available)
    this.setupGCObserver();

    console.log(`[Profiler] Initialized (sampling: ${this.config.samplingRate * 100}%)`);
  }

  // ==================== Request Tracing ====================

  /**
   * Start tracing a request
   */
  startTrace(id: string, method: string, path: string): void {
    if (!this.config.tracingEnabled) return;
    if (Math.random() > this.config.samplingRate) return;

    const trace: RequestTrace = {
      id,
      method,
      path,
      startedAt: performance.now(),
      duration: 0,
      spans: [],
    };

    this.traces.push(trace);
    this.activeSpans.set(id, []);

    // Trim traces if too many
    if (this.traces.length > this.config.maxTraces) {
      this.traces = this.traces.slice(-this.config.maxTraces);
    }
  }

  /**
   * Start a span within a trace
   */
  startSpan(traceId: string, spanName: string): void {
    const spans = this.activeSpans.get(traceId);
    if (!spans) return;

    spans.push({
      name: spanName,
      startedAt: performance.now(),
    });
  }

  /**
   * End a span within a trace
   */
  endSpan(traceId: string, spanName: string, metadata?: Record<string, unknown>): void {
    const spans = this.activeSpans.get(traceId);
    if (!spans) return;

    const spanIndex = spans.findIndex((s) => s.name === spanName);
    if (spanIndex === -1) return;

    const span = spans[spanIndex];
    const duration = performance.now() - span.startedAt;

    const trace = this.traces.find((t) => t.id === traceId);
    if (trace) {
      trace.spans.push({
        name: spanName,
        startedAt: span.startedAt,
        duration,
        metadata,
      });
    }

    spans.splice(spanIndex, 1);
  }

  /**
   * End a request trace
   */
  endTrace(
    id: string,
    statusCode?: number,
    error?: string,
    metadata?: Record<string, unknown>
  ): RequestTrace | undefined {
    const trace = this.traces.find((t) => t.id === id);
    if (!trace) return undefined;

    trace.duration = performance.now() - trace.startedAt;
    trace.statusCode = statusCode;
    trace.error = error;
    trace.metadata = metadata;

    // Update aggregated stats
    this.aggregatedStats.totalRequests++;
    this.aggregatedStats.totalDuration += trace.duration;
    this.aggregatedStats.durations.push(trace.duration);

    // Keep durations array manageable (last 10000)
    if (this.aggregatedStats.durations.length > 10000) {
      this.aggregatedStats.durations = this.aggregatedStats.durations.slice(-10000);
    }

    // Check for slow request
    if (trace.duration > this.config.slowRequestThresholdMs) {
      const percentile = this.calculatePercentile(trace.duration);
      this.recordSlowRequest(trace, percentile);
    }

    // Cleanup
    this.activeSpans.delete(id);

    // Persist periodically
    if (this.aggregatedStats.totalRequests % 100 === 0) {
      this.persist();
    }

    return trace;
  }

  // ==================== Metrics ====================

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = this.getCpuUsage();
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    // Calculate request metrics
    const recentTraces = this.traces.filter((t) => t.startedAt >= fiveMinutesAgo);
    const durations = this.aggregatedStats.durations;

    return {
      requests: {
        total: this.aggregatedStats.totalRequests,
        last5Minutes: recentTraces.length,
        avgDuration: durations.length > 0
          ? this.aggregatedStats.totalDuration / this.aggregatedStats.totalRequests
          : 0,
        p50Duration: this.getPercentileValue(durations, 50),
        p95Duration: this.getPercentileValue(durations, 95),
        p99Duration: this.getPercentileValue(durations, 99),
        slowRequests: this.slowRequests.length,
      },
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        heapUsedPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      },
      cpu: {
        usage: cpuUsage,
        loadAverage: os.loadavg(),
      },
      gc: this.gcStats.totalCollections > 0 ? this.gcStats : undefined,
      eventLoop: {
        lag: this.eventLoopLag,
        utilization: this.getEventLoopUtilization(),
      },
    };
  }

  /**
   * Get slow requests
   */
  getSlowRequests(limit = 50): SlowRequest[] {
    return this.slowRequests.slice(-limit).reverse();
  }

  /**
   * Get performance alerts
   */
  getAlerts(limit = 100): PerformanceAlert[] {
    return this.alerts.slice(-limit).reverse();
  }

  /**
   * Get recent traces
   */
  getTraces(limit = 100): RequestTrace[] {
    return this.traces.slice(-limit).reverse();
  }

  /**
   * Get V8 heap statistics
   */
  getHeapStats(): v8.HeapInfo {
    return v8.getHeapStatistics();
  }

  // ==================== Monitoring ====================

  /**
   * Start background monitoring
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      console.log('[Profiler] Monitoring already running');
      return;
    }

    console.log('[Profiler] Starting performance monitoring');

    this.monitoringInterval = setInterval(() => {
      this.checkHealth();
    }, 10000); // Every 10 seconds

    // Start event loop lag monitoring
    this.monitorEventLoopLag();
  }

  /**
   * Stop background monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      console.log('[Profiler] Monitoring stopped');
    }
  }

  // ==================== Private Methods ====================

  private setupGCObserver(): void {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'gc') {
            this.gcStats.totalCollections++;
            this.gcStats.totalDuration += entry.duration;
            this.gcStats.lastCollection = {
              type: (entry as any).detail?.kind || 'unknown',
              duration: entry.duration,
              timestamp: Date.now(),
            };

            // Alert on long GC pause
            if (entry.duration > 100) {
              this.createAlert('gc_pressure', 'warning', 
                `Long GC pause: ${entry.duration.toFixed(2)}ms`,
                entry.duration, 100);
            }
          }
        }
      });

      obs.observe({ entryTypes: ['gc'] });
    } catch {
      // GC observation not supported in all environments
    }
  }

  private monitorEventLoopLag(): void {
    let lastCheck = performance.now();

    const check = () => {
      const now = performance.now();
      const expectedInterval = 100; // We schedule every 100ms
      const actualInterval = now - lastCheck;
      this.eventLoopLag = Math.max(0, actualInterval - expectedInterval);
      lastCheck = now;

      if (this.eventLoopLag > this.config.eventLoopLagThresholdMs) {
        this.createAlert('event_loop_lag', 
          this.eventLoopLag > 500 ? 'critical' : 'warning',
          `Event loop lag: ${this.eventLoopLag.toFixed(2)}ms`,
          this.eventLoopLag, this.config.eventLoopLagThresholdMs);
      }

      setTimeout(check, 100);
    };

    setTimeout(check, 100);
  }

  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    }

    return ((totalTick - totalIdle) / totalTick) * 100;
  }

  private getEventLoopUtilization(): number {
    try {
      const elu = (performance as any).eventLoopUtilization?.();
      return elu?.utilization ?? 0;
    } catch {
      return 0;
    }
  }

  private getPercentileValue(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private calculatePercentile(duration: number): number {
    const sorted = [...this.aggregatedStats.durations].sort((a, b) => a - b);
    const index = sorted.findIndex((d) => d >= duration);
    return index === -1 ? 100 : (index / sorted.length) * 100;
  }

  private recordSlowRequest(trace: RequestTrace, percentile: number): void {
    this.slowRequests.push({
      trace,
      threshold: this.config.slowRequestThresholdMs,
      percentile,
    });

    // Keep last 100 slow requests
    if (this.slowRequests.length > 100) {
      this.slowRequests = this.slowRequests.slice(-100);
    }

    // Create alert for very slow requests
    if (trace.duration > this.config.slowRequestThresholdMs * 3) {
      this.createAlert('slow_request', 'critical',
        `Very slow request: ${trace.method} ${trace.path} (${trace.duration.toFixed(2)}ms)`,
        trace.duration, this.config.slowRequestThresholdMs);
    }
  }

  private checkHealth(): void {
    const metrics = this.getMetrics();

    // Check memory
    if (metrics.memory.heapUsedPercent > this.config.memoryWarningPercent) {
      this.createAlert('high_memory',
        metrics.memory.heapUsedPercent > 90 ? 'critical' : 'warning',
        `High memory usage: ${metrics.memory.heapUsedPercent.toFixed(1)}%`,
        metrics.memory.heapUsedPercent, this.config.memoryWarningPercent);
    }

    // Check CPU
    if (metrics.cpu.usage > this.config.cpuWarningPercent) {
      this.createAlert('high_cpu',
        metrics.cpu.usage > 90 ? 'critical' : 'warning',
        `High CPU usage: ${metrics.cpu.usage.toFixed(1)}%`,
        metrics.cpu.usage, this.config.cpuWarningPercent);
    }
  }

  private createAlert(
    type: PerformanceAlert['type'],
    severity: PerformanceAlert['severity'],
    message: string,
    value: number,
    threshold: number
  ): PerformanceAlert {
    // Deduplicate alerts (same type within 60 seconds)
    const recentSimilar = this.alerts.find(
      (a) => a.type === type && Date.now() - a.timestamp < 60000
    );
    if (recentSimilar) return recentSimilar;

    const alert: PerformanceAlert = {
      id: crypto.randomUUID(),
      type,
      severity,
      message,
      value,
      threshold,
      timestamp: Date.now(),
    };

    this.alerts.push(alert);

    // Keep last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }

    console.warn(`[Profiler] ${severity.toUpperCase()}: ${message}`);

    this.persist();
    return alert;
  }

  private persist(): void {
    saveProfilerStore({
      slowRequests: this.slowRequests,
      alerts: this.alerts,
      aggregatedStats: this.aggregatedStats,
    });
  }
}

// ==================== Singleton Export ====================

export const performanceProfiler = new PerformanceProfiler();

// ==================== Express Middleware ====================

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Express middleware for request tracing
 */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const traceId = crypto.randomUUID();
  (req as any).traceId = traceId;

  performanceProfiler.startTrace(traceId, req.method, req.path);

  const originalEnd = res.end;
  res.end = function (this: Response, chunk?: any, encoding?: any, cb?: any) {
    performanceProfiler.endTrace(traceId, res.statusCode);
    return originalEnd.call(this, chunk, encoding, cb);
  } as any;

  next();
}

// Export class for testing
export { PerformanceProfiler };
