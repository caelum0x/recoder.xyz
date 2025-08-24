/**
 * Enterprise Analytics Service
 * PRODUCTION FEATURE: User behavior tracking and business intelligence
 * PostHog + custom analytics that Cursor/Copilot don't provide
 */

import { PostHog } from 'posthog-node';
import { PrismaClient } from '@prisma/client';
import { Logger } from 'recoder-shared';
import { EventEmitter } from 'events';

export interface AnalyticsEvent {
  userId?: string;
  sessionId?: string;
  deviceId?: string;
  event: string;
  properties: Record<string, any>;
  timestamp?: Date;
  context?: {
    userAgent?: string;
    ip?: string;
    platform?: string;
    version?: string;
    environment?: string;
  };
}

export interface UserProfile {
  userId: string;
  properties: Record<string, any>;
  traits?: {
    email?: string;
    name?: string;
    organization?: string;
    plan?: string;
    role?: string;
    signupDate?: Date;
    lastActive?: Date;
  };
}

export interface AnalyticsQuery {
  event?: string;
  userId?: string;
  dateRange: {
    start: Date;
    end: Date;
  };
  groupBy?: string[];
  aggregation?: 'count' | 'sum' | 'avg' | 'unique';
  filters?: Record<string, any>;
  limit?: number;
}

export interface AnalyticsResult {
  data: Array<{
    timestamp: Date;
    value: number;
    dimensions?: Record<string, any>;
  }>;
  totalEvents: number;
  uniqueUsers: number;
  metadata: {
    query: AnalyticsQuery;
    executionTime: number;
    cached: boolean;
  };
}

export interface FunnelStep {
  event: string;
  properties?: Record<string, any>;
  name: string;
}

export interface FunnelAnalysis {
  steps: Array<{
    step: FunnelStep;
    users: number;
    conversionRate: number;
    dropoffRate: number;
  }>;
  totalEntered: number;
  totalCompleted: number;
  overallConversionRate: number;
}

export interface CohortAnalysis {
  cohorts: Array<{
    cohortDate: Date;
    cohortSize: number;
    retentionRates: number[]; // Day 1, 7, 14, 30 retention
  }>;
  averageRetention: {
    day1: number;
    day7: number;
    day14: number;
    day30: number;
  };
}

export interface FeatureUsageMetrics {
  feature: string;
  usage: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    engagementScore: number;
    averageSessionDuration: number;
    retentionRate: number;
  };
  trends: Array<{
    date: Date;
    users: number;
    events: number;
  }>;
}

export class AnalyticsService extends EventEmitter {
  private posthog: PostHog | null = null;
  private prisma: PrismaClient;
  private config: {
    posthogApiKey?: string;
    posthogHost?: string;
    enablePostHog: boolean;
    enableCustomAnalytics: boolean;
    batchSize: number;
    flushInterval: number;
    retentionDays: number;
  };
  private eventQueue: AnalyticsEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<typeof AnalyticsService.prototype.config>) {
    super();
    
    this.config = {
      posthogApiKey: process.env.POSTHOG_API_KEY,
      posthogHost: process.env.POSTHOG_HOST || 'https://app.posthog.com',
      enablePostHog: process.env.ENABLE_POSTHOG === 'true',
      enableCustomAnalytics: process.env.ENABLE_CUSTOM_ANALYTICS !== 'false',
      batchSize: parseInt(process.env.ANALYTICS_BATCH_SIZE || '100'),
      flushInterval: parseInt(process.env.ANALYTICS_FLUSH_INTERVAL || '30000'), // 30 seconds
      retentionDays: parseInt(process.env.ANALYTICS_RETENTION_DAYS || '365'),
      ...config
    };

    this.prisma = new PrismaClient();
    this.initializePostHog();
    this.startBatchProcessor();
  }

  private initializePostHog(): void {
    if (this.config.enablePostHog && this.config.posthogApiKey) {
      this.posthog = new PostHog(this.config.posthogApiKey, {
        host: this.config.posthogHost,
        flushAt: this.config.batchSize,
        flushInterval: this.config.flushInterval
      });
      Logger.info('PostHog analytics initialized');
    } else {
      Logger.info('PostHog analytics disabled - using custom analytics only');
    }
  }

  private startBatchProcessor(): void {
    this.flushTimer = setInterval(() => {
      this.flushEventQueue();
    }, this.config.flushInterval);
  }

  /**
   * Track an analytics event
   */
  public async track(event: AnalyticsEvent): Promise<void> {
    try {
      // Add to queue for batch processing
      this.eventQueue.push({
        ...event,
        timestamp: event.timestamp || new Date()
      });

      // Send to PostHog if enabled
      if (this.posthog && event.userId) {
        this.posthog.capture({
          distinctId: event.userId,
          event: event.event,
          properties: {
            ...event.properties,
            sessionId: event.sessionId,
            deviceId: event.deviceId,
            ...event.context
          }
        });
      }

      // Emit event for real-time processing
      this.emit('event', event);

      // Flush if queue is full
      if (this.eventQueue.length >= this.config.batchSize) {
        await this.flushEventQueue();
      }

    } catch (error) {
      Logger.error('Failed to track analytics event:', error);
    }
  }

  /**
   * Identify a user with their profile
   */
  public async identify(profile: UserProfile): Promise<void> {
    try {
      if (this.posthog) {
        this.posthog.identify({
          distinctId: profile.userId,
          properties: {
            ...profile.properties,
            ...profile.traits
          }
        });
      }

      // Store user profile in custom analytics
      if (this.config.enableCustomAnalytics) {
        // Check if user profile already exists
        const existingProfile = await this.prisma.usageAnalytics.findFirst({
          where: {
            userId: profile.userId,
            eventType: 'user_profile',
            platform: 'system'
          }
        });

        if (existingProfile) {
          await this.prisma.usageAnalytics.update({
            where: { id: existingProfile.id },
            data: {
              metadata: {
                ...profile.properties,
                ...profile.traits,
                lastUpdated: new Date()
              }
            }
          });
        } else {
          await this.prisma.usageAnalytics.create({
            data: {
              userId: profile.userId,
              eventType: 'user_profile',
              platform: 'system',
              success: true,
              metadata: {
                ...profile.properties,
                ...profile.traits,
                created: new Date()
              }
            }
          });
        }
      }

      Logger.debug(`User identified: ${profile.userId}`);

    } catch (error) {
      Logger.error('Failed to identify user:', error);
    }
  }

  /**
   * Track page view
   */
  public async trackPageView(userId: string, page: string, properties: Record<string, any> = {}): Promise<void> {
    await this.track({
      userId,
      event: 'page_view',
      properties: {
        page,
        ...properties
      }
    });
  }

  /**
   * Track feature usage
   */
  public async trackFeatureUsage(
    userId: string, 
    feature: string, 
    action: string, 
    properties: Record<string, any> = {}
  ): Promise<void> {
    await this.track({
      userId,
      event: 'feature_usage',
      properties: {
        feature,
        action,
        ...properties
      }
    });
  }

  /**
   * Track code generation events
   */
  public async trackCodeGeneration(
    userId: string,
    details: {
      type: string;
      provider: string;
      model: string;
      tokens: number;
      duration: number;
      success: boolean;
      language?: string;
      framework?: string;
    }
  ): Promise<void> {
    await this.track({
      userId,
      event: 'code_generation',
      properties: {
        ...details,
        timestamp: new Date()
      }
    });
  }

  /**
   * Track business metrics
   */
  public async trackBusinessEvent(
    userId: string,
    event: string,
    revenue?: number,
    properties: Record<string, any> = {}
  ): Promise<void> {
    await this.track({
      userId,
      event,
      properties: {
        ...properties,
        revenue
      }
    });
  }

  /**
   * Query analytics data
   */
  public async query(query: AnalyticsQuery): Promise<AnalyticsResult> {
    const startTime = Date.now();

    try {
      // Build where clause
      const whereClause: any = {
        timestamp: {
          gte: query.dateRange.start,
          lte: query.dateRange.end
        }
      };

      if (query.event) {
        whereClause.eventType = query.event;
      }

      if (query.userId) {
        whereClause.userId = query.userId;
      }

      if (query.filters) {
        // Add filter conditions to metadata search
        Object.entries(query.filters).forEach(([key, value]) => {
          whereClause.metadata = {
            path: [key],
            equals: value
          };
        });
      }

      // Execute query
      const events = await this.prisma.usageAnalytics.findMany({
        where: whereClause,
        orderBy: { timestamp: 'asc' },
        take: query.limit || 1000
      });

      // Process results based on aggregation
      const data = this.aggregateResults(events, query);
      const uniqueUsers = new Set(events.map(e => e.userId).filter(Boolean)).size;

      return {
        data,
        totalEvents: events.length,
        uniqueUsers,
        metadata: {
          query,
          executionTime: Date.now() - startTime,
          cached: false
        }
      };

    } catch (error) {
      Logger.error('Analytics query failed:', error);
      throw error;
    }
  }

  /**
   * Analyze funnel conversion
   */
  public async analyzeFunnel(steps: FunnelStep[], dateRange: { start: Date; end: Date }): Promise<FunnelAnalysis> {
    try {
      const funnelData: FunnelAnalysis = {
        steps: [],
        totalEntered: 0,
        totalCompleted: 0,
        overallConversionRate: 0
      };

      let previousStepUsers: Set<string> = new Set();

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        // Get users who completed this step
        const stepUsers = await this.getUsersForEvent(step.event, dateRange, step.properties);
        
        let stepUserSet: Set<string>;
        if (i === 0) {
          // First step - all users
          stepUserSet = new Set(stepUsers);
          funnelData.totalEntered = stepUserSet.size;
        } else {
          // Subsequent steps - only users who completed previous step
          stepUserSet = new Set(stepUsers.filter(userId => previousStepUsers.has(userId)));
        }

        const conversionRate = i === 0 ? 100 : (stepUserSet.size / previousStepUsers.size) * 100;
        const dropoffRate = 100 - conversionRate;

        funnelData.steps.push({
          step,
          users: stepUserSet.size,
          conversionRate,
          dropoffRate
        });

        previousStepUsers = stepUserSet;
      }

      funnelData.totalCompleted = previousStepUsers.size;
      funnelData.overallConversionRate = funnelData.totalEntered > 0 
        ? (funnelData.totalCompleted / funnelData.totalEntered) * 100 
        : 0;

      return funnelData;

    } catch (error) {
      Logger.error('Funnel analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze cohort retention
   */
  public async analyzeCohorts(cohortPeriod: 'daily' | 'weekly' | 'monthly' = 'weekly'): Promise<CohortAnalysis> {
    try {
      // This is a simplified implementation
      // In production, you'd use more sophisticated cohort analysis
      
      const cohorts: CohortAnalysis['cohorts'] = [];
      const now = new Date();
      const periodDays = cohortPeriod === 'daily' ? 1 : cohortPeriod === 'weekly' ? 7 : 30;

      // Get cohorts for the last 12 periods
      for (let i = 0; i < 12; i++) {
        const cohortStart = new Date(now.getTime() - (i * periodDays * 24 * 60 * 60 * 1000));
        const cohortEnd = new Date(cohortStart.getTime() + (periodDays * 24 * 60 * 60 * 1000));

        // Get users who signed up in this cohort
        const cohortUsers = await this.prisma.user.findMany({
          where: {
            createdAt: {
              gte: cohortStart,
              lt: cohortEnd
            }
          },
          select: { id: true }
        });

        const cohortSize = cohortUsers.length;
        if (cohortSize === 0) continue;

        const userIds = cohortUsers.map(u => u.id);
        const retentionRates: number[] = [];

        // Calculate retention for days 1, 7, 14, 30
        for (const retentionDay of [1, 7, 14, 30]) {
          const retentionDate = new Date(cohortEnd.getTime() + (retentionDay * 24 * 60 * 60 * 1000));
          
          if (retentionDate > now) {
            retentionRates.push(0); // Future date
            continue;
          }

          // Count active users on retention date
          const activeUserCount = await this.prisma.usageAnalytics.groupBy({
            by: ['userId'],
            where: {
              userId: { in: userIds },
              timestamp: {
                gte: retentionDate,
                lt: new Date(retentionDate.getTime() + (24 * 60 * 60 * 1000))
              }
            },
            _count: true
          });

          const activeUsers = activeUserCount.length;

          retentionRates.push((activeUsers / cohortSize) * 100);
        }

        cohorts.push({
          cohortDate: cohortStart,
          cohortSize,
          retentionRates
        });
      }

      // Calculate average retention
      const averageRetention = {
        day1: cohorts.length > 0 ? cohorts.reduce((sum, c) => sum + (c.retentionRates[0] || 0), 0) / cohorts.length : 0,
        day7: cohorts.length > 0 ? cohorts.reduce((sum, c) => sum + (c.retentionRates[1] || 0), 0) / cohorts.length : 0,
        day14: cohorts.length > 0 ? cohorts.reduce((sum, c) => sum + (c.retentionRates[2] || 0), 0) / cohorts.length : 0,
        day30: cohorts.length > 0 ? cohorts.reduce((sum, c) => sum + (c.retentionRates[3] || 0), 0) / cohorts.length : 0
      };

      return { cohorts, averageRetention };

    } catch (error) {
      Logger.error('Cohort analysis failed:', error);
      throw error;
    }
  }

  /**
   * Get feature usage metrics
   */
  public async getFeatureUsageMetrics(feature: string, dateRange: { start: Date; end: Date }): Promise<FeatureUsageMetrics> {
    try {
      // Get all feature usage events
      const events = await this.prisma.usageAnalytics.findMany({
        where: {
          eventType: 'feature_usage',
          timestamp: {
            gte: dateRange.start,
            lte: dateRange.end
          },
          metadata: {
            path: ['feature'],
            equals: feature
          }
        }
      });

      const userIds = [...new Set(events.map(e => e.userId).filter(Boolean))];
      const totalUsers = userIds.length;

      // Calculate metrics
      const usage = {
        totalUsers,
        activeUsers: userIds.length, // Users who used the feature in the period
        newUsers: 0, // Would need to check if this was their first use
        engagementScore: events.length > 0 ? events.length / totalUsers : 0,
        averageSessionDuration: 0, // Would need session tracking
        retentionRate: 0 // Would need retention calculation
      };

      // Get daily trends
      const trends: FeatureUsageMetrics['trends'] = [];
      const dayMs = 24 * 60 * 60 * 1000;
      const startTime = dateRange.start.getTime();
      const endTime = dateRange.end.getTime();

      for (let time = startTime; time <= endTime; time += dayMs) {
        const date = new Date(time);
        const nextDate = new Date(time + dayMs);

        const dayEvents = events.filter(e => 
          e.timestamp.getTime() >= time && e.timestamp.getTime() < time + dayMs
        );

        const dayUsers = [...new Set(dayEvents.map(e => e.userId).filter(Boolean))].length;

        trends.push({
          date,
          users: dayUsers,
          events: dayEvents.length
        });
      }

      return {
        feature,
        usage,
        trends
      };

    } catch (error) {
      Logger.error('Feature usage metrics failed:', error);
      throw error;
    }
  }

  /**
   * Get real-time analytics dashboard data
   */
  public async getDashboardData(): Promise<{
    activeUsers: number;
    totalEvents: number;
    topFeatures: Array<{ feature: string; usage: number }>;
    recentActivity: Array<{ event: string; count: number; timestamp: Date }>;
  }> {
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Active users in last 24 hours - use groupBy for distinct count
      const activeUserGroups = await this.prisma.usageAnalytics.groupBy({
        by: ['userId'],
        where: {
          timestamp: { gte: last24Hours },
          userId: { not: null }
        },
        _count: true
      });
      const activeUsers = activeUserGroups.length;

      // Total events in last 24 hours
      const totalEvents = await this.prisma.usageAnalytics.count({
        where: {
          timestamp: { gte: last24Hours }
        }
      });

      // Top features by usage
      const featureEvents = await this.prisma.usageAnalytics.findMany({
        where: {
          eventType: 'feature_usage',
          timestamp: { gte: last24Hours }
        },
        select: {
          metadata: true
        }
      });

      const featureUsage = new Map<string, number>();
      featureEvents.forEach(event => {
        const feature = (event.metadata as any)?.feature;
        if (feature) {
          featureUsage.set(feature, (featureUsage.get(feature) || 0) + 1);
        }
      });

      const topFeatures = Array.from(featureUsage.entries())
        .map(([feature, usage]) => ({ feature, usage }))
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 10);

      // Recent activity
      const recentEvents = await this.prisma.usageAnalytics.groupBy({
        by: ['eventType'],
        where: {
          timestamp: { gte: last24Hours }
        },
        _count: true,
        orderBy: {
          _count: {
            eventType: 'desc'
          }
        },
        take: 10
      });

      const recentActivity = recentEvents.map(event => ({
        event: event.eventType,
        count: event._count,
        timestamp: new Date()
      }));

      return {
        activeUsers,
        totalEvents,
        topFeatures,
        recentActivity
      };

    } catch (error) {
      Logger.error('Dashboard data failed:', error);
      throw error;
    }
  }

  // Private helper methods

  private async flushEventQueue(): Promise<void> {
    if (this.eventQueue.length === 0 || !this.config.enableCustomAnalytics) return;

    const events = this.eventQueue.splice(0, this.config.batchSize);

    try {
      // Batch insert to database
      await this.prisma.usageAnalytics.createMany({
        data: events.map(event => ({
          userId: event.userId,
          deviceId: event.deviceId,
          eventType: event.event,
          platform: event.context?.platform || 'unknown',
          provider: (event.properties as any)?.provider,
          tokens: (event.properties as any)?.tokens,
          cost: (event.properties as any)?.cost,
          duration: (event.properties as any)?.duration,
          success: (event.properties as any)?.success !== false,
          errorCode: (event.properties as any)?.errorCode,
          errorMessage: (event.properties as any)?.errorMessage,
          metadata: {
            ...event.properties,
            ...event.context,
            sessionId: event.sessionId
          },
          timestamp: event.timestamp || new Date()
        })),
        skipDuplicates: true
      });

      Logger.debug(`Flushed ${events.length} analytics events`);

    } catch (error) {
      Logger.error('Failed to flush analytics events:', error);
      // Re-add events to queue for retry
      this.eventQueue.unshift(...events);
    }
  }

  private aggregateResults(events: any[], query: AnalyticsQuery): AnalyticsResult['data'] {
    // Simple aggregation implementation
    // In production, you'd use more sophisticated aggregation

    if (!query.groupBy || query.groupBy.length === 0) {
      // No grouping - return time-series data
      const grouped = new Map<string, number>();
      
      events.forEach(event => {
        const date = event.timestamp.toISOString().split('T')[0]; // Group by day
        grouped.set(date, (grouped.get(date) || 0) + 1);
      });

      return Array.from(grouped.entries()).map(([date, value]) => ({
        timestamp: new Date(date),
        value
      }));
    }

    // Group by specified dimensions
    const grouped = new Map<string, number>();
    
    events.forEach(event => {
      const key = query.groupBy!.map(dimension => 
        event.metadata?.[dimension] || event[dimension] || 'unknown'
      ).join('|');
      
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });

    return Array.from(grouped.entries()).map(([key, value]) => {
      const dimensions: Record<string, any> = {};
      const keyParts = key.split('|');
      query.groupBy!.forEach((dimension, index) => {
        dimensions[dimension] = keyParts[index];
      });

      return {
        timestamp: new Date(),
        value,
        dimensions
      };
    });
  }

  private async getUsersForEvent(
    event: string, 
    dateRange: { start: Date; end: Date }, 
    properties?: Record<string, any>
  ): Promise<string[]> {
    const whereClause: any = {
      eventType: event,
      timestamp: {
        gte: dateRange.start,
        lte: dateRange.end
      },
      userId: { not: null }
    };

    if (properties) {
      Object.entries(properties).forEach(([key, value]) => {
        whereClause.metadata = {
          path: [key],
          equals: value
        };
      });
    }

    const events = await this.prisma.usageAnalytics.findMany({
      where: whereClause,
      select: { userId: true }
    });

    return events.map(e => e.userId!).filter(Boolean);
  }

  // Public API methods

  public async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush remaining events
    await this.flushEventQueue();

    if (this.posthog) {
      await this.posthog.shutdown();
    }

    await this.prisma.$disconnect();
    Logger.info('Analytics service shut down');
  }

  public getConfig() {
    return { ...this.config };
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    try {
      // Test database connection
      await this.prisma.$queryRaw`SELECT 1`;
      
      // Test PostHog if enabled
      let posthogStatus = 'disabled';
      if (this.posthog) {
        // PostHog doesn't have a direct health check, so we assume it's healthy if initialized
        posthogStatus = 'healthy';
      }

      return {
        status: 'healthy',
        details: {
          database: 'healthy',
          posthog: posthogStatus,
          queueSize: this.eventQueue.length,
          config: {
            enablePostHog: this.config.enablePostHog,
            enableCustomAnalytics: this.config.enableCustomAnalytics,
            batchSize: this.config.batchSize
          }
        }
      };

    } catch (error) {
      Logger.error('Analytics health check failed:', error);
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();

// Export helper functions for common tracking patterns
export const trackingHelpers = {
  // Track user signup
  signup: (userId: string, properties: Record<string, any> = {}) => 
    analyticsService.track({
      userId,
      event: 'user_signup',
      properties
    }),

  // Track login
  login: (userId: string, properties: Record<string, any> = {}) =>
    analyticsService.track({
      userId,
      event: 'user_login',
      properties
    }),

  // Track subscription
  subscribe: (userId: string, plan: string, revenue: number) =>
    analyticsService.trackBusinessEvent(userId, 'subscription_created', revenue, { plan }),

  // Track code generation
  codeGeneration: (userId: string, details: any) =>
    analyticsService.trackCodeGeneration(userId, details),

  // Track feature usage
  feature: (userId: string, feature: string, action: string, properties: Record<string, any> = {}) =>
    analyticsService.trackFeatureUsage(userId, feature, action, properties)
};