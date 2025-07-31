interface ProjectContext {
    id: string;
    name: string;
    type: 'web' | 'mobile' | 'api' | 'library' | 'cli' | 'desktop';
    technologies: string[];
    architecture: string[];
    dependencies: Record<string, string>;
    codebaseSize: {
        files: number;
        lines: number;
        languages: Record<string, number>;
    };
    lastAnalyzed: Date;
}
export declare class ContextMemory {
    private projectContext;
    private conversationHistory;
    private currentConversation;
    private semanticContext;
    private fileAnalysisCache;
    constructor();
    analyzeProject(rootPath: string): Promise<ProjectContext>;
    addMessage(role: 'user' | 'assistant', content: string, metadata?: {
        codeBlocks?: string[];
        files?: string[];
    }): void;
    getRelevantContext(query: string, maxResults?: number): {
        relevantFiles: string[];
        relatedConcepts: string[];
        similarQueries: string[];
        projectInsights: string[];
    };
    rememberFileAnalysis(filePath: string, content: string, analysis: any): void;
    getFileContext(filePath: string): {
        lastAnalysis: any;
        relatedFiles: string[];
        concepts: string[];
        patterns: string[];
    } | null;
    private detectProjectType;
    private detectTechnologies;
    private analyzeArchitecture;
    private extractSemanticInfo;
    private findRelevantFiles;
    private findRelatedConcepts;
    private initializeSession;
    private updateTopics;
    private generateProjectId;
    private generateSessionId;
    private extractProjectName;
    private tokenize;
    private extractConcepts;
    private extractRelationships;
    private fileExists;
    private readFile;
    private listDirectories;
    getProjectSummary(): string;
    getConversationSummary(): string;
}
export {};
//# sourceMappingURL=context-memory.d.ts.map