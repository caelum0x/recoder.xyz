interface APIUsage {
    id: string;
    timestamp: Date;
    provider: 'openai' | 'anthropic' | 'google' | 'local';
    model: string;
    endpoint: string;
    tokenUsage: {
        input: number;
        output: number;
        total: number;
    };
    cost: {
        input: number;
        output: number;
        total: number;
    };
    responseTime: number;
    userId?: string;
    projectId?: string;
    taskType: string;
}
interface Budget {
    id: string;
    name: string;
    type: 'daily' | 'weekly' | 'monthly' | 'project' | 'user';
    limit: number;
    spent: number;
    remaining: number;
    period: {
        start: Date;
        end: Date;
    };
    alerts: {
        threshold: number;
        triggered: boolean;
        lastAlert: Date | null;
    }[];
}
interface CostOptimization {
    suggestion: string;
    potentialSavings: number;
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    category: 'model' | 'prompt' | 'caching' | 'batching' | 'scheduling';
}
export declare class CostTracker {
    private usage;
    private budgets;
    private costRules;
    private alerts;
    constructor();
    recordUsage(usage: Omit<APIUsage, 'id' | 'timestamp' | 'cost'>): APIUsage;
    createBudget(budget: Omit<Budget, 'id' | 'spent' | 'remaining'>): Budget;
    getBudgetStatus(budgetId?: string): Budget[];
    getCostAnalysis(period: {
        start: Date;
        end: Date;
    }, groupBy?: 'day' | 'model' | 'user' | 'project'): {
        totalCost: number;
        totalTokens: number;
        averageCostPerToken: number;
        breakdown: Record<string, {
            cost: number;
            tokens: number;
            requests: number;
        }>;
        trends: {
            period: string;
            cost: number;
        }[];
    };
    getOptimizationSuggestions(): CostOptimization[];
    predictMonthlySpend(): {
        current: number;
        projected: number;
        confidence: number;
        breakdown: Record<string, number>;
    };
    getAlerts(): typeof this.alerts;
    acknowledgeAlert(alertId: string): void;
    private calculateCost;
    private updateBudgets;
    private checkAlerts;
    private analyzeSpending;
    private analyzeModelUsage;
    private analyzePromptEfficiency;
    private analyzeTimingPatterns;
    private analyzeTokenUsage;
    private calculateTrends;
    private getGroupingFunction;
    private isBudgetActive;
    private isBudgetApplicable;
    private createAlert;
    private initializeCostRules;
    private generateUsageId;
    private generateBudgetId;
    private generateAlertId;
    private loadBudgets;
    private loadUsageHistory;
    exportData(format: 'csv' | 'json', period?: {
        start: Date;
        end: Date;
    }): string;
}
export {};
//# sourceMappingURL=cost-tracker.d.ts.map