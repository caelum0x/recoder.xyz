/**
 * Real-time Usage Tracking Service
 * Monitors AI usage, costs, and enforces limits to prevent bankruptcy
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { prisma } from '../database/prisma';
import { unifiedPaymentService } from './unified-payment-service';

// AI Provider Cost Models (pricing per 1K tokens)
const AI_PROVIDER_COSTS = {
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'gemini-1.5-pro': { input: 0.0035, output: 0.0105 },
  'gemini-1.5-flash': { input: 0.00035, output: 0.00105 },
  'llama-3.1-70b': { input: 0.00088, output: 0.00088 },
  'llama-3.1-8b': { input: 0.00018, output: 0.00018 },
  'deepseek-coder': { input: 0.00014, output: 0.00028 },
  'groq-llama3-70b': { input: 0.00059, output: 0.00079 },
  'groq-mixtral-8x7b': { input: 0.00024, output: 0.00024 }
};

// Plan limits and cost thresholds
const PLAN_LIMITS = {
  'free': { 
    monthlyTokens: 100000,
    monthlyCost: 5.00,
    dailyTokens: 5000,
    dailyCost: 0.50,
    requestsPerMinute: 5,
    maxConcurrency: 1
  },
  'starter': {
    monthlyTokens: 1000000,
    monthlyCost: 15.00,
    dailyTokens: 50000,
    dailyCost: 2.00,
    requestsPerMinute: 20,
    maxConcurrency: 3
  },
  'recoder-monthly': {
    monthlyTokens: 5000000,
    monthlyCost: 50.00,
    dailyTokens: 200000,
    dailyCost: 5.00,
    requestsPerMinute: 100,
    maxConcurrency: 10
  },
  'enterprise': {
    monthlyTokens: 50000000,
    monthlyCost: 500.00,
    dailyTokens: 2000000,
    dailyCost: 50.00,
    requestsPerMinute: 1000,
    maxConcurrency: 50
  }
};

interface UsageEvent {
  userId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  feature: string;
  platform: string;
  timestamp: Date;
  metadata?: any;
}

interface UserLimits {
  userId: string;
  planId: string;
  monthlyTokensUsed: number;
  monthlyCostIncurred: number;
  dailyTokensUsed: number;
  dailyCostIncurred: number;
  requestsThisMinute: number;
  activeConcurrentRequests: number;
  lastResetDate: Date;
  warningsIssued: string[];
}

export class RealTimeUsageTracker extends EventEmitter {
  private static instance: RealTimeUsageTracker;
  private userLimits: Map<string, UserLimits> = new Map();
  private activeRequests: Map<string, number> = new Map();
  private costAccumulator: Map<string, number> = new Map();
  private emergencyStop: boolean = false;
  
  // Cost monitoring thresholds
  private readonly COST_WARNING_THRESHOLD = 0.80; // 80% of plan limit
  private readonly COST_CRITICAL_THRESHOLD = 0.95; // 95% of plan limit
  private readonly EMERGENCY_COST_THRESHOLD = 1000; // $1000 absolute emergency stop

  public static getInstance(): RealTimeUsageTracker {
    if (!RealTimeUsageTracker.instance) {
      RealTimeUsageTracker.instance = new RealTimeUsageTracker();
    }
    return RealTimeUsageTracker.instance;
  }

  constructor() {
    super();
    this.setupEventHandlers();
    this.startPeriodicCleanup();
    this.startCostMonitoring();
    
    logger.info('Real-time usage tracker initialized');
  }

  /**
   * Calculate cost for AI usage
   */
  private calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
    const modelKey = model.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const costs = AI_PROVIDER_COSTS[modelKey];
    
    if (!costs) {
      // Default fallback pricing for unknown models
      logger.warn(`Unknown model pricing: ${model}, using default rates`);
      return ((inputTokens * 0.001) + (outputTokens * 0.002)) / 1000;
    }

    const inputCost = (inputTokens / 1000) * costs.input;
    const outputCost = (outputTokens / 1000) * costs.output;
    
    return inputCost + outputCost;
  }

  /**
   * Get user's current limits and usage
   */
  private async getUserLimits(userId: string): Promise<UserLimits> {
    if (this.userLimits.has(userId)) {
      return this.userLimits.get(userId)!;
    }

    // Get user's subscription plan
    const subscription = await unifiedPaymentService.getUserSubscription(userId);
    const planId = subscription?.planId || 'free';
    
    // Check if we need to reset daily/monthly counters
    const now = new Date();
    const lastReset = new Date(now.getFullYear(), now.getMonth(), 1); // First of month
    
    // Get existing usage from database
    const monthlyUsage = await this.getMonthlyUsage(userId);
    const dailyUsage = await this.getDailyUsage(userId);

    const limits: UserLimits = {
      userId,
      planId,
      monthlyTokensUsed: monthlyUsage.tokens,
      monthlyCostIncurred: monthlyUsage.cost,
      dailyTokensUsed: dailyUsage.tokens,
      dailyCostIncurred: dailyUsage.cost,
      requestsThisMinute: 0,
      activeConcurrentRequests: 0,
      lastResetDate: lastReset,
      warningsIssued: []
    };

    this.userLimits.set(userId, limits);
    return limits;
  }

  /**
   * Get monthly usage from database
   */
  private async getMonthlyUsage(userId: string): Promise<{ tokens: number; cost: number }> {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // For now, return mock data - in production this would aggregate from usage events
      // In the future, this would query actual usage events and aggregate token counts
      return {
        tokens: Math.floor(Math.random() * 50000) + 10000, // 10K-60K tokens used
        cost: Math.random() * 10 + 2 // $2-$12 used
      };
    } catch (error) {
      logger.warn('Failed to fetch monthly usage from database, using mock data', { userId, error });
      return {
        tokens: 25000,
        cost: 5.50
      };
    }
  }

  /**
   * Get daily usage from database
   */
  private async getDailyUsage(userId: string): Promise<{ tokens: number; cost: number }> {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      // For now, return mock data - in production this would aggregate from usage events
      return {
        tokens: Math.floor(Math.random() * 5000) + 500, // 500-5500 tokens used today
        cost: Math.random() * 2 + 0.25 // $0.25-$2.25 used today
      };
    } catch (error) {
      logger.warn('Failed to fetch daily usage from database, using mock data', { userId, error });
      return {
        tokens: 1500,
        cost: 0.75
      };
    }
  }

  /**
   * Track AI usage in real-time
   */
  async trackUsage(usageEvent: Omit<UsageEvent, 'estimatedCost' | 'totalTokens' | 'timestamp'>): Promise<{
    allowed: boolean;
    cost: number;
    remainingTokens: number;
    remainingCost: number;
    warnings: string[];
    quotaStatus: string;
  }> {
    try {
      // Check emergency stop
      if (this.emergencyStop) {
        throw new Error('EMERGENCY STOP: AI usage temporarily suspended due to cost limits');
      }

      const userId = usageEvent.userId;
      const limits = await this.getUserLimits(userId);
      const planLimits = PLAN_LIMITS[limits.planId] || PLAN_LIMITS['free'];

      // Calculate cost
      const estimatedCost = this.calculateCost(
        usageEvent.provider,
        usageEvent.model,
        usageEvent.inputTokens,
        usageEvent.outputTokens
      );

      const totalTokens = usageEvent.inputTokens + usageEvent.outputTokens;
      
      // Check limits before processing
      const preflightCheck = this.checkLimits(limits, planLimits, totalTokens, estimatedCost);
      if (!preflightCheck.allowed) {
        return preflightCheck;
      }

      // Increment concurrent requests
      this.activeRequests.set(userId, (this.activeRequests.get(userId) || 0) + 1);
      
      // Update usage counters
      limits.monthlyTokensUsed += totalTokens;
      limits.monthlyCostIncurred += estimatedCost;
      limits.dailyTokensUsed += totalTokens;
      limits.dailyCostIncurred += estimatedCost;
      limits.activeConcurrentRequests = this.activeRequests.get(userId) || 0;

      // Store in database
      const completeUsageEvent: UsageEvent = {
        ...usageEvent,
        totalTokens,
        estimatedCost,
        timestamp: new Date()
      };

      await this.storeUsageEvent(completeUsageEvent);

      // Emit real-time events
      this.emit('usage_tracked', completeUsageEvent);
      this.emit('cost_updated', {
        userId,
        totalCost: limits.monthlyCostIncurred,
        dailyCost: limits.dailyCostIncurred
      });

      // Check for warnings and overage conditions
      const warnings = this.checkForWarnings(limits, planLimits);
      
      // Check for overage billing conditions
      this.checkOverageConditions(userId, limits, planLimits, limits.planId || 'free');

      return {
        allowed: true,
        cost: estimatedCost,
        remainingTokens: Math.max(0, planLimits.monthlyTokens - limits.monthlyTokensUsed),
        remainingCost: Math.max(0, planLimits.monthlyCost - limits.monthlyCostIncurred),
        warnings,
        quotaStatus: this.getQuotaStatus(limits, planLimits)
      };

    } catch (error) {
      logger.error('Usage tracking failed', { error, userId: usageEvent.userId });
      throw error;
    }
  }

  /**
   * Check usage limits
   */
  private checkLimits(limits: UserLimits, planLimits: any, additionalTokens: number, additionalCost: number) {
    const warnings: string[] = [];

    // Check monthly limits
    if (limits.monthlyTokensUsed + additionalTokens > planLimits.monthlyTokens) {
      return {
        allowed: false,
        warnings: ['Monthly token limit exceeded. Please upgrade your plan.'],
        quotaStatus: 'EXCEEDED',
        cost: 0,
        remainingTokens: 0,
        remainingCost: 0
      };
    }

    if (limits.monthlyCostIncurred + additionalCost > planLimits.monthlyCost) {
      return {
        allowed: false,
        warnings: ['Monthly cost limit exceeded. Please upgrade your plan.'],
        quotaStatus: 'EXCEEDED',
        cost: 0,
        remainingTokens: 0,
        remainingCost: 0
      };
    }

    // Check daily limits
    if (limits.dailyTokensUsed + additionalTokens > planLimits.dailyTokens) {
      return {
        allowed: false,
        warnings: ['Daily token limit exceeded. Please try again tomorrow or upgrade your plan.'],
        quotaStatus: 'DAILY_EXCEEDED',
        cost: 0,
        remainingTokens: 0,
        remainingCost: 0
      };
    }

    // Check concurrency limits
    if (limits.activeConcurrentRequests >= planLimits.maxConcurrency) {
      return {
        allowed: false,
        warnings: ['Too many concurrent requests. Please wait for current requests to complete.'],
        quotaStatus: 'CONCURRENCY_EXCEEDED',
        cost: 0,
        remainingTokens: 0,
        remainingCost: 0
      };
    }

    return { allowed: true, warnings: [], quotaStatus: 'OK', cost: 0, remainingTokens: 0, remainingCost: 0 };
  }

  /**
   * Check for usage warnings
   */
  private checkForWarnings(limits: UserLimits, planLimits: any): string[] {
    const warnings: string[] = [];
    
    const costPercentage = limits.monthlyCostIncurred / planLimits.monthlyCost;
    const tokenPercentage = limits.monthlyTokensUsed / planLimits.monthlyTokens;

    if (costPercentage >= this.COST_CRITICAL_THRESHOLD) {
      warnings.push('CRITICAL: You have used 95% of your monthly cost allowance');
    } else if (costPercentage >= this.COST_WARNING_THRESHOLD) {
      warnings.push('WARNING: You have used 80% of your monthly cost allowance');
    }

    if (tokenPercentage >= 0.90) {
      warnings.push('You have used 90% of your monthly token allowance');
    } else if (tokenPercentage >= 0.75) {
      warnings.push('You have used 75% of your monthly token allowance');
    }

    return warnings;
  }

  /**
   * Get quota status
   */
  private getQuotaStatus(limits: UserLimits, planLimits: any): string {
    const costPercentage = limits.monthlyCostIncurred / planLimits.monthlyCost;
    const tokenPercentage = limits.monthlyTokensUsed / planLimits.monthlyTokens;

    if (costPercentage >= 1.0 || tokenPercentage >= 1.0) return 'EXCEEDED';
    if (costPercentage >= 0.95 || tokenPercentage >= 0.95) return 'CRITICAL';
    if (costPercentage >= 0.80 || tokenPercentage >= 0.80) return 'WARNING';
    if (costPercentage >= 0.50 || tokenPercentage >= 0.50) return 'MODERATE';
    return 'OK';
  }

  /**
   * Check overage billing conditions
   */
  private checkOverageConditions(userId: string, limits: UserLimits, planLimits: any, planType: string): void {
    try {
      // Map plan limits to request-based limits for overage billing
      const requestLimits = {
        'free': 100,
        '$10/week': 500, 
        '$20/month': 2000,
        '$100/month': 10000,
        '$200/month': 50000,
        'enterprise': 1000000
      };

      const requestLimit = requestLimits[planType as keyof typeof requestLimits] || 100;
      
      // Estimate current requests based on token usage (rough estimation: 100 tokens per request)
      const estimatedRequests = Math.floor(limits.monthlyTokensUsed / 100);
      
      // Check if approaching limit (80% threshold)
      const approachingThreshold = requestLimit * 0.8;
      if (estimatedRequests >= approachingThreshold && estimatedRequests < requestLimit) {
        this.emit('usageLimitApproaching', {
          userId,
          usage: estimatedRequests,
          limit: requestLimit,
          planType
        });
      }
      
      // Check if exceeded limit
      if (estimatedRequests > requestLimit) {
        this.emit('usageLimitExceeded', {
          userId,
          usage: estimatedRequests,
          limit: requestLimit,
          planType,
          overage: estimatedRequests - requestLimit
        });
      }
      
    } catch (error) {
      logger.error('Failed to check overage conditions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        planType
      });
    }
  }

  /**
   * Store usage event in database
   */
  private async storeUsageEvent(usageEvent: UsageEvent): Promise<void> {
    try {
      // Try to store in database, fallback to logging if schema issues
      await prisma.usageRecord.create({
        data: {
          userId: usageEvent.userId,
          type: 'ai_usage',
          metadata: {
            provider: usageEvent.provider,
            model: usageEvent.model,
            inputTokens: usageEvent.inputTokens,
            outputTokens: usageEvent.outputTokens,
            totalTokens: usageEvent.totalTokens,
            estimatedCost: usageEvent.estimatedCost,
            feature: usageEvent.feature,
            platform: usageEvent.platform,
            ...usageEvent.metadata
          },
          timestamp: usageEvent.timestamp
        }
      });
      
      logger.info('Usage event stored in database', { 
        userId: usageEvent.userId, 
        model: usageEvent.model,
        cost: usageEvent.estimatedCost 
      });
    } catch (error) {
      // Log the usage event even if database storage fails
      logger.warn('Failed to store usage event in database, logging for recovery', {
        usageEvent,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // In production, this could be sent to a message queue or external logging service
    }
  }

  /**
   * Release concurrent request slot
   */
  releaseRequest(userId: string): void {
    const current = this.activeRequests.get(userId) || 0;
    this.activeRequests.set(userId, Math.max(0, current - 1));
    
    if (this.userLimits.has(userId)) {
      this.userLimits.get(userId)!.activeConcurrentRequests = this.activeRequests.get(userId) || 0;
    }
  }

  /**
   * Get real-time usage statistics
   */
  async getRealTimeStats(userId: string): Promise<any> {
    const limits = await this.getUserLimits(userId);
    const planLimits = PLAN_LIMITS[limits.planId] || PLAN_LIMITS['free'];

    return {
      planId: limits.planId,
      monthlyUsage: {
        tokens: limits.monthlyTokensUsed,
        tokensLimit: planLimits.monthlyTokens,
        tokensPercentage: (limits.monthlyTokensUsed / planLimits.monthlyTokens) * 100,
        cost: limits.monthlyCostIncurred,
        costLimit: planLimits.monthlyCost,
        costPercentage: (limits.monthlyCostIncurred / planLimits.monthlyCost) * 100
      },
      dailyUsage: {
        tokens: limits.dailyTokensUsed,
        tokensLimit: planLimits.dailyTokens,
        cost: limits.dailyCostIncurred,
        costLimit: planLimits.dailyCost
      },
      concurrency: {
        active: limits.activeConcurrentRequests,
        limit: planLimits.maxConcurrency
      },
      quotaStatus: this.getQuotaStatus(limits, planLimits),
      warnings: this.checkForWarnings(limits, planLimits)
    };
  }

  /**
   * Emergency cost monitoring
   */
  private startCostMonitoring(): void {
    setInterval(async () => {
      try {
        // Check total platform cost
        const totalCost = Array.from(this.userLimits.values())
          .reduce((sum, limits) => sum + limits.monthlyCostIncurred, 0);

        if (totalCost > this.EMERGENCY_COST_THRESHOLD) {
          this.emergencyStop = true;
          logger.error('EMERGENCY STOP ACTIVATED: Total platform cost exceeded $1000', { totalCost });
          
          // Send alerts to all admins
          this.emit('emergency_stop', { totalCost, threshold: this.EMERGENCY_COST_THRESHOLD });
        }
      } catch (error) {
        logger.error('Cost monitoring failed', { error });
      }
    }, 60000); // Check every minute
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.on('usage_tracked', (event) => {
      logger.info('Usage tracked', {
        userId: event.userId,
        model: event.model,
        tokens: event.totalTokens,
        cost: event.estimatedCost
      });
    });

    this.on('cost_updated', (event) => {
      logger.info('Cost updated', {
        userId: event.userId,
        totalCost: event.totalCost
      });
    });

    this.on('emergency_stop', (event) => {
      logger.error('Emergency stop triggered', event);
      // In production, this would send alerts to admins
    });
  }

  /**
   * Periodic cleanup of stale data
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      const now = new Date();
      
      // Reset daily counters at midnight
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        for (const limits of this.userLimits.values()) {
          limits.dailyTokensUsed = 0;
          limits.dailyCostIncurred = 0;
        }
        logger.info('Daily usage counters reset');
      }

      // Reset monthly counters on first of month
      if (now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() === 0) {
        for (const limits of this.userLimits.values()) {
          limits.monthlyTokensUsed = 0;
          limits.monthlyCostIncurred = 0;
          limits.warningsIssued = [];
        }
        logger.info('Monthly usage counters reset');
      }

      // Clean up inactive users
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      for (const [userId, limits] of this.userLimits.entries()) {
        if (limits.lastResetDate < cutoff && limits.activeConcurrentRequests === 0) {
          this.userLimits.delete(userId);
          this.activeRequests.delete(userId);
        }
      }
    }, 60000); // Check every minute
  }
}

// Export singleton
export const realTimeUsageTracker = RealTimeUsageTracker.getInstance();