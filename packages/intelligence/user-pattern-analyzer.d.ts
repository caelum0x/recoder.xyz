interface UserPreferences {
    preferredFrameworks: string[];
    codingStyle: {
        indentation: 'tabs' | 'spaces';
        quotes: 'single' | 'double';
        semicolons: boolean;
        bracketSpacing: boolean;
    };
    workflowPatterns: string[];
    errorPatterns: string[];
}
export declare class UserPatternAnalyzer {
    private patterns;
    private preferences;
    private sessionHistory;
    constructor();
    analyzeCodeSubmission(code: string, language: string, context: string): void;
    analyzeUserFeedback(feedback: string, context: string, rating: number): void;
    getRecommendations(currentContext: string): string[];
    private detectFrameworkUsage;
    private analyzeCodeStyle;
    private trackWorkflowPattern;
    private extractPatternFromFeedback;
    private updatePatternEffectiveness;
    private getRelevantPatterns;
    private recordPattern;
    private getFrameworkSignatures;
    private updatePreferences;
    private loadPreferences;
    private loadPatterns;
    private savePreferences;
    getInsights(): {
        mostUsedFrameworks: string[];
        preferredStyle: UserPreferences['codingStyle'];
        successRate: number;
        improvementAreas: string[];
    };
}
export {};
//# sourceMappingURL=user-pattern-analyzer.d.ts.map