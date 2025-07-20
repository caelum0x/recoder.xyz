interface UserFeedback {
  id: string;
  timestamp: Date;
  userId?: string;
  sessionId: string;
  type: 'rating' | 'text' | 'correction' | 'suggestion' | 'bug_report';
  content: {
    rating?: number; // 1-5 scale
    text?: string;
    context?: string;
    expectedOutput?: string;
    actualOutput?: string;
    categories?: string[];
  };
  metadata: {
    taskType: string;
    model: string;
    promptLength: number;
    responseLength: number;
    responseTime: number;
    cost: number;
  };
  processed: boolean;
  actionsTaken: string[];
}

interface FeedbackPattern {
  id: string;
  pattern: string;
  frequency: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'quality' | 'performance' | 'cost' | 'usability' | 'accuracy';
  examples: string[];
  suggestedActions: string[];
  lastSeen: Date;
}

interface ImprovementAction {
  id: string;
  type: 'prompt_adjustment' | 'model_change' | 'parameter_tuning' | 'workflow_change' | 'feature_request';
  description: string;
  triggeredBy: string[]; // Feedback IDs
  status: 'pending' | 'implementing' | 'testing' | 'deployed' | 'rejected';
  impact: {
    estimated: number;
    actual?: number;
    metrics: string[];
  };
  implementation: {
    startDate?: Date;
    endDate?: Date;
    effort: 'low' | 'medium' | 'high';
    resources: string[];
  };
}

export class FeedbackProcessor {
  private feedback: UserFeedback[] = [];
  private patterns: Map<string, FeedbackPattern> = new Map();
  private improvements: Map<string, ImprovementAction> = new Map();
  private learningHistory: Array<{
    timestamp: Date;
    insight: string;
    confidence: number;
    appliedActions: string[];
  }> = [];

  constructor() {
    this.loadFeedbackHistory();
    this.initializePatternDetection();
  }

  processFeedback(feedback: Omit<UserFeedback, 'id' | 'timestamp' | 'processed' | 'actionsTaken'>): UserFeedback {
    const processedFeedback: UserFeedback = {
      ...feedback,
      id: this.generateFeedbackId(),
      timestamp: new Date(),
      processed: false,
      actionsTaken: []
    };

    this.feedback.push(processedFeedback);
    
    // Process immediately
    this.analyzeFeedback(processedFeedback);
    this.detectPatterns();
    this.generateImprovements();
    
    processedFeedback.processed = true;
    
    // Keep only last 5000 feedback items for performance
    if (this.feedback.length > 5000) {
      this.feedback = this.feedback.slice(-5000);
    }

    return processedFeedback;
  }

  analyzeSentiment(text: string): {
    sentiment: 'positive' | 'negative' | 'neutral';
    confidence: number;
    emotions: string[];
    issues: string[];
  } {
    const positiveWords = ['good', 'great', 'excellent', 'perfect', 'helpful', 'accurate', 'fast', 'useful'];
    const negativeWords = ['bad', 'poor', 'wrong', 'slow', 'inaccurate', 'useless', 'confusing', 'broken'];
    const emotionWords = {
      frustrated: ['frustrated', 'annoyed', 'irritated'],
      satisfied: ['satisfied', 'happy', 'pleased'],
      confused: ['confused', 'unclear', 'puzzled']
    };

    const words = text.toLowerCase().split(/\W+/);
    
    let positiveCount = 0;
    let negativeCount = 0;
    const emotions: string[] = [];
    const issues: string[] = [];

    words.forEach(word => {
      if (positiveWords.includes(word)) positiveCount++;
      if (negativeWords.includes(word)) negativeCount++;
      
      Object.entries(emotionWords).forEach(([emotion, keywords]) => {
        if (keywords.includes(word) && !emotions.includes(emotion)) {
          emotions.push(emotion);
        }
      });
    });

    // Extract potential issues
    const issuePatterns = [
      /too (slow|fast|expensive|cheap)/gi,
      /(incorrect|wrong|inaccurate) (response|answer|result)/gi,
      /(doesn't|does not) (work|understand|help)/gi
    ];

    issuePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        issues.push(...matches);
      }
    });

    let sentiment: 'positive' | 'negative' | 'neutral';
    let confidence: number;

    if (positiveCount > negativeCount) {
      sentiment = 'positive';
      confidence = Math.min((positiveCount - negativeCount) / words.length * 10, 1);
    } else if (negativeCount > positiveCount) {
      sentiment = 'negative';
      confidence = Math.min((negativeCount - positiveCount) / words.length * 10, 1);
    } else {
      sentiment = 'neutral';
      confidence = 0.5;
    }

    return { sentiment, confidence, emotions, issues };
  }

  identifyImprovementOpportunities(): Array<{
    area: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affectedUsers: number;
    potentialImpact: number;
    suggestedActions: string[];
  }> {
    const opportunities = [];
    
    // Analyze rating patterns
    const lowRatings = this.feedback.filter(f => f.content.rating && f.content.rating <= 2);
    if (lowRatings.length > this.feedback.length * 0.2) {
      opportunities.push({
        area: 'Overall Quality',
        priority: 'high' as const,
        description: `${Math.round(lowRatings.length / this.feedback.length * 100)}% of responses received low ratings`,
        affectedUsers: new Set(lowRatings.map(f => f.userId)).size,
        potentialImpact: 0.8,
        suggestedActions: [
          'Review and improve prompt templates',
          'Consider using higher-quality models for critical tasks',
          'Implement response validation'
        ]
      });
    }

    // Analyze performance complaints
    const performanceIssues = this.feedback.filter(f => 
      f.content.text?.toLowerCase().includes('slow') || 
      f.metadata.responseTime > 10000
    );
    
    if (performanceIssues.length > 0) {
      opportunities.push({
        area: 'Performance',
        priority: 'medium' as const,
        description: `${performanceIssues.length} reports of slow response times`,
        affectedUsers: new Set(performanceIssues.map(f => f.userId)).size,
        potentialImpact: 0.6,
        suggestedActions: [
          'Optimize model selection for faster responses',
          'Implement caching for common queries',
          'Use streaming responses for long outputs'
        ]
      });
    }

    // Analyze cost concerns
    const costIssues = this.feedback.filter(f => 
      f.content.text?.toLowerCase().includes('expensive') ||
      f.content.text?.toLowerCase().includes('cost')
    );
    
    if (costIssues.length > 0) {
      opportunities.push({
        area: 'Cost Efficiency',
        priority: 'medium' as const,
        description: `${costIssues.length} mentions of cost concerns`,
        affectedUsers: new Set(costIssues.map(f => f.userId)).size,
        potentialImpact: 0.5,
        suggestedActions: [
          'Implement cost-aware model selection',
          'Optimize prompt efficiency',
          'Provide cost transparency to users'
        ]
      });
    }

    // Analyze accuracy issues
    const accuracyIssues = this.feedback.filter(f => 
      f.type === 'correction' ||
      f.content.text?.toLowerCase().includes('wrong') ||
      f.content.text?.toLowerCase().includes('incorrect')
    );
    
    if (accuracyIssues.length > 0) {
      opportunities.push({
        area: 'Accuracy',
        priority: 'high' as const,
        description: `${accuracyIssues.length} reports of incorrect responses`,
        affectedUsers: new Set(accuracyIssues.map(f => f.userId)).size,
        potentialImpact: 0.9,
        suggestedActions: [
          'Implement fact-checking mechanisms',
          'Add confidence scores to responses',
          'Create feedback loops for corrections'
        ]
      });
    }

    return opportunities.sort((a, b) => b.potentialImpact - a.potentialImpact);
  }

  getInsights(timeframe?: {start: Date, end: Date}): {
    overallSatisfaction: number;
    topIssues: Array<{issue: string, frequency: number}>;
    improvementTrends: Array<{metric: string, trend: 'improving' | 'declining' | 'stable'}>;
    userSegmentInsights: Record<string, any>;
    actionableRecommendations: string[];
  } {
    let relevantFeedback = this.feedback;
    
    if (timeframe) {
      relevantFeedback = this.feedback.filter(f => 
        f.timestamp >= timeframe.start && f.timestamp <= timeframe.end
      );
    }

    // Calculate overall satisfaction
    const ratingsData = relevantFeedback.filter(f => f.content.rating);
    const overallSatisfaction = ratingsData.length > 0 
      ? ratingsData.reduce((sum, f) => sum + f.content.rating!, 0) / ratingsData.length / 5
      : 0;

    // Identify top issues
    const issueMap = new Map<string, number>();
    relevantFeedback.forEach(f => {
      if (f.content.text) {
        const sentiment = this.analyzeSentiment(f.content.text);
        sentiment.issues.forEach(issue => {
          issueMap.set(issue, (issueMap.get(issue) || 0) + 1);
        });
      }
    });
    
    const topIssues = Array.from(issueMap.entries())
      .map(([issue, frequency]) => ({issue, frequency}))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    // Analyze trends
    const improvementTrends = this.analyzeTrends(relevantFeedback);

    // User segment insights
    const userSegmentInsights = this.analyzeUserSegments(relevantFeedback);

    // Generate recommendations
    const actionableRecommendations = this.generateRecommendations(relevantFeedback);

    return {
      overallSatisfaction,
      topIssues,
      improvementTrends,
      userSegmentInsights,
      actionableRecommendations
    };
  }

  trainFromFeedback(): {
    newPatterns: number;
    updatedRules: number;
    confidenceImprovements: Array<{area: string, improvement: number}>;
  } {
    const beforePatterns = this.patterns.size;
    
    // Extract new patterns from recent feedback
    this.detectPatterns();
    this.updateLearningRules();
    
    const newPatterns = this.patterns.size - beforePatterns;
    const updatedRules = this.countUpdatedRules();
    const confidenceImprovements = this.calculateConfidenceImprovements();

    // Record learning session
    this.learningHistory.push({
      timestamp: new Date(),
      insight: `Processed ${this.feedback.length} feedback items, found ${newPatterns} new patterns`,
      confidence: 0.8,
      appliedActions: Array.from(this.improvements.keys())
    });

    return {
      newPatterns,
      updatedRules,
      confidenceImprovements
    };
  }

  private analyzeFeedback(feedback: UserFeedback): void {
    if (feedback.content.text) {
      const sentiment = this.analyzeSentiment(feedback.content.text);
      
      // Log sentiment for learning
      this.recordSentimentLearning(feedback, sentiment);
    }

    if (feedback.content.rating) {
      this.analyzeRatingContext(feedback);
    }

    if (feedback.type === 'correction') {
      this.processCorrection(feedback);
    }
  }

  private detectPatterns(): void {
    const recentFeedback = this.feedback.slice(-1000); // Last 1000 items
    
    // Group feedback by various dimensions
    const groupings = {
      byModel: new Map<string, UserFeedback[]>(),
      byTaskType: new Map<string, UserFeedback[]>(),
      byResponseTime: new Map<string, UserFeedback[]>()
    };

    recentFeedback.forEach(feedback => {
      // Group by model
      const model = feedback.metadata.model;
      if (!groupings.byModel.has(model)) {
        groupings.byModel.set(model, []);
      }
      groupings.byModel.get(model)!.push(feedback);

      // Group by task type
      const taskType = feedback.metadata.taskType;
      if (!groupings.byTaskType.has(taskType)) {
        groupings.byTaskType.set(taskType, []);
      }
      groupings.byTaskType.get(taskType)!.push(feedback);

      // Group by response time
      const timeCategory = feedback.metadata.responseTime > 5000 ? 'slow' : 'fast';
      if (!groupings.byResponseTime.has(timeCategory)) {
        groupings.byResponseTime.set(timeCategory, []);
      }
      groupings.byResponseTime.get(timeCategory)!.push(feedback);
    });

    // Analyze each grouping for patterns
    this.analyzeGroupPatterns(groupings.byModel, 'model');
    this.analyzeGroupPatterns(groupings.byTaskType, 'task_type');
    this.analyzeGroupPatterns(groupings.byResponseTime, 'response_time');
  }

  private analyzeGroupPatterns(groups: Map<string, UserFeedback[]>, dimension: string): void {
    for (const [key, feedbackGroup] of groups.entries()) {
      if (feedbackGroup.length < 5) continue; // Need sufficient data
      
      const avgRating = feedbackGroup
        .filter(f => f.content.rating)
        .reduce((sum, f) => sum + f.content.rating!, 0) / feedbackGroup.length;
      
      const commonIssues = this.extractCommonIssues(feedbackGroup);
      
      if (avgRating < 3 || commonIssues.length > 0) {
        const patternId = `${dimension}_${key}_issues`;
        
        const existingPattern = this.patterns.get(patternId);
        if (existingPattern) {
          existingPattern.frequency += feedbackGroup.length;
          existingPattern.lastSeen = new Date();
        } else {
          this.patterns.set(patternId, {
            id: patternId,
            pattern: `Issues with ${dimension}: ${key}`,
            frequency: feedbackGroup.length,
            severity: avgRating < 2 ? 'critical' : avgRating < 3 ? 'high' : 'medium',
            category: 'quality',
            examples: commonIssues.slice(0, 3),
            suggestedActions: this.generateSuggestedActions(dimension, key, commonIssues),
            lastSeen: new Date()
          });
        }
      }
    }
  }

  private generateImprovements(): void {
    for (const pattern of this.patterns.values()) {
      if (pattern.frequency > 10 && pattern.severity !== 'low') {
        const improvementId = `improvement_${pattern.id}`;
        
        if (!this.improvements.has(improvementId)) {
          this.improvements.set(improvementId, {
            id: improvementId,
            type: this.determineImprovementType(pattern),
            description: `Address pattern: ${pattern.pattern}`,
            triggeredBy: [pattern.id],
            status: 'pending',
            impact: {
              estimated: this.estimateImpact(pattern),
              metrics: ['user_satisfaction', 'accuracy', 'response_time']
            },
            implementation: {
              effort: pattern.severity === 'critical' ? 'high' : 'medium',
              resources: ['engineering', 'data_science']
            }
          });
        }
      }
    }
  }

  private extractCommonIssues(feedback: UserFeedback[]): string[] {
    const issues: string[] = [];
    
    feedback.forEach(f => {
      if (f.content.text) {
        const sentiment = this.analyzeSentiment(f.content.text);
        issues.push(...sentiment.issues);
      }
    });

    // Count frequency and return top issues
    const issueCount = new Map<string, number>();
    issues.forEach(issue => {
      issueCount.set(issue, (issueCount.get(issue) || 0) + 1);
    });

    return Array.from(issueCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue]) => issue);
  }

  private generateSuggestedActions(dimension: string, key: string, issues: string[]): string[] {
    const actions: string[] = [];
    
    if (dimension === 'model') {
      actions.push(`Evaluate alternative models for tasks currently using ${key}`);
      actions.push(`Adjust ${key} parameters based on common issues`);
    }
    
    if (dimension === 'task_type') {
      actions.push(`Create specialized prompts for ${key} tasks`);
      actions.push(`Implement task-specific validation for ${key}`);
    }
    
    if (dimension === 'response_time') {
      actions.push('Optimize response time through model selection');
      actions.push('Implement caching for slow queries');
    }

    // Add issue-specific actions
    issues.forEach(issue => {
      if (issue.includes('slow')) {
        actions.push('Implement performance optimizations');
      }
      if (issue.includes('wrong')) {
        actions.push('Add accuracy validation checks');
      }
    });

    return [...new Set(actions)]; // Remove duplicates
  }

  private determineImprovementType(pattern: FeedbackPattern): ImprovementAction['type'] {
    if (pattern.pattern.includes('model')) return 'model_change';
    if (pattern.pattern.includes('prompt')) return 'prompt_adjustment';
    if (pattern.pattern.includes('response_time')) return 'parameter_tuning';
    return 'workflow_change';
  }

  private estimateImpact(pattern: FeedbackPattern): number {
    let impact = 0.5; // Base impact
    
    if (pattern.severity === 'critical') impact += 0.4;
    else if (pattern.severity === 'high') impact += 0.3;
    else if (pattern.severity === 'medium') impact += 0.2;
    
    if (pattern.frequency > 50) impact += 0.2;
    else if (pattern.frequency > 20) impact += 0.1;
    
    return Math.min(impact, 1);
  }

  private recordSentimentLearning(feedback: UserFeedback, sentiment: any): void {
    // Record sentiment patterns for future learning
  }

  private analyzeRatingContext(feedback: UserFeedback): void {
    // Analyze what context leads to specific ratings
  }

  private processCorrection(feedback: UserFeedback): void {
    // Process user corrections to improve future responses
    if (feedback.content.expectedOutput && feedback.content.actualOutput) {
      // Store correction for training
    }
  }

  private analyzeTrends(feedback: UserFeedback[]): Array<{metric: string, trend: 'improving' | 'declining' | 'stable'}> {
    // Implement trend analysis
    return [];
  }

  private analyzeUserSegments(feedback: UserFeedback[]): Record<string, any> {
    // Implement user segment analysis
    return {};
  }

  private generateRecommendations(feedback: UserFeedback[]): string[] {
    const recommendations: string[] = [];
    
    // Add recommendations based on feedback analysis
    const lowRatings = feedback.filter(f => f.content.rating && f.content.rating <= 2);
    if (lowRatings.length > feedback.length * 0.3) {
      recommendations.push('Focus on improving response quality - consider using higher-tier models');
    }

    return recommendations;
  }

  private updateLearningRules(): void {
    // Update internal learning rules based on patterns
  }

  private countUpdatedRules(): number {
    // Count how many rules were updated
    return 0;
  }

  private calculateConfidenceImprovements(): Array<{area: string, improvement: number}> {
    // Calculate confidence improvements in various areas
    return [];
  }

  private initializePatternDetection(): void {
    // Initialize pattern detection algorithms
  }

  private loadFeedbackHistory(): void {
    // Load feedback from persistent storage
  }

  private generateFeedbackId(): string {
    return `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getActiveImprovements(): ImprovementAction[] {
    return Array.from(this.improvements.values())
      .filter(improvement => improvement.status !== 'rejected');
  }

  getFeedbackSummary(): {
    totalFeedback: number;
    averageRating: number;
    sentimentDistribution: Record<string, number>;
    topCategories: string[];
  } {
    const ratingsData = this.feedback.filter(f => f.content.rating);
    const averageRating = ratingsData.length > 0 
      ? ratingsData.reduce((sum, f) => sum + f.content.rating!, 0) / ratingsData.length
      : 0;

    const sentimentDistribution = {
      positive: 0,
      negative: 0,
      neutral: 0
    };

    const categories = new Map<string, number>();

    this.feedback.forEach(f => {
      if (f.content.text) {
        const sentiment = this.analyzeSentiment(f.content.text);
        sentimentDistribution[sentiment.sentiment]++;
      }

      if (f.content.categories) {
        f.content.categories.forEach(cat => {
          categories.set(cat, (categories.get(cat) || 0) + 1);
        });
      }
    });

    const topCategories = Array.from(categories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);

    return {
      totalFeedback: this.feedback.length,
      averageRating,
      sentimentDistribution,
      topCategories
    };
  }
}