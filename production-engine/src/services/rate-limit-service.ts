/**
 * Commercial Rate Limiting and Quota Management Service
 * Handles API rate limiting, quota enforcement, and usage controls
 */

import { logger } from '../utils/logger';
import { billingService } from './billing-service';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  maxTokens: number; // Max tokens per window
  maxConcurrent: number; // Max concurrent requests
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  keyGenerator?: (req: any) => string;
}

export interface QuotaLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  requestsPerMonth: number;
  tokensPerMinute: number;
  tokensPerHour: number;
  tokensPerDay: number;
  tokensPerMonth: number;
  concurrentRequests: number;
  maxProjectSize: number; // in MB
  maxFileSize: number; // in MB
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: {
    requests: number;
    tokens: number;
    concurrent: number;
  };
  resetTime: number;
  retryAfter?: number;
  quotaExceeded?: boolean;
  reason?: string;
}

export interface UsageWindow {
  windowStart: number;
  requests: number;
  tokens: number;
  resetTime: number;
}

export interface ConcurrentRequest {
  id: string;
  userId: string;
  startTime: number;
  estimatedTokens: number;
  projectType: string;
}

export class RateLimitService {
  private userWindows: Map<string, Map<string, UsageWindow>> = new Map(); // userId -> timeframe -> window
  private concurrentRequests: Map<string, ConcurrentRequest[]> = new Map(); // userId -> requests
  private quotaCache: Map<string, QuotaLimits> = new Map(); // userId -> limits
  private suspendedUsers: Map<string, { until: number; reason: string }> = new Map();

  constructor() {
    this.initializeRateLimiting();
    this.setupCleanupTasks();
  }

  private initializeRateLimiting(): void {
    logger.info('🚦 Initializing commercial rate limiting system...');
    
    // Load suspended users and quota overrides
    this.loadPersistentData();
    
    logger.info('✅ Rate limiting system initialized');
  }

  private loadPersistentData(): void {
    // In production, load from database
    // For now, initialize empty collections
    logger.debug('📊 Loading rate limiting data...');
  }

  private setupCleanupTasks(): void {
    // Clean up expired windows and completed requests every minute
    setInterval(() => {
      this.cleanupExpiredWindows();
      this.cleanupCompletedRequests();
    }, 60 * 1000);

    // Reset daily quotas at midnight
    setInterval(() => {
      this.resetDailyQuotas();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Get quota limits for a user based on their subscription
   */
  private getUserQuotaLimits(userId: string): QuotaLimits {
    // Check cache first
    if (this.quotaCache.has(userId)) {
      return this.quotaCache.get(userId)!;
    }

    const subscription = billingService.getUserSubscription(userId);
    if (!subscription) {
      // Default free tier limits
      const limits: QuotaLimits = {
        requestsPerMinute: 5,
        requestsPerHour: 50,
        requestsPerDay: 100,
        requestsPerMonth: 100,
        tokensPerMinute: 1000,
        tokensPerHour: 10000,
        tokensPerDay: 50000,
        tokensPerMonth: 50000,
        concurrentRequests: 1,
        maxProjectSize: 10,
        maxFileSize: 1
      };
      this.quotaCache.set(userId, limits);
      return limits;
    }

    const tier = billingService.getPricingTier(subscription.tierId);
    if (!tier) {
      throw new Error(`Invalid subscription tier: ${subscription.tierId}`);
    }

    // Calculate limits based on subscription tier
    const baseMultiplier = this.getTierMultiplier(subscription.tierId);
    
    const limits: QuotaLimits = {
      requestsPerMinute: Math.ceil(tier.limits.requestsPerMonth / (30 * 24 * 60)) * baseMultiplier,
      requestsPerHour: Math.ceil(tier.limits.requestsPerMonth / (30 * 24)) * baseMultiplier,
      requestsPerDay: Math.ceil(tier.limits.requestsPerMonth / 30) * baseMultiplier,
      requestsPerMonth: tier.limits.requestsPerMonth,
      tokensPerMinute: Math.ceil(tier.limits.tokensPerMonth / (30 * 24 * 60)) * baseMultiplier,
      tokensPerHour: Math.ceil(tier.limits.tokensPerMonth / (30 * 24)) * baseMultiplier,
      tokensPerDay: Math.ceil(tier.limits.tokensPerMonth / 30) * baseMultiplier,
      tokensPerMonth: tier.limits.tokensPerMonth,
      concurrentRequests: tier.limits.concurrentRequests,
      maxProjectSize: tier.limits.maxProjectsSize,
      maxFileSize: Math.min(tier.limits.maxProjectsSize, 100) // Max 100MB per file
    };

    this.quotaCache.set(userId, limits);
    return limits;
  }

  private getTierMultiplier(tierId: string): number {
    const multipliers: Record<string, number> = {
      'free': 1,
      'pro': 2,
      'business': 3,
      'enterprise': 5
    };
    return multipliers[tierId] || 1;
  }

  /**
   * Check if user can make a request
   */
  async checkRateLimit(
    userId: string,
    requestType: string,
    estimatedTokens: number,
    projectSize?: number
  ): Promise<RateLimitResult> {
    // Check if user is suspended
    if (this.suspendedUsers.has(userId)) {
      const suspension = this.suspendedUsers.get(userId)!;
      if (Date.now() < suspension.until) {
        return {
          allowed: false,
          remaining: { requests: 0, tokens: 0, concurrent: 0 },
          resetTime: suspension.until,
          retryAfter: Math.ceil((suspension.until - Date.now()) / 1000),
          reason: `Account suspended: ${suspension.reason}`
        };
      } else {
        // Suspension expired
        this.suspendedUsers.delete(userId);
      }
    }

    const limits = this.getUserQuotaLimits(userId);
    const now = Date.now();

    // Check project size limit
    if (projectSize && projectSize > limits.maxProjectSize) {
      return {
        allowed: false,
        remaining: { requests: 0, tokens: 0, concurrent: 0 },
        resetTime: now,
        quotaExceeded: true,
        reason: `Project size ${projectSize}MB exceeds limit of ${limits.maxProjectSize}MB`
      };
    }

    // Check concurrent requests
    const concurrent = this.getConcurrentRequests(userId);
    if (concurrent.length >= limits.concurrentRequests) {
      return {
        allowed: false,
        remaining: { 
          requests: 0, 
          tokens: 0, 
          concurrent: Math.max(0, limits.concurrentRequests - concurrent.length)
        },
        resetTime: Math.min(...concurrent.map(r => r.startTime + 300000)), // Assume 5min max request time
        retryAfter: 30, // Retry in 30 seconds
        reason: `Concurrent request limit of ${limits.concurrentRequests} exceeded`
      };
    }

    // Check rate limits for different time windows
    const timeWindows = [
      { name: 'minute', duration: 60 * 1000, requestLimit: limits.requestsPerMinute, tokenLimit: limits.tokensPerMinute },
      { name: 'hour', duration: 60 * 60 * 1000, requestLimit: limits.requestsPerHour, tokenLimit: limits.tokensPerHour },
      { name: 'day', duration: 24 * 60 * 60 * 1000, requestLimit: limits.requestsPerDay, tokenLimit: limits.tokensPerDay }
    ];

    for (const window of timeWindows) {
      const result = this.checkTimeWindow(userId, window.name, window.duration, window.requestLimit, window.tokenLimit, estimatedTokens);
      if (!result.allowed) {
        return result;
      }
    }

    // Check monthly quota through billing service
    const quotaCheck = await billingService.checkUsageLimit(userId, requestType, estimatedTokens);
    if (!quotaCheck.allowed) {
      return {
        allowed: false,
        remaining: { 
          requests: quotaCheck.usage.requestsRemaining, 
          tokens: quotaCheck.usage.tokensRemaining, 
          concurrent: Math.max(0, limits.concurrentRequests - concurrent.length)
        },
        resetTime: quotaCheck.subscription?.usage.currentPeriodEnd.getTime() || now,
        quotaExceeded: true,
        reason: quotaCheck.reason
      };
    }

    // All checks passed
    return {
      allowed: true,
      remaining: {
        requests: Math.min(
          limits.requestsPerMinute - this.getWindowUsage(userId, 'minute').requests,
          limits.requestsPerHour - this.getWindowUsage(userId, 'hour').requests,
          limits.requestsPerDay - this.getWindowUsage(userId, 'day').requests,
          quotaCheck.usage.requestsRemaining
        ),
        tokens: Math.min(
          limits.tokensPerMinute - this.getWindowUsage(userId, 'minute').tokens,
          limits.tokensPerHour - this.getWindowUsage(userId, 'hour').tokens,
          limits.tokensPerDay - this.getWindowUsage(userId, 'day').tokens,
          quotaCheck.usage.tokensRemaining
        ),
        concurrent: Math.max(0, limits.concurrentRequests - concurrent.length)
      },
      resetTime: this.getNextResetTime(userId)
    };
  }

  private checkTimeWindow(
    userId: string,
    windowName: string,
    duration: number,
    requestLimit: number,
    tokenLimit: number,
    estimatedTokens: number
  ): RateLimitResult {
    const usage = this.getWindowUsage(userId, windowName);
    const now = Date.now();

    if (usage.requests >= requestLimit) {
      return {
        allowed: false,
        remaining: { 
          requests: Math.max(0, requestLimit - usage.requests), 
          tokens: Math.max(0, tokenLimit - usage.tokens), 
          concurrent: 0 
        },
        resetTime: usage.resetTime,
        retryAfter: Math.ceil((usage.resetTime - now) / 1000),
        reason: `${windowName} request limit of ${requestLimit} exceeded`
      };
    }

    if (usage.tokens + estimatedTokens > tokenLimit) {
      return {
        allowed: false,
        remaining: { 
          requests: Math.max(0, requestLimit - usage.requests), 
          tokens: Math.max(0, tokenLimit - usage.tokens), 
          concurrent: 0 
        },
        resetTime: usage.resetTime,
        retryAfter: Math.ceil((usage.resetTime - now) / 1000),
        reason: `${windowName} token limit of ${tokenLimit} would be exceeded`
      };
    }

    return { allowed: true, remaining: { requests: 0, tokens: 0, concurrent: 0 }, resetTime: usage.resetTime };
  }

  private getWindowUsage(userId: string, windowName: string): UsageWindow {
    if (!this.userWindows.has(userId)) {
      this.userWindows.set(userId, new Map());
    }

    const userWindows = this.userWindows.get(userId)!;
    const now = Date.now();
    const durations: Record<string, number> = {
      'minute': 60 * 1000,
      'hour': 60 * 60 * 1000,
      'day': 24 * 60 * 60 * 1000
    };

    const duration = durations[windowName];
    if (!duration) {
      throw new Error(`Invalid window name: ${windowName}`);
    }

    const windowStart = Math.floor(now / duration) * duration;
    const existing = userWindows.get(windowName);

    if (!existing || existing.windowStart < windowStart) {
      const newWindow: UsageWindow = {
        windowStart,
        requests: 0,
        tokens: 0,
        resetTime: windowStart + duration
      };
      userWindows.set(windowName, newWindow);
      return newWindow;
    }

    return existing;
  }

  private getNextResetTime(userId: string): number {
    const windows = this.userWindows.get(userId);
    if (!windows) return Date.now() + 60000; // 1 minute default

    const resetTimes = Array.from(windows.values()).map(w => w.resetTime);
    return Math.min(...resetTimes);
  }

  /**
   * Record usage after a successful request
   */
  recordUsage(userId: string, tokensUsed: number): void {
    const windowNames = ['minute', 'hour', 'day'];
    
    for (const windowName of windowNames) {
      const window = this.getWindowUsage(userId, windowName);
      window.requests += 1;
      window.tokens += tokensUsed;
    }

    logger.debug(`📊 Recorded usage for user ${userId}: 1 request, ${tokensUsed} tokens`);
  }

  /**
   * Start tracking a concurrent request
   */
  startConcurrentRequest(userId: string, requestId: string, estimatedTokens: number, projectType: string): void {
    if (!this.concurrentRequests.has(userId)) {
      this.concurrentRequests.set(userId, []);
    }

    const concurrent = this.concurrentRequests.get(userId)!;
    concurrent.push({
      id: requestId,
      userId,
      startTime: Date.now(),
      estimatedTokens,
      projectType
    });
  }

  /**
   * Complete a concurrent request
   */
  completeConcurrentRequest(userId: string, requestId: string): void {
    if (!this.concurrentRequests.has(userId)) return;

    const concurrent = this.concurrentRequests.get(userId)!;
    const index = concurrent.findIndex(r => r.id === requestId);
    
    if (index !== -1) {
      concurrent.splice(index, 1);
    }
  }

  private getConcurrentRequests(userId: string): ConcurrentRequest[] {
    return this.concurrentRequests.get(userId) || [];
  }

  /**
   * Suspend a user temporarily
   */
  suspendUser(userId: string, durationMs: number, reason: string): void {
    const until = Date.now() + durationMs;
    this.suspendedUsers.set(userId, { until, reason });
    
    logger.warn(`⚠️ User ${userId} suspended until ${new Date(until).toISOString()}: ${reason}`);
  }

  /**
   * Remove user suspension
   */
  unsuspendUser(userId: string): void {
    if (this.suspendedUsers.delete(userId)) {
      logger.info(`✅ User ${userId} suspension removed`);
    }
  }

  /**
   * Get usage statistics for admin dashboard
   */
  getUsageStatistics(): {
    totalActiveUsers: number;
    totalRequests: number;
    totalTokens: number;
    averageRequestsPerUser: number;
    topUsers: Array<{ userId: string; requests: number; tokens: number }>;
    suspendedUsers: number;
    rateLimitHits: number;
  } {
    const userStats = new Map<string, { requests: number; tokens: number; rateLimitHits: number }>();
    let totalRequests = 0;
    let totalTokens = 0;
    let rateLimitHits = 0;

    // Aggregate statistics from all time windows
    for (const [userId, windows] of this.userWindows) {
      if (!userStats.has(userId)) {
        userStats.set(userId, { requests: 0, tokens: 0, rateLimitHits: 0 });
      }

      const stats = userStats.get(userId)!;
      for (const window of windows.values()) {
        stats.requests += window.requests;
        stats.tokens += window.tokens;
        totalRequests += window.requests;
        totalTokens += window.tokens;
      }
    }

    const topUsers = Array.from(userStats.entries())
      .map(([userId, stats]) => ({ userId, ...stats }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return {
      totalActiveUsers: userStats.size,
      totalRequests,
      totalTokens,
      averageRequestsPerUser: userStats.size > 0 ? totalRequests / userStats.size : 0,
      topUsers,
      suspendedUsers: this.suspendedUsers.size,
      rateLimitHits
    };
  }

  /**
   * Clear user rate limit data (for testing or admin purposes)
   */
  clearUserRateLimit(userId: string): void {
    this.userWindows.delete(userId);
    this.concurrentRequests.delete(userId);
    this.quotaCache.delete(userId);
    
    logger.info(`🔄 Cleared rate limit data for user ${userId}`);
  }

  private cleanupExpiredWindows(): void {
    const now = Date.now();
    
    for (const [userId, windows] of this.userWindows) {
      for (const [windowName, window] of windows) {
        if (window.resetTime < now) {
          windows.delete(windowName);
        }
      }
      
      // Remove user entry if no windows remain
      if (windows.size === 0) {
        this.userWindows.delete(userId);
      }
    }
  }

  private cleanupCompletedRequests(): void {
    const now = Date.now();
    const maxRequestDuration = 10 * 60 * 1000; // 10 minutes

    for (const [userId, requests] of this.concurrentRequests) {
      const activeRequests = requests.filter(r => now - r.startTime < maxRequestDuration);
      
      if (activeRequests.length !== requests.length) {
        if (activeRequests.length === 0) {
          this.concurrentRequests.delete(userId);
        } else {
          this.concurrentRequests.set(userId, activeRequests);
        }
      }
    }
  }

  private resetDailyQuotas(): void {
    // This would typically reset daily quotas stored in database
    logger.info('🔄 Daily quota reset completed');
  }
}

// Export singleton instance
export const rateLimitService = new RateLimitService();