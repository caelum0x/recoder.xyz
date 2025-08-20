/**
 * Cost Optimization Analytics Service
 * Shares cost optimization data with main platform for centralized analytics
 * Provides real-time cost insights and recommendations
 */

import { EventEmitter } from 'events';
import { Logger } from './logger';
import MainBackendConnection from './main-backend-connection';

export interface CostMetrics {
  provider: string;
  model: string;
  requests_count: number;
  total_tokens: number;
  total_cost: number;
  avg_cost_per_token: number;
  avg_response_time: number;
  success_rate: number;
  period_start: Date;
  period_end: Date;
}

export interface OptimizationOpportunity {
  type: 'model_switch' | 'provider_switch' | 'caching' | 'batching' | 'scheduling';
  current_model: string;
  recommended_model: string;
  potential_savings: number;
  confidence_score: number;
  reasoning: string;
  estimated_quality_impact: number; // -5 to +5
}

export interface RouterCostData {
  router_id: string;
  time_period: {
    start: Date;
    end: Date;
    duration_hours: number;
  };
  cost_summary: {
    total_requests: number;
    total_cost: number;
    total_tokens: number;
    avg_cost_per_request: number;
    cost_by_provider: Record<string, number>;
    cost_by_model: Record<string, number>;
  };
  optimization_metrics: {
    baseline_cost: number; // What it would cost without optimization
    actual_cost: number;
    savings_amount: number;
    savings_percentage: number;
  };
  performance_metrics: {
    avg_response_time: number;
    p95_response_time: number;
    success_rate: number;
    error_rate: number;
  };
  recommendations: OptimizationOpportunity[];
}

export class CostOptimizationAnalytics extends EventEmitter {
  private logger: Logger;
  private backendConnection: MainBackendConnection | null = null;
  private costMetrics: Map<string, CostMetrics> = new Map();
  private requestHistory: Array<{
    timestamp: Date;
    provider: string;
    model: string;
    tokens: number;
    cost: number;
    response_time: number;
    success: boolean;
  }> = [];
  private syncTimer: NodeJS.Timeout | null = null;
  private analyticsBuffer: RouterCostData[] = [];

  constructor() {
    super();
    this.logger = new Logger('CostOptimizationAnalytics');
  }

  /**
   * Initialize with backend connection
   */
  async initialize(backendConnection: MainBackendConnection): Promise<void> {
    this.backendConnection = backendConnection;

    // Start periodic analytics sync
    this.startAnalyticsSync();

    // Listen for backend events
    this.backendConnection.on('connected', () => {
      this.logger.info('📊 Connected to cost analytics platform');
      this.syncPendingAnalytics();
    });

    this.backendConnection.on('disconnected', () => {
      this.logger.warn('📊 Cost analytics platform disconnected - buffering data');
    });

    this.logger.info('📈 Cost optimization analytics initialized');
  }

  /**
   * Record a request for cost analysis
   */
  recordRequest(
    provider: string,
    model: string,
    tokens: number,
    cost: number,
    responseTime: number,
    success: boolean
  ): void {
    const timestamp = new Date();

    // Add to request history
    this.requestHistory.push({
      timestamp,
      provider,
      model,
      tokens,
      cost,
      response_time: responseTime,
      success
    });

    // Update cost metrics
    this.updateCostMetrics(provider, model, tokens, cost, responseTime, success);

    // Emit real-time cost event
    this.emit('cost_recorded', {
      provider,
      model,
      cost,
      timestamp,
      cumulative_cost: this.getTotalCost()
    });

    // Check for optimization opportunities
    this.checkForOptimizationOpportunities(provider, model, cost);

    // Cleanup old history (keep last 24 hours)
    this.cleanupHistory();
  }

  /**
   * Generate comprehensive cost report
   */
  generateCostReport(periodHours: number = 24): RouterCostData {
    const now = new Date();
    const periodStart = new Date(now.getTime() - periodHours * 60 * 60 * 1000);
    
    // Filter requests within period
    const periodRequests = this.requestHistory.filter(
      req => req.timestamp >= periodStart
    );

    if (periodRequests.length === 0) {
      return this.getEmptyReport(periodStart, now, periodHours);
    }

    // Calculate cost summary
    const costSummary = this.calculateCostSummary(periodRequests);
    
    // Calculate optimization metrics
    const optimizationMetrics = this.calculateOptimizationMetrics(periodRequests);
    
    // Calculate performance metrics
    const performanceMetrics = this.calculatePerformanceMetrics(periodRequests);
    
    // Generate recommendations
    const recommendations = this.generateOptimizationRecommendations(periodRequests);

    const report: RouterCostData = {
      router_id: this.getRouterId(),
      time_period: {
        start: periodStart,
        end: now,
        duration_hours: periodHours
      },
      cost_summary: costSummary,
      optimization_metrics: optimizationMetrics,
      performance_metrics: performanceMetrics,
      recommendations: recommendations
    };

    // Emit report generated event
    this.emit('cost_report_generated', report);

    return report;
  }

  /**
   * Get real-time cost optimization insights
   */
  getRealTimeInsights(): {
    current_hourly_rate: number;
    projected_monthly_cost: number;
    top_cost_drivers: Array<{ model: string; cost: number; percentage: number }>;
    recent_savings: number;
    efficiency_score: number;
  } {
    const lastHour = this.requestHistory.filter(
      req => req.timestamp >= new Date(Date.now() - 60 * 60 * 1000)
    );

    const currentHourlyRate = lastHour.reduce((sum, req) => sum + req.cost, 0);
    const projectedMonthlyCost = currentHourlyRate * 24 * 30;

    // Calculate top cost drivers
    const costByModel = new Map<string, number>();
    const totalCost = this.requestHistory.reduce((sum, req) => {
      const existing = costByModel.get(req.model) || 0;
      costByModel.set(req.model, existing + req.cost);
      return sum + req.cost;
    }, 0);

    const topCostDrivers = Array.from(costByModel.entries())
      .map(([model, cost]) => ({
        model,
        cost,
        percentage: (cost / totalCost) * 100
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    // Calculate recent savings
    const baselineCost = this.calculateBaselineCost();
    const actualCost = totalCost;
    const recentSavings = Math.max(0, baselineCost - actualCost);

    // Calculate efficiency score
    const efficiencyScore = this.calculateEfficiencyScore();

    return {
      current_hourly_rate: currentHourlyRate,
      projected_monthly_cost: projectedMonthlyCost,
      top_cost_drivers: topCostDrivers,
      recent_savings: recentSavings,
      efficiency_score: efficiencyScore
    };
  }

  /**
   * Sync analytics data with main platform
   */
  async syncWithPlatform(): Promise<void> {
    if (!this.backendConnection) {
      this.logger.warn('No backend connection for analytics sync');
      return;
    }

    try {
      // Generate comprehensive report
      const report = this.generateCostReport(1); // Last hour

      // Send to backend
      await this.backendConnection.reportUsage({
        requests: this.requestHistory.slice(-100), // Last 100 requests
        period_start: report.time_period.start,
        period_end: report.time_period.end
      });

      // Send cost optimization data
      await this.sendCostOptimizationData(report);

      this.logger.debug('📊 Analytics synced with main platform');

    } catch (error: any) {
      this.logger.error('Failed to sync analytics with platform', error);
      
      // Buffer data for later sync
      const report = this.generateCostReport(1);
      this.analyticsBuffer.push(report);
    }
  }

  /**
   * Get cost savings recommendations
   */
  async getCostSavingsRecommendations(): Promise<{
    immediate_actions: OptimizationOpportunity[];
    long_term_strategies: OptimizationOpportunity[];
    estimated_monthly_savings: number;
  }> {
    const allRecommendations = this.generateOptimizationRecommendations(this.requestHistory);

    // Separate immediate vs long-term actions
    const immediateActions = allRecommendations.filter(
      rec => rec.type === 'model_switch' || rec.type === 'provider_switch'
    );

    const longTermStrategies = allRecommendations.filter(
      rec => rec.type === 'caching' || rec.type === 'batching' || rec.type === 'scheduling'
    );

    // Calculate estimated monthly savings
    const estimatedMonthlySavings = allRecommendations.reduce(
      (sum, rec) => sum + rec.potential_savings * 30, // Assume daily savings * 30
      0
    );

    return {
      immediate_actions: immediateActions,
      long_term_strategies: longTermStrategies,
      estimated_monthly_savings: estimatedMonthlySavings
    };
  }

  /**
   * Private helper methods
   */

  private updateCostMetrics(
    provider: string,
    model: string,
    tokens: number,
    cost: number,
    responseTime: number,
    success: boolean
  ): void {
    const key = `${provider}/${model}`;
    const existing = this.costMetrics.get(key);

    if (existing) {
      // Update existing metrics
      existing.requests_count++;
      existing.total_tokens += tokens;
      existing.total_cost += cost;
      existing.avg_cost_per_token = existing.total_cost / existing.total_tokens;
      existing.avg_response_time = (existing.avg_response_time + responseTime) / 2;
      existing.success_rate = (existing.success_rate + (success ? 1 : 0)) / 2;
    } else {
      // Create new metrics
      this.costMetrics.set(key, {
        provider,
        model,
        requests_count: 1,
        total_tokens: tokens,
        total_cost: cost,
        avg_cost_per_token: cost / tokens,
        avg_response_time: responseTime,
        success_rate: success ? 1 : 0,
        period_start: new Date(),
        period_end: new Date()
      });
    }
  }

  private calculateCostSummary(requests: any[]) {
    const totalRequests = requests.length;
    const totalCost = requests.reduce((sum, req) => sum + req.cost, 0);
    const totalTokens = requests.reduce((sum, req) => sum + req.tokens, 0);
    const avgCostPerRequest = totalCost / totalRequests;

    const costByProvider: Record<string, number> = {};
    const costByModel: Record<string, number> = {};

    requests.forEach(req => {
      costByProvider[req.provider] = (costByProvider[req.provider] || 0) + req.cost;
      costByModel[req.model] = (costByModel[req.model] || 0) + req.cost;
    });

    return {
      total_requests: totalRequests,
      total_cost: totalCost,
      total_tokens: totalTokens,
      avg_cost_per_request: avgCostPerRequest,
      cost_by_provider: costByProvider,
      cost_by_model: costByModel
    };
  }

  private calculateOptimizationMetrics(requests: any[]) {
    const actualCost = requests.reduce((sum, req) => sum + req.cost, 0);
    const baselineCost = this.calculateBaselineCostForRequests(requests);
    const savingsAmount = Math.max(0, baselineCost - actualCost);
    const savingsPercentage = baselineCost > 0 ? (savingsAmount / baselineCost) * 100 : 0;

    return {
      baseline_cost: baselineCost,
      actual_cost: actualCost,
      savings_amount: savingsAmount,
      savings_percentage: savingsPercentage
    };
  }

  private calculatePerformanceMetrics(requests: any[]) {
    const responseTimes = requests.map(req => req.response_time).sort((a, b) => a - b);
    const successfulRequests = requests.filter(req => req.success).length;

    return {
      avg_response_time: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      p95_response_time: responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
      success_rate: successfulRequests / requests.length,
      error_rate: (requests.length - successfulRequests) / requests.length
    };
  }

  private generateOptimizationRecommendations(requests: any[]): OptimizationOpportunity[] {
    const recommendations: OptimizationOpportunity[] = [];

    // Analyze expensive models
    const costByModel = new Map<string, { cost: number; count: number }>();
    requests.forEach(req => {
      const existing = costByModel.get(req.model) || { cost: 0, count: 0 };
      costByModel.set(req.model, {
        cost: existing.cost + req.cost,
        count: existing.count + 1
      });
    });

    // Find expensive models with alternatives
    for (const [model, data] of costByModel.entries()) {
      if (data.cost > 1.0 && data.count > 10) { // High cost and usage
        const alternative = this.findCheaperAlternative(model);
        if (alternative) {
          recommendations.push({
            type: 'model_switch',
            current_model: model,
            recommended_model: alternative.model,
            potential_savings: data.cost * alternative.savings_percentage,
            confidence_score: alternative.confidence,
            reasoning: `Switch from ${model} to ${alternative.model} for ${(alternative.savings_percentage * 100).toFixed(0)}% cost reduction`,
            estimated_quality_impact: alternative.quality_impact
          });
        }
      }
    }

    // Check for caching opportunities
    if (requests.length > 50) {
      const duplicateQueries = this.findDuplicateQueries(requests);
      if (duplicateQueries > 10) {
        recommendations.push({
          type: 'caching',
          current_model: 'all',
          recommended_model: 'cached responses',
          potential_savings: duplicateQueries * 0.002, // Estimate $0.002 per cached response
          confidence_score: 0.9,
          reasoning: `Enable caching to avoid ${duplicateQueries} duplicate API calls`,
          estimated_quality_impact: 0
        });
      }
    }

    return recommendations.sort((a, b) => b.potential_savings - a.potential_savings);
  }

  private findCheaperAlternative(model: string): {
    model: string;
    savings_percentage: number;
    confidence: number;
    quality_impact: number;
  } | null {
    // Simple model alternatives mapping
    const alternatives: Record<string, any> = {
      'gpt-4o': { model: 'gpt-4o-mini', savings_percentage: 0.8, confidence: 0.9, quality_impact: -1 },
      'claude-3.5-sonnet': { model: 'claude-3-haiku', savings_percentage: 0.7, confidence: 0.8, quality_impact: -2 },
      'gemini-pro': { model: 'gemini-flash', savings_percentage: 0.6, confidence: 0.85, quality_impact: -1 }
    };

    return alternatives[model] || null;
  }

  private findDuplicateQueries(requests: any[]): number {
    // Simple duplicate detection based on similar token counts
    const tokenCounts = new Map<number, number>();
    requests.forEach(req => {
      const roundedTokens = Math.round(req.tokens / 100) * 100; // Round to nearest 100
      tokenCounts.set(roundedTokens, (tokenCounts.get(roundedTokens) || 0) + 1);
    });

    return Array.from(tokenCounts.values()).reduce(
      (sum, count) => sum + Math.max(0, count - 1), 0
    );
  }

  private calculateBaselineCost(): number {
    // Estimate baseline cost without optimization (using expensive models)
    return this.requestHistory.reduce((sum, req) => {
      const baselineMultiplier = this.getBaselineMultiplier(req.model);
      return sum + (req.cost * baselineMultiplier);
    }, 0);
  }

  private calculateBaselineCostForRequests(requests: any[]): number {
    return requests.reduce((sum, req) => {
      const baselineMultiplier = this.getBaselineMultiplier(req.model);
      return sum + (req.cost * baselineMultiplier);
    }, 0);
  }

  private getBaselineMultiplier(model: string): number {
    // Multipliers representing cost without optimization
    const multipliers: Record<string, number> = {
      'gpt-4o-mini': 5.0, // Would cost 5x more with gpt-4o
      'claude-3-haiku': 4.0,
      'gemini-flash': 3.0,
      'gpt-4o': 1.0,
      'claude-3.5-sonnet': 1.0,
      'gemini-pro': 1.0
    };

    return multipliers[model] || 2.0; // Default 2x multiplier
  }

  private calculateEfficiencyScore(): number {
    const totalCost = this.getTotalCost();
    const baselineCost = this.calculateBaselineCost();
    
    if (baselineCost === 0) return 100;
    
    const efficiency = ((baselineCost - totalCost) / baselineCost) * 100;
    return Math.max(0, Math.min(100, efficiency));
  }

  private getTotalCost(): number {
    return this.requestHistory.reduce((sum, req) => sum + req.cost, 0);
  }

  private checkForOptimizationOpportunities(provider: string, model: string, cost: number): void {
    // Real-time opportunity detection
    if (cost > 0.01) { // High cost request
      const alternative = this.findCheaperAlternative(model);
      if (alternative) {
        this.emit('optimization_opportunity', {
          type: 'high_cost_request',
          current_model: model,
          alternative: alternative.model,
          potential_savings: cost * alternative.savings_percentage
        });
      }
    }
  }

  private cleanupHistory(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    this.requestHistory = this.requestHistory.filter(req => req.timestamp >= cutoff);
  }

  private startAnalyticsSync(): void {
    // Sync analytics every 5 minutes
    this.syncTimer = setInterval(async () => {
      await this.syncWithPlatform();
    }, 5 * 60 * 1000);
  }

  private async syncPendingAnalytics(): Promise<void> {
    // Sync any buffered analytics when connection is restored
    while (this.analyticsBuffer.length > 0) {
      const report = this.analyticsBuffer.shift();
      if (report) {
        try {
          await this.sendCostOptimizationData(report);
        } catch (error) {
          this.logger.error('Failed to sync buffered analytics', error);
          // Put it back in buffer
          this.analyticsBuffer.unshift(report);
          break;
        }
      }
    }
  }

  private async sendCostOptimizationData(report: RouterCostData): Promise<void> {
    if (!this.backendConnection) return;

    try {
      // Send to both backend router API and web platform API
      const promises = [
        // Send to backend router API
        (this.backendConnection as any).client.post('/api/router/cost-analytics', {
          router_id: report.router_id,
          cost_data: report,
          timestamp: new Date().toISOString()
        }),
        // Send to web platform API
        this.sendToWebPlatform(report)
      ];

      await Promise.allSettled(promises);
      this.logger.debug('📊 Cost optimization data sent to platform');
    } catch (error) {
      throw error;
    }
  }

  /**
   * Send analytics data to web platform for dashboard display
   */
  private async sendToWebPlatform(report: RouterCostData): Promise<void> {
    try {
      const webPlatformUrl = this.getWebPlatformUrl();
      if (!webPlatformUrl) {
        this.logger.warn('Web platform URL not configured, skipping web sync');
        return;
      }

      const response = await fetch(`${webPlatformUrl}/api/router/${report.router_id}/cost-analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getWebPlatformToken()}`
        },
        body: JSON.stringify({
          router_id: report.router_id,
          cost_data: report,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Web platform sync failed: ${response.status}`);
      }

      this.logger.debug('📊 Cost optimization data synced with web platform');
    } catch (error: any) {
      this.logger.warn('Failed to sync with web platform:', error.message);
      // Don't throw error - web platform sync is optional
    }
  }

  private getWebPlatformUrl(): string | null {
    return process.env.WEB_PLATFORM_URL || 'https://recoder.xyz';
  }

  private getWebPlatformToken(): string | null {
    return this.backendConnection?.getAuthToken?.() || process.env.ROUTER_AUTH_TOKEN || null;
  }

  private getRouterId(): string {
    return this.backendConnection?.getStatus().router_id || 'unknown';
  }

  private getEmptyReport(start: Date, end: Date, hours: number): RouterCostData {
    return {
      router_id: this.getRouterId(),
      time_period: { start, end, duration_hours: hours },
      cost_summary: {
        total_requests: 0,
        total_cost: 0,
        total_tokens: 0,
        avg_cost_per_request: 0,
        cost_by_provider: {},
        cost_by_model: {}
      },
      optimization_metrics: {
        baseline_cost: 0,
        actual_cost: 0,
        savings_amount: 0,
        savings_percentage: 0
      },
      performance_metrics: {
        avg_response_time: 0,
        p95_response_time: 0,
        success_rate: 1,
        error_rate: 0
      },
      recommendations: []
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    this.logger.info('📊 Cost optimization analytics destroyed');
  }
}

export default CostOptimizationAnalytics;