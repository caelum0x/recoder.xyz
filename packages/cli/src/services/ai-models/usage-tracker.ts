/**
 * Usage Tracker - Tracks AI model usage, costs, and analytics
 */

import fs from 'fs-extra';
import path from 'path';
import { Logger } from 'recoder-shared';
import {
  ModelRequest,
  ModelResponse,
  ModelUsageStats,
  StatsPeriod,
  TaskType,
  TokenUsageStats,
  ModelProvider
} from 'recoder-shared/types/ai-models';

export interface UsageRecord {
  id: string;
  timestamp: Date;
  model: string;
  provider: ModelProvider;
  task: TaskType;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
  responseTime: number;
  success: boolean;
  error?: string;
  userId?: string;
  projectPath?: string;
}

export interface CostBreakdown {
  total: number;
  byProvider: Record<ModelProvider, number>;
  byModel: Record<string, number>;
  byTask: Record<TaskType, number>;
  byPeriod: Array<{
    period: string;
    cost: number;
    requests: number;
  }>;
}

export interface PerformanceMetrics {
  totalRequests: number;
  successRate: number;
  averageResponseTime: number;
  averageCost: number;
  popularModels: Array<{
    model: string;
    requests: number;
    percentage: number;
  }>;
  popularTasks: Array<{
    task: TaskType;
    requests: number;
    percentage: number;
  }>;
}

export class UsageTracker {
  private records: UsageRecord[] = [];
  private dataDir: string;
  private maxRecords: number = 10000;
  private saveInterval: number = 60000; // 1 minute
  private saveTimer?: NodeJS.Timeout;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(process.cwd(), '.recoder', 'usage');
  }

  public async initialize(): Promise<void> {
    await fs.ensureDir(this.dataDir);
    await this.loadRecords();
    this.startAutoSave();
    
    Logger.info('Usage tracker initialized', {
      dataDir: this.dataDir,
      recordCount: this.records.length
    });
  }

  public trackRequestStart(request: ModelRequest): void {
    // Create a pending record that will be updated on completion
    const record: Partial<UsageRecord> = {
      id: request.id,
      timestamp: request.timestamp,
      model: request.model,
      task: request.context?.task || TaskType.CHAT,
      projectPath: request.context?.projectPath
    };

    Logger.debug('Request started', { requestId: request.id, model: request.model });
  }

  public trackRequestComplete(request: ModelRequest, response: ModelResponse): void {
    const record: UsageRecord = {
      id: request.id,
      timestamp: request.timestamp,
      model: response.model,
      provider: response.metadata.provider,
      task: request.context?.task || TaskType.CHAT,
      tokens: {
        input: response.usage.inputTokens,
        output: response.usage.outputTokens,
        total: response.usage.totalTokens
      },
      cost: response.usage.cost || 0,
      responseTime: response.metadata.responseTime,
      success: !response.error,
      error: response.error?.message,
      projectPath: request.context?.projectPath
    };

    this.addRecord(record);
    
    Logger.debug('Request completed', {
      requestId: request.id,
      model: response.model,
      tokens: record.tokens.total,
      cost: record.cost,
      responseTime: record.responseTime
    });
  }

  public trackRequestError(request: ModelRequest, error: any): void {
    const record: UsageRecord = {
      id: request.id,
      timestamp: request.timestamp,
      model: request.model || 'unknown',
      provider: ModelProvider.CUSTOM, // Unknown provider for failed requests
      task: request.context?.task || TaskType.CHAT,
      tokens: {
        input: 0,
        output: 0,
        total: 0
      },
      cost: 0,
      responseTime: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      projectPath: request.context?.projectPath
    };

    this.addRecord(record);
    
    Logger.debug('Request failed', {
      requestId: request.id,
      model: request.model,
      error: record.error
    });
  }

  public getUsageStats(period: StatsPeriod = StatsPeriod.DAY): ModelUsageStats[] {
    const now = new Date();
    const periodStart = this.getPeriodStart(now, period);
    
    const periodRecords = this.records.filter(record => 
      record.timestamp >= periodStart && record.timestamp <= now
    );

    // Group by model
    const modelStats = new Map<string, {
      requests: number;
      tokens: TokenUsageStats;
      cost: number;
      responseTime: number;
      errors: number;
      tasks: Map<TaskType, number>;
    }>();

    for (const record of periodRecords) {
      const existing = modelStats.get(record.model) || {
        requests: 0,
        tokens: { input: 0, output: 0, total: 0, cached: 0 },
        cost: 0,
        responseTime: 0,
        errors: 0,
        tasks: new Map()
      };

      existing.requests++;
      existing.tokens.input += record.tokens.input;
      existing.tokens.output += record.tokens.output;
      existing.tokens.total += record.tokens.total;
      existing.cost += record.cost;
      existing.responseTime += record.responseTime;
      
      if (!record.success) {
        existing.errors++;
      }

      const taskCount = existing.tasks.get(record.task) || 0;
      existing.tasks.set(record.task, taskCount + 1);

      modelStats.set(record.model, existing);
    }

    // Convert to stats format
    const stats: ModelUsageStats[] = [];
    
    for (const [model, data] of modelStats) {
      const popularTasks = Array.from(data.tasks.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([task, count]) => ({ task, count }));

      stats.push({
        model,
        period,
        requests: data.requests,
        tokens: data.tokens,
        cost: data.cost,
        averageResponseTime: data.requests > 0 ? data.responseTime / data.requests : 0,
        errorRate: data.requests > 0 ? data.errors / data.requests : 0,
        popularTasks,
        qualityScore: this.calculateQualityScore(data)
      });
    }

    return stats.sort((a, b) => b.requests - a.requests);
  }

  public getCostBreakdown(period: StatsPeriod = StatsPeriod.MONTH): CostBreakdown {
    const now = new Date();
    const periodStart = this.getPeriodStart(now, period);
    
    const periodRecords = this.records.filter(record => 
      record.timestamp >= periodStart && record.timestamp <= now
    );

    const breakdown: CostBreakdown = {
      total: 0,
      byProvider: {} as Record<ModelProvider, number>,
      byModel: {},
      byTask: {} as Record<TaskType, number>,
      byPeriod: []
    };

    // Calculate totals
    for (const record of periodRecords) {
      breakdown.total += record.cost;
      
      breakdown.byProvider[record.provider] = (breakdown.byProvider[record.provider] || 0) + record.cost;
      breakdown.byModel[record.model] = (breakdown.byModel[record.model] || 0) + record.cost;
      breakdown.byTask[record.task] = (breakdown.byTask[record.task] || 0) + record.cost;
    }

    // Calculate by period (daily breakdown for the period)
    const dailyStats = new Map<string, { cost: number; requests: number }>();
    
    for (const record of periodRecords) {
      const day = record.timestamp.toISOString().split('T')[0];
      const existing = dailyStats.get(day) || { cost: 0, requests: 0 };
      existing.cost += record.cost;
      existing.requests++;
      dailyStats.set(day, existing);
    }

    breakdown.byPeriod = Array.from(dailyStats.entries())
      .map(([period, data]) => ({ period, cost: data.cost, requests: data.requests }))
      .sort((a, b) => a.period.localeCompare(b.period));

    return breakdown;
  }

  public getPerformanceMetrics(period: StatsPeriod = StatsPeriod.DAY): PerformanceMetrics {
    const now = new Date();
    const periodStart = this.getPeriodStart(now, period);
    
    const periodRecords = this.records.filter(record => 
      record.timestamp >= periodStart && record.timestamp <= now
    );

    const totalRequests = periodRecords.length;
    const successfulRequests = periodRecords.filter(r => r.success).length;
    const totalResponseTime = periodRecords.reduce((sum, r) => sum + r.responseTime, 0);
    const totalCost = periodRecords.reduce((sum, r) => sum + r.cost, 0);

    // Model popularity
    const modelCounts = new Map<string, number>();
    periodRecords.forEach(record => {
      modelCounts.set(record.model, (modelCounts.get(record.model) || 0) + 1);
    });

    const popularModels = Array.from(modelCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([model, requests]) => ({
        model,
        requests,
        percentage: totalRequests > 0 ? (requests / totalRequests) * 100 : 0
      }));

    // Task popularity
    const taskCounts = new Map<TaskType, number>();
    periodRecords.forEach(record => {
      taskCounts.set(record.task, (taskCounts.get(record.task) || 0) + 1);
    });

    const popularTasks = Array.from(taskCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([task, requests]) => ({
        task,
        requests,
        percentage: totalRequests > 0 ? (requests / totalRequests) * 100 : 0
      }));

    return {
      totalRequests,
      successRate: totalRequests > 0 ? successfulRequests / totalRequests : 0,
      averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      averageCost: totalRequests > 0 ? totalCost / totalRequests : 0,
      popularModels,
      popularTasks
    };
  }

  public getModelComparison(models: string[], period: StatsPeriod = StatsPeriod.DAY): any {
    const stats = this.getUsageStats(period);
    const modelStats = stats.filter(s => models.includes(s.model));

    return {
      models: modelStats,
      comparison: {
        costEfficiency: modelStats.map(s => ({
          model: s.model,
          costPerToken: s.tokens.total > 0 ? s.cost / s.tokens.total : 0,
          score: this.calculateCostEfficiencyScore(s)
        })),
        performance: modelStats.map(s => ({
          model: s.model,
          responseTime: s.averageResponseTime,
          errorRate: s.errorRate,
          score: this.calculatePerformanceScore(s)
        })),
        quality: modelStats.map(s => ({
          model: s.model,
          qualityScore: s.qualityScore,
          requests: s.requests
        }))
      }
    };
  }

  public exportUsageData(
    format: 'json' | 'csv' = 'json',
    period?: StatsPeriod,
    filePath?: string
  ): string {
    const records = period ? 
      this.getRecordsForPeriod(period) : 
      this.records;

    const fileName = filePath || `usage-export-${Date.now()}.${format}`;
    const fullPath = path.resolve(fileName);

    if (format === 'json') {
      const data = {
        exportDate: new Date().toISOString(),
        recordCount: records.length,
        period,
        records
      };
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
    } else if (format === 'csv') {
      const headers = [
        'timestamp', 'model', 'provider', 'task', 'inputTokens', 
        'outputTokens', 'totalTokens', 'cost', 'responseTime', 'success', 'error'
      ];
      
      const rows = records.map(record => [
        record.timestamp.toISOString(),
        record.model,
        record.provider,
        record.task,
        record.tokens.input,
        record.tokens.output,
        record.tokens.total,
        record.cost,
        record.responseTime,
        record.success,
        record.error || ''
      ]);

      const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
      fs.writeFileSync(fullPath, csv);
    }

    Logger.info('Usage data exported', { format, recordCount: records.length, filePath: fullPath });
    return fullPath;
  }

  public async destroy(): Promise<void> {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    
    await this.saveRecords();
    this.records = [];
    
    Logger.info('Usage tracker destroyed');
  }

  private addRecord(record: UsageRecord): void {
    this.records.push(record);
    
    // Trim old records if needed
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }
  }

  private async loadRecords(): Promise<void> {
    try {
      const recordsFile = path.join(this.dataDir, 'usage-records.json');
      
      if (await fs.pathExists(recordsFile)) {
        const data = await fs.readJson(recordsFile);
        this.records = data.records || [];
        
        // Convert timestamp strings back to Date objects
        this.records.forEach(record => {
          record.timestamp = new Date(record.timestamp);
        });
        
        Logger.info('Usage records loaded', { count: this.records.length });
      }
    } catch (error) {
      Logger.warn('Failed to load usage records', { error });
      this.records = [];
    }
  }

  private async saveRecords(): Promise<void> {
    try {
      const recordsFile = path.join(this.dataDir, 'usage-records.json');
      
      const data = {
        version: '1.0',
        lastSaved: new Date().toISOString(),
        recordCount: this.records.length,
        records: this.records
      };
      
      await fs.writeJson(recordsFile, data, { spaces: 2 });
      
      Logger.debug('Usage records saved', { count: this.records.length });
    } catch (error) {
      Logger.error('Failed to save usage records', { error });
    }
  }

  private startAutoSave(): void {
    this.saveTimer = setInterval(() => {
      this.saveRecords().catch(error => {
        Logger.error('Auto-save failed', { error });
      });
    }, this.saveInterval);
  }

  private getPeriodStart(date: Date, period: StatsPeriod): Date {
    const start = new Date(date);
    
    switch (period) {
      case StatsPeriod.HOUR:
        start.setMinutes(0, 0, 0);
        break;
      case StatsPeriod.DAY:
        start.setHours(0, 0, 0, 0);
        break;
      case StatsPeriod.WEEK:
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      case StatsPeriod.MONTH:
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      case StatsPeriod.YEAR:
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        break;
    }
    
    return start;
  }

  private getRecordsForPeriod(period: StatsPeriod): UsageRecord[] {
    const now = new Date();
    const periodStart = this.getPeriodStart(now, period);
    
    return this.records.filter(record => 
      record.timestamp >= periodStart && record.timestamp <= now
    );
  }

  private calculateQualityScore(data: any): number {
    const successRate = data.requests > 0 ? (data.requests - data.errors) / data.requests : 0;
    const responseTimeScore = Math.max(0, 1 - (data.responseTime / data.requests) / 30000); // 30s max
    
    return (successRate * 0.7 + responseTimeScore * 0.3) * 100;
  }

  private calculateCostEfficiencyScore(stats: ModelUsageStats): number {
    const costPerToken = stats.tokens.total > 0 ? stats.cost / stats.tokens.total : 0;
    
    // Lower cost per token = higher score
    // Assume 0.01 per token is expensive (score 0), 0 is perfect (score 100)
    return Math.max(0, 100 - (costPerToken / 0.01) * 100);
  }

  private calculatePerformanceScore(stats: ModelUsageStats): number {
    const successScore = (1 - stats.errorRate) * 100;
    const speedScore = Math.max(0, 100 - (stats.averageResponseTime / 30000) * 100); // 30s max
    
    return (successScore * 0.6 + speedScore * 0.4);
  }
}