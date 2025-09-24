/**
 * Usage Quota Manager
 * Enforces usage limits, tracks consumption, and manages billing
 */

import { Logger } from 'recoder-shared';
import { backendClient } from './backend-client';

export interface QuotaConfig {
  plan: 'free' | 'pro' | 'enterprise';
  monthlyRequests: number;
  dailyRequests: number;
  maxTokensPerRequest: number;
  features: string[];
  priority: number;
}

export interface UsageRecord {
  userId: string;
  timestamp: Date;
  provider: string;
  model: string;
  tokens: number;
  cost: number;
  requestType: string;
  success: boolean;
}

export interface QuotaStatus {
  plan: string;
  monthlyUsage: number;
  monthlyLimit: number;
  dailyUsage: number;
  dailyLimit: number;
  resetDate: Date;
  overageAllowed: boolean;
  estimatedMonthlyCost: number;
}

export class UsageQuotaManager {
  private quotaConfigs: Map<string, QuotaConfig> = new Map();
  private usageCache: Map<string, UsageRecord[]> = new Map();
  private initialized = false;

  constructor() {
    this.initializeQuotaConfigs();
  }

  /**
   * Initialize quota configurations for different plans
   */
  private initializeQuotaConfigs(): void {
    const configs: QuotaConfig[] = [
      {
        plan: 'free',
        monthlyRequests: 500,
        dailyRequests: 25,
        maxTokensPerRequest: 4000,
        features: ['basic-models', 'code-generation'],
        priority: 1
      },
      {
        plan: 'pro',
        monthlyRequests: 5000,
        dailyRequests: 200,
        maxTokensPerRequest: 16000,
        features: ['all-models', 'code-generation', 'planning', 'analysis', 'priority-support'],
        priority: 5
      },
      {
        plan: 'enterprise',
        monthlyRequests: 50000,
        dailyRequests: 2000,
        maxTokensPerRequest: 32000,
        features: ['all-models', 'premium-models', 'custom-routing', 'priority-support', 'analytics', 'collaboration'],
        priority: 10
      }
    ];

    configs.forEach(config => {
      this.quotaConfigs.set(config.plan, config);
    });

    this.initialized = true;
    Logger.info(`📊 Quota manager initialized with ${configs.length} plans`);
  }

  /**
   * Check if user can make a request
   */
  async checkQuota(
    userId: string, 
    estimatedTokens: number,
    requestType: string = 'code-generation'
  ): Promise<{ allowed: boolean; reason?: string; quotaStatus: QuotaStatus }> {
    const session = backendClient.getCurrentSession();
    const plan = session?.plan || 'free';
    const config = this.quotaConfigs.get(plan);

    if (!config) {
      return {
        allowed: false,
        reason: 'Invalid plan configuration',
        quotaStatus: this.getEmptyQuotaStatus()
      };
    }

    // Get current usage
    const currentUsage = await this.getCurrentUsage(userId);
    const quotaStatus = this.calculateQuotaStatus(currentUsage, config);

    // Check monthly limit
    if (currentUsage.monthlyUsage >= config.monthlyRequests) {
      return {
        allowed: false,
        reason: `Monthly quota exceeded (${currentUsage.monthlyUsage}/${config.monthlyRequests})`,
        quotaStatus
      };
    }

    // Check daily limit
    if (currentUsage.dailyUsage >= config.dailyRequests) {
      return {
        allowed: false,
        reason: `Daily quota exceeded (${currentUsage.dailyUsage}/${config.dailyRequests})`,
        quotaStatus
      };
    }

    // Check token limit per request
    if (estimatedTokens > config.maxTokensPerRequest) {
      return {
        allowed: false,
        reason: `Request too large (${estimatedTokens} tokens > ${config.maxTokensPerRequest} limit)`,
        quotaStatus
      };
    }

    // Check feature access
    if (!config.features.includes(requestType) && !config.features.includes('all-models')) {
      return {
        allowed: false,
        reason: `Feature '${requestType}' not available in ${plan} plan`,
        quotaStatus
      };
    }

    return {
      allowed: true,
      quotaStatus
    };
  }

  /**
   * Record usage after successful request
   */
  async recordUsage(
    userId: string,
    provider: string,
    model: string,
    tokens: number,
    cost: number,
    requestType: string,
    success: boolean = true
  ): Promise<void> {
    const record: UsageRecord = {
      userId,
      timestamp: new Date(),
      provider,
      model,
      tokens,
      cost,
      requestType,
      success
    };

    // Cache locally
    if (!this.usageCache.has(userId)) {
      this.usageCache.set(userId, []);
    }
    this.usageCache.get(userId)!.push(record);

    // Send to backend for persistent storage
    try {
      await backendClient.trackUsage({
        platform: 'cli',
        command: `${provider}/${model}`,
        tokens,
        model,
        timestamp: record.timestamp
      });

      Logger.debug(`📈 Recorded usage: ${tokens} tokens, $${cost.toFixed(6)}`);
    } catch (error) {
      Logger.warn('Failed to record usage to backend:', error);
    }

    // Clean old cache entries (keep last 24 hours)
    this.cleanupCache(userId);
  }

  /**
   * Get current usage for user
   */
  private async getCurrentUsage(userId: string): Promise<{
    monthlyUsage: number;
    dailyUsage: number;
    monthlyTokens: number;
    dailyTokens: number;
  }> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get from backend (authoritative)
    try {
      const session = backendClient.getCurrentSession();
      if (session) {
        const monthlyUsage = session.quotas.usedRequests;
        const dailyUsage = await this.getDailyUsageFromBackend(userId);
        
        return {
          monthlyUsage,
          dailyUsage,
          monthlyTokens: monthlyUsage * 2000, // Estimate
          dailyTokens: dailyUsage * 2000
        };
      }
    } catch (error) {
      Logger.warn('Failed to get usage from backend, using cache:', error);
    }

    // Fallback to cache
    const records = this.usageCache.get(userId) || [];
    const monthlyRecords = records.filter(r => r.timestamp >= monthStart && r.success);
    const dailyRecords = records.filter(r => r.timestamp >= dayStart && r.success);

    return {
      monthlyUsage: monthlyRecords.length,
      dailyUsage: dailyRecords.length,
      monthlyTokens: monthlyRecords.reduce((sum, r) => sum + r.tokens, 0),
      dailyTokens: dailyRecords.reduce((sum, r) => sum + r.tokens, 0)
    };
  }

  /**
   * Calculate quota status for display
   */
  private calculateQuotaStatus(usage: any, config: QuotaConfig): QuotaStatus {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    // Estimate monthly cost based on usage
    const avgCostPerRequest = 0.004; // $0.004 per request average
    const estimatedMonthlyCost = usage.monthlyUsage * avgCostPerRequest;

    return {
      plan: config.plan,
      monthlyUsage: usage.monthlyUsage,
      monthlyLimit: config.monthlyRequests,
      dailyUsage: usage.dailyUsage,
      dailyLimit: config.dailyRequests,
      resetDate: nextMonth,
      overageAllowed: config.plan === 'enterprise',
      estimatedMonthlyCost
    };
  }

  /**
   * Get daily usage from backend
   */
  private async getDailyUsageFromBackend(userId: string): Promise<number> {
    // This would make an API call to get today's usage
    // For now, return estimate based on cached data
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const records = this.usageCache.get(userId) || [];
    return records.filter(r => r.timestamp >= today && r.success).length;
  }

  /**
   * Clean up old cache entries
   */
  private cleanupCache(userId: string): void {
    const records = this.usageCache.get(userId);
    if (!records) return;

    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);

    const filtered = records.filter(r => r.timestamp >= cutoff);
    this.usageCache.set(userId, filtered);
  }

  /**
   * Get empty quota status for errors
   */
  private getEmptyQuotaStatus(): QuotaStatus {
    return {
      plan: 'unknown',
      monthlyUsage: 0,
      monthlyLimit: 0,
      dailyUsage: 0,
      dailyLimit: 0,
      resetDate: new Date(),
      overageAllowed: false,
      estimatedMonthlyCost: 0
    };
  }

  /**
   * Get quota information for display
   */
  async getQuotaInfo(userId: string): Promise<QuotaStatus> {
    const session = backendClient.getCurrentSession();
    const plan = session?.plan || 'free';
    const config = this.quotaConfigs.get(plan);

    if (!config) {
      return this.getEmptyQuotaStatus();
    }

    const usage = await this.getCurrentUsage(userId);
    return this.calculateQuotaStatus(usage, config);
  }

  /**
   * Calculate upgrade recommendations
   */
  async getUpgradeRecommendation(userId: string): Promise<{
    currentPlan: string;
    recommendedPlan?: string;
    reason: string;
    savings: number;
  }> {
    const session = backendClient.getCurrentSession();
    const currentPlan = session?.plan || 'free';
    const usage = await this.getCurrentUsage(userId);
    const currentConfig = this.quotaConfigs.get(currentPlan);

    if (!currentConfig) {
      return {
        currentPlan,
        reason: 'Unable to determine current plan',
        savings: 0
      };
    }

    // Check if user is hitting limits
    const monthlyUtilization = usage.monthlyUsage / currentConfig.monthlyRequests;
    const dailyUtilization = usage.dailyUsage / currentConfig.dailyRequests;

    if (monthlyUtilization > 0.8 || dailyUtilization > 0.8) {
      const nextTier = currentPlan === 'free' ? 'pro' : 'enterprise';
      const nextConfig = this.quotaConfigs.get(nextTier);
      
      if (nextConfig) {
        const overage = Math.max(0, usage.monthlyUsage - currentConfig.monthlyRequests);
        const overageCost = overage * 0.01; // $0.01 per overage request
        const upgradeCost = nextTier === 'pro' ? 20 : 50;
        const savings = Math.max(0, overageCost - upgradeCost);

        return {
          currentPlan,
          recommendedPlan: nextTier,
          reason: `You're using ${Math.round(monthlyUtilization * 100)}% of your monthly quota`,
          savings
        };
      }
    }

    return {
      currentPlan,
      reason: 'Current plan meets your usage needs',
      savings: 0
    };
  }

  /**
   * Get usage analytics
   */
  async getUsageAnalytics(userId: string, days: number = 30): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    averageRequestsPerDay: number;
    topModels: Array<{ model: string; count: number; cost: number }>;
    costTrend: Array<{ date: string; cost: number }>;
  }> {
    const records = this.usageCache.get(userId) || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    const relevantRecords = records.filter(r => r.timestamp >= cutoff && r.success);
    
    const totalRequests = relevantRecords.length;
    const totalTokens = relevantRecords.reduce((sum, r) => sum + r.tokens, 0);
    const totalCost = relevantRecords.reduce((sum, r) => sum + r.cost, 0);
    const averageRequestsPerDay = totalRequests / days;

    // Calculate top models
    const modelUsage = new Map<string, { count: number; cost: number }>();
    relevantRecords.forEach(r => {
      const key = `${r.provider}/${r.model}`;
      const current = modelUsage.get(key) || { count: 0, cost: 0 };
      modelUsage.set(key, {
        count: current.count + 1,
        cost: current.cost + r.cost
      });
    });

    const topModels = Array.from(modelUsage.entries())
      .map(([model, data]) => ({ model, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate cost trend (daily)
    const costByDay = new Map<string, number>();
    relevantRecords.forEach(r => {
      const day = r.timestamp.toISOString().split('T')[0];
      costByDay.set(day, (costByDay.get(day) || 0) + r.cost);
    });

    const costTrend = Array.from(costByDay.entries())
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalRequests,
      totalTokens,
      totalCost,
      averageRequestsPerDay,
      topModels,
      costTrend
    };
  }
}

// Export singleton instance
export const usageQuotaManager = new UsageQuotaManager();
export default usageQuotaManager;