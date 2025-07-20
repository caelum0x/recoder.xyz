import { UserPatternAnalyzer } from './user-pattern-analyzer';
import { ContextMemory } from './context-memory';
import { PerformanceOptimizer } from './performance-optimizer';
import { CostTracker } from './cost-tracker';
import { FeedbackProcessor } from './feedback-processor';

interface Recommendation {
  id: string;
  type: 'optimization' | 'suggestion' | 'warning' | 'improvement' | 'learning';
  category: 'performance' | 'cost' | 'quality' | 'workflow' | 'learning' | 'security';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  impact: {
    effort: 'low' | 'medium' | 'high';
    benefit: 'low' | 'medium' | 'high';
    timeframe: 'immediate' | 'short' | 'medium' | 'long';
  };
  actions: Array<{
    type: 'code' | 'config' | 'process' | 'learning';
    description: string;
    automated: boolean;
  }>;
  context: {
    triggeredBy: string[];
    relevantFiles: string[];
    relatedConcepts: string[];
  };
  metadata: {
    timestamp: Date;
    viewed: boolean;
    dismissed: boolean;
    implemented: boolean;
    feedback?: string;
  };
}

interface RecommendationRule {
  id: string;
  name: string;
  description: string;
  triggers: Array<{
    source: 'patterns' | 'context' | 'performance' | 'cost' | 'feedback';
    condition: string;
    threshold?: number;
  }>;
  generator: (data: any) => Recommendation | null;
  enabled: boolean;
  frequency: 'always' | 'daily' | 'weekly' | 'on_change';
  lastExecuted?: Date;
}

export class RecommendationEngine {
  private patternAnalyzer: UserPatternAnalyzer;
  private contextMemory: ContextMemory;
  private performanceOptimizer: PerformanceOptimizer;
  private costTracker: CostTracker;
  private feedbackProcessor: FeedbackProcessor;
  
  private recommendations: Map<string, Recommendation> = new Map();
  private rules: Map<string, RecommendationRule> = new Map();
  private userPreferences: {
    notificationLevel: 'minimal' | 'normal' | 'verbose';
    categories: string[];
    autoImplement: string[];
    dismissed: string[];
  };

  constructor(
    patternAnalyzer: UserPatternAnalyzer,
    contextMemory: ContextMemory,
    performanceOptimizer: PerformanceOptimizer,
    costTracker: CostTracker,
    feedbackProcessor: FeedbackProcessor
  ) {
    this.patternAnalyzer = patternAnalyzer;
    this.contextMemory = contextMemory;
    this.performanceOptimizer = performanceOptimizer;
    this.costTracker = costTracker;
    this.feedbackProcessor = feedbackProcessor;
    
    this.userPreferences = {
      notificationLevel: 'normal',
      categories: ['performance', 'cost', 'quality'],
      autoImplement: [],
      dismissed: []
    };

    this.initializeRules();
    this.loadRecommendations();
  }

  generateRecommendations(context?: {
    currentTask?: string;
    activeFiles?: string[];
    timeConstraint?: 'immediate' | 'standard' | 'batch';
  }): Recommendation[] {
    const newRecommendations: Recommendation[] = [];
    
    // Execute all enabled rules
    for (const rule of this.rules.values()) {
      if (!rule.enabled || !this.shouldExecuteRule(rule)) continue;
      
      try {
        const recommendation = this.executeRule(rule, context);
        if (recommendation && this.isRecommendationRelevant(recommendation)) {
          // Check for duplicates
          const existingId = this.findSimilarRecommendation(recommendation);
          if (!existingId) {
            this.recommendations.set(recommendation.id, recommendation);
            newRecommendations.push(recommendation);
          }
        }
        
        rule.lastExecuted = new Date();
      } catch (error) {
        console.error(`Error executing rule ${rule.id}:`, error);
      }
    }

    // Sort by priority and confidence
    return this.sortRecommendations(newRecommendations);
  }

  getActiveRecommendations(filters?: {
    category?: string[];
    priority?: string[];
    type?: string[];
    showDismissed?: boolean;
  }): Recommendation[] {
    let recommendations = Array.from(this.recommendations.values());
    
    if (!filters?.showDismissed) {
      recommendations = recommendations.filter(r => !r.metadata.dismissed);
    }
    
    if (filters?.category) {
      recommendations = recommendations.filter(r => filters.category!.includes(r.category));
    }
    
    if (filters?.priority) {
      recommendations = recommendations.filter(r => filters.priority!.includes(r.priority));
    }
    
    if (filters?.type) {
      recommendations = recommendations.filter(r => filters.type!.includes(r.type));
    }
    
    return this.sortRecommendations(recommendations);
  }

  implementRecommendation(recommendationId: string, options?: {
    dryRun?: boolean;
    customActions?: string[];
  }): {
    success: boolean;
    actions: Array<{
      action: string;
      result: 'success' | 'failed' | 'skipped';
      message: string;
    }>;
    changes: string[];
  } {
    const recommendation = this.recommendations.get(recommendationId);
    if (!recommendation) {
      throw new Error(`Recommendation ${recommendationId} not found`);
    }

    const results = {
      success: true,
      actions: [] as Array<{action: string, result: 'success' | 'failed' | 'skipped', message: string}>,
      changes: [] as string[]
    };

    // Execute actions
    for (const action of recommendation.actions) {
      try {
        if (options?.dryRun) {
          results.actions.push({
            action: action.description,
            result: 'skipped',
            message: 'Dry run mode'
          });
          continue;
        }

        const result = this.executeAction(action, recommendation.context);
        results.actions.push({
          action: action.description,
          result: result.success ? 'success' : 'failed',
          message: result.message
        });
        
        if (result.success) {
          results.changes.push(...result.changes);
        } else {
          results.success = false;
        }
      } catch (error) {
        results.actions.push({
          action: action.description,
          result: 'failed',
          message: `Error: ${error}`
        });
        results.success = false;
      }
    }

    // Mark as implemented if successful
    if (results.success && !options?.dryRun) {
      recommendation.metadata.implemented = true;
    }

    return results;
  }

  dismissRecommendation(recommendationId: string, reason?: string): void {
    const recommendation = this.recommendations.get(recommendationId);
    if (recommendation) {
      recommendation.metadata.dismissed = true;
      recommendation.metadata.feedback = reason;
      
      // Learn from dismissal
      this.learnFromDismissal(recommendation, reason);
    }
  }

  provideFeedback(recommendationId: string, feedback: {
    helpful: boolean;
    implemented: boolean;
    comments?: string;
    rating?: number;
  }): void {
    const recommendation = this.recommendations.get(recommendationId);
    if (recommendation) {
      recommendation.metadata.feedback = JSON.stringify(feedback);
      
      // Update recommendation confidence based on feedback
      this.updateRecommendationConfidence(recommendation, feedback);
      
      // Learn from feedback
      this.learnFromFeedback(recommendation, feedback);
    }
  }

  getRecommendationInsights(): {
    totalRecommendations: number;
    implementationRate: number;
    categoryBreakdown: Record<string, number>;
    priorityDistribution: Record<string, number>;
    averageConfidence: number;
    topTriggeredRules: Array<{rule: string, count: number}>;
  } {
    const recommendations = Array.from(this.recommendations.values());
    
    const implemented = recommendations.filter(r => r.metadata.implemented).length;
    const implementationRate = recommendations.length > 0 ? implemented / recommendations.length : 0;
    
    const categoryBreakdown: Record<string, number> = {};
    const priorityDistribution: Record<string, number> = {};
    let totalConfidence = 0;
    
    recommendations.forEach(r => {
      categoryBreakdown[r.category] = (categoryBreakdown[r.category] || 0) + 1;
      priorityDistribution[r.priority] = (priorityDistribution[r.priority] || 0) + 1;
      totalConfidence += r.confidence;
    });
    
    const averageConfidence = recommendations.length > 0 ? totalConfidence / recommendations.length : 0;
    
    // Count rule triggers
    const ruleTriggerscount = new Map<string, number>();
    recommendations.forEach(r => {
      r.context.triggeredBy.forEach(trigger => {
        ruleTriggerscount.set(trigger, (ruleTriggerscount.get(trigger) || 0) + 1);
      });
    });
    
    const topTriggeredRules = Array.from(ruleTriggerscount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([rule, count]) => ({rule, count}));

    return {
      totalRecommendations: recommendations.length,
      implementationRate,
      categoryBreakdown,
      priorityDistribution,
      averageConfidence,
      topTriggeredRules
    };
  }

  private initializeRules(): void {
    // Performance optimization rules
    this.addRule({
      id: 'model_performance_optimization',
      name: 'Model Performance Optimization',
      description: 'Suggests better model choices based on task requirements',
      triggers: [{
        source: 'performance',
        condition: 'avgResponseTime > 5000'
      }],
      generator: (data) => this.generatePerformanceOptimizationRecommendation(data),
      enabled: true,
      frequency: 'on_change'
    });

    // Cost optimization rules
    this.addRule({
      id: 'cost_optimization',
      name: 'Cost Optimization',
      description: 'Identifies opportunities to reduce API costs',
      triggers: [{
        source: 'cost',
        condition: 'dailySpend > 10',
        threshold: 10
      }],
      generator: (data) => this.generateCostOptimizationRecommendation(data),
      enabled: true,
      frequency: 'daily'
    });

    // Pattern-based learning rules
    this.addRule({
      id: 'pattern_learning',
      name: 'Pattern Learning Suggestions',
      description: 'Suggests improvements based on user patterns',
      triggers: [{
        source: 'patterns',
        condition: 'newPatternDetected'
      }],
      generator: (data) => this.generatePatternLearningRecommendation(data),
      enabled: true,
      frequency: 'on_change'
    });

    // Context awareness rules
    this.addRule({
      id: 'context_awareness',
      name: 'Context Awareness Improvements',
      description: 'Suggests better context utilization',
      triggers: [{
        source: 'context',
        condition: 'contextUnderutilized'
      }],
      generator: (data) => this.generateContextAwarenessRecommendation(data),
      enabled: true,
      frequency: 'weekly'
    });

    // Quality improvement rules
    this.addRule({
      id: 'quality_improvement',
      name: 'Quality Improvement',
      description: 'Suggests ways to improve response quality',
      triggers: [{
        source: 'feedback',
        condition: 'averageRating < 3.5',
        threshold: 3.5
      }],
      generator: (data) => this.generateQualityImprovementRecommendation(data),
      enabled: true,
      frequency: 'on_change'
    });
  }

  private addRule(rule: Omit<RecommendationRule, 'lastExecuted'>): void {
    this.rules.set(rule.id, rule);
  }

  private shouldExecuteRule(rule: RecommendationRule): boolean {
    if (rule.frequency === 'always') return true;
    
    if (!rule.lastExecuted) return true;
    
    const now = new Date();
    const timeSinceLastExecution = now.getTime() - rule.lastExecuted.getTime();
    
    switch (rule.frequency) {
      case 'daily':
        return timeSinceLastExecution > 24 * 60 * 60 * 1000;
      case 'weekly':
        return timeSinceLastExecution > 7 * 24 * 60 * 60 * 1000;
      case 'on_change':
        return this.hasRelevantDataChanged(rule);
      default:
        return false;
    }
  }

  private executeRule(rule: RecommendationRule, context?: any): Recommendation | null {
    // Gather data for rule evaluation
    const data = this.gatherRuleData(rule, context);
    
    // Check if triggers are met
    const triggered = rule.triggers.some(trigger => this.evaluateTrigger(trigger, data));
    
    if (!triggered) return null;
    
    // Generate recommendation
    return rule.generator(data);
  }

  private gatherRuleData(rule: RecommendationRule, context?: any): any {
    const data: any = { context };
    
    rule.triggers.forEach(trigger => {
      switch (trigger.source) {
        case 'patterns':
          data.patterns = this.patternAnalyzer.getInsights();
          break;
        case 'context':
          data.contextSummary = this.contextMemory.getProjectSummary();
          break;
        case 'performance':
          data.performance = this.performanceOptimizer.getModelStats();
          break;
        case 'cost':
          data.cost = this.costTracker.predictMonthlySpend();
          break;
        case 'feedback':
          data.feedback = this.feedbackProcessor.getFeedbackSummary();
          break;
      }
    });
    
    return data;
  }

  private evaluateTrigger(trigger: any, data: any): boolean {
    // Simple evaluation logic - in production, use more sophisticated expression evaluation
    switch (trigger.condition) {
      case 'avgResponseTime > 5000':
        return data.performance?.averageLatency > 5000;
      case 'dailySpend > 10':
        return data.cost?.current > (trigger.threshold || 10);
      case 'newPatternDetected':
        return data.patterns?.mostUsedFrameworks?.length > 0;
      case 'contextUnderutilized':
        return data.contextSummary && data.contextSummary.includes('No active conversation');
      case 'averageRating < 3.5':
        return data.feedback?.averageRating < (trigger.threshold || 3.5);
      default:
        return false;
    }
  }

  private generatePerformanceOptimizationRecommendation(data: any): Recommendation {
    return {
      id: this.generateRecommendationId(),
      type: 'optimization',
      category: 'performance',
      title: 'Optimize Model Performance',
      description: 'Your current model selection may not be optimal for response time requirements',
      priority: 'medium',
      confidence: 0.8,
      impact: {
        effort: 'low',
        benefit: 'high',
        timeframe: 'immediate'
      },
      actions: [{
        type: 'config',
        description: 'Switch to faster models for time-sensitive tasks',
        automated: true
      }],
      context: {
        triggeredBy: ['model_performance_optimization'],
        relevantFiles: [],
        relatedConcepts: ['model-selection', 'performance']
      },
      metadata: {
        timestamp: new Date(),
        viewed: false,
        dismissed: false,
        implemented: false
      }
    };
  }

  private generateCostOptimizationRecommendation(data: any): Recommendation {
    const suggestions = this.costTracker.getOptimizationSuggestions();
    const topSuggestion = suggestions[0];
    
    return {
      id: this.generateRecommendationId(),
      type: 'optimization',
      category: 'cost',
      title: 'Reduce API Costs',
      description: topSuggestion?.suggestion || 'Opportunities identified to reduce API costs',
      priority: 'high',
      confidence: 0.9,
      impact: {
        effort: topSuggestion?.effort || 'medium',
        benefit: topSuggestion?.impact || 'high',
        timeframe: 'short'
      },
      actions: [{
        type: 'config',
        description: topSuggestion?.suggestion || 'Implement cost optimization',
        automated: false
      }],
      context: {
        triggeredBy: ['cost_optimization'],
        relevantFiles: [],
        relatedConcepts: ['cost-optimization', 'api-usage']
      },
      metadata: {
        timestamp: new Date(),
        viewed: false,
        dismissed: false,
        implemented: false
      }
    };
  }

  private generatePatternLearningRecommendation(data: any): Recommendation {
    const insights = data.patterns;
    
    return {
      id: this.generateRecommendationId(),
      type: 'learning',
      category: 'learning',
      title: 'Improve Based on Usage Patterns',
      description: `We've noticed you frequently use ${insights.mostUsedFrameworks?.[0]}. We can optimize for this.`,
      priority: 'low',
      confidence: 0.7,
      impact: {
        effort: 'low',
        benefit: 'medium',
        timeframe: 'medium'
      },
      actions: [{
        type: 'learning',
        description: 'Update AI preferences based on usage patterns',
        automated: true
      }],
      context: {
        triggeredBy: ['pattern_learning'],
        relevantFiles: [],
        relatedConcepts: ['user-patterns', 'learning']
      },
      metadata: {
        timestamp: new Date(),
        viewed: false,
        dismissed: false,
        implemented: false
      }
    };
  }

  private generateContextAwarenessRecommendation(data: any): Recommendation {
    return {
      id: this.generateRecommendationId(),
      type: 'improvement',
      category: 'workflow',
      title: 'Improve Context Awareness',
      description: 'Enable better project understanding for more relevant suggestions',
      priority: 'medium',
      confidence: 0.6,
      impact: {
        effort: 'medium',
        benefit: 'high',
        timeframe: 'medium'
      },
      actions: [{
        type: 'process',
        description: 'Analyze project structure and dependencies',
        automated: true
      }],
      context: {
        triggeredBy: ['context_awareness'],
        relevantFiles: [],
        relatedConcepts: ['context-memory', 'project-analysis']
      },
      metadata: {
        timestamp: new Date(),
        viewed: false,
        dismissed: false,
        implemented: false
      }
    };
  }

  private generateQualityImprovementRecommendation(data: any): Recommendation {
    return {
      id: this.generateRecommendationId(),
      type: 'improvement',
      category: 'quality',
      title: 'Improve Response Quality',
      description: 'Recent feedback indicates opportunities to improve response quality',
      priority: 'high',
      confidence: 0.85,
      impact: {
        effort: 'medium',
        benefit: 'high',
        timeframe: 'short'
      },
      actions: [{
        type: 'config',
        description: 'Use higher-quality models for critical tasks',
        automated: false
      }],
      context: {
        triggeredBy: ['quality_improvement'],
        relevantFiles: [],
        relatedConcepts: ['quality', 'feedback', 'model-selection']
      },
      metadata: {
        timestamp: new Date(),
        viewed: false,
        dismissed: false,
        implemented: false
      }
    };
  }

  private isRecommendationRelevant(recommendation: Recommendation): boolean {
    // Check user preferences
    if (!this.userPreferences.categories.includes(recommendation.category)) {
      return false;
    }
    
    // Check if similar recommendation was recently dismissed
    if (this.userPreferences.dismissed.includes(recommendation.type)) {
      return false;
    }
    
    // Check confidence threshold
    if (recommendation.confidence < 0.5) {
      return false;
    }
    
    return true;
  }

  private findSimilarRecommendation(recommendation: Recommendation): string | null {
    for (const existing of this.recommendations.values()) {
      if (existing.type === recommendation.type && 
          existing.category === recommendation.category &&
          this.calculateSimilarity(existing.description, recommendation.description) > 0.8) {
        return existing.id;
      }
    }
    return null;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple similarity calculation - in production, use more sophisticated methods
    const words1 = new Set(text1.toLowerCase().split(/\W+/));
    const words2 = new Set(text2.toLowerCase().split(/\W+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private sortRecommendations(recommendations: Recommendation[]): Recommendation[] {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    
    return recommendations.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      return b.confidence - a.confidence;
    });
  }

  private executeAction(action: any, context: any): {
    success: boolean;
    message: string;
    changes: string[];
  } {
    // Implementation would depend on action type
    return {
      success: true,
      message: 'Action executed successfully',
      changes: []
    };
  }

  private hasRelevantDataChanged(rule: RecommendationRule): boolean {
    // Check if relevant data has changed since last execution
    return true; // Simplified
  }

  private learnFromDismissal(recommendation: Recommendation, reason?: string): void {
    // Learn from user dismissals to improve future recommendations
  }

  private updateRecommendationConfidence(recommendation: Recommendation, feedback: any): void {
    // Update confidence based on user feedback
    if (feedback.helpful) {
      recommendation.confidence = Math.min(1, recommendation.confidence + 0.1);
    } else {
      recommendation.confidence = Math.max(0, recommendation.confidence - 0.1);
    }
  }

  private learnFromFeedback(recommendation: Recommendation, feedback: any): void {
    // Learn from feedback to improve future recommendations
  }

  private loadRecommendations(): void {
    // Load recommendations from persistent storage
  }

  private generateRecommendationId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods
  updateUserPreferences(preferences: Partial<typeof this.userPreferences>): void {
    this.userPreferences = { ...this.userPreferences, ...preferences };
  }

  enableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
    }
  }

  disableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
    }
  }

  clearOldRecommendations(maxAge: number = 30 * 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge);
    
    for (const [id, recommendation] of this.recommendations.entries()) {
      if (recommendation.metadata.timestamp < cutoff) {
        this.recommendations.delete(id);
      }
    }
  }
}