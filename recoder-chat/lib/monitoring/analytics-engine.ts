/**
 * Advanced Analytics & Monitoring Engine for Recoder.xyz
 * Real-time metrics, user behavior analysis, and AI performance tracking
 */

import { EventEmitter } from 'events';

interface UserAction {
  userId: string;
  sessionId: string;
  action: string;
  timestamp: number;
  metadata: {
    platform: 'web' | 'chat' | 'mobile' | 'desktop' | 'extension';
    aiProvider?: string;
    aiModel?: string;
    codeLanguage?: string;
    collaborationSession?: string;
    duration?: number;
    success?: boolean;
  };
}

interface AIUsageMetrics {
  provider: string;
  model: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  totalTokens: number;
  totalCost: number;
  cacheHitRate: number;
  lastUsed: number;
}

interface PlatformMetrics {
  platform: string;
  activeUsers: number;
  totalSessions: number;
  avgSessionDuration: number;
  codeGenerations: number;
  collaborativeSessions: number;
  errorRate: number;
  performanceScore: number;
}

interface SystemHealth {
  timestamp: number;
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  storage: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    requestsPerSecond: number;
    bytesTransferred: number;
    errorRate: number;
  };
  database: {
    connections: number;
    queryTime: number;
    errorRate: number;
  };
}

/**
 * Analytics Engine for comprehensive monitoring
 */
export class AnalyticsEngine extends EventEmitter {
  private userActions: UserAction[] = [];
  private aiMetrics = new Map<string, AIUsageMetrics>();
  private platformMetrics = new Map<string, PlatformMetrics>();
  private systemHealth: SystemHealth[] = [];
  private activeUsers = new Set<string>();
  private activeSessions = new Map<string, { userId: string; startTime: number; platform: string }>();
  
  constructor() {
    super();
    this.startHealthMonitoring();
    this.startAnalyticsAggregation();
  }

  /**
   * Track user action with detailed context
   */
  trackAction(action: UserAction): void {
    // Add to actions log
    this.userActions.push(action);
    
    // Track active users
    this.activeUsers.add(action.userId);
    
    // Track sessions
    if (!this.activeSessions.has(action.sessionId)) {
      this.activeSessions.set(action.sessionId, {
        userId: action.userId,
        startTime: action.timestamp,
        platform: action.metadata.platform
      });
    }
    
    // Update platform metrics
    this.updatePlatformMetrics(action);
    
    // Track AI usage if applicable
    if (action.metadata.aiProvider && action.metadata.aiModel) {
      this.trackAIUsage(action);
    }
    
    // Emit event for real-time listeners
    this.emit('action', action);
    
    // Clean up old data
    this.cleanupOldData();
    
    console.log(`📊 Tracked action: ${action.action} for user ${action.userId}`);
  }

  /**
   * Track AI model usage and performance
   */
  trackAIUsage(action: UserAction): void {
    const key = `${action.metadata.aiProvider}:${action.metadata.aiModel}`;
    const existing = this.aiMetrics.get(key);
    
    if (existing) {
      existing.totalRequests++;
      if (action.metadata.success) {
        existing.successfulRequests++;
      } else {
        existing.failedRequests++;
      }
      
      if (action.metadata.duration) {
        existing.avgResponseTime = (existing.avgResponseTime + action.metadata.duration) / 2;
      }
      
      existing.lastUsed = action.timestamp;
    } else {
      this.aiMetrics.set(key, {
        provider: action.metadata.aiProvider!,
        model: action.metadata.aiModel!,
        totalRequests: 1,
        successfulRequests: action.metadata.success ? 1 : 0,
        failedRequests: action.metadata.success ? 0 : 1,
        avgResponseTime: action.metadata.duration || 0,
        totalTokens: 0,
        totalCost: 0,
        cacheHitRate: 0,
        lastUsed: action.timestamp
      });
    }
  }

  /**
   * Update platform-specific metrics
   */
  updatePlatformMetrics(action: UserAction): void {
    const platform = action.metadata.platform;
    const existing = this.platformMetrics.get(platform);
    
    if (existing) {
      // Update metrics based on action type
      if (action.action === 'code_generation') {
        existing.codeGenerations++;
      } else if (action.action === 'collaboration_join') {
        existing.collaborativeSessions++;
      }
      
      existing.totalSessions = this.getSessionCount(platform);
      existing.activeUsers = this.getActiveUserCount(platform);
    } else {
      this.platformMetrics.set(platform, {
        platform,
        activeUsers: 1,
        totalSessions: 1,
        avgSessionDuration: 0,
        codeGenerations: action.action === 'code_generation' ? 1 : 0,
        collaborativeSessions: action.action === 'collaboration_join' ? 1 : 0,
        errorRate: 0,
        performanceScore: 100
      });
    }
  }

  /**
   * Record system health metrics
   */
  recordSystemHealth(health: Omit<SystemHealth, 'timestamp'>): void {
    const healthRecord: SystemHealth = {
      ...health,
      timestamp: Date.now()
    };
    
    this.systemHealth.push(healthRecord);
    
    // Keep only last 1000 health records
    if (this.systemHealth.length > 1000) {
      this.systemHealth = this.systemHealth.slice(-1000);
    }
    
    this.emit('health', healthRecord);
  }

  /**
   * Get real-time analytics dashboard data
   */
  getDashboardData(): {
    overview: any;
    aiMetrics: AIUsageMetrics[];
    platformMetrics: PlatformMetrics[];
    systemHealth: SystemHealth;
    recentActions: UserAction[];
  } {
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    
    // Filter recent actions
    const recentActions = this.userActions
      .filter(action => action.timestamp > last24h)
      .slice(-100);
    
    // Calculate overview metrics
    const overview = {
      totalUsers: this.activeUsers.size,
      activeSessions: this.activeSessions.size,
      totalActions: recentActions.length,
      avgResponseTime: this.getAverageResponseTime(),
      systemStatus: this.getSystemStatus(),
      uptime: this.getUptime(),
      costOptimization: this.getCostOptimizationScore()
    };
    
    return {
      overview,
      aiMetrics: Array.from(this.aiMetrics.values()),
      platformMetrics: Array.from(this.platformMetrics.values()),
      systemHealth: this.systemHealth[this.systemHealth.length - 1] || this.getDefaultHealth(),
      recentActions
    };
  }

  /**
   * Get AI performance analytics
   */
  getAIAnalytics(): {
    providerComparison: any[];
    modelPerformance: any[];
    costAnalysis: any[];
    cacheEfficiency: any[];
  } {
    const aiMetrics = Array.from(this.aiMetrics.values());
    
    // Provider comparison
    const providerStats = new Map<string, {
      requests: number;
      successRate: number;
      avgResponseTime: number;
      cost: number;
    }>();
    
    aiMetrics.forEach(metric => {
      const existing = providerStats.get(metric.provider);
      if (existing) {
        existing.requests += metric.totalRequests;
        existing.successRate = (existing.successRate + (metric.successfulRequests / metric.totalRequests)) / 2;
        existing.avgResponseTime = (existing.avgResponseTime + metric.avgResponseTime) / 2;
        existing.cost += metric.totalCost;
      } else {
        providerStats.set(metric.provider, {
          requests: metric.totalRequests,
          successRate: metric.successfulRequests / metric.totalRequests,
          avgResponseTime: metric.avgResponseTime,
          cost: metric.totalCost
        });
      }
    });
    
    return {
      providerComparison: Array.from(providerStats.entries()).map(([provider, stats]) => ({
        provider,
        ...stats
      })),
      modelPerformance: aiMetrics.sort((a, b) => b.totalRequests - a.totalRequests),
      costAnalysis: aiMetrics.map(metric => ({
        provider: metric.provider,
        model: metric.model,
        totalCost: metric.totalCost,
        costPerRequest: metric.totalCost / metric.totalRequests,
        tokens: metric.totalTokens
      })),
      cacheEfficiency: aiMetrics.map(metric => ({
        provider: metric.provider,
        model: metric.model,
        hitRate: metric.cacheHitRate,
        requests: metric.totalRequests
      }))
    };
  }

  /**
   * Get user behavior insights
   */
  getUserInsights(): {
    userFlow: any[];
    platformUsage: any[];
    featureAdoption: any[];
    sessionPatterns: any[];
  } {
    const now = Date.now();
    const last7days = now - (7 * 24 * 60 * 60 * 1000);
    
    const recentActions = this.userActions.filter(action => action.timestamp > last7days);
    
    // User flow analysis
    const userFlow = this.analyzeUserFlow(recentActions);
    
    // Platform usage distribution
    const platformUsage = this.analyzePlatformUsage(recentActions);
    
    // Feature adoption rates
    const featureAdoption = this.analyzeFeatureAdoption(recentActions);
    
    // Session patterns
    const sessionPatterns = this.analyzeSessionPatterns();
    
    return {
      userFlow,
      platformUsage,
      featureAdoption,
      sessionPatterns
    };
  }

  /**
   * Start monitoring system health
   */
  private startHealthMonitoring(): void {
    setInterval(() => {
      // Simulate system health data (in production, use real metrics)
      const health = {
        cpu: {
          usage: Math.random() * 100,
          cores: 8
        },
        memory: {
          used: Math.random() * 8000,
          total: 16000,
          percentage: Math.random() * 100
        },
        storage: {
          used: Math.random() * 100,
          total: 500,
          percentage: Math.random() * 100
        },
        network: {
          requestsPerSecond: Math.random() * 1000,
          bytesTransferred: Math.random() * 1000000,
          errorRate: Math.random() * 5
        },
        database: {
          connections: Math.floor(Math.random() * 100),
          queryTime: Math.random() * 100,
          errorRate: Math.random() * 2
        }
      };
      
      this.recordSystemHealth(health);
    }, 30000); // Every 30 seconds
  }

  /**
   * Start analytics aggregation
   */
  private startAnalyticsAggregation(): void {
    setInterval(() => {
      // Aggregate and clean up analytics data
      this.aggregateMetrics();
      this.cleanupOldData();
    }, 300000); // Every 5 minutes
  }

  /**
   * Aggregate metrics for efficiency
   */
  private aggregateMetrics(): void {
    // Update session durations
    const now = Date.now();
    for (const [sessionId, session] of this.activeSessions.entries()) {
      const duration = now - session.startTime;
      const platform = this.platformMetrics.get(session.platform);
      if (platform) {
        platform.avgSessionDuration = (platform.avgSessionDuration + duration) / 2;
      }
    }
    
    console.log('📊 Aggregated analytics metrics');
  }

  /**
   * Clean up old data to prevent memory leaks
   */
  private cleanupOldData(): void {
    const now = Date.now();
    const retentionPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    // Clean up old actions
    this.userActions = this.userActions.filter(
      action => now - action.timestamp < retentionPeriod
    );
    
    // Clean up inactive sessions
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.startTime > 24 * 60 * 60 * 1000) { // 24 hours
        this.activeSessions.delete(sessionId);
      }
    }
    
    // Clean up inactive users (haven't acted in 1 hour)
    const recentUsers = new Set<string>();
    this.userActions
      .filter(action => now - action.timestamp < 60 * 60 * 1000) // 1 hour
      .forEach(action => recentUsers.add(action.userId));
    
    this.activeUsers = recentUsers;
  }

  // Helper methods
  private getSessionCount(platform: string): number {
    return Array.from(this.activeSessions.values())
      .filter(session => session.platform === platform).length;
  }

  private getActiveUserCount(platform: string): number {
    const now = Date.now();
    const last1h = now - (60 * 60 * 1000);
    
    return new Set(
      this.userActions
        .filter(action => 
          action.timestamp > last1h && 
          action.metadata.platform === platform
        )
        .map(action => action.userId)
    ).size;
  }

  private getAverageResponseTime(): number {
    const aiMetrics = Array.from(this.aiMetrics.values());
    if (aiMetrics.length === 0) return 0;
    
    const totalTime = aiMetrics.reduce((sum, metric) => sum + metric.avgResponseTime, 0);
    return totalTime / aiMetrics.length;
  }

  private getSystemStatus(): 'healthy' | 'warning' | 'critical' {
    const latestHealth = this.systemHealth[this.systemHealth.length - 1];
    if (!latestHealth) return 'healthy';
    
    if (latestHealth.cpu.usage > 90 || latestHealth.memory.percentage > 90) {
      return 'critical';
    } else if (latestHealth.cpu.usage > 70 || latestHealth.memory.percentage > 70) {
      return 'warning';
    }
    
    return 'healthy';
  }

  private getUptime(): number {
    // Simplified uptime calculation (in production, use real uptime)
    return Math.floor(Date.now() / 1000);
  }

  private getCostOptimizationScore(): number {
    const aiMetrics = Array.from(this.aiMetrics.values());
    if (aiMetrics.length === 0) return 100;
    
    // Calculate score based on local AI usage vs cloud AI
    const localRequests = aiMetrics
      .filter(metric => metric.provider === 'ollama' || metric.provider === 'lm-studio')
      .reduce((sum, metric) => sum + metric.totalRequests, 0);
    
    const totalRequests = aiMetrics.reduce((sum, metric) => sum + metric.totalRequests, 0);
    
    return Math.round((localRequests / totalRequests) * 100);
  }

  private getDefaultHealth(): SystemHealth {
    return {
      timestamp: Date.now(),
      cpu: { usage: 0, cores: 8 },
      memory: { used: 0, total: 16000, percentage: 0 },
      storage: { used: 0, total: 500, percentage: 0 },
      network: { requestsPerSecond: 0, bytesTransferred: 0, errorRate: 0 },
      database: { connections: 0, queryTime: 0, errorRate: 0 }
    };
  }

  private analyzeUserFlow(actions: UserAction[]): any[] {
    // Simplified user flow analysis
    const flowMap = new Map<string, number>();
    
    actions.forEach(action => {
      const key = `${action.metadata.platform}:${action.action}`;
      flowMap.set(key, (flowMap.get(key) || 0) + 1);
    });
    
    return Array.from(flowMap.entries()).map(([flow, count]) => ({
      flow,
      count,
      percentage: (count / actions.length) * 100
    }));
  }

  private analyzePlatformUsage(actions: UserAction[]): any[] {
    const platformMap = new Map<string, number>();
    
    actions.forEach(action => {
      const platform = action.metadata.platform;
      platformMap.set(platform, (platformMap.get(platform) || 0) + 1);
    });
    
    return Array.from(platformMap.entries()).map(([platform, count]) => ({
      platform,
      usage: count,
      percentage: (count / actions.length) * 100
    }));
  }

  private analyzeFeatureAdoption(actions: UserAction[]): any[] {
    const featureMap = new Map<string, Set<string>>();
    
    actions.forEach(action => {
      if (!featureMap.has(action.action)) {
        featureMap.set(action.action, new Set());
      }
      featureMap.get(action.action)!.add(action.userId);
    });
    
    return Array.from(featureMap.entries()).map(([feature, users]) => ({
      feature,
      uniqueUsers: users.size,
      adoptionRate: (users.size / this.activeUsers.size) * 100
    }));
  }

  private analyzeSessionPatterns(): any[] {
    const patterns = [];
    const now = Date.now();
    
    for (const session of this.activeSessions.values()) {
      const duration = now - session.startTime;
      patterns.push({
        platform: session.platform,
        duration,
        active: true
      });
    }
    
    return patterns;
  }
}

// Singleton instance
export const analyticsEngine = new AnalyticsEngine();

export default analyticsEngine;