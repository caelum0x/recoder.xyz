interface TaskRequirements {
    type: 'code-generation' | 'analysis' | 'explanation' | 'debugging' | 'refactoring' | 'documentation';
    complexity: 'low' | 'medium' | 'high';
    contextSize: number;
    expectedOutputSize: number;
    timeConstraint: 'real-time' | 'standard' | 'batch';
    qualityRequirement: 'basic' | 'production' | 'critical';
}
interface PerformanceMetrics {
    modelName: string;
    taskType: string;
    responseTime: number;
    tokenUsage: {
        input: number;
        output: number;
    };
    quality: {
        accuracy: number;
        relevance: number;
        completeness: number;
    };
    cost: number;
    timestamp: Date;
}
export declare class PerformanceOptimizer {
    private models;
    private performanceHistory;
    private currentModel;
    private adaptiveThresholds;
    constructor();
    selectOptimalModel(task: TaskRequirements): {
        modelName: string;
        confidence: number;
        reasoning: string[];
        alternatives: Array<{
            model: string;
            score: number;
        }>;
    };
    recordPerformance(metrics: PerformanceMetrics): void;
    optimizePrompt(prompt: string, task: TaskRequirements): {
        optimizedPrompt: string;
        tokensSaved: number;
        qualityImpact: number;
    };
    predictPerformance(modelName: string, task: TaskRequirements): {
        estimatedLatency: number;
        estimatedCost: number;
        estimatedQuality: number;
        confidence: number;
    };
    getOptimizationRecommendations(): Array<{
        type: 'model' | 'prompt' | 'batching' | 'caching';
        description: string;
        impact: 'high' | 'medium' | 'low';
        effort: 'high' | 'medium' | 'low';
    }>;
    private initializeModels;
    private evaluateModels;
    private getTaskAlignment;
    private predictLatency;
    private predictCost;
    private predictQuality;
    private updateModelCapabilities;
    private adjustThresholds;
    private estimateTokens;
    private compressInstructions;
    private applyTaskTemplate;
    private estimateQualityImpact;
    private analyzeTaskPatterns;
    private generateReasoning;
    private loadPerformanceHistory;
    getModelStats(): Record<string, {
        averageLatency: number;
        averageCost: number;
        averageQuality: number;
        usageCount: number;
    }>;
}
export {};
//# sourceMappingURL=performance-optimizer.d.ts.map