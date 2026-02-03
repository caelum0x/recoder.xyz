/**
 * Usage Aggregator
 * Aggregates usage metrics into hourly/daily/monthly summaries
 */

import { EventEmitter } from 'events';
import {
  MetricType,
  UsageMetric,
  UsageRecord,
  UsageSummary,
  AggregationPeriod,
  MeteringConfig,
  DEFAULT_METERING_CONFIG,
  METRIC_UNITS,
} from './types.js';
import { v4 as uuid } from 'uuid';
import { loadStore, debouncedSave } from '../persistence.js';

// ==================== Types ====================

interface AggregationBucket {
  userId: string;
  projectId?: string;
  metricType: MetricType;
  periodStart: Date;
  periodEnd: Date;
  period: AggregationPeriod;
  values: number[];
  sum: number;
  count: number;
  min: number;
  max: number;
}

interface RollingWindow {
  userId: string;
  metricType: MetricType;
  windowSize: number; // in seconds
  dataPoints: Array<{ timestamp: number; value: number }>;
}

// ==================== Usage Aggregator ====================

export class UsageAggregator extends EventEmitter {
  private config: MeteringConfig;

  // Current aggregation buckets
  private hourlyBuckets: Map<string, AggregationBucket> = new Map();
  private dailyBuckets: Map<string, AggregationBucket> = new Map();
  private monthlyBuckets: Map<string, AggregationBucket> = new Map();

  // Rolling windows for rate limiting
  private rollingWindows: Map<string, RollingWindow> = new Map();

  // Aggregation interval handle
  private aggregationInterval?: ReturnType<typeof setInterval>;

  // Historical records (loaded from persisted data)
  private records: UsageRecord[] = [];

  constructor(config: Partial<MeteringConfig> = {}) {
    super();
    this.config = { ...DEFAULT_METERING_CONFIG, ...config };

    // Load persisted records
    const stored = loadStore<{ records: UsageRecord[] }>('usage-records', { records: [] });
    if (stored.records.length > 0) {
      // Restore Date objects from serialized strings
      this.records = stored.records.map(r => ({
        ...r,
        periodStart: new Date(r.periodStart),
        periodEnd: new Date(r.periodEnd),
        createdAt: new Date(r.createdAt),
      }));
      console.log(`[UsageAggregator] Loaded ${this.records.length} persisted records`);
    }
  }

  private saveRecords(): void {
    debouncedSave('usage-records', { records: this.records });
  }

  // ==================== Lifecycle ====================

  /**
   * Start the aggregator
   */
  start(): void {
    console.log('[UsageAggregator] Starting usage aggregation');

    // Run aggregation periodically
    this.aggregationInterval = setInterval(
      () => this.runAggregation(),
      this.config.aggregationInterval
    );
  }

  /**
   * Stop the aggregator
   */
  stop(): void {
    console.log('[UsageAggregator] Stopping usage aggregation');

    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = undefined;
    }

    // Final aggregation
    this.runAggregation();
  }

  // ==================== Metric Ingestion ====================

  /**
   * Ingest a new usage metric
   */
  ingestMetric(metric: UsageMetric): void {
    const now = metric.timestamp;

    // Add to hourly bucket
    this.addToBucket(
      this.hourlyBuckets,
      metric,
      AggregationPeriod.HOUR,
      this.getHourStart(now),
      this.getHourEnd(now)
    );

    // Add to daily bucket
    this.addToBucket(
      this.dailyBuckets,
      metric,
      AggregationPeriod.DAY,
      this.getDayStart(now),
      this.getDayEnd(now)
    );

    // Add to monthly bucket
    this.addToBucket(
      this.monthlyBuckets,
      metric,
      AggregationPeriod.MONTH,
      this.getMonthStart(now),
      this.getMonthEnd(now)
    );

    // Update rolling window for rate limiting
    this.updateRollingWindow(metric);
  }

  /**
   * Ingest multiple metrics (batch)
   */
  ingestMetrics(metrics: UsageMetric[]): void {
    for (const metric of metrics) {
      this.ingestMetric(metric);
    }
  }

  // ==================== Bucket Management ====================

  /**
   * Generate bucket key
   */
  private getBucketKey(
    userId: string,
    metricType: MetricType,
    period: AggregationPeriod,
    periodStart: Date,
    projectId?: string
  ): string {
    const projectPart = projectId ? `:${projectId}` : '';
    return `${userId}${projectPart}:${metricType}:${period}:${periodStart.getTime()}`;
  }

  /**
   * Add metric to aggregation bucket
   */
  private addToBucket(
    buckets: Map<string, AggregationBucket>,
    metric: UsageMetric,
    period: AggregationPeriod,
    periodStart: Date,
    periodEnd: Date
  ): void {
    const key = this.getBucketKey(metric.userId, metric.metricType, period, periodStart, metric.projectId);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        userId: metric.userId,
        projectId: metric.projectId,
        metricType: metric.metricType,
        periodStart,
        periodEnd,
        period,
        values: [],
        sum: 0,
        count: 0,
        min: Infinity,
        max: -Infinity,
      };
      buckets.set(key, bucket);
    }

    bucket.values.push(metric.value);
    bucket.sum += metric.value;
    bucket.count++;
    bucket.min = Math.min(bucket.min, metric.value);
    bucket.max = Math.max(bucket.max, metric.value);
  }

  // ==================== Rolling Windows ====================

  /**
   * Update rolling window for rate limiting
   */
  private updateRollingWindow(metric: UsageMetric): void {
    const key = `${metric.userId}:${metric.metricType}`;
    const windowSize = 3600; // 1 hour window

    let window = this.rollingWindows.get(key);
    if (!window) {
      window = {
        userId: metric.userId,
        metricType: metric.metricType,
        windowSize,
        dataPoints: [],
      };
      this.rollingWindows.set(key, window);
    }

    // Add new data point
    window.dataPoints.push({
      timestamp: metric.timestamp.getTime(),
      value: metric.value,
    });

    // Remove old data points outside window
    const cutoff = Date.now() - (windowSize * 1000);
    window.dataPoints = window.dataPoints.filter(dp => dp.timestamp > cutoff);
  }

  /**
   * Get rolling window sum for rate limiting
   */
  getRollingWindowSum(userId: string, metricType: MetricType): number {
    const key = `${userId}:${metricType}`;
    const window = this.rollingWindows.get(key);

    if (!window) return 0;

    // Filter to only recent data points
    const cutoff = Date.now() - (window.windowSize * 1000);
    return window.dataPoints
      .filter(dp => dp.timestamp > cutoff)
      .reduce((sum, dp) => sum + dp.value, 0);
  }

  /**
   * Get rolling window rate (per second)
   */
  getRollingWindowRate(userId: string, metricType: MetricType): number {
    const key = `${userId}:${metricType}`;
    const window = this.rollingWindows.get(key);

    if (!window || window.dataPoints.length === 0) return 0;

    const cutoff = Date.now() - (window.windowSize * 1000);
    const recentPoints = window.dataPoints.filter(dp => dp.timestamp > cutoff);

    if (recentPoints.length < 2) return 0;

    const sum = recentPoints.reduce((s, dp) => s + dp.value, 0);
    const duration = (recentPoints[recentPoints.length - 1].timestamp - recentPoints[0].timestamp) / 1000;

    return duration > 0 ? sum / duration : 0;
  }

  // ==================== Aggregation ====================

  /**
   * Run aggregation for completed periods
   */
  private runAggregation(): void {
    const now = new Date();

    // Flush completed hourly buckets
    this.flushCompletedBuckets(this.hourlyBuckets, now);

    // Flush completed daily buckets
    this.flushCompletedBuckets(this.dailyBuckets, now);

    // Flush completed monthly buckets
    this.flushCompletedBuckets(this.monthlyBuckets, now);
  }

  /**
   * Flush completed buckets to records
   */
  private flushCompletedBuckets(
    buckets: Map<string, AggregationBucket>,
    now: Date
  ): void {
    const toRemove: string[] = [];

    for (const [key, bucket] of buckets) {
      if (bucket.periodEnd <= now && bucket.count > 0) {
        // Create usage record
        const record: UsageRecord = {
          id: uuid(),
          userId: bucket.userId,
          projectId: bucket.projectId,
          metricType: bucket.metricType,
          value: bucket.sum,
          periodStart: bucket.periodStart,
          periodEnd: bucket.periodEnd,
          aggregationPeriod: bucket.period,
          createdAt: new Date(),
          metadata: {
            count: bucket.count,
            min: bucket.min === Infinity ? 0 : bucket.min,
            max: bucket.max === -Infinity ? 0 : bucket.max,
            avg: bucket.count > 0 ? bucket.sum / bucket.count : 0,
          },
        };

        this.records.push(record);
        this.emit('record', record);

        toRemove.push(key);
      }
    }

    // Remove flushed buckets
    for (const key of toRemove) {
      buckets.delete(key);
    }

    if (toRemove.length > 0) {
      console.log(`[UsageAggregator] Flushed ${toRemove.length} aggregation buckets`);
      this.saveRecords();
    }
  }

  // ==================== Period Helpers ====================

  private getHourStart(date: Date): Date {
    const d = new Date(date);
    d.setMinutes(0, 0, 0);
    return d;
  }

  private getHourEnd(date: Date): Date {
    const d = this.getHourStart(date);
    d.setHours(d.getHours() + 1);
    return d;
  }

  private getDayStart(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private getDayEnd(date: Date): Date {
    const d = this.getDayStart(date);
    d.setDate(d.getDate() + 1);
    return d;
  }

  private getMonthStart(date: Date): Date {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private getMonthEnd(date: Date): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ==================== Query Methods ====================

  /**
   * Get usage summary for a user
   */
  getUserSummary(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): UsageSummary {
    // Get records for the period
    const userRecords = this.records.filter(
      r => r.userId === userId &&
           r.periodStart >= periodStart &&
           r.periodEnd <= periodEnd
    );

    // Also include current bucket data
    const currentBucketData = this.getCurrentBucketData(userId);

    // Aggregate by metric type
    const metricTotals: Record<MetricType, number[]> = {} as Record<MetricType, number[]>;
    const projectBreakdown = new Map<string, Partial<Record<MetricType, number>>>();
    const dailyBreakdown = new Map<string, Partial<Record<MetricType, number>>>();

    // Process historical records
    for (const record of userRecords) {
      // Metric totals
      if (!metricTotals[record.metricType]) {
        metricTotals[record.metricType] = [];
      }
      metricTotals[record.metricType].push(record.value);

      // Project breakdown
      if (record.projectId) {
        const project = projectBreakdown.get(record.projectId) || {};
        project[record.metricType] = (project[record.metricType] || 0) + record.value;
        projectBreakdown.set(record.projectId, project);
      }

      // Daily breakdown
      const dayKey = record.periodStart.toISOString().split('T')[0];
      const day = dailyBreakdown.get(dayKey) || {};
      day[record.metricType] = (day[record.metricType] || 0) + record.value;
      dailyBreakdown.set(dayKey, day);
    }

    // Process current bucket data
    for (const bucket of currentBucketData) {
      if (!metricTotals[bucket.metricType]) {
        metricTotals[bucket.metricType] = [];
      }
      metricTotals[bucket.metricType].push(bucket.sum);

      if (bucket.projectId) {
        const project = projectBreakdown.get(bucket.projectId) || {};
        project[bucket.metricType] = (project[bucket.metricType] || 0) + bucket.sum;
        projectBreakdown.set(bucket.projectId, project);
      }
    }

    // Build summary
    const metrics: UsageSummary['metrics'] = {};
    for (const [metricType, values] of Object.entries(metricTotals)) {
      const mt = metricType as MetricType;
      const total = values.reduce((a, b) => a + b, 0);
      const avg = values.length > 0 ? total / values.length : 0;
      const peak = values.length > 0 ? Math.max(...values) : 0;

      metrics[mt] = {
        total,
        average: avg,
        peak,
        unit: METRIC_UNITS[mt],
      };
    }

    return {
      userId,
      periodStart,
      periodEnd,
      metrics,
      breakdown: {
        byProject: projectBreakdown,
        byDay: dailyBreakdown,
      },
    };
  }

  /**
   * Get current bucket data for a user
   */
  private getCurrentBucketData(userId: string): AggregationBucket[] {
    const buckets: AggregationBucket[] = [];

    for (const bucket of this.monthlyBuckets.values()) {
      if (bucket.userId === userId) {
        buckets.push(bucket);
      }
    }

    return buckets;
  }

  /**
   * Get current month's usage for a user by metric type
   */
  getCurrentMonthUsage(userId: string, metricType: MetricType): number {
    const monthStart = this.getMonthStart(new Date());
    let total = 0;

    // Sum from monthly buckets
    for (const bucket of this.monthlyBuckets.values()) {
      if (bucket.userId === userId &&
          bucket.metricType === metricType &&
          bucket.periodStart.getTime() === monthStart.getTime()) {
        total += bucket.sum;
      }
    }

    // Add historical records for this month
    for (const record of this.records) {
      if (record.userId === userId &&
          record.metricType === metricType &&
          record.periodStart >= monthStart) {
        total += record.value;
      }
    }

    return total;
  }

  /**
   * Get usage by project for current month
   */
  getCurrentMonthUsageByProject(userId: string): Map<string, Partial<Record<MetricType, number>>> {
    const monthStart = this.getMonthStart(new Date());
    const result = new Map<string, Partial<Record<MetricType, number>>>();

    // From monthly buckets
    for (const bucket of this.monthlyBuckets.values()) {
      if (bucket.userId === userId &&
          bucket.projectId &&
          bucket.periodStart.getTime() === monthStart.getTime()) {
        const project = result.get(bucket.projectId) || {};
        project[bucket.metricType] = (project[bucket.metricType] || 0) + bucket.sum;
        result.set(bucket.projectId, project);
      }
    }

    // From historical records
    for (const record of this.records) {
      if (record.userId === userId &&
          record.projectId &&
          record.periodStart >= monthStart) {
        const project = result.get(record.projectId) || {};
        project[record.metricType] = (project[record.metricType] || 0) + record.value;
        result.set(record.projectId, project);
      }
    }

    return result;
  }

  /**
   * Get all usage records for a user
   */
  getRecords(
    userId: string,
    options?: {
      metricType?: MetricType;
      projectId?: string;
      period?: AggregationPeriod;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): UsageRecord[] {
    let records = this.records.filter(r => r.userId === userId);

    if (options?.metricType) {
      records = records.filter(r => r.metricType === options.metricType);
    }

    if (options?.projectId) {
      records = records.filter(r => r.projectId === options.projectId);
    }

    if (options?.period) {
      records = records.filter(r => r.aggregationPeriod === options.period);
    }

    if (options?.startDate) {
      records = records.filter(r => r.periodStart >= options.startDate!);
    }

    if (options?.endDate) {
      records = records.filter(r => r.periodEnd <= options.endDate!);
    }

    // Sort by period start descending
    records.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());

    if (options?.limit) {
      records = records.slice(0, options.limit);
    }

    return records;
  }

  // ==================== Data Management ====================

  /**
   * Import records (for loading from storage)
   */
  importRecords(records: UsageRecord[]): void {
    this.records.push(...records);
    this.saveRecords();
    console.log(`[UsageAggregator] Imported ${records.length} records`);
  }

  /**
   * Export records (for persistence)
   */
  exportRecords(): UsageRecord[] {
    return [...this.records];
  }

  /**
   * Clear old records based on retention policy
   */
  cleanupOldRecords(): number {
    const rawCutoff = new Date();
    rawCutoff.setDate(rawCutoff.getDate() - this.config.rawDataRetention);

    const aggregatedCutoff = new Date();
    aggregatedCutoff.setDate(aggregatedCutoff.getDate() - this.config.aggregatedDataRetention);

    const originalCount = this.records.length;

    this.records = this.records.filter(r => {
      if (r.aggregationPeriod === AggregationPeriod.MINUTE ||
          r.aggregationPeriod === AggregationPeriod.HOUR) {
        return r.createdAt > rawCutoff;
      }
      return r.createdAt > aggregatedCutoff;
    });

    const removedCount = originalCount - this.records.length;
    if (removedCount > 0) {
      console.log(`[UsageAggregator] Cleaned up ${removedCount} old records`);
      this.saveRecords();
    }

    return removedCount;
  }

  /**
   * Get statistics about the aggregator
   */
  getStats(): {
    hourlyBuckets: number;
    dailyBuckets: number;
    monthlyBuckets: number;
    rollingWindows: number;
    totalRecords: number;
  } {
    return {
      hourlyBuckets: this.hourlyBuckets.size,
      dailyBuckets: this.dailyBuckets.size,
      monthlyBuckets: this.monthlyBuckets.size,
      rollingWindows: this.rollingWindows.size,
      totalRecords: this.records.length,
    };
  }
}

// ==================== Singleton Factory ====================

let aggregatorInstance: UsageAggregator | null = null;

/**
 * Get or create the usage aggregator singleton
 */
export function getUsageAggregator(config?: Partial<MeteringConfig>): UsageAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new UsageAggregator(config);
  }
  return aggregatorInstance;
}

/**
 * Reset the usage aggregator (for testing)
 */
export function resetUsageAggregator(): void {
  if (aggregatorInstance) {
    aggregatorInstance.stop();
    aggregatorInstance = null;
  }
}

export default UsageAggregator;
