"use strict";
/**
 * AI Prompt Sanitizer
 * Prevents prompt injection and malicious input attacks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIPromptSanitizer = void 0;
const shared_1 = require("@recoder/shared");
class AIPromptSanitizer {
    constructor(config = {}) {
        this.injectionPatterns = [
            /ignore\s+previous\s+instructions/gi,
            /system\s*:\s*you\s+are\s+now/gi,
            /(?:pretend|act)\s+(?:as|like)\s+(?:a|an)/gi,
            /\[system\]/gi,
            /\<\|system\|\>/gi,
            /__[A-Z_]+__/g,
            /jailbreak/gi,
            /bypass\s+safety/gi
        ];
        this.config = {
            maxLength: 10000,
            removeHtml: true,
            detectInjection: true,
            logThreats: true,
            ...config
        };
    }
    sanitizePrompt(input) {
        const threats = [];
        let sanitized = input;
        let riskLevel = 'low';
        // Check for prompt injection patterns
        if (this.config.detectInjection) {
            for (const pattern of this.injectionPatterns) {
                const matches = input.match(pattern);
                if (matches) {
                    threats.push(`Potential prompt injection: ${matches[0]}`);
                    sanitized = sanitized.replace(pattern, '[REDACTED]');
                    riskLevel = 'high';
                }
            }
        }
        // Remove HTML/script tags
        if (this.config.removeHtml) {
            const scriptMatches = sanitized.match(/<script[^>]*>.*?<\/script>/gi);
            if (scriptMatches) {
                threats.push('Script tags detected and removed');
                sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '[SCRIPT_REMOVED]');
                riskLevel = 'critical';
            }
            sanitized = sanitized.replace(/<[^>]*>/g, '');
        }
        // Length limitation
        if (sanitized.length > this.config.maxLength) {
            sanitized = sanitized.substring(0, this.config.maxLength) + '... [TRUNCATED]';
            threats.push('Input truncated due to excessive length');
            if (riskLevel === 'low')
                riskLevel = 'medium';
        }
        // Log threats if configured
        if (this.config.logThreats && threats.length > 0) {
            shared_1.Logger.warn(`AI Prompt Sanitizer detected ${threats.length} threats`, { threats, riskLevel });
        }
        return { sanitized, threats, riskLevel };
    }
    validatePrompt(input) {
        const result = this.sanitizePrompt(input);
        return result.threats.length === 0;
    }
}
exports.AIPromptSanitizer = AIPromptSanitizer;
//# sourceMappingURL=ai-prompt-sanitizer.js.map