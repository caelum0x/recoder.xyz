interface UserFeedback {
    id: string;
    timestamp: Date;
    userId?: string;
    sessionId: string;
    type: 'rating' | 'text' | 'correction' | 'suggestion' | 'bug_report';
    content: {
        rating?: number;
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
interface ImprovementAction {
    id: string;
    type: 'prompt_adjustment' | 'model_change' | 'parameter_tuning' | 'workflow_change' | 'feature_request';
    description: string;
    triggeredBy: string[];
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
export declare class FeedbackProcessor {
    private feedback;
    private patterns;
    private improvements;
    private learningHistory;
    constructor();
    processFeedback(feedback: Omit<UserFeedback, 'id' | 'timestamp' | 'processed' | 'actionsTaken'>): UserFeedback;
    analyzeSentiment(text: string): {
        sentiment: 'positive' | 'negative' | 'neutral';
        confidence: number;
        emotions: string[];
        issues: string[];
    };
    identifyImprovementOpportunities(): Array<{
        area: string;
        priority: 'low' | 'medium' | 'high' | 'critical';
        description: string;
        affectedUsers: number;
        potentialImpact: number;
        suggestedActions: string[];
    }>;
    getInsights(timeframe?: {
        start: Date;
        end: Date;
    }): {
        overallSatisfaction: number;
        topIssues: Array<{
            issue: string;
            frequency: number;
        }>;
        improvementTrends: Array<{
            metric: string;
            trend: 'improving' | 'declining' | 'stable';
        }>;
        userSegmentInsights: Record<string, any>;
        actionableRecommendations: string[];
    };
    trainFromFeedback(): {
        newPatterns: number;
        updatedRules: number;
        confidenceImprovements: Array<{
            area: string;
            improvement: number;
        }>;
    };
    private analyzeFeedback;
    private detectPatterns;
    private analyzeGroupPatterns;
    private generateImprovements;
    private extractCommonIssues;
    private generateSuggestedActions;
    private determineImprovementType;
    private estimateImpact;
    private recordSentimentLearning;
    private analyzeRatingContext;
    private processCorrection;
    private analyzeTrends;
    private analyzeUserSegments;
    private generateRecommendations;
    private updateLearningRules;
    private countUpdatedRules;
    private calculateConfidenceImprovements;
    private initializePatternDetection;
    private loadFeedbackHistory;
    private generateFeedbackId;
    getActiveImprovements(): ImprovementAction[];
    getFeedbackSummary(): {
        totalFeedback: number;
        averageRating: number;
        sentimentDistribution: Record<string, number>;
        topCategories: string[];
    };
}
export {};
//# sourceMappingURL=feedback-processor.d.ts.map