/**
 * AI Prompt Sanitizer
 * Prevents prompt injection and malicious input attacks
 */
export interface SanitizationResult {
    sanitized: string;
    threats: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
}
export interface SanitizationConfig {
    maxLength: number;
    removeHtml: boolean;
    detectInjection: boolean;
    logThreats: boolean;
}
export declare class AIPromptSanitizer {
    private config;
    private injectionPatterns;
    constructor(config?: Partial<SanitizationConfig>);
    sanitizePrompt(input: string): SanitizationResult;
    validatePrompt(input: string): boolean;
}
//# sourceMappingURL=ai-prompt-sanitizer.d.ts.map