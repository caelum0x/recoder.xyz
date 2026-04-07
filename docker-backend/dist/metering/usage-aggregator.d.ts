/**
 * Usage Aggregator
 * Aggregates usage metrics into hourly/daily/monthly summaries
 */
import { EventEmitter } from 'events';
import { MetricType, UsageMetric, UsageRecord, UsageSummary, AggregationPeriod, MeteringConfig } from './types.js';
export declare class UsageAggregator extends EventEmitter {
    private config;
    private hourlyBuckets;
    private dailyBuckets;
    private monthlyBuckets;
    private rollingWindows;
    private aggregationInterval?;
    private records;
    constructor(config?: Partial<MeteringConfig>);
    private saveRecords;
    /**
     * Start the aggregator
     */
    start(): void;
    /**
     * Stop the aggregator
     */
    stop(): void;
    /**
     * Ingest a new usage metric
     */
    ingestMetric(metric: UsageMetric): void;
    /**
     * Ingest multiple metrics (batch)
     */
    ingestMetrics(metrics: UsageMetric[]): void;
    /**
     * Generate bucket key
     */
    private getBucketKey;
    /**
     * Add metric to aggregation bucket
     */
    private addToBucket;
    /**
     * Update rolling window for rate limiting
     */
    private updateRollingWindow;
    /**
     * Get rolling window sum for rate limiting
     */
    getRollingWindowSum(userId: string, metricType: MetricType): number;
    /**
     * Get rolling window rate (per second)
     */
    getRollingWindowRate(userId: string, metricType: MetricType): number;
    /**
     * Run aggregation for completed periods
     */
    private runAggregation;
    /**
     * Flush completed buckets to records
     */
    private flushCompletedBuckets;
    private getHourStart;
    private getHourEnd;
    private getDayStart;
    private getDayEnd;
    private getMonthStart;
    private getMonthEnd;
    /**
     * Get usage summary for a user
     */
    getUserSummary(userId: string, periodStart: Date, periodEnd: Date): UsageSummary;
    /**
     * Get current bucket data for a user
     */
    private getCurrentBucketData;
    /**
     * Get current month's usage for a user by metric type
     */
    getCurrentMonthUsage(userId: string, metricType: MetricType): number;
    /**
     * Get usage by project for current month
     */
    getCurrentMonthUsageByProject(userId: string): Map<string, Partial<Record<MetricType, number>>>;
    /**
     * Get all usage records for a user
     */
    getRecords(userId: string, options?: {
        metricType?: MetricType;
        projectId?: string;
        period?: AggregationPeriod;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }): UsageRecord[];
    /**
     * Import records (for loading from storage)
     */
    importRecords(records: UsageRecord[]): void;
    /**
     * Export records (for persistence)
     */
    exportRecords(): UsageRecord[];
    /**
     * Clear old records based on retention policy
     */
    cleanupOldRecords(): number;
    /**
     * Get statistics about the aggregator
     */
    getStats(): {
        hourlyBuckets: number;
        dailyBuckets: number;
        monthlyBuckets: number;
        rollingWindows: number;
        totalRecords: number;
    };
}
/**
 * Get or create the usage aggregator singleton
 */
export declare function getUsageAggregator(config?: Partial<MeteringConfig>): UsageAggregator;
/**
 * Reset the usage aggregator (for testing)
 */
export declare function resetUsageAggregator(): void;
export default UsageAggregator;
