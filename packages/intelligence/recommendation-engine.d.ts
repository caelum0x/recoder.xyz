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
export declare class RecommendationEngine {
    private patternAnalyzer;
    private contextMemory;
    private performanceOptimizer;
    private costTracker;
    private feedbackProcessor;
    private recommendations;
    private rules;
    private userPreferences;
    constructor(patternAnalyzer: UserPatternAnalyzer, contextMemory: ContextMemory, performanceOptimizer: PerformanceOptimizer, costTracker: CostTracker, feedbackProcessor: FeedbackProcessor);
    generateRecommendations(context?: {
        currentTask?: string;
        activeFiles?: string[];
        timeConstraint?: 'immediate' | 'standard' | 'batch';
    }): Recommendation[];
    getActiveRecommendations(filters?: {
        category?: string[];
        priority?: string[];
        type?: string[];
        showDismissed?: boolean;
    }): Recommendation[];
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
    };
    dismissRecommendation(recommendationId: string, reason?: string): void;
    provideFeedback(recommendationId: string, feedback: {
        helpful: boolean;
        implemented: boolean;
        comments?: string;
        rating?: number;
    }): void;
    getRecommendationInsights(): {
        totalRecommendations: number;
        implementationRate: number;
        categoryBreakdown: Record<string, number>;
        priorityDistribution: Record<string, number>;
        averageConfidence: number;
        topTriggeredRules: Array<{
            rule: string;
            count: number;
        }>;
    };
    private initializeRules;
    private addRule;
    private shouldExecuteRule;
    private executeRule;
    private gatherRuleData;
    private evaluateTrigger;
    private generatePerformanceOptimizationRecommendation;
    private generateCostOptimizationRecommendation;
    private generatePatternLearningRecommendation;
    private generateContextAwarenessRecommendation;
    private generateQualityImprovementRecommendation;
    private isRecommendationRelevant;
    private findSimilarRecommendation;
    private calculateSimilarity;
    private sortRecommendations;
    private executeAction;
    private hasRelevantDataChanged;
    private learnFromDismissal;
    private updateRecommendationConfidence;
    private learnFromFeedback;
    private loadRecommendations;
    private generateRecommendationId;
    updateUserPreferences(preferences: Partial<typeof this.userPreferences>): void;
    enableRule(ruleId: string): void;
    disableRule(ruleId: string): void;
    clearOldRecommendations(maxAge?: number): void;
}
export {};
//# sourceMappingURL=recommendation-engine.d.ts.map