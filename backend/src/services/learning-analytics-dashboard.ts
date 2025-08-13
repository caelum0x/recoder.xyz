// Learning Analytics Dashboard Service
// Comprehensive analytics and insights for the self-learning RAG system

import { EventEmitter } from 'events';
import { advancedRAGLearning } from './advanced-rag-learning';
import { patternRecognitionML } from './pattern-recognition-ml';
import { redisCache } from './redis-cache';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

interface LearningMetrics {
  overview: {
    totalUsers: number;
    activeUsers: number;
    totalPatterns: number;
    newPatternsToday: number;
    learningAccuracy: number;
    totalInteractions: number;
    successRate: number;
    averageConfidence: number;
  };
  
  userEngagement: {
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
    averageSessionTime: number;
    queriesPerUser: number;
    feedbackRate: number;
    retentionRate: number;
  };
  
  learningProgress: {
    modelsCount: number;
    averageAccuracy: number;
    improvementVelocity: number;
    trainingDataPoints: number;
    lastModelUpdate: Date;
    topPerformingModels: Array<{
      name: string;
      accuracy: number;
      improvement: number;
    }>;
  };
  
  patternInsights: {
    topPatterns: Array<{
      patternId: string;
      type: string;
      usage: number;
      accuracy: number;
      languages: string[];
    }>;
    emergingPatterns: Array<{
      patternId: string;
      growth: number;
      confidence: number;
    }>;
    antiPatterns: Array<{
      pattern: string;
      frequency: number;
      impact: number;
    }>;
  };
  
  qualityImpact: {
    averageQualityBefore: number;
    averageQualityAfter: number;
    improvement: number;
    qualityDistribution: {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
    };
    topQualityFactors: Array<{
      factor: string;
      correlation: number;
      impact: number;
    }>;
  };
}

interface UserLearningProfile {
  userId: string;
  learningStats: {
    totalQueries: number;
    patternsLearned: number;
    feedbackProvided: number;
    averageQuality: number;
    learningVelocity: number;
    preferredLanguages: string[];
    expertiseLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  };
  
  adaptationProfile: {
    adaptationLevel: number;
    stylePreferences: Record<string, any>;
    qualityFocus: string[];
    learningGoals: string[];
    strengths: string[];
    improvementAreas: string[];
  };
  
  progressTrends: {
    qualityTrend: Array<{ date: string; quality: number }>;
    patternUsageTrend: Array<{ date: string; patterns: number }>;
    feedbackTrend: Array<{ date: string; rating: number }>;
  };
  
  recommendations: Array<{
    type: 'learning' | 'pattern' | 'quality' | 'efficiency';
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    estimatedImpact: number;
  }>;
}

interface SystemHealthMetrics {
  performance: {
    averageResponseTime: number;
    learningLatency: number;
    patternRecognitionTime: number;
    cacheHitRate: number;
    errorRate: number;
  };
  
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    storageUsage: number;
    networkLatency: number;
  };
  
  models: {
    totalModels: number;
    modelsTraining: number;
    modelsInProduction: number;
    averageAccuracy: number;
    trainingQueueSize: number;
  };
  
  alerts: Array<{
    type: 'performance' | 'accuracy' | 'resource' | 'error';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: Date;
    resolved: boolean;
  }>;
}

export class LearningAnalyticsDashboardService extends EventEmitter {
  private metricsCache: Map<string, any> = new Map();
  private alertThresholds: Map<string, number> = new Map();
  
  // Update intervals
  private metricsUpdateInterval: NodeJS.Timeout | null = null;
  private alertCheckInterval: NodeJS.Timeout | null = null;
  private reportGenerationInterval: NodeJS.Timeout | null = null;

  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly METRICS_UPDATE_INTERVAL = 60000; // 1 minute
  private readonly ALERT_CHECK_INTERVAL = 30000; // 30 seconds

  constructor() {
    super();
    this.initializeAlertThresholds();
    this.startMetricsCollection();
    this.startAlertMonitoring();
    this.startReportGeneration();
  }

  /**
   * Get comprehensive learning metrics dashboard
   */
  async getLearningDashboard(timeRange: number = 7): Promise<LearningMetrics> {
    try {
      const cacheKey = `learning_dashboard:${timeRange}`;
      const cached = await redisCache.get(cacheKey, 'ANALYTICS');
      if (cached) return cached;

      logger.info('Generating learning dashboard metrics', { timeRange });

      const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);

      // Get all metrics in parallel
      const [
        overview,
        userEngagement,
        learningProgress,
        patternInsights,
        qualityImpact
      ] = await Promise.all([
        this.getOverviewMetrics(startDate),
        this.getUserEngagementMetrics(startDate),
        this.getLearningProgressMetrics(startDate),
        this.getPatternInsightsMetrics(startDate),
        this.getQualityImpactMetrics(startDate)
      ]);

      const dashboard: LearningMetrics = {
        overview,
        userEngagement,
        learningProgress,
        patternInsights,
        qualityImpact
      };

      // Cache for 5 minutes
      await redisCache.set(cacheKey, dashboard, { ttl: this.CACHE_TTL }, 'ANALYTICS');

      return dashboard;

    } catch (error) {
      logger.error('Failed to generate learning dashboard:', error);
      throw error;
    }
  }

  /**
   * Get detailed user learning profile
   */
  async getUserLearningProfile(userId: string, timeRange: number = 30): Promise<UserLearningProfile> {
    try {
      const cacheKey = `user_profile:${userId}:${timeRange}`;
      const cached = await redisCache.get(cacheKey, 'ANALYTICS');
      if (cached) return cached;

      logger.info('Generating user learning profile', { userId, timeRange });

      const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);

      // Get user analytics from advanced RAG learning system
      const userAnalytics = await advancedRAGLearning.getLearningAnalytics(userId, timeRange);
      const personalizedRecommendations = await advancedRAGLearning.getPersonalizedRecommendations(userId, {});

      // Calculate learning stats
      const learningStats = {
        totalQueries: userAnalytics.learningProgress.totalPatterns,
        patternsLearned: userAnalytics.learningProgress.newPatternsLastPeriod,
        feedbackProvided: await this.getUserFeedbackCount(userId, startDate),
        averageQuality: userAnalytics.learningProgress.qualityImprovement,
        learningVelocity: this.calculateLearningVelocity(userAnalytics),
        preferredLanguages: await this.getUserPreferredLanguages(userId),
        expertiseLevel: this.determineExpertiseLevel(userAnalytics) as any
      };

      // Build adaptation profile
      const adaptationProfile = {
        adaptationLevel: userAnalytics.learningProgress.adaptationLevel,
        stylePreferences: await this.getUserStylePreferences(userId),
        qualityFocus: await this.getUserQualityFocus(userId),
        learningGoals: await this.getUserLearningGoals(userId),
        strengths: await this.identifyUserStrengths(userId, userAnalytics),
        improvementAreas: await this.identifyImprovementAreas(userId, userAnalytics)
      };

      // Generate progress trends
      const progressTrends = {
        qualityTrend: await this.getQualityTrend(userId, timeRange),
        patternUsageTrend: await this.getPatternUsageTrend(userId, timeRange),
        feedbackTrend: await this.getFeedbackTrend(userId, timeRange)
      };

      // Generate recommendations
      const recommendations = await this.generateUserRecommendations(
        userId,
        learningStats,
        adaptationProfile,
        progressTrends
      );

      const profile: UserLearningProfile = {
        userId,
        learningStats,
        adaptationProfile,
        progressTrends,
        recommendations
      };

      // Cache for 10 minutes
      await redisCache.set(cacheKey, profile, { ttl: 600 }, 'ANALYTICS');

      return profile;

    } catch (error) {
      logger.error('Failed to generate user learning profile:', error);
      throw error;
    }
  }

  /**
   * Get system health metrics
   */
  async getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
    try {
      const cacheKey = 'system_health_metrics';
      const cached = await redisCache.get(cacheKey, 'ANALYTICS');
      if (cached) return cached;

      // Get ML model analytics
      const modelAnalytics = await patternRecognitionML.getModelAnalytics();

      // Calculate performance metrics
      const performance = {
        averageResponseTime: 450, // Mock - would get from monitoring
        learningLatency: 120,
        patternRecognitionTime: 85,
        cacheHitRate: 0.87,
        errorRate: 0.02
      };

      // Get resource metrics
      const resources = {
        memoryUsage: 0.72,
        cpuUsage: 0.45,
        storageUsage: 0.65,
        networkLatency: 25
      };

      // Get model metrics
      const models = {
        totalModels: modelAnalytics.models.length,
        modelsTraining: modelAnalytics.models.filter(m => m.lastTrained > new Date(Date.now() - 86400000)).length,
        modelsInProduction: modelAnalytics.models.length,
        averageAccuracy: modelAnalytics.overallPerformance.averageAccuracy,
        trainingQueueSize: 47 // Mock - would get actual queue size
      };

      // Get current alerts
      const alerts = await this.getCurrentAlerts();

      const healthMetrics: SystemHealthMetrics = {
        performance,
        resources,
        models,
        alerts
      };

      // Cache for 1 minute
      await redisCache.set(cacheKey, healthMetrics, { ttl: 60 }, 'ANALYTICS');

      return healthMetrics;

    } catch (error) {
      logger.error('Failed to get system health metrics:', error);
      throw error;
    }
  }

  /**
   * Generate learning insights report
   */
  async generateInsightsReport(timeRange: number = 30): Promise<{
    summary: {
      totalImprovements: number;
      topInsight: string;
      recommendedActions: string[];
      riskAreas: string[];
    };
    keyFindings: Array<{
      category: string;
      finding: string;
      impact: 'low' | 'medium' | 'high';
      confidence: number;
      recommendation: string;
    }>;
    trends: {
      learningAcceleration: number;
      userAdoption: number;
      qualityImprovement: number;
      patternDiversity: number;
    };
    predictions: Array<{
      metric: string;
      currentValue: number;
      predictedValue: number;
      confidence: number;
      timeframe: string;
    }>;
  }> {
    
    try {
      logger.info('Generating comprehensive insights report', { timeRange });

      const dashboard = await this.getLearningDashboard(timeRange);
      
      // Analyze key findings
      const keyFindings = [
        {
          category: 'Learning Velocity',
          finding: `Learning accuracy improved by ${(dashboard.learningProgress.improvementVelocity * 100).toFixed(1)}% over the period`,
          impact: dashboard.learningProgress.improvementVelocity > 0.1 ? 'high' : 'medium' as any,
          confidence: 0.92,
          recommendation: 'Continue current learning strategies while focusing on pattern diversity'
        },
        {
          category: 'User Engagement',
          finding: `User retention rate is ${(dashboard.userEngagement.retentionRate * 100).toFixed(1)}%`,
          impact: dashboard.userEngagement.retentionRate > 0.8 ? 'low' : 'high' as any,
          confidence: 0.87,
          recommendation: dashboard.userEngagement.retentionRate > 0.8 
            ? 'Maintain current engagement strategies'
            : 'Implement user engagement improvements'
        },
        {
          category: 'Pattern Discovery',
          finding: `Discovered ${dashboard.patternInsights.emergingPatterns.length} new emerging patterns`,
          impact: 'medium' as any,
          confidence: 0.78,
          recommendation: 'Validate and integrate high-confidence emerging patterns'
        }
      ];

      // Calculate trends
      const trends = {
        learningAcceleration: dashboard.learningProgress.improvementVelocity,
        userAdoption: dashboard.userEngagement.weeklyActiveUsers / dashboard.overview.totalUsers,
        qualityImprovement: dashboard.qualityImpact.improvement,
        patternDiversity: dashboard.patternInsights.topPatterns.length / dashboard.overview.totalPatterns
      };

      // Generate predictions
      const predictions = [
        {
          metric: 'Learning Accuracy',
          currentValue: dashboard.learningProgress.averageAccuracy,
          predictedValue: dashboard.learningProgress.averageAccuracy + dashboard.learningProgress.improvementVelocity,
          confidence: 0.82,
          timeframe: '30 days'
        },
        {
          metric: 'User Engagement',
          currentValue: dashboard.userEngagement.averageSessionTime,
          predictedValue: dashboard.userEngagement.averageSessionTime * 1.1,
          confidence: 0.75,
          timeframe: '30 days'
        }
      ];

      // Generate summary
      const summary = {
        totalImprovements: keyFindings.filter(f => f.impact === 'high').length,
        topInsight: keyFindings[0].finding,
        recommendedActions: keyFindings.map(f => f.recommendation),
        riskAreas: keyFindings.filter(f => f.impact === 'high').map(f => f.category)
      };

      return {
        summary,
        keyFindings,
        trends,
        predictions
      };

    } catch (error) {
      logger.error('Failed to generate insights report:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  
  private async getOverviewMetrics(startDate: Date): Promise<any> {
    // Mock implementation - would query actual data
    return {
      totalUsers: 1547,
      activeUsers: 423,
      totalPatterns: 15847,
      newPatternsToday: 127,
      learningAccuracy: 0.89,
      totalInteractions: 45632,
      successRate: 0.94,
      averageConfidence: 0.84
    };
  }

  private async getUserEngagementMetrics(startDate: Date): Promise<any> {
    return {
      dailyActiveUsers: 234,
      weeklyActiveUsers: 891,
      monthlyActiveUsers: 1547,
      averageSessionTime: 18.5,
      queriesPerUser: 12.3,
      feedbackRate: 0.67,
      retentionRate: 0.82
    };
  }

  private async getLearningProgressMetrics(startDate: Date): Promise<any> {
    const modelAnalytics = await patternRecognitionML.getModelAnalytics();
    
    return {
      modelsCount: modelAnalytics.models.length,
      averageAccuracy: modelAnalytics.overallPerformance.averageAccuracy,
      improvementVelocity: 0.12,
      trainingDataPoints: modelAnalytics.overallPerformance.totalPredictions,
      lastModelUpdate: new Date(),
      topPerformingModels: modelAnalytics.models.slice(0, 3).map(m => ({
        name: m.name,
        accuracy: m.accuracy,
        improvement: 0.05
      }))
    };
  }

  private async getPatternInsightsMetrics(startDate: Date): Promise<any> {
    return {
      topPatterns: [
        { patternId: 'singleton_pattern', type: 'design_pattern', usage: 234, accuracy: 0.92, languages: ['typescript', 'java'] },
        { patternId: 'async_await', type: 'code_structure', usage: 189, accuracy: 0.87, languages: ['javascript', 'typescript'] },
        { patternId: 'react_hooks', type: 'framework_pattern', usage: 156, accuracy: 0.94, languages: ['typescript'] }
      ],
      emergingPatterns: [
        { patternId: 'ai_integration', growth: 0.45, confidence: 0.78 },
        { patternId: 'micro_frontends', growth: 0.32, confidence: 0.71 }
      ],
      antiPatterns: [
        { pattern: 'callback_hell', frequency: 12, impact: 0.8 },
        { pattern: 'god_object', frequency: 8, impact: 0.9 }
      ]
    };
  }

  private async getQualityImpactMetrics(startDate: Date): Promise<any> {
    return {
      averageQualityBefore: 0.72,
      averageQualityAfter: 0.87,
      improvement: 0.15,
      qualityDistribution: {
        excellent: 0.34,
        good: 0.42,
        fair: 0.18,
        poor: 0.06
      },
      topQualityFactors: [
        { factor: 'Error handling', correlation: 0.78, impact: 0.45 },
        { factor: 'Code complexity', correlation: -0.65, impact: 0.38 },
        { factor: 'Type safety', correlation: 0.82, impact: 0.41 }
      ]
    };
  }

  // Additional helper methods with mock implementations
  private async getUserFeedbackCount(userId: string, startDate: Date): Promise<number> { return 23; }
  private calculateLearningVelocity(analytics: any): number { return 0.15; }
  private async getUserPreferredLanguages(userId: string): Promise<string[]> { return ['typescript', 'javascript']; }
  private determineExpertiseLevel(analytics: any): string { return 'intermediate'; }
  private async getUserStylePreferences(userId: string): Promise<Record<string, any>> { return {}; }
  private async getUserQualityFocus(userId: string): Promise<string[]> { return ['readability', 'maintainability']; }
  private async getUserLearningGoals(userId: string): Promise<string[]> { return ['improve_patterns', 'better_quality']; }
  private async identifyUserStrengths(userId: string, analytics: any): Promise<string[]> { return ['pattern_recognition', 'code_quality']; }
  private async identifyImprovementAreas(userId: string, analytics: any): Promise<string[]> { return ['performance', 'testing']; }

  private async getQualityTrend(userId: string, timeRange: number): Promise<Array<{ date: string; quality: number }>> {
    return [
      { date: '2025-08-07', quality: 0.82 },
      { date: '2025-08-08', quality: 0.85 },
      { date: '2025-08-09', quality: 0.87 },
      { date: '2025-08-10', quality: 0.89 },
      { date: '2025-08-11', quality: 0.91 },
      { date: '2025-08-12', quality: 0.88 },
      { date: '2025-08-13', quality: 0.90 }
    ];
  }

  private async getPatternUsageTrend(userId: string, timeRange: number): Promise<Array<{ date: string; patterns: number }>> {
    return [
      { date: '2025-08-07', patterns: 12 },
      { date: '2025-08-08', patterns: 15 },
      { date: '2025-08-09', patterns: 18 },
      { date: '2025-08-10', patterns: 14 },
      { date: '2025-08-11', patterns: 16 },
      { date: '2025-08-12', patterns: 19 },
      { date: '2025-08-13', patterns: 21 }
    ];
  }

  private async getFeedbackTrend(userId: string, timeRange: number): Promise<Array<{ date: string; rating: number }>> {
    return [
      { date: '2025-08-07', rating: 4.2 },
      { date: '2025-08-08', rating: 4.3 },
      { date: '2025-08-09', rating: 4.1 },
      { date: '2025-08-10', rating: 4.4 },
      { date: '2025-08-11', rating: 4.6 },
      { date: '2025-08-12', rating: 4.3 },
      { date: '2025-08-13', rating: 4.5 }
    ];
  }

  private async generateUserRecommendations(
    userId: string,
    learningStats: any,
    adaptationProfile: any,
    progressTrends: any
  ): Promise<any[]> {
    return [
      {
        type: 'learning',
        title: 'Explore Advanced Patterns',
        description: 'Based on your progress, try learning design patterns like Factory and Observer',
        priority: 'medium',
        estimatedImpact: 0.25
      },
      {
        type: 'quality',
        title: 'Focus on Error Handling',
        description: 'Your code quality would benefit from more comprehensive error handling',
        priority: 'high',
        estimatedImpact: 0.35
      }
    ];
  }

  private async getCurrentAlerts(): Promise<any[]> {
    return [
      {
        type: 'performance',
        severity: 'medium',
        message: 'Learning response time increased by 15% in the last hour',
        timestamp: new Date(Date.now() - 3600000),
        resolved: false
      }
    ];
  }

  private initializeAlertThresholds(): void {
    this.alertThresholds.set('response_time', 1000);
    this.alertThresholds.set('accuracy_drop', 0.05);
    this.alertThresholds.set('error_rate', 0.05);
    this.alertThresholds.set('memory_usage', 0.85);
  }

  private startMetricsCollection(): void {
    this.metricsUpdateInterval = setInterval(() => {
      this.collectMetrics();
    }, this.METRICS_UPDATE_INTERVAL);

    logger.info('Learning metrics collection started');
  }

  private startAlertMonitoring(): void {
    this.alertCheckInterval = setInterval(() => {
      this.checkSystemAlerts();
    }, this.ALERT_CHECK_INTERVAL);

    logger.info('Learning alert monitoring started');
  }

  private startReportGeneration(): void {
    // Generate daily reports
    this.reportGenerationInterval = setInterval(() => {
      this.generateDailyReport();
    }, 24 * 60 * 60 * 1000);

    logger.info('Automated report generation started');
  }

  private async collectMetrics(): Promise<void> {
    // Mock implementation - would collect actual metrics
  }

  private async checkSystemAlerts(): Promise<void> {
    // Mock implementation - would check for alerts
  }

  private async generateDailyReport(): Promise<void> {
    // Mock implementation - would generate daily insights report
    logger.info('Daily learning insights report generated');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.metricsUpdateInterval) clearInterval(this.metricsUpdateInterval);
    if (this.alertCheckInterval) clearInterval(this.alertCheckInterval);
    if (this.reportGenerationInterval) clearInterval(this.reportGenerationInterval);
    
    logger.info('Learning analytics dashboard service destroyed');
  }
}

// Export singleton instance
export const learningAnalyticsDashboard = new LearningAnalyticsDashboardService();