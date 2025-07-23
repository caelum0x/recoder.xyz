/**
 * User Satisfaction Tracking System
 * 
 * Comprehensive system for tracking, analyzing, and improving user satisfaction
 * with AI model outputs. Includes feedback collection, sentiment analysis,
 * satisfaction scoring, and actionable insights for model improvement.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';

export interface UserFeedback {
  id: string;
  userId?: string;
  sessionId: string;
  timestamp: Date;
  
  // Request context
  requestId: string;
  modelName: string;
  provider: string;
  taskType: string;
  prompt?: string;
  
  // Feedback data
  rating: number;                     // 1-5 star rating
  sentiment: 'positive' | 'neutral' | 'negative';
  feedbackText?: string;              // Optional text feedback
  
  // Specific feedback categories
  categories: {
    accuracy: number;                 // 1-5 rating
    helpfulness: number;              // 1-5 rating
    clarity: number;                  // 1-5 rating
    completeness: number;             // 1-5 rating
    creativity: number;               // 1-5 rating
    speed: number;                    // 1-5 rating
  };
  
  // Behavioral indicators
  behavior: {
    accepted: boolean;                // User accepted the output
    modified: boolean;                // User modified the output
    regenerated: boolean;             // User requested regeneration
    timeToReview: number;             // Time spent reviewing (ms)
    followUpQuestions: number;        // Number of follow-up questions
  };
  
  // Context information
  context: {
    userExperience: 'beginner' | 'intermediate' | 'expert';
    taskComplexity: 'low' | 'medium' | 'high';
    urgency: 'low' | 'medium' | 'high';
    previousInteractions: number;     // Count of previous interactions
  };
  
  // Metadata
  source: 'explicit' | 'implicit' | 'inferred';
  confidence: number;                 // 0-1 confidence in feedback quality
  processed: boolean;
  tags: string[];
}

export interface SatisfactionMetrics {
  modelName: string;
  timeframe: string;
  
  // Overall satisfaction
  overallSatisfaction: number;        // 0-1 overall satisfaction score
  totalFeedback: number;
  
  // Rating distribution
  ratingDistribution: {
    1: number; 2: number; 3: number; 4: number; 5: number;
  };
  
  // Category scores
  categoryScores: {
    accuracy: number;
    helpfulness: number;
    clarity: number;
    completeness: number;
    creativity: number;
    speed: number;
  };
  
  // Sentiment analysis
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  
  // Behavioral metrics
  behaviorMetrics: {
    acceptanceRate: number;           // % of outputs accepted
    modificationRate: number;         // % of outputs modified
    regenerationRate: number;         // % requiring regeneration
    avgReviewTime: number;            // Average review time (ms)
    followUpRate: number;             // % requiring follow-ups
  };
  
  // Trends
  trends: {
    satisfactionTrend: 'improving' | 'stable' | 'declining';
    trendStrength: number;            // 0-1 strength of trend
    weekOverWeek: number;             // % change from previous week
    monthOverMonth: number;           // % change from previous month
  };
  
  // Segments
  segmentBreakdown: {
    byExperience: Record<string, number>;
    byTaskType: Record<string, number>;
    byComplexity: Record<string, number>;
  };
}

export interface SatisfactionIssue {
  id: string;
  type: 'quality' | 'performance' | 'usability' | 'accuracy' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  
  // Issue details
  affectedModels: string[];
  affectedTaskTypes: string[];
  impactScore: number;                // 0-1 impact on satisfaction
  frequency: number;                  // How often this issue occurs
  
  // Evidence
  feedbackSamples: string[];          // Sample feedback texts
  commonKeywords: string[];           // Most common keywords in feedback
  userSegments: string[];             // Which user segments report this
  
  // Resolution
  status: 'open' | 'investigating' | 'resolved' | 'wont_fix';
  priority: number;                   // 1-5 priority score
  assignedTo?: string;
  resolution?: string;
  
  // Tracking
  detectedAt: Date;
  lastUpdated: Date;
  resolvedAt?: Date;
}

export interface SatisfactionInsight {
  id: string;
  type: 'opportunity' | 'strength' | 'concern' | 'trend';
  priority: 'low' | 'medium' | 'high';
  
  // Insight details
  title: string;
  description: string;
  evidence: string[];
  metrics: Record<string, number>;
  
  // Recommendations
  recommendations: InsightRecommendation[];
  
  // Impact
  potentialImpact: {
    satisfactionIncrease: number;     // Expected % increase
    userRetention: number;            // Expected retention improvement
    usageIncrease: number;            // Expected usage increase
  };
  
  // Metadata
  confidence: number;                 // 0-1 confidence in insight
  createdAt: Date;
  category: string;
}

export interface InsightRecommendation {
  type: 'model_training' | 'prompt_optimization' | 'ux_improvement' | 'feature_addition';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  actionItems: string[];
  estimatedEffort: 'low' | 'medium' | 'high';
  expectedImpact: 'low' | 'medium' | 'high';
  timeline: string;                   // e.g., "2-4 weeks"
}

export interface UserSegment {
  id: string;
  name: string;
  criteria: {
    experience?: string[];
    taskTypes?: string[];
    usageFrequency?: string;          // e.g., "daily", "weekly"
    satisfactionRange?: [number, number];
  };
  
  // Segment metrics
  userCount: number;
  avgSatisfaction: number;
  retentionRate: number;
  
  // Characteristics
  topTaskTypes: string[];
  commonIssues: string[];
  preferences: Record<string, any>;
}

export interface FeedbackAnalysisResult {
  feedbackId: string;
  
  // Extracted insights
  extractedTopics: string[];
  emotionalTone: {
    joy: number;
    anger: number;
    sadness: number;
    fear: number;
    surprise: number;
    disgust: number;
  };
  
  // Key phrases
  positiveKeywords: string[];
  negativeKeywords: string[];
  actionableKeywords: string[];
  
  // Classification
  categories: string[];
  urgency: 'low' | 'medium' | 'high';
  
  // Confidence scores
  sentimentConfidence: number;
  categoryConfidence: number;
  
  // Processing metadata
  processedAt: Date;
  processingTime: number;
}

export class UserSatisfactionTracker extends EventEmitter {
  private feedback: Map<string, UserFeedback> = new Map();
  private metrics: Map<string, SatisfactionMetrics> = new Map();
  private issues: Map<string, SatisfactionIssue> = new Map();
  private insights: Map<string, SatisfactionInsight> = new Map();
  private segments: Map<string, UserSegment> = new Map();
  
  private config = {
    metricsUpdateInterval: 300000,    // 5 minutes
    insightGenerationInterval: 3600000, // 1 hour
    feedbackRetentionDays: 365,       // Keep feedback for 1 year
    minFeedbackForMetrics: 10,        // Minimum feedback for reliable metrics
    satisfactionThreshold: 3.5,       // Threshold for "satisfied" (out of 5)
    trendAnalysisWindow: 30,          // Days for trend analysis
  };

  private updateTimer: NodeJS.Timeout | null = null;
  private insightTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.initializeDefaultSegments();
  }

  private initializeDefaultSegments(): void {
    const defaultSegments: UserSegment[] = [
      {
        id: 'beginners',
        name: 'Beginner Users',
        criteria: {
          experience: ['beginner'],
          satisfactionRange: [0, 5]
        },
        userCount: 0,
        avgSatisfaction: 0,
        retentionRate: 0,
        topTaskTypes: [],
        commonIssues: [],
        preferences: {}
      },
      {
        id: 'power_users',
        name: 'Power Users',
        criteria: {
          experience: ['expert'],
          usageFrequency: 'daily'
        },
        userCount: 0,
        avgSatisfaction: 0,
        retentionRate: 0,
        topTaskTypes: [],
        commonIssues: [],
        preferences: {}
      },
      {
        id: 'unsatisfied',
        name: 'Unsatisfied Users',
        criteria: {
          satisfactionRange: [0, 2.5]
        },
        userCount: 0,
        avgSatisfaction: 0,
        retentionRate: 0,
        topTaskTypes: [],
        commonIssues: [],
        preferences: {}
      }
    ];

    defaultSegments.forEach(segment => {
      this.segments.set(segment.id, segment);
    });

    Logger.info(`Initialized ${defaultSegments.length} user segments`);
  }

  /**
   * Start satisfaction tracking
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('User satisfaction tracker is already running');
      return;
    }

    Logger.info('Starting user satisfaction tracking...');

    // Start metrics update timer
    this.updateTimer = setInterval(() => {
      this.updateMetrics();
    }, this.config.metricsUpdateInterval);

    // Start insight generation timer
    this.insightTimer = setInterval(() => {
      this.generateInsights();
    }, this.config.insightGenerationInterval);

    this.isRunning = true;
    this.emit('trackerStarted');

    Logger.info('User satisfaction tracker started successfully');
  }

  /**
   * Stop satisfaction tracking
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping user satisfaction tracking...');

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    if (this.insightTimer) {
      clearInterval(this.insightTimer);
      this.insightTimer = null;
    }

    this.isRunning = false;
    this.emit('trackerStopped');

    Logger.info('User satisfaction tracker stopped');
  }

  /**
   * Record user feedback
   */
  async recordFeedback(feedbackData: Omit<UserFeedback, 'id' | 'timestamp' | 'processed' | 'confidence'>): Promise<string> {
    const feedback: UserFeedback = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      processed: false,
      confidence: this.calculateFeedbackConfidence(feedbackData),
      ...feedbackData
    };

    // Store feedback
    this.feedback.set(feedback.id, feedback);

    // Process feedback asynchronously
    await this.processFeedback(feedback);

    // Emit event
    this.emit('feedbackReceived', feedback);

    Logger.debug(`Recorded feedback: ${feedback.id} (${feedback.rating}/5 stars)`);

    return feedback.id;
  }

  /**
   * Get satisfaction metrics for a model
   */
  getSatisfactionMetrics(modelName: string, timeframe: string = '7d'): SatisfactionMetrics | null {
    const key = `${modelName}_${timeframe}`;
    return this.metrics.get(key) || null;
  }

  /**
   * Get all satisfaction issues
   */
  getSatisfactionIssues(filters?: {
    severity?: string;
    status?: string;
    modelName?: string;
    limit?: number;
  }): SatisfactionIssue[] {
    let issues = Array.from(this.issues.values());

    if (filters) {
      if (filters.severity) {
        issues = issues.filter(issue => issue.severity === filters.severity);
      }
      if (filters.status) {
        issues = issues.filter(issue => issue.status === filters.status);
      }
      if (filters.modelName) {
        issues = issues.filter(issue => issue.affectedModels.includes(filters.modelName!));
      }
      if (filters.limit) {
        issues = issues.slice(0, filters.limit);
      }
    }

    return issues.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get satisfaction insights
   */
  getSatisfactionInsights(filters?: {
    type?: string;
    priority?: string;
    category?: string;
  }): SatisfactionInsight[] {
    let insights = Array.from(this.insights.values());

    if (filters) {
      if (filters.type) {
        insights = insights.filter(insight => insight.type === filters.type);
      }
      if (filters.priority) {
        insights = insights.filter(insight => insight.priority === filters.priority);
      }
      if (filters.category) {
        insights = insights.filter(insight => insight.category === filters.category);
      }
    }

    return insights.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get user segments with satisfaction data
   */
  getUserSegments(): UserSegment[] {
    return Array.from(this.segments.values());
  }

  /**
   * Generate satisfaction report for a model
   */
  async generateSatisfactionReport(modelName: string, timeframe: string = '30d'): Promise<{
    summary: SatisfactionMetrics;
    issues: SatisfactionIssue[];
    insights: SatisfactionInsight[];
    recommendations: InsightRecommendation[];
    segments: UserSegment[];
  }> {
    const summary = this.getSatisfactionMetrics(modelName, timeframe);
    const issues = this.getSatisfactionIssues({ modelName, status: 'open' });
    const insights = this.getSatisfactionInsights({ category: modelName });
    
    const recommendations = insights.flatMap(insight => insight.recommendations)
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

    const segments = this.getUserSegments();

    return {
      summary: summary || this.createEmptyMetrics(modelName, timeframe),
      issues,
      insights,
      recommendations,
      segments
    };
  }

  /**
   * Record implicit feedback from user behavior
   */
  async recordImplicitFeedback(behaviorData: {
    requestId: string;
    modelName: string;
    taskType: string;
    userId?: string;
    sessionId: string;
    
    // Behavioral indicators
    accepted: boolean;
    modified: boolean;
    regenerated: boolean;
    timeToReview: number;
    followUpQuestions: number;
    
    // Context
    userExperience?: string;
    taskComplexity?: string;
  }): Promise<void> {
    // Convert behavior to satisfaction score
    const implicitRating = this.inferSatisfactionFromBehavior(behaviorData);
    const sentiment = this.inferSentimentFromBehavior(behaviorData);

    // Create implicit feedback
    await this.recordFeedback({
      userId: behaviorData.userId,
      sessionId: behaviorData.sessionId,
      requestId: behaviorData.requestId,
      modelName: behaviorData.modelName,
      provider: 'unknown',
      taskType: behaviorData.taskType,
      rating: implicitRating,
      sentiment,
      categories: this.inferCategoryRatings(behaviorData),
      behavior: {
        accepted: behaviorData.accepted,
        modified: behaviorData.modified,
        regenerated: behaviorData.regenerated,
        timeToReview: behaviorData.timeToReview,
        followUpQuestions: behaviorData.followUpQuestions
      },
      context: {
        userExperience: (behaviorData.userExperience as any) || 'intermediate',
        taskComplexity: (behaviorData.taskComplexity as any) || 'medium',
        urgency: 'medium',
        previousInteractions: 0
      },
      source: 'implicit',
      tags: ['implicit', 'behavioral']
    });
  }

  // Private methods

  private async processFeedback(feedback: UserFeedback): Promise<void> {
    try {
      // Analyze feedback text if present
      if (feedback.feedbackText) {
        const analysis = await this.analyzeFeedbackText(feedback.feedbackText);
        
        // Store analysis results (would be linked to feedback in production)
        Logger.debug(`Analyzed feedback ${feedback.id}: ${analysis.extractedTopics.join(', ')}`);
      }

      // Update real-time metrics
      await this.updateRealTimeMetrics(feedback);

      // Check for immediate issues
      await this.checkForImmediateIssues(feedback);

      // Mark as processed
      feedback.processed = true;
      this.feedback.set(feedback.id, feedback);

    } catch (error) {
      Logger.error(`Error processing feedback ${feedback.id}:`, error);
    }
  }

  private async analyzeFeedbackText(text: string): Promise<FeedbackAnalysisResult> {
    const startTime = Date.now();

    // Extract topics (simplified keyword extraction)
    const extractedTopics = this.extractTopics(text);
    
    // Analyze emotional tone (simplified)
    const emotionalTone = this.analyzeEmotionalTone(text);
    
    // Extract keywords
    const { positive, negative, actionable } = this.extractKeywords(text);
    
    // Classify categories
    const categories = this.classifyFeedback(text);
    
    // Determine urgency
    const urgency = this.determineUrgency(text);

    return {
      feedbackId: `analysis_${Date.now()}`,
      extractedTopics,
      emotionalTone,
      positiveKeywords: positive,
      negativeKeywords: negative,
      actionableKeywords: actionable,
      categories,
      urgency,
      sentimentConfidence: 0.8, // Simplified
      categoryConfidence: 0.7,
      processedAt: new Date(),
      processingTime: Date.now() - startTime
    };
  }

  private extractTopics(text: string): string[] {
    // Simplified topic extraction using keyword matching
    const topicKeywords = {
      'accuracy': ['wrong', 'incorrect', 'mistake', 'error', 'accurate', 'correct'],
      'speed': ['slow', 'fast', 'quick', 'delay', 'responsive', 'performance'],
      'clarity': ['unclear', 'confusing', 'clear', 'understandable', 'explain'],
      'helpfulness': ['helpful', 'useful', 'useless', 'unhelpful', 'assistance'],
      'completeness': ['incomplete', 'missing', 'complete', 'thorough', 'partial']
    };

    const topics: string[] = [];
    const lowerText = text.toLowerCase();

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  private analyzeEmotionalTone(text: string): FeedbackAnalysisResult['emotionalTone'] {
    // Simplified emotional analysis using keyword matching
    const emotionKeywords = {
      joy: ['great', 'excellent', 'amazing', 'love', 'perfect', 'wonderful'],
      anger: ['terrible', 'awful', 'hate', 'angry', 'frustrated', 'annoying'],
      sadness: ['disappointed', 'sad', 'unfortunate', 'regret'],
      fear: ['worried', 'concerned', 'afraid', 'anxious'],
      surprise: ['unexpected', 'surprised', 'wow', 'amazing'],
      disgust: ['disgusting', 'horrible', 'gross', 'repulsive']
    };

    const tone = { joy: 0, anger: 0, sadness: 0, fear: 0, surprise: 0, disgust: 0 };
    const lowerText = text.toLowerCase();

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      const matches = keywords.filter(keyword => lowerText.includes(keyword)).length;
      tone[emotion as keyof typeof tone] = Math.min(1, matches * 0.3);
    }

    return tone;
  }

  private extractKeywords(text: string): { positive: string[]; negative: string[]; actionable: string[] } {
    const lowerText = text.toLowerCase();
    
    const positiveKeywords = ['good', 'great', 'excellent', 'perfect', 'helpful', 'clear', 'fast', 'accurate'];
    const negativeKeywords = ['bad', 'terrible', 'slow', 'wrong', 'confusing', 'unclear', 'useless'];
    const actionableKeywords = ['should', 'could', 'need', 'improve', 'fix', 'add', 'remove', 'change'];

    return {
      positive: positiveKeywords.filter(keyword => lowerText.includes(keyword)),
      negative: negativeKeywords.filter(keyword => lowerText.includes(keyword)),
      actionable: actionableKeywords.filter(keyword => lowerText.includes(keyword))
    };
  }

  private classifyFeedback(text: string): string[] {
    const categories: string[] = [];
    const lowerText = text.toLowerCase();

    const categoryPatterns = {
      'bug_report': ['bug', 'error', 'crash', 'broken', 'not working'],
      'feature_request': ['add', 'need', 'would like', 'feature', 'enhancement'],
      'performance': ['slow', 'fast', 'performance', 'speed', 'lag'],
      'usability': ['confusing', 'hard to use', 'interface', 'ux', 'user experience'],
      'content_quality': ['wrong', 'incorrect', 'quality', 'accuracy', 'relevant']
    };

    for (const [category, patterns] of Object.entries(categoryPatterns)) {
      if (patterns.some(pattern => lowerText.includes(pattern))) {
        categories.push(category);
      }
    }

    return categories.length > 0 ? categories : ['general'];
  }

  private determineUrgency(text: string): 'low' | 'medium' | 'high' {
    const urgentKeywords = ['urgent', 'critical', 'immediately', 'asap', 'emergency'];
    const moderateKeywords = ['soon', 'important', 'needed', 'should'];
    
    const lowerText = text.toLowerCase();
    
    if (urgentKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'high';
    } else if (moderateKeywords.some(keyword => lowerText.includes(keyword))) {
      return 'medium';
    }
    
    return 'low';
  }

  private calculateFeedbackConfidence(feedback: Partial<UserFeedback>): number {
    let confidence = 0.5; // Base confidence
    
    // Explicit rating increases confidence
    if (feedback.rating && feedback.rating > 0) {
      confidence += 0.3;
    }
    
    // Text feedback increases confidence
    if (feedback.feedbackText && feedback.feedbackText.length > 10) {
      confidence += 0.2;
    }
    
    // Complete category ratings increase confidence
    if (feedback.categories) {
      const categoryCount = Object.values(feedback.categories).filter(rating => rating > 0).length;
      confidence += (categoryCount / 6) * 0.2; // 6 categories max
    }
    
    // Behavioral data increases confidence
    if (feedback.behavior) {
      confidence += 0.1;
    }
    
    return Math.min(1, confidence);
  }

  private inferSatisfactionFromBehavior(behaviorData: any): number {
    let score = 3; // Neutral starting point
    
    // Positive indicators
    if (behaviorData.accepted) score += 1;
    if (!behaviorData.regenerated) score += 0.5;
    if (behaviorData.followUpQuestions === 0) score += 0.5;
    if (behaviorData.timeToReview < 30000) score += 0.5; // Less than 30 seconds
    
    // Negative indicators
    if (behaviorData.regenerated) score -= 1.5;
    if (behaviorData.modified) score -= 0.5;
    if (behaviorData.followUpQuestions > 2) score -= 1;
    if (behaviorData.timeToReview > 180000) score -= 0.5; // More than 3 minutes
    
    return Math.max(1, Math.min(5, Math.round(score)));
  }

  private inferSentimentFromBehavior(behaviorData: any): 'positive' | 'neutral' | 'negative' {
    const satisfactionScore = this.inferSatisfactionFromBehavior(behaviorData);
    
    if (satisfactionScore >= 4) return 'positive';
    if (satisfactionScore <= 2) return 'negative';
    return 'neutral';
  }

  private inferCategoryRatings(behaviorData: any): UserFeedback['categories'] {
    const baseSatisfaction = this.inferSatisfactionFromBehavior(behaviorData);
    
    return {
      accuracy: behaviorData.regenerated ? Math.max(1, baseSatisfaction - 1) : baseSatisfaction,
      helpfulness: behaviorData.accepted ? Math.min(5, baseSatisfaction + 1) : baseSatisfaction,
      clarity: behaviorData.followUpQuestions > 0 ? Math.max(1, baseSatisfaction - 1) : baseSatisfaction,
      completeness: behaviorData.modified ? Math.max(1, baseSatisfaction - 0.5) : baseSatisfaction,
      creativity: baseSatisfaction,
      speed: behaviorData.timeToReview < 30000 ? Math.min(5, baseSatisfaction + 1) : 
             behaviorData.timeToReview > 180000 ? Math.max(1, baseSatisfaction - 1) : baseSatisfaction
    };
  }

  private async updateRealTimeMetrics(feedback: UserFeedback): Promise<void> {
    const key = `${feedback.modelName}_realtime`;
    let metrics = this.metrics.get(key);
    
    if (!metrics) {
      metrics = this.createEmptyMetrics(feedback.modelName, 'realtime');
    }
    
    // Update metrics with new feedback
    metrics.totalFeedback++;
    metrics.ratingDistribution[feedback.rating as keyof typeof metrics.ratingDistribution]++;
    
    // Update category scores (running average)
    const weight = 1 / metrics.totalFeedback;
    metrics.categoryScores.accuracy = (metrics.categoryScores.accuracy * (1 - weight)) + (feedback.categories.accuracy * weight);
    metrics.categoryScores.helpfulness = (metrics.categoryScores.helpfulness * (1 - weight)) + (feedback.categories.helpfulness * weight);
    metrics.categoryScores.clarity = (metrics.categoryScores.clarity * (1 - weight)) + (feedback.categories.clarity * weight);
    metrics.categoryScores.completeness = (metrics.categoryScores.completeness * (1 - weight)) + (feedback.categories.completeness * weight);
    metrics.categoryScores.creativity = (metrics.categoryScores.creativity * (1 - weight)) + (feedback.categories.creativity * weight);
    metrics.categoryScores.speed = (metrics.categoryScores.speed * (1 - weight)) + (feedback.categories.speed * weight);
    
    // Update sentiment breakdown
    const sentimentKey = feedback.sentiment;
    metrics.sentimentBreakdown[sentimentKey]++;
    
    // Update behavioral metrics
    if (feedback.behavior.accepted) {
      metrics.behaviorMetrics.acceptanceRate = 
        (metrics.behaviorMetrics.acceptanceRate * (metrics.totalFeedback - 1) + 1) / metrics.totalFeedback;
    }
    
    // Recalculate overall satisfaction
    const totalRating = Object.entries(metrics.ratingDistribution)
      .reduce((sum, [rating, count]) => sum + (parseInt(rating) * count), 0);
    metrics.overallSatisfaction = totalRating / (metrics.totalFeedback * 5); // Normalize to 0-1
    
    this.metrics.set(key, metrics);
  }

  private async checkForImmediateIssues(feedback: UserFeedback): Promise<void> {
    // Check for critical satisfaction issues
    if (feedback.rating <= 2 && feedback.confidence > 0.7) {
      await this.createSatisfactionIssue({
        type: 'quality',
        severity: feedback.rating === 1 ? 'critical' : 'high',
        title: 'Low User Satisfaction Detected',
        description: `User gave ${feedback.rating}/5 rating for ${feedback.modelName}`,
        affectedModels: [feedback.modelName],
        affectedTaskTypes: [feedback.taskType],
        feedbackText: feedback.feedbackText,
        categories: feedback.categories
      });
    }
    
    // Check for regeneration patterns
    if (feedback.behavior.regenerated && feedback.behavior.followUpQuestions > 1) {
      await this.createSatisfactionIssue({
        type: 'usability',
        severity: 'medium',
        title: 'Multiple Regenerations Required',
        description: 'User required multiple regenerations and follow-up questions',
        affectedModels: [feedback.modelName],
        affectedTaskTypes: [feedback.taskType],
        feedbackText: feedback.feedbackText,
        categories: feedback.categories
      });
    }
  }

  private async createSatisfactionIssue(issueData: {
    type: SatisfactionIssue['type'];
    severity: SatisfactionIssue['severity'];
    title: string;
    description: string;
    affectedModels: string[];
    affectedTaskTypes: string[];
    feedbackText?: string;
    categories?: UserFeedback['categories'];
  }): Promise<void> {
    const issue: SatisfactionIssue = {
      id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: issueData.type,
      severity: issueData.severity,
      title: issueData.title,
      description: issueData.description,
      affectedModels: issueData.affectedModels,
      affectedTaskTypes: issueData.affectedTaskTypes,
      impactScore: this.calculateImpactScore(issueData.severity, issueData.categories),
      frequency: 1,
      feedbackSamples: issueData.feedbackText ? [issueData.feedbackText] : [],
      commonKeywords: [],
      userSegments: [],
      status: 'open',
      priority: this.calculateIssuePriority(issueData.severity, issueData.type),
      detectedAt: new Date(),
      lastUpdated: new Date()
    };

    // Check for existing similar issue
    const existingIssue = this.findSimilarIssue(issue);
    if (existingIssue) {
      existingIssue.frequency++;
      existingIssue.lastUpdated = new Date();
      if (issueData.feedbackText) {
        existingIssue.feedbackSamples.push(issueData.feedbackText);
      }
    } else {
      this.issues.set(issue.id, issue);
      this.emit('satisfactionIssueDetected', issue);
      Logger.warn(`Satisfaction issue detected: ${issue.title} (${issue.severity})`);
    }
  }

  private findSimilarIssue(newIssue: SatisfactionIssue): SatisfactionIssue | null {
    for (const existingIssue of this.issues.values()) {
      if (existingIssue.type === newIssue.type &&
          existingIssue.severity === newIssue.severity &&
          existingIssue.affectedModels.some(model => newIssue.affectedModels.includes(model)) &&
          existingIssue.status === 'open') {
        return existingIssue;
      }
    }
    return null;
  }

  private calculateImpactScore(severity: string, categories?: UserFeedback['categories']): number {
    let impact = 0;
    
    // Base impact from severity
    const severityImpact = { low: 0.2, medium: 0.5, high: 0.8, critical: 1.0 };
    impact += severityImpact[severity as keyof typeof severityImpact] || 0.5;
    
    // Additional impact from category scores
    if (categories) {
      const avgCategoryScore = Object.values(categories).reduce((sum, score) => sum + score, 0) / 6;
      impact += (5 - avgCategoryScore) / 5 * 0.3; // Lower scores = higher impact
    }
    
    return Math.min(1, impact);
  }

  private calculateIssuePriority(severity: string, type: string): number {
    const severityPriority = { low: 1, medium: 2, high: 4, critical: 5 };
    const typePriority = { quality: 1.2, performance: 1.0, usability: 0.8, accuracy: 1.3, other: 0.6 };
    
    const basePriority = severityPriority[severity as keyof typeof severityPriority] || 2;
    const typeMultiplier = typePriority[type as keyof typeof typePriority] || 1;
    
    return Math.round(basePriority * typeMultiplier);
  }

  private async updateMetrics(): Promise<void> {
    try {
      const modelNames = new Set(Array.from(this.feedback.values()).map(f => f.modelName));
      
      for (const modelName of modelNames) {
        await this.calculateMetricsForModel(modelName, '7d');
        await this.calculateMetricsForModel(modelName, '30d');
      }
      
      // Update segments
      await this.updateUserSegments();
      
    } catch (error) {
      Logger.error('Error updating satisfaction metrics:', error);
    }
  }

  private async calculateMetricsForModel(modelName: string, timeframe: string): Promise<void> {
    const cutoff = this.getTimeframeCutoff(timeframe);
    const modelFeedback = Array.from(this.feedback.values())
      .filter(f => f.modelName === modelName && f.timestamp >= cutoff);

    if (modelFeedback.length < this.config.minFeedbackForMetrics) {
      return; // Not enough data for reliable metrics
    }

    const metrics = this.createEmptyMetrics(modelName, timeframe);
    
    // Calculate all metrics
    metrics.totalFeedback = modelFeedback.length;
    
    // Rating distribution
    for (const feedback of modelFeedback) {
      metrics.ratingDistribution[feedback.rating as keyof typeof metrics.ratingDistribution]++;
    }
    
    // Category scores (averages)
    const categoryTotals = { accuracy: 0, helpfulness: 0, clarity: 0, completeness: 0, creativity: 0, speed: 0 };
    for (const feedback of modelFeedback) {
      Object.entries(feedback.categories).forEach(([category, score]) => {
        categoryTotals[category as keyof typeof categoryTotals] += score;
      });
    }
    
    Object.entries(categoryTotals).forEach(([category, total]) => {
      metrics.categoryScores[category as keyof typeof metrics.categoryScores] = total / modelFeedback.length;
    });
    
    // Sentiment breakdown
    for (const feedback of modelFeedback) {
      metrics.sentimentBreakdown[feedback.sentiment]++;
    }
    
    // Behavioral metrics
    const acceptedCount = modelFeedback.filter(f => f.behavior.accepted).length;
    const modifiedCount = modelFeedback.filter(f => f.behavior.modified).length;
    const regeneratedCount = modelFeedback.filter(f => f.behavior.regenerated).length;
    const totalReviewTime = modelFeedback.reduce((sum, f) => sum + f.behavior.timeToReview, 0);
    const followUpCount = modelFeedback.filter(f => f.behavior.followUpQuestions > 0).length;
    
    metrics.behaviorMetrics = {
      acceptanceRate: acceptedCount / modelFeedback.length,
      modificationRate: modifiedCount / modelFeedback.length,
      regenerationRate: regeneratedCount / modelFeedback.length,
      avgReviewTime: totalReviewTime / modelFeedback.length,
      followUpRate: followUpCount / modelFeedback.length
    };
    
    // Overall satisfaction
    const totalRating = Object.entries(metrics.ratingDistribution)
      .reduce((sum, [rating, count]) => sum + (parseInt(rating) * count), 0);
    metrics.overallSatisfaction = totalRating / (metrics.totalFeedback * 5);
    
    // Trends (simplified)
    const previousMetrics = this.metrics.get(`${modelName}_${timeframe}`);
    if (previousMetrics) {
      const change = metrics.overallSatisfaction - previousMetrics.overallSatisfaction;
      metrics.trends.weekOverWeek = change * 100;
      metrics.trends.satisfactionTrend = change > 0.02 ? 'improving' : change < -0.02 ? 'declining' : 'stable';
      metrics.trends.trendStrength = Math.abs(change);
    }
    
    // Segment breakdown
    const segmentData = {
      byExperience: this.calculateSegmentBreakdown(modelFeedback, 'userExperience'),
      byTaskType: this.calculateSegmentBreakdown(modelFeedback, 'taskType'),
      byComplexity: this.calculateSegmentBreakdown(modelFeedback, 'taskComplexity')
    };
    metrics.segmentBreakdown = segmentData;
    
    // Store metrics
    const key = `${modelName}_${timeframe}`;
    this.metrics.set(key, metrics);
  }

  private calculateSegmentBreakdown(feedback: UserFeedback[], segmentBy: string): Record<string, number> {
    const segments: Record<string, { total: number; sum: number }> = {};
    
    for (const f of feedback) {
      let segmentValue: string;
      
      switch (segmentBy) {
        case 'userExperience':
          segmentValue = f.context.userExperience;
          break;
        case 'taskType':
          segmentValue = f.taskType;
          break;
        case 'taskComplexity':
          segmentValue = f.context.taskComplexity;
          break;
        default:
          segmentValue = 'unknown';
      }
      
      if (!segments[segmentValue]) {
        segments[segmentValue] = { total: 0, sum: 0 };
      }
      
      segments[segmentValue].total++;
      segments[segmentValue].sum += f.rating;
    }
    
    const result: Record<string, number> = {};
    for (const [segment, data] of Object.entries(segments)) {
      result[segment] = data.sum / data.total;
    }
    
    return result;
  }

  private async updateUserSegments(): Promise<void> {
    for (const segment of this.segments.values()) {
      const matchingFeedback = this.getSegmentFeedback(segment);
      
      segment.userCount = new Set(matchingFeedback.map(f => f.userId).filter(Boolean)).size;
      segment.avgSatisfaction = matchingFeedback.length > 0 ? 
        matchingFeedback.reduce((sum, f) => sum + f.rating, 0) / matchingFeedback.length : 0;
      
      // Calculate top task types
      const taskTypes = new Map<string, number>();
      matchingFeedback.forEach(f => {
        taskTypes.set(f.taskType, (taskTypes.get(f.taskType) || 0) + 1);
      });
      
      segment.topTaskTypes = Array.from(taskTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([taskType]) => taskType);
    }
  }

  private getSegmentFeedback(segment: UserSegment): UserFeedback[] {
    return Array.from(this.feedback.values()).filter(feedback => {
      const criteria = segment.criteria;
      
      // Check experience criteria
      if (criteria.experience && !criteria.experience.includes(feedback.context.userExperience)) {
        return false;
      }
      
      // Check task type criteria
      if (criteria.taskTypes && !criteria.taskTypes.includes(feedback.taskType)) {
        return false;
      }
      
      // Check satisfaction range
      if (criteria.satisfactionRange) {
        const [min, max] = criteria.satisfactionRange;
        if (feedback.rating < min || feedback.rating > max) {
          return false;
        }
      }
      
      return true;
    });
  }

  private async generateInsights(): Promise<void> {
    try {
      const modelNames = new Set(Array.from(this.feedback.values()).map(f => f.modelName));
      
      for (const modelName of modelNames) {
        await this.generateModelInsights(modelName);
      }
    } catch (error) {
      Logger.error('Error generating satisfaction insights:', error);
    }
  }

  private async generateModelInsights(modelName: string): Promise<void> {
    const metrics = this.getSatisfactionMetrics(modelName, '30d');
    if (!metrics) return;

    const insights: SatisfactionInsight[] = [];

    // Opportunity insights
    if (metrics.overallSatisfaction < 0.7) {
      insights.push({
        id: `insight_${modelName}_satisfaction_${Date.now()}`,
        type: 'opportunity',
        priority: 'high',
        title: 'Low Overall Satisfaction',
        description: `${modelName} has below-average satisfaction (${(metrics.overallSatisfaction * 100).toFixed(1)}%)`,
        evidence: [
          `Overall satisfaction: ${(metrics.overallSatisfaction * 100).toFixed(1)}%`,
          `${metrics.sentimentBreakdown.negative} negative reviews out of ${metrics.totalFeedback}`
        ],
        metrics: { satisfaction: metrics.overallSatisfaction },
        recommendations: [
          {
            type: 'model_training',
            priority: 'high',
            title: 'Improve Model Training',
            description: 'Focus on accuracy and helpfulness improvements',
            actionItems: [
              'Analyze negative feedback patterns',
              'Retrain with improved datasets',
              'Implement quality filters'
            ],
            estimatedEffort: 'high',
            expectedImpact: 'high',
            timeline: '4-6 weeks'
          }
        ],
        potentialImpact: {
          satisfactionIncrease: 25,
          userRetention: 15,
          usageIncrease: 20
        },
        confidence: 0.85,
        createdAt: new Date(),
        category: modelName
      });
    }

    // Performance insights
    if (metrics.behaviorMetrics.regenerationRate > 0.3) {
      insights.push({
        id: `insight_${modelName}_regeneration_${Date.now()}`,
        type: 'concern',
        priority: 'medium',
        title: 'High Regeneration Rate',
        description: `${(metrics.behaviorMetrics.regenerationRate * 100).toFixed(1)}% of users request regenerations`,
        evidence: [
          `Regeneration rate: ${(metrics.behaviorMetrics.regenerationRate * 100).toFixed(1)}%`,
          `Acceptance rate: ${(metrics.behaviorMetrics.acceptanceRate * 100).toFixed(1)}%`
        ],
        metrics: { regenerationRate: metrics.behaviorMetrics.regenerationRate },
        recommendations: [
          {
            type: 'prompt_optimization',
            priority: 'medium',
            title: 'Optimize Prompts',
            description: 'Improve initial response quality to reduce regenerations',
            actionItems: [
              'Analyze regeneration patterns',
              'Optimize prompt templates',
              'Add context preservation'
            ],
            estimatedEffort: 'medium',
            expectedImpact: 'medium',
            timeline: '2-3 weeks'
          }
        ],
        potentialImpact: {
          satisfactionIncrease: 15,
          userRetention: 10,
          usageIncrease: 12
        },
        confidence: 0.75,
        createdAt: new Date(),
        category: modelName
      });
    }

    // Store insights
    insights.forEach(insight => {
      this.insights.set(insight.id, insight);
    });

    if (insights.length > 0) {
      Logger.info(`Generated ${insights.length} satisfaction insights for ${modelName}`);
      this.emit('insightsGenerated', { modelName, insights });
    }
  }

  private createEmptyMetrics(modelName: string, timeframe: string): SatisfactionMetrics {
    return {
      modelName,
      timeframe,
      overallSatisfaction: 0,
      totalFeedback: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      categoryScores: {
        accuracy: 0,
        helpfulness: 0,
        clarity: 0,
        completeness: 0,
        creativity: 0,
        speed: 0
      },
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
      behaviorMetrics: {
        acceptanceRate: 0,
        modificationRate: 0,
        regenerationRate: 0,
        avgReviewTime: 0,
        followUpRate: 0
      },
      trends: {
        satisfactionTrend: 'stable',
        trendStrength: 0,
        weekOverWeek: 0,
        monthOverMonth: 0
      },
      segmentBreakdown: {
        byExperience: {},
        byTaskType: {},
        byComplexity: {}
      }
    };
  }

  private getTimeframeCutoff(timeframe: string): Date {
    const now = new Date();
    const match = timeframe.match(/^(\d+)([dwmy])$/);
    
    if (!match) return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Default 7 days
    
    const value = parseInt(match[1]);
    const unit = match[2];
    let milliseconds = 0;
    
    switch (unit) {
      case 'd': milliseconds = value * 24 * 60 * 60 * 1000; break;
      case 'w': milliseconds = value * 7 * 24 * 60 * 60 * 1000; break;
      case 'm': milliseconds = value * 30 * 24 * 60 * 60 * 1000; break;
      case 'y': milliseconds = value * 365 * 24 * 60 * 60 * 1000; break;
    }
    
    return new Date(now.getTime() - milliseconds);
  }
}

// Export singleton instance
export const userSatisfactionTracker = new UserSatisfactionTracker();