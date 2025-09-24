/**
 * Game Analytics Service
 * Real-time analytics collection and processing for game events
 */

import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface AnalyticsEvent {
  eventType: string;
  eventName: string;
  category?: string;
  eventData: Record<string, any>;
  properties?: Record<string, any>;
  metrics?: Record<string, number>;
  sessionId?: string;
  userId?: string;
  projectId?: string;
  platform?: string;
  deviceInfo?: Record<string, any>;
  location?: Record<string, any>;
}

export interface GameSession {
  sessionId: string;
  userId?: string;
  projectId: string;
  platform: string;
  gameVersion: string;
  deviceInfo: Record<string, any>;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  events?: AnalyticsEvent[];
}

export interface PlayerBehaviorMetrics {
  userId: string;
  projectId: string;
  totalSessions: number;
  totalPlaytime: number;
  avgSessionDuration: number;
  retentionRate: number;
  churnRisk: number;
  lastActive: Date;
  favoriteGameModes: string[];
  skillProgression: Record<string, number>;
}

export class GameAnalyticsService extends EventEmitter {
  private static instance: GameAnalyticsService;
  private sessionCache: Map<string, GameSession> = new Map();
  private eventBuffer: AnalyticsEvent[] = [];
  private readonly bufferSize = 100;
  private flushInterval!: NodeJS.Timeout;

  constructor() {
    super();
    this.startEventProcessor();
  }

  public static getInstance(): GameAnalyticsService {
    if (!GameAnalyticsService.instance) {
      GameAnalyticsService.instance = new GameAnalyticsService();
    }
    return GameAnalyticsService.instance;
  }

  /**
   * Record a single analytics event
   */
  async recordEvent(event: AnalyticsEvent): Promise<void> {
    try {
      // Validate event data
      if (!event.eventType || !event.eventName) {
        throw new Error('Event type and name are required');
      }

      // Add timestamp and processing metadata
      const enrichedEvent = {
        ...event,
        timestamp: new Date(),
        ip: '0.0.0.0', // Will be set by middleware
        userAgent: '', // Will be set by middleware
        processed: false,
        version: '1.0'
      };

      // Add to buffer for batch processing
      this.eventBuffer.push(enrichedEvent);

      // Flush if buffer is full
      if (this.eventBuffer.length >= this.bufferSize) {
        await this.flushEvents();
      }

      // Update session if provided
      if (event.sessionId) {
        await this.updateSession(event.sessionId, event);
      }

      // Emit for real-time processing
      this.emit('eventRecorded', enrichedEvent);

      logger.info('Game analytics event recorded', { 
        eventType: event.eventType, 
        eventName: event.eventName,
        sessionId: event.sessionId 
      });
    } catch (error) {
      logger.error('Failed to record game analytics event:', error);
      throw error;
    }
  }

  /**
   * Record multiple events in batch
   */
  async recordEvents(events: AnalyticsEvent[]): Promise<void> {
    try {
      const recordPromises = events.map(event => this.recordEvent(event));
      await Promise.all(recordPromises);
      
      logger.info(`Batch recorded ${events.length} game analytics events`);
    } catch (error) {
      logger.error('Failed to record batch game analytics events:', error);
      throw error;
    }
  }

  /**
   * Start a new game session
   */
  async startSession(session: Omit<GameSession, 'startTime'>): Promise<string> {
    try {
      const gameSession = await prisma.gameSession.create({
        data: {
          sessionId: session.sessionId,
          userId: session.userId || null,
          projectId: session.projectId,
          platform: session.platform,
          gameVersion: session.gameVersion,
          deviceInfo: session.deviceInfo as any,
          startTime: new Date()
        }
      });

      // Cache session for quick updates
      this.sessionCache.set(session.sessionId, {
        ...session,
        startTime: new Date(),
        events: []
      });

      this.emit('sessionStarted', gameSession);
      
      logger.info('Game session started', { 
        sessionId: session.sessionId, 
        userId: session.userId,
        projectId: session.projectId 
      });

      return gameSession.sessionId;
    } catch (error) {
      logger.error('Failed to start game session:', error);
      throw error;
    }
  }

  /**
   * End a game session
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      const endedAt = new Date();
      const cachedSession = this.sessionCache.get(sessionId);
      
      let duration = 0;
      if (cachedSession) {
        duration = endedAt.getTime() - cachedSession.startTime.getTime();
      }

      const updatedSession = await prisma.gameSession.update({
        where: { sessionId },
        data: {
          endTime: endedAt,
          duration: Math.floor(duration / 1000), // Duration in seconds
          isActive: false
        }
      });

      // Remove from cache
      this.sessionCache.delete(sessionId);

      // Update player behavior profile
      if (updatedSession.userId && updatedSession.projectId) {
        await this.updatePlayerBehaviorProfile(updatedSession.userId, updatedSession.projectId);
      }

      this.emit('sessionEnded', updatedSession);
      
      logger.info('Game session ended', { 
        sessionId, 
        duration: Math.floor(duration / 1000) + 's'
      });
    } catch (error) {
      logger.error('Failed to end game session:', error);
      throw error;
    }
  }

  /**
   * Generate analytics report
   */
  async generateReport(
    projectId: string,
    startDate: Date,
    endDate: Date,
    reportType: 'overview' | 'retention' | 'performance' | 'monetization' = 'overview'
  ): Promise<any> {
    try {
      const baseQuery = {
        projectId,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      };

      let reportData: any = {};

      switch (reportType) {
        case 'overview':
          reportData = await this.generateOverviewReport(baseQuery);
          break;
        case 'retention':
          reportData = await this.generateRetentionReport(baseQuery);
          break;
        case 'performance':
          reportData = await this.generatePerformanceReport(baseQuery);
          break;
        case 'monetization':
          reportData = await this.generateMonetizationReport(baseQuery);
          break;
      }

      // Note: gameAnalyticsReport model doesn't exist in schema
      // const savedReport = await prisma.gameAnalyticsReport.create({
      //   data: {
      //     projectId,
      //     reportType,
      //     generatedAt: new Date(),
      //     dateRange: {
      //       start: startDate,
      //       end: endDate
      //     } as any,
      //     data: reportData as any,
      //     summary: this.generateReportSummary(reportData),
      //     insights: this.generateInsights(reportData, reportType)
      //   }
      // });

      logger.info('Game analytics report generated', { 
        // reportId: savedReport.id,
        projectId,
        reportType 
      });

      return {
        success: true,
        reportType,
        data: reportData,
        summary: this.generateReportSummary(reportData),
        insights: this.generateInsights(reportData, reportType)
      };
    } catch (error) {
      logger.error('Failed to generate game analytics report:', error);
      throw error;
    }
  }

  /**
   * Get player behavior profile
   */
  async getPlayerBehaviorProfile(userId: string, projectId: string): Promise<PlayerBehaviorMetrics | null> {
    try {
      // playerBehaviorProfile model not implemented in schema yet
      const profile = null; // TODO: Implement playerBehaviorProfile model

      // Return null since playerBehaviorProfile model is not implemented
      return null;
      
      /* TODO: Implement when playerBehaviorProfile model exists
      return profile ? {
        userId: profile.userId,
        projectId: profile.projectId,
        totalSessions: profile.totalSessions,
        totalPlaytime: profile.totalPlaytime,
        avgSessionDuration: profile.avgSessionDuration,
        retentionRate: profile.retentionRate,
        churnRisk: profile.churnRisk,
        lastActive: profile.lastActive,
        favoriteGameModes: profile.favoriteGameModes,
        skillProgression: profile.skillProgression as Record<string, number>
      } : null;
      */
    } catch (error) {
      logger.error('Failed to get player behavior profile:', error);
      throw error;
    }
  }

  /**
   * Get real-time analytics dashboard data
   */
  async getDashboardData(projectId: string): Promise<any> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get active sessions
      const activeSessions = await prisma.gameSession.count({
        where: {
          projectId,
          startTime: { gte: oneDayAgo },
          endTime: null
        }
      });

      // Get daily events
      const dailyEvents = await prisma.gameAnalyticsEvent.count({
        where: {
          projectId,
          timestamp: { gte: oneDayAgo }
        }
      });

      // Get weekly retention
      const weeklyRetention = await this.calculateRetentionRate(projectId, oneWeekAgo, now);

      // Get top events
      const topEvents = await prisma.gameAnalyticsEvent.groupBy({
        by: ['eventName'],
        where: {
          projectId,
          timestamp: { gte: oneDayAgo }
        },
        _count: true,
        orderBy: {
          _count: {
            eventName: 'desc'
          }
        },
        take: 10
      });

      return {
        activeSessions,
        dailyEvents,
        weeklyRetention,
        topEvents: topEvents.map(event => ({
          name: event.eventName,
          count: event._count
        })),
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error('Failed to get game analytics dashboard data:', error);
      throw error;
    }
  }

  // Private methods

  private startEventProcessor(): void {
    // Process events every 30 seconds
    this.flushInterval = setInterval(async () => {
      if (this.eventBuffer.length > 0) {
        await this.flushEvents();
      }
    }, 30000);
  }

  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    try {
      const eventsToFlush = [...this.eventBuffer];
      this.eventBuffer = [];

      // Batch insert events
      await prisma.gameAnalyticsEvent.createMany({
        data: eventsToFlush.map(event => ({
          eventType: event.eventType,
          eventName: event.eventName,
          category: event.category || null,
          eventData: event.eventData as any,
          properties: event.properties as any,
          metrics: event.metrics as any,
          sessionId: event.sessionId || null,
          userId: event.userId || null,
          projectId: event.projectId || null,
          platform: event.platform || null,
          deviceInfo: event.deviceInfo as any,
          location: event.location as any,
          timestamp: (event as any).timestamp,
          ip: (event as any).ip,
          userAgent: (event as any).userAgent,
          processed: false,
          version: (event as any).version
        }))
      });

      logger.info(`Flushed ${eventsToFlush.length} game analytics events to database`);
    } catch (error) {
      logger.error('Failed to flush game analytics events:', error);
      // Put events back in buffer on failure
      this.eventBuffer.unshift(...this.eventBuffer);
    }
  }

  private async updateSession(sessionId: string, event: AnalyticsEvent): Promise<void> {
    const cachedSession = this.sessionCache.get(sessionId);
    if (cachedSession) {
      if (!cachedSession.events) cachedSession.events = [];
      cachedSession.events.push(event);
    }
  }

  private async updatePlayerBehaviorProfile(userId: string, projectId: string): Promise<void> {
    try {
      // Calculate behavior metrics from user's sessions and events
      const sessions = await prisma.gameSession.findMany({
        where: { userId, projectId },
        orderBy: { startTime: 'desc' },
        take: 100 // Last 100 sessions
      });

      if (sessions.length === 0) return;

      const totalSessions = sessions.length;
      const totalPlaytime = sessions.reduce((sum, session) => sum + (session.duration || 0), 0);
      const avgSessionDuration = totalPlaytime / totalSessions;
      const lastActive = sessions[0].startTime;

      // Calculate retention rate (simplified)
      const retentionRate = await this.calculateUserRetentionRate(userId, projectId);

      // Calculate churn risk (simplified)
      const daysSinceLastActive = (new Date().getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
      const churnRisk = Math.min(daysSinceLastActive / 7, 1); // Higher risk after 7 days

      // TODO: Implement playerBehaviorProfile model in Prisma schema
      // await prisma.playerBehaviorProfile.upsert({
      //   where: {
      //     userId_projectId: {
      //       userId,
      //       projectId
      //     }
      //   },
      //   update: {
      //     totalSessions,
      //     totalPlaytime,
      //     avgSessionDuration,
      //     retentionRate,
      //     churnRisk,
      //     lastActive,
      //     updatedAt: new Date()
      //   },
      //   create: {
      //     userId,
      //     projectId,
      //     totalSessions,
      //     totalPlaytime,
      //     avgSessionDuration,
      //     retentionRate,
      //     churnRisk,
      //     lastActive,
      //     favoriteGameModes: [],
      //     skillProgression: {}
      //   }
      // });
      
      logger.info('Player behavior profile update skipped - model not implemented');
    } catch (error) {
      logger.error('Failed to update player behavior profile:', error);
    }
  }

  private async generateOverviewReport(baseQuery: any): Promise<any> {
    const events = await prisma.gameAnalyticsEvent.findMany({
      where: baseQuery
    });

    const sessions = await prisma.gameSession.findMany({
      where: {
        projectId: baseQuery.projectId,
        startTime: {
          gte: baseQuery.timestamp.gte,
          lte: baseQuery.timestamp.lte
        }
      }
    });

    return {
      totalEvents: events.length,
      totalSessions: sessions.length,
      uniqueUsers: new Set(events.filter(e => e.userId).map(e => e.userId)).size,
      avgSessionDuration: sessions.reduce((sum, s) => sum + (s.duration || 0), 0) / sessions.length,
      topEvents: this.getTopEvents(events),
      platformDistribution: this.getPlatformDistribution(events)
    };
  }

  private async generateRetentionReport(baseQuery: any): Promise<any> {
    const retentionRate = await this.calculateRetentionRate(
      baseQuery.projectId,
      baseQuery.timestamp.gte,
      baseQuery.timestamp.lte
    );

    return {
      overallRetention: retentionRate,
      dailyRetention: await this.calculateDailyRetention(baseQuery.projectId, baseQuery.timestamp.gte, baseQuery.timestamp.lte),
      weeklyRetention: await this.calculateWeeklyRetention(baseQuery.projectId, baseQuery.timestamp.gte, baseQuery.timestamp.lte)
    };
  }

  private async generatePerformanceReport(baseQuery: any): Promise<any> {
    const performanceEvents = await prisma.gameAnalyticsEvent.findMany({
      where: {
        ...baseQuery,
        eventType: 'performance'
      }
    });

    return {
      avgFrameRate: this.calculateAvgMetric(performanceEvents, 'fps'),
      avgLoadTime: this.calculateAvgMetric(performanceEvents, 'loadTime'),
      crashRate: this.calculateCrashRate(performanceEvents),
      memoryUsage: this.calculateAvgMetric(performanceEvents, 'memoryUsage')
    };
  }

  private async generateMonetizationReport(baseQuery: any): Promise<any> {
    const monetizationEvents = await prisma.gameAnalyticsEvent.findMany({
      where: {
        ...baseQuery,
        eventType: 'monetization'
      }
    });

    return {
      totalRevenue: this.calculateTotalRevenue(monetizationEvents),
      avgRevenuePerUser: this.calculateAvgRevenuePerUser(monetizationEvents),
      topPurchases: this.getTopPurchases(monetizationEvents),
      conversionRate: this.calculateConversionRate(monetizationEvents)
    };
  }

  // Helper methods for calculations
  private async calculateRetentionRate(projectId: string, startDate: Date, endDate: Date): Promise<number> {
    // Simplified retention calculation
    const totalUserSessions = await prisma.gameSession.findMany({
      where: {
        projectId,
        startTime: { gte: startDate, lte: endDate }
      },
      select: { userId: true }
    });
    const totalUsers = new Set(totalUserSessions.filter(s => s.userId).map(s => s.userId)).size;

    const returningUserSessions = await prisma.gameSession.findMany({
      where: {
        projectId,
        startTime: { gte: startDate, lte: endDate },
        userId: { not: null }
      },
      select: { userId: true }
    });
    const returningUsers = new Set(returningUserSessions.map(s => s.userId)).size;

    return totalUsers > 0 ? returningUsers / totalUsers : 0;
  }

  private async calculateUserRetentionRate(userId: string, projectId: string): Promise<number> {
    // Simplified user retention calculation
    const sessions = await prisma.gameSession.findMany({
      where: { userId, projectId },
      orderBy: { startTime: 'desc' },
      take: 30 // Last 30 sessions
    });

    if (sessions.length < 2) return 0;

    const daysSinceFirst = (sessions[0].startTime.getTime() - sessions[sessions.length - 1].startTime.getTime()) / (1000 * 60 * 60 * 24);
    return Math.min(sessions.length / daysSinceFirst, 1);
  }

  private async calculateDailyRetention(projectId: string, startDate: Date, endDate: Date): Promise<number[]> {
    // TODO: Implement daily retention calculation
    return [0.8, 0.6, 0.5, 0.4, 0.35, 0.3, 0.25]; // Mock data
  }

  private async calculateWeeklyRetention(projectId: string, startDate: Date, endDate: Date): Promise<number[]> {
    // TODO: Implement weekly retention calculation
    return [0.7, 0.5, 0.4, 0.3]; // Mock data
  }

  private getTopEvents(events: any[]): any[] {
    const eventCounts = events.reduce((counts, event) => {
      counts[event.eventName] = (counts[event.eventName] || 0) + 1;
      return counts;
    }, {});

    return Object.entries(eventCounts)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }

  private getPlatformDistribution(events: any[]): any[] {
    const platformCounts = events.reduce((counts, event) => {
      const platform = event.platform || 'unknown';
      counts[platform] = (counts[platform] || 0) + 1;
      return counts;
    }, {});

    return Object.entries(platformCounts)
      .map(([platform, count]) => ({ platform, count }));
  }

  private calculateAvgMetric(events: any[], metricName: string): number {
    const values = events
      .map(e => e.metrics?.[metricName])
      .filter(v => typeof v === 'number');
    
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  }

  private calculateCrashRate(events: any[]): number {
    const crashEvents = events.filter(e => e.eventName === 'crash');
    return events.length > 0 ? crashEvents.length / events.length : 0;
  }

  private calculateTotalRevenue(events: any[]): number {
    return events
      .map(e => e.metrics?.revenue || 0)
      .reduce((sum, revenue) => sum + revenue, 0);
  }

  private calculateAvgRevenuePerUser(events: any[]): number {
    const uniqueUsers = new Set(events.filter(e => e.userId).map(e => e.userId)).size;
    const totalRevenue = this.calculateTotalRevenue(events);
    return uniqueUsers > 0 ? totalRevenue / uniqueUsers : 0;
  }

  private getTopPurchases(events: any[]): any[] {
    const purchaseCounts = events.reduce((counts, event) => {
      const item = event.eventData?.item || 'unknown';
      counts[item] = (counts[item] || 0) + 1;
      return counts;
    }, {});

    return Object.entries(purchaseCounts)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 10)
      .map(([item, count]) => ({ item, count }));
  }

  private calculateConversionRate(events: any[]): number {
    const purchaseEvents = events.filter(e => e.eventName === 'purchase');
    const viewEvents = events.filter(e => e.eventName === 'item_view');
    return viewEvents.length > 0 ? purchaseEvents.length / viewEvents.length : 0;
  }

  private generateReportSummary(data: any): string {
    return `Game analytics report generated with ${data.totalEvents || 0} events and ${data.totalSessions || 0} sessions.`;
  }

  private generateInsights(data: any, reportType: string): string[] {
    // Generate AI-powered insights based on data patterns
    const insights: string[] = [];

    if (reportType === 'overview') {
      if (data.avgSessionDuration > 600) {
        insights.push('High engagement: Average session duration exceeds 10 minutes');
      }
      if (data.uniqueUsers / data.totalSessions < 0.3) {
        insights.push('High retention: Users are returning for multiple sessions');
      }
    }

    return insights;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
  }
}

export const gameAnalyticsService = GameAnalyticsService.getInstance();