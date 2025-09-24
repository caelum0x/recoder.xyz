/**
 * Rate Limiting Service with Plan-Based Tiers
 * Implements different rate limits based on subscription plans
 */

import { redisCache } from './redis-cache';
import { logger } from '../utils/logger';

export interface PlanLimits {
  requestsPerHour: number;
  requestsPerDay: number;
  requestsPerMonth: number;
  modelsAllowed: string[];
  features: string[];
  overage: {
    allowed: boolean;
    costPerRequest: number;
  };
}

export interface UserPlan {
  tier: 'FREE' | 'WEEK_10' | 'MONTH_20' | 'MONTH_100' | 'MONTH_200' | 'ENTERPRISE';
  startDate: Date;
  endDate?: Date;
  customLimits?: Partial<PlanLimits>;
}

export class RateLimitingService {
  private readonly planConfigurations: Record<string, PlanLimits> = {
    FREE: {
      requestsPerHour: 10,
      requestsPerDay: 50,
      requestsPerMonth: 1000,
      modelsAllowed: [
        'deepseek-v3-0324-free',
        'deepseek-r1-0528-free',
        'qwen/qwen-2.5-coder-32b-instruct'
      ],
      features: ['basic_chat', 'code_generation'],
      overage: {
        allowed: false,
        costPerRequest: 0
      }
    },
    WEEK_10: {
      requestsPerHour: 50,
      requestsPerDay: 400,
      requestsPerMonth: 2500,
      modelsAllowed: [
        // FREE models
        'deepseek-v3-0324-free',
        'deepseek-r1-0528-free',
        'qwen/qwen-2.5-coder-32b-instruct',
        // Premium models
        'anthropic/claude-3-5-sonnet-20241022',
        'google/gemini-2.5-pro-exp-thinking-v1',
        'deepseek/deepseek-v3',
        'qwen/qwen-2.5-coder-32b-instruct'
      ],
      features: ['basic_chat', 'code_generation', 'project_generation', 'ai_routing'],
      overage: {
        allowed: true,
        costPerRequest: 0.05
      }
    },
    MONTH_20: {
      requestsPerHour: 100,
      requestsPerDay: 800,
      requestsPerMonth: 5000,
      modelsAllowed: [
        // All models available
        'deepseek-v3-0324-free',
        'deepseek-r1-0528-free',
        'qwen/qwen-2.5-coder-32b-instruct',
        'anthropic/claude-3-5-sonnet-20241022',
        'google/gemini-2.5-pro-exp-thinking-v1',
        'deepseek/deepseek-v3',
        'openai/gpt-4o',
        'meta-llama/llama-3.3-70b-instruct',
        'x-ai/grok-2-1212'
      ],
      features: ['basic_chat', 'code_generation', 'project_generation', 'ai_routing', 'batch_processing'],
      overage: {
        allowed: true,
        costPerRequest: 0.03
      }
    },
    MONTH_100: {
      requestsPerHour: 500,
      requestsPerDay: 4000,
      requestsPerMonth: 25000,
      modelsAllowed: [
        // All premium models
        'deepseek-v3-0324-free',
        'deepseek-r1-0528-free',
        'qwen/qwen-2.5-coder-32b-instruct',
        'anthropic/claude-3-5-sonnet-20241022',
        'google/gemini-2.5-pro-exp-thinking-v1',
        'deepseek/deepseek-v3',
        'openai/gpt-4o',
        'meta-llama/llama-3.3-70b-instruct',
        'x-ai/grok-2-1212',
        'anthropic/claude-sonnet-4-20250514'
      ],
      features: ['basic_chat', 'code_generation', 'project_generation', 'ai_routing', 'batch_processing', 'prompt_caching', 'priority_support'],
      overage: {
        allowed: true,
        costPerRequest: 0.02
      }
    },
    MONTH_200: {
      requestsPerHour: 1000,
      requestsPerDay: 8000,
      requestsPerMonth: 50000,
      modelsAllowed: [
        // All models including experimental
        'deepseek-v3-0324-free',
        'deepseek-r1-0528-free',
        'qwen/qwen-2.5-coder-32b-instruct',
        'anthropic/claude-3-5-sonnet-20241022',
        'google/gemini-2.5-pro-exp-thinking-v1',
        'deepseek/deepseek-v3',
        'openai/gpt-4o',
        'meta-llama/llama-3.3-70b-instruct',
        'x-ai/grok-2-1212',
        'anthropic/claude-sonnet-4-20250514',
        'perplexity/llama-3.1-sonar-huge-128k-online'
      ],
      features: ['basic_chat', 'code_generation', 'project_generation', 'ai_routing', 'batch_processing', 'prompt_caching', 'priority_support', 'advanced_analytics'],
      overage: {
        allowed: true,
        costPerRequest: 0.015
      }
    },
    ENTERPRISE: {
      requestsPerHour: -1, // Unlimited
      requestsPerDay: -1,
      requestsPerMonth: -1,
      modelsAllowed: ['*'], // All models
      features: ['*'], // All features
      overage: {
        allowed: true,
        costPerRequest: 0.01
      }
    }
  };

  /**
   * Check if user can make a request based on their plan
   */
  async checkRateLimit(userId: string, userPlan: UserPlan): Promise<{
    allowed: boolean;
    remaining: {
      hourly: number;
      daily: number;
      monthly: number;
    };
    resetTimes: {
      hourly: Date;
      daily: Date;
      monthly: Date;
    };
    overage?: {
      willTrigger: boolean;
      cost: number;
    };
  }> {
    const limits = this.getPlanLimits(userPlan);
    const now = new Date();

    // Enterprise tier has unlimited access
    if (userPlan.tier === 'ENTERPRISE') {
      return {
        allowed: true,
        remaining: {
          hourly: -1,
          daily: -1,
          monthly: -1
        },
        resetTimes: {
          hourly: new Date(now.getTime() + 60 * 60 * 1000),
          daily: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          monthly: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        }
      };
    }

    // Get current usage counts
    const [hourlyCount, dailyCount, monthlyCount] = await Promise.all([
      this.getCurrentUsage(userId, 'hour'),
      this.getCurrentUsage(userId, 'day'),
      this.getCurrentUsage(userId, 'month')
    ]);

    // Check if within limits
    const withinHourly = limits.requestsPerHour === -1 || hourlyCount < limits.requestsPerHour;
    const withinDaily = limits.requestsPerDay === -1 || dailyCount < limits.requestsPerDay;
    const withinMonthly = limits.requestsPerMonth === -1 || monthlyCount < limits.requestsPerMonth;

    const allowed = withinHourly && withinDaily && withinMonthly;

    // Calculate overage if applicable
    let overage;
    if (!allowed && limits.overage.allowed) {
      overage = {
        willTrigger: true,
        cost: limits.overage.costPerRequest + 0.50 // Base processing fee
      };
    }

    return {
      allowed: allowed || (limits.overage.allowed && overage?.willTrigger),
      remaining: {
        hourly: Math.max(0, limits.requestsPerHour - hourlyCount),
        daily: Math.max(0, limits.requestsPerDay - dailyCount),
        monthly: Math.max(0, limits.requestsPerMonth - monthlyCount)
      },
      resetTimes: {
        hourly: new Date(Math.ceil(now.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000)),
        daily: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        monthly: new Date(now.getFullYear(), now.getMonth() + 1, 1)
      },
      overage
    };
  }

  /**
   * Record API usage for a user
   */
  async recordUsage(userId: string, userPlan: UserPlan, model: string, tokens: {
    input: number;
    output: number;
  }): Promise<void> {
    const now = new Date();
    const hour = Math.floor(now.getTime() / (60 * 60 * 1000));
    const day = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
    const month = `${now.getFullYear()}-${now.getMonth() + 1}`;

    const keys = [
      `usage:${userId}:hour:${hour}`,
      `usage:${userId}:day:${day}`,
      `usage:${userId}:month:${month}`
    ];

    // Increment counters
    await Promise.all([
      ...keys.map(key => redisCache.incrementRateLimit(key, 3600)), // 1 hour TTL for hour, longer for others
      // Store detailed usage for analytics
      redisCache.set(`usage_detail:${userId}:${Date.now()}`, JSON.stringify({
        timestamp: now.toISOString(),
        model,
        tokens,
        plan: userPlan.tier
      }), { ttl: 86400 * 30 }) // 30 days
    ]);

    logger.debug('Usage recorded', {
      userId,
      model,
      tokens,
      plan: userPlan.tier
    });
  }

  /**
   * Check if user can use a specific model
   */
  canUseModel(model: string, userPlan: UserPlan): boolean {
    const limits = this.getPlanLimits(userPlan);
    
    // Enterprise gets all models
    if (limits.modelsAllowed.includes('*')) {
      return true;
    }

    return limits.modelsAllowed.includes(model);
  }

  /**
   * Check if user can use a specific feature
   */
  canUseFeature(feature: string, userPlan: UserPlan): boolean {
    const limits = this.getPlanLimits(userPlan);
    
    // Enterprise gets all features
    if (limits.features.includes('*')) {
      return true;
    }

    return limits.features.includes(feature);
  }

  /**
   * Get current usage for a time period
   */
  private async getCurrentUsage(userId: string, period: 'hour' | 'day' | 'month'): Promise<number> {
    const now = new Date();
    let key: string;

    switch (period) {
      case 'hour':
        const hour = Math.floor(now.getTime() / (60 * 60 * 1000));
        key = `usage:${userId}:hour:${hour}`;
        break;
      case 'day':
        const day = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
        key = `usage:${userId}:day:${day}`;
        break;
      case 'month':
        const month = `${now.getFullYear()}-${now.getMonth() + 1}`;
        key = `usage:${userId}:month:${month}`;
        break;
    }

    const count = await redisCache.get(key);
    return count ? parseInt(count as string) : 0;
  }

  /**
   * Get plan limits with custom overrides
   */
  private getPlanLimits(userPlan: UserPlan): PlanLimits {
    const baseLimits = this.planConfigurations[userPlan.tier];
    
    if (userPlan.customLimits) {
      return {
        ...baseLimits,
        ...userPlan.customLimits
      };
    }

    return baseLimits;
  }

  /**
   * Get usage analytics for a user
   */
  async getUsageAnalytics(userId: string, period: 'hour' | 'day' | 'month' = 'day'): Promise<{
    current: number;
    history: Array<{ timestamp: string; count: number }>;
    models: Record<string, number>;
    totalTokens: { input: number; output: number };
  }> {
    // This would be implemented with more detailed analytics
    // For now, return basic current usage
    const current = await this.getCurrentUsage(userId, period);
    
    return {
      current,
      history: [], // Would fetch historical data
      models: {}, // Would aggregate model usage
      totalTokens: { input: 0, output: 0 } // Would sum token usage
    };
  }

  /**
   * Batch process multiple requests to optimize rate limiting
   */
  async batchCheckRateLimit(requests: Array<{
    userId: string;
    userPlan: UserPlan;
    model: string;
  }>): Promise<Array<{
    allowed: boolean;
    reason?: string;
  }>> {
    // Group requests by user to minimize Redis calls
    const userGroups = new Map<string, typeof requests>();
    
    for (const request of requests) {
      const existing = userGroups.get(request.userId) || [];
      existing.push(request);
      userGroups.set(request.userId, existing);
    }

    const results: Array<{ allowed: boolean; reason?: string }> = [];

    for (const [userId, userRequests] of userGroups) {
      const userPlan = userRequests[0].userPlan;
      const rateLimitResult = await this.checkRateLimit(userId, userPlan);

      for (const request of userRequests) {
        if (!rateLimitResult.allowed) {
          results.push({
            allowed: false,
            reason: 'Rate limit exceeded'
          });
        } else if (!this.canUseModel(request.model, userPlan)) {
          results.push({
            allowed: false,
            reason: `Model ${request.model} not available in ${userPlan.tier} plan`
          });
        } else {
          results.push({
            allowed: true
          });
        }
      }
    }

    return results;
  }
}

export const rateLimitingService = new RateLimitingService();