/**
 * AI Prompt Sanitization and Injection Prevention
 * Protects against prompt injection, jailbreaking, and malicious AI manipulation
 */

import sanitizeHtml from 'sanitize-html';
import validator from 'validator';
import { Logger } from '@recoder/shared';

export interface PromptSanitizationConfig {
  maxLength: number;
  allowedDomains: string[];
  blockedPatterns: RegExp[];
  strictMode: boolean;
  logViolations: boolean;
  emergencyStop: boolean;
}

export interface SanitizationResult {
  sanitized: string;
  violations: SecurityViolation[];
  riskScore: number;
  blocked: boolean;
  metadata: {
    originalLength: number;
    sanitizedLength: number;
    processingTime: number;
    detectedAttacks: string[];
  };
}

export interface SecurityViolation {
  type: 'prompt_injection' | 'jailbreak' | 'data_exfiltration' | 'code_injection' | 'social_engineering';
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: string;
  location: { start: number; end: number };
  description: string;
  mitigation: string;
}

export class AIPromptSanitizer {
  private readonly logger = new Logger('AIPromptSanitizer');
  private readonly config: PromptSanitizationConfig;
  
  // Known prompt injection patterns
  private readonly injectionPatterns = [
    // Direct instruction overrides
    /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi,
    /forget\s+(everything|all)\s+(you\s+)?(know|learned)/gi,
    /disregard\s+(all\s+)?(previous|above|security)\s+(instructions?|measures?)/gi,
    
    // System prompt manipulation
    /you\s+are\s+(now\s+)?(a\s+)?(different|new)\s+(ai|assistant|system)/gi,
    /act\s+as\s+(if\s+)?you\s+(are\s+)?(not\s+)?(bound\s+by|constrained\s+by)/gi,
    /pretend\s+(that\s+)?you\s+(are\s+)?(a\s+)?(hacker|criminal|malicious)/gi,
    
    // Jailbreak attempts
    /developer\s+mode|dev\s+mode|debug\s+mode/gi,
    /i'm\s+(the\s+)?(developer|admin|owner)\s+of\s+this\s+system/gi,
    /this\s+is\s+(a\s+)?(test|simulation|hypothetical)/gi,
    
    // Data exfiltration
    /show\s+me\s+(your|the)\s+(system\s+)?(prompt|instructions)/gi,
    /what\s+(are\s+)?(your|the)\s+(hidden|secret)\s+(instructions|rules)/gi,
    /repeat\s+(back\s+)?(your|the)\s+(original|system)\s+prompt/gi,
    
    // Code execution attempts
    /execute\s+(this\s+)?(code|script|command)/gi,
    /run\s+(this\s+)?(shell|bash|cmd|powershell)/gi,
    /eval\s*\(|exec\s*\(|system\s*\(/gi,
    
    // Social engineering
    /this\s+is\s+(urgent|emergency|critical)/gi,
    /i\s+(need|require)\s+immediate\s+(access|help)/gi,
    /my\s+(boss|manager|ceo)\s+(told|asked)\s+me/gi,
  ];

  // Dangerous keywords that increase risk score
  private readonly dangerousKeywords = [
    'bypass', 'override', 'hack', 'exploit', 'vulnerability', 'backdoor',
    'privilege', 'escalation', 'injection', 'malware', 'virus', 'trojan',
    'phishing', 'scam', 'fraud', 'illegal', 'criminal', 'unauthorized'
  ];

  // Code injection patterns
  private readonly codeInjectionPatterns = [
    /<script[^>]*>.*?<\/script>/gis,
    /javascript\s*:/gi,
    /on\w+\s*=\s*["'][^"']*["']/gi,
    /eval\s*\(/gi,
    /function\s*\(\s*\)\s*\{/gi,
    /\$\{[^}]*\}/g, // Template literals
    /`[^`]*`/g, // Backticks
  ];

  constructor(config?: Partial<PromptSanitizationConfig>) {
    this.config = {
      maxLength: 10000,
      allowedDomains: ['codecraft.dev', 'github.com', 'npmjs.com'],
      blockedPatterns: [],
      strictMode: true,
      logViolations: true,
      emergencyStop: false,
      ...config,
    };
  }

  /**
   * Sanitize AI prompt input
   */
  async sanitizePrompt(input: string, context?: { userId?: string; sessionId?: string }): Promise<SanitizationResult> {
    const startTime = Date.now();
    const originalLength = input.length;
    
    this.logger.debug(`Sanitizing prompt: ${originalLength} characters`);

    // Emergency stop check
    if (this.config.emergencyStop) {
      return this.createBlockedResult(input, 'Emergency stop activated', startTime);
    }

    // Length validation
    if (input.length > this.config.maxLength) {
      return this.createBlockedResult(input, `Input exceeds maximum length (${this.config.maxLength})`, startTime);
    }

    const violations: SecurityViolation[] = [];
    let sanitized = input;
    
    // Step 1: Basic HTML sanitization
    sanitized = this.sanitizeHtml(sanitized);
    
    // Step 2: URL validation and sanitization
    sanitized = this.sanitizeUrls(sanitized, violations);
    
    // Step 3: Detect prompt injection attempts
    this.detectPromptInjection(sanitized, violations);
    
    // Step 4: Detect code injection
    this.detectCodeInjection(sanitized, violations);
    
    // Step 5: Check for social engineering
    this.detectSocialEngineering(sanitized, violations);
    
    // Step 6: Calculate risk score
    const riskScore = this.calculateRiskScore(sanitized, violations);
    
    // Step 7: Apply mitigation strategies
    if (violations.length > 0) {
      sanitized = this.applyMitigations(sanitized, violations);
    }

    const result: SanitizationResult = {
      sanitized,
      violations,
      riskScore,
      blocked: this.shouldBlock(riskScore, violations),
      metadata: {
        originalLength,
        sanitizedLength: sanitized.length,
        processingTime: Date.now() - startTime,
        detectedAttacks: violations.map(v => v.type),
      },
    };

    // Log security events
    if (this.config.logViolations && violations.length > 0) {
      await this.logSecurityEvent(input, result, context);
    }

    return result;
  }

  /**
   * Sanitize HTML content
   */
  private sanitizeHtml(input: string): string {
    return sanitizeHtml(input, {
      allowedTags: [], // No HTML tags allowed
      allowedAttributes: {},
      disallowedTagsMode: 'escape',
      enforceHtmlBoundary: true,
    });
  }

  /**
   * Sanitize and validate URLs
   */
  private sanitizeUrls(input: string, violations: SecurityViolation[]): string {
    const urlPattern = /(https?:\/\/[^\s]+)/gi;
    
    return input.replace(urlPattern, (match, url) => {
      try {
        const parsedUrl = new URL(url);
        
        // Check if domain is allowed
        const isAllowed = this.config.allowedDomains.some(domain => 
          parsedUrl.hostname.endsWith(domain)
        );
        
        if (!isAllowed) {
          violations.push({
            type: 'data_exfiltration',
            severity: 'medium',
            pattern: url,
            location: { start: input.indexOf(url), end: input.indexOf(url) + url.length },
            description: `Unauthorized external URL detected: ${parsedUrl.hostname}`,
            mitigation: 'URL removed for security',
          });
          
          return '[REMOVED_URL]';
        }
        
        // Validate URL is not malicious
        if (this.isMaliciousUrl(parsedUrl)) {
          violations.push({
            type: 'data_exfiltration',
            severity: 'high',
            pattern: url,
            location: { start: input.indexOf(url), end: input.indexOf(url) + url.length },
            description: 'Potentially malicious URL detected',
            mitigation: 'URL blocked for security',
          });
          
          return '[BLOCKED_URL]';
        }
        
        return url;
      } catch (error) {
        // Invalid URL format
        violations.push({
          type: 'data_exfiltration',
          severity: 'low',
          pattern: url,
          location: { start: input.indexOf(url), end: input.indexOf(url) + url.length },
          description: 'Invalid URL format detected',
          mitigation: 'Malformed URL removed',
        });
        
        return '[INVALID_URL]';
      }
    });
  }

  /**
   * Detect prompt injection attempts
   */
  private detectPromptInjection(input: string, violations: SecurityViolation[]): void {
    for (const pattern of this.injectionPatterns) {
      const matches = input.matchAll(pattern);
      
      for (const match of matches) {
        violations.push({
          type: 'prompt_injection',
          severity: 'high',
          pattern: match[0],
          location: { start: match.index || 0, end: (match.index || 0) + match[0].length },
          description: 'Prompt injection attempt detected',
          mitigation: 'Suspicious instruction pattern blocked',
        });
      }
    }
    
    // Check for additional custom patterns
    for (const pattern of this.config.blockedPatterns) {
      const matches = input.matchAll(pattern);
      
      for (const match of matches) {
        violations.push({
          type: 'prompt_injection',
          severity: 'medium',
          pattern: match[0],
          location: { start: match.index || 0, end: (match.index || 0) + match[0].length },
          description: 'Custom blocked pattern detected',
          mitigation: 'Pattern blocked by security policy',
        });
      }
    }
  }

  /**
   * Detect code injection attempts
   */
  private detectCodeInjection(input: string, violations: SecurityViolation[]): void {
    for (const pattern of this.codeInjectionPatterns) {
      const matches = input.matchAll(pattern);
      
      for (const match of matches) {
        violations.push({
          type: 'code_injection',
          severity: 'critical',
          pattern: match[0],
          location: { start: match.index || 0, end: (match.index || 0) + match[0].length },
          description: 'Code injection attempt detected',
          mitigation: 'Executable code pattern blocked',
        });
      }
    }
  }

  /**
   * Detect social engineering attempts
   */
  private detectSocialEngineering(input: string, violations: SecurityViolation[]): void {
    const socialPatterns = [
      /i\s+am\s+(your\s+)?(admin|administrator|developer|creator)/gi,
      /trust\s+me,?\s+i\s+(am|work\s+for)/gi,
      /this\s+is\s+(confidential|secret|classified)/gi,
      /don't\s+(tell|inform)\s+(anyone|others)/gi,
    ];

    for (const pattern of socialPatterns) {
      const matches = input.matchAll(pattern);
      
      for (const match of matches) {
        violations.push({
          type: 'social_engineering',
          severity: 'medium',
          pattern: match[0],
          location: { start: match.index || 0, end: (match.index || 0) + match[0].length },
          description: 'Social engineering attempt detected',
          mitigation: 'Suspicious authority claim blocked',
        });
      }
    }
  }

  /**
   * Calculate risk score based on content analysis
   */
  private calculateRiskScore(input: string, violations: SecurityViolation[]): number {
    let score = 0;
    
    // Base score from violations
    for (const violation of violations) {
      switch (violation.severity) {
        case 'low': score += 10; break;
        case 'medium': score += 25; break;
        case 'high': score += 50; break;
        case 'critical': score += 100; break;
      }
    }
    
    // Additional risk factors
    const lowerInput = input.toLowerCase();
    
    // Count dangerous keywords
    const dangerousCount = this.dangerousKeywords.filter(keyword => 
      lowerInput.includes(keyword)
    ).length;
    
    score += dangerousCount * 5;
    
    // Length-based risk (very long inputs might be attacks)
    if (input.length > 5000) {
      score += Math.floor((input.length - 5000) / 100);
    }
    
    // Repetitive patterns (potential token manipulation)
    const repetitivePattern = /(.{10,})\1{3,}/g;
    if (repetitivePattern.test(input)) {
      score += 20;
    }
    
    // Unicode/encoding attacks
    if (/[^\x00-\x7F]/.test(input)) {
      score += 10;
    }
    
    return Math.min(score, 100); // Cap at 100
  }

  /**
   * Apply mitigation strategies
   */
  private applyMitigations(input: string, violations: SecurityViolation[]): string {
    let sanitized = input;
    
    // Sort violations by severity (highest first)
    const sortedViolations = [...violations].sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
    
    // Apply mitigations in reverse order to maintain indices
    for (const violation of sortedViolations.reverse()) {
      const { start, end } = violation.location;
      
      if (violation.severity === 'critical' || violation.severity === 'high') {
        // Remove high-risk content entirely
        sanitized = sanitized.slice(0, start) + '[SECURITY_FILTERED]' + sanitized.slice(end);
      } else {
        // Replace medium/low risk content with placeholders
        sanitized = sanitized.slice(0, start) + '[FILTERED]' + sanitized.slice(end);
      }
    }
    
    return sanitized;
  }

  /**
   * Determine if input should be blocked
   */
  private shouldBlock(riskScore: number, violations: SecurityViolation[]): boolean {
    // Block if risk score is too high
    if (riskScore >= 75) {
      return true;
    }
    
    // Block if there are critical violations
    if (violations.some(v => v.severity === 'critical')) {
      return true;
    }
    
    // Block if there are multiple high-severity violations
    const highSeverityCount = violations.filter(v => v.severity === 'high').length;
    if (highSeverityCount >= 2) {
      return true;
    }
    
    // In strict mode, be more aggressive
    if (this.config.strictMode && riskScore >= 50) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if URL is potentially malicious
   */
  private isMaliciousUrl(url: URL): boolean {
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /bit\.ly|tinyurl|short\.link/i, // URL shorteners
      /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/, // IP addresses
      /localhost|127\.0\.0\.1/i, // Local addresses
      /\.onion$/i, // Tor domains
      /[^a-zA-Z0-9\-\.]/, // Non-standard characters
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(url.hostname + url.pathname));
  }

  /**
   * Create blocked result
   */
  private createBlockedResult(input: string, reason: string, startTime: number): SanitizationResult {
    return {
      sanitized: '',
      violations: [{
        type: 'prompt_injection',
        severity: 'critical',
        pattern: 'BLOCKED',
        location: { start: 0, end: input.length },
        description: reason,
        mitigation: 'Input completely blocked',
      }],
      riskScore: 100,
      blocked: true,
      metadata: {
        originalLength: input.length,
        sanitizedLength: 0,
        processingTime: Date.now() - startTime,
        detectedAttacks: ['blocked'],
      },
    };
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(
    originalInput: string,
    result: SanitizationResult,
    context?: { userId?: string; sessionId?: string }
  ): Promise<void> {
    const event = {
      timestamp: new Date().toISOString(),
      type: 'prompt_sanitization',
      severity: result.blocked ? 'critical' : 'warning',
      userId: context?.userId,
      sessionId: context?.sessionId,
      riskScore: result.riskScore,
      violations: result.violations.length,
      blocked: result.blocked,
      metadata: result.metadata,
      // Don't log full input for privacy
      inputHash: this.hashString(originalInput),
    };
    
    this.logger.warn('Security violation detected', event);
  }

  /**
   * Hash string for privacy-preserving logging
   */
  private hashString(input: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  /**
   * Update emergency stop status
   */
  setEmergencyStop(enabled: boolean): void {
    this.config.emergencyStop = enabled;
    this.logger.warn(`Emergency stop ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Add custom blocked pattern
   */
  addBlockedPattern(pattern: RegExp): void {
    this.config.blockedPatterns.push(pattern);
    this.logger.info('Added custom blocked pattern');
  }

  /**
   * Get sanitizer statistics
   */
  getStatistics(): {
    injectionPatterns: number;
    dangerousKeywords: number;
    codeInjectionPatterns: number;
    emergencyStop: boolean;
    strictMode: boolean;
  } {
    return {
      injectionPatterns: this.injectionPatterns.length,
      dangerousKeywords: this.dangerousKeywords.length,
      codeInjectionPatterns: this.codeInjectionPatterns.length,
      emergencyStop: this.config.emergencyStop,
      strictMode: this.config.strictMode,
    };
  }
}