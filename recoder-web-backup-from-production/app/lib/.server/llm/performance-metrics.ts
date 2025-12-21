/**
 * Performance Metrics Tracker
 * Tracks system performance, costs, and optimization effectiveness
 */

export interface PerformanceMetric {
  timestamp: number;
  metricType: 'request' | 'file' | 'shell' | 'parse' | 'stream';
  duration: number;
  success: boolean;
  details?: Record<string, any>;
}

export interface CostMetric {
  timestamp: number;
  strategy: string;
  estimatedCost: number;
  actualCost?: number;
  tokensSaved: number;
  model: string;
}

class PerformanceMetricsTracker {
  private metrics: PerformanceMetric[] = [];
  private costMetrics: CostMetric[] = [];
  private readonly MAX_METRICS = 1000; // Keep last 1000 metrics

  /**
   * Track a performance metric
   */
  trackMetric(metric: Omit<PerformanceMetric, 'timestamp'>) {
    const fullMetric: PerformanceMetric = {
      ...metric,
      timestamp: Date.now(),
    };

    this.metrics.push(fullMetric);

    // Cleanup old metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }

    // Log slow operations
    if (metric.duration > 5000) {
      console.warn(`⚠️ Slow ${metric.metricType} operation: ${metric.duration}ms`, metric.details);
    }
  }

  /**
   * Track cost metric
   */
  trackCost(metric: Omit<CostMetric, 'timestamp'>) {
    const fullMetric: CostMetric = {
      ...metric,
      timestamp: Date.now(),
    };

    this.costMetrics.push(fullMetric);

    // Cleanup old metrics
    if (this.costMetrics.length > this.MAX_METRICS) {
      this.costMetrics.shift();
    }
  }

  /**
   * Get performance statistics
   */
  getStats(metricType?: PerformanceMetric['metricType']) {
    const relevantMetrics = metricType
      ? this.metrics.filter(m => m.metricType === metricType)
      : this.metrics;

    if (relevantMetrics.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        successRate: 0,
      };
    }

    const durations = relevantMetrics.map(m => m.duration);
    const successes = relevantMetrics.filter(m => m.success).length;

    return {
      count: relevantMetrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: (successes / relevantMetrics.length) * 100,
    };
  }

  /**
   * Get cost statistics
   */
  getCostStats() {
    if (this.costMetrics.length === 0) {
      return {
        totalEstimatedCost: 0,
        totalTokensSaved: 0,
        avgCostPerRequest: 0,
        strategyBreakdown: {},
      };
    }

    const totalEstimatedCost = this.costMetrics.reduce((sum, m) => sum + m.estimatedCost, 0);
    const totalTokensSaved = this.costMetrics.reduce((sum, m) => sum + m.tokensSaved, 0);

    // Strategy breakdown
    const strategyBreakdown: Record<string, { count: number; cost: number; saved: number }> = {};
    for (const metric of this.costMetrics) {
      if (!strategyBreakdown[metric.strategy]) {
        strategyBreakdown[metric.strategy] = { count: 0, cost: 0, saved: 0 };
      }
      strategyBreakdown[metric.strategy].count++;
      strategyBreakdown[metric.strategy].cost += metric.estimatedCost;
      strategyBreakdown[metric.strategy].saved += metric.tokensSaved;
    }

    return {
      totalEstimatedCost,
      totalTokensSaved,
      avgCostPerRequest: totalEstimatedCost / this.costMetrics.length,
      strategyBreakdown,
      totalRequests: this.costMetrics.length,
    };
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(count: number = 10): PerformanceMetric[] {
    return this.metrics.slice(-count);
  }

  /**
   * Get recent cost metrics
   */
  getRecentCostMetrics(count: number = 10): CostMetric[] {
    return this.costMetrics.slice(-count);
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = [];
    this.costMetrics = [];
  }

  /**
   * Export metrics as JSON
   */
  export() {
    return {
      performance: this.metrics,
      costs: this.costMetrics,
      stats: {
        performance: {
          overall: this.getStats(),
          byType: {
            request: this.getStats('request'),
            file: this.getStats('file'),
            shell: this.getStats('shell'),
            parse: this.getStats('parse'),
            stream: this.getStats('stream'),
          },
        },
        costs: this.getCostStats(),
      },
      timestamp: Date.now(),
    };
  }
}

// Global metrics instance
export const performanceMetrics = new PerformanceMetricsTracker();

// Helper to time async operations
export async function timeAsync<T>(
  metricType: PerformanceMetric['metricType'],
  operation: () => Promise<T>,
  details?: Record<string, any>
): Promise<T> {
  const start = Date.now();
  let success = false;

  try {
    const result = await operation();
    success = true;
    return result;
  } finally {
    const duration = Date.now() - start;
    performanceMetrics.trackMetric({
      metricType,
      duration,
      success,
      details,
    });
  }
}

// Helper to time sync operations
export function timeSync<T>(
  metricType: PerformanceMetric['metricType'],
  operation: () => T,
  details?: Record<string, any>
): T {
  const start = Date.now();
  let success = false;

  try {
    const result = operation();
    success = true;
    return result;
  } finally {
    const duration = Date.now() - start;
    performanceMetrics.trackMetric({
      metricType,
      duration,
      success,
      details,
    });
  }
}
