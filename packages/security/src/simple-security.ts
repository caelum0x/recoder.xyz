/**
 * Simple Security System for Recoder.xyz
 * 
 * Provides basic security features for AI-powered development
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface SecurityConfig {
  enablePromptSanitization: boolean;
  enableSecretDetection: boolean;
  enableThreatDetection: boolean;
  enableAuditLogging: boolean;
  allowedDomains: string[];
  blockedPatterns: string[];
}

export interface SecurityAlert {
  id: string;
  type: 'secret_detected' | 'prompt_injection' | 'suspicious_activity' | 'policy_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  source: string;
  timestamp: Date;
  resolved: boolean;
  metadata?: Record<string, any>;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  resource: string;
  timestamp: Date;
  success: boolean;
  details?: Record<string, any>;
}

export class SimpleSecurity extends EventEmitter {
  private config: SecurityConfig;
  private alerts: SecurityAlert[] = [];
  private auditLog: AuditLogEntry[] = [];
  private secretPatterns: RegExp[] = [
    /(?:api_key|apikey|api-key)[\s=:]*["\']?([a-zA-Z0-9_\-]{20,})["\']?/gi,
    /(?:password|pwd|pass)[\s=:]*["\']?([^\s"']{8,})["\']?/gi,
    /(?:token|jwt)[\s=:]*["\']?([a-zA-Z0-9_\-\.]{20,})["\']?/gi,
    /(?:secret|private_key)[\s=:]*["\']?([a-zA-Z0-9_\-\/+=]{20,})["\']?/gi,
    /sk-[a-zA-Z0-9]{48}/g, // OpenAI API keys
    /xoxb-[0-9]{11}-[0-9]{11}-[a-zA-Z0-9]{24}/g, // Slack bot tokens
    /ghp_[a-zA-Z0-9]{36}/g, // GitHub personal access tokens
  ];
  
  private promptInjectionPatterns: RegExp[] = [
    /ignore\s+previous\s+instructions/gi,
    /system\s*:\s*you\s+are\s+now/gi,
    /(?:pretend|act)\s+(?:as|like)\s+(?:a|an)/gi,
    /\[system\]/gi,
    /\<\|system\|\>/gi,
    /__[A-Z_]+__/g, // Special tokens like __USER__ __SYSTEM__
  ];

  constructor(config: Partial<SecurityConfig> = {}) {
    super();
    
    this.config = {
      enablePromptSanitization: true,
      enableSecretDetection: true,
      enableThreatDetection: true,
      enableAuditLogging: true,
      allowedDomains: [],
      blockedPatterns: [],
      ...config
    };
  }

  /**
   * Sanitize user input to prevent prompt injection attacks
   */
  sanitizePrompt(input: string): { sanitized: string; threats: string[] } {
    if (!this.config.enablePromptSanitization) {
      return { sanitized: input, threats: [] };
    }

    const threats: string[] = [];
    let sanitized = input;

    // Check for prompt injection patterns
    for (const pattern of this.promptInjectionPatterns) {
      const matches = input.match(pattern);
      if (matches) {
        threats.push(`Potential prompt injection: ${matches[0]}`);
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      }
    }

    // Basic HTML/script tag removal
    sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '[SCRIPT_REMOVED]');
    sanitized = sanitized.replace(/<[^>]*>/g, ''); // Remove HTML tags
    
    // Limit length to prevent overflow attacks
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000) + '... [TRUNCATED]';
      threats.push('Input truncated due to excessive length');
    }

    if (threats.length > 0) {
      this.createAlert({
        type: 'prompt_injection',
        severity: 'medium',
        title: 'Prompt Injection Attempt Detected',
        description: `Detected ${threats.length} potential threats in user input`,
        source: 'prompt_sanitizer',
        metadata: { threats, originalLength: input.length }
      });
    }

    return { sanitized, threats };
  }

  /**
   * Detect secrets in code or text
   */
  detectSecrets(content: string, source: string = 'unknown'): string[] {
    if (!this.config.enableSecretDetection) return [];

    const secrets: string[] = [];

    for (const pattern of this.secretPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        secrets.push(...matches);
      }
    }

    if (secrets.length > 0) {
      this.createAlert({
        type: 'secret_detected',
        severity: 'high',
        title: 'Secrets Detected in Content',
        description: `Found ${secrets.length} potential secrets in ${source}`,
        source: 'secret_detector',
        metadata: { secretCount: secrets.length, source }
      });
    }

    return secrets;
  }

  /**
   * Scan for basic security vulnerabilities in code
   */
  scanCode(code: string, language: string): { safe: boolean; issues: string[] } {
    const issues: string[] = [];

    // Basic SQL injection patterns
    if (language.toLowerCase().includes('sql') || code.includes('SELECT') || code.includes('INSERT')) {
      if (/(?:union|select|insert|update|delete).*(?:\+|concat|\|\|)/gi.test(code)) {
        issues.push('Potential SQL injection vulnerability');
      }
    }

    // Command injection patterns
    if (/(?:exec|system|shell_exec|passthru|eval)\s*\(/gi.test(code)) {
      issues.push('Potential command injection vulnerability');
    }

    // Path traversal patterns
    if (/\.\.\/|\.\.\\/g.test(code)) {
      issues.push('Potential path traversal vulnerability');
    }

    // Hardcoded secrets
    const secrets = this.detectSecrets(code, `${language}_code`);
    if (secrets.length > 0) {
      issues.push(`Hardcoded secrets detected: ${secrets.length} instances`);
    }

    const safe = issues.length === 0;

    if (!safe) {
      this.createAlert({
        type: 'policy_violation',
        severity: 'medium',
        title: 'Code Security Issues Detected',
        description: `Found ${issues.length} security issues in generated code`,
        source: 'code_scanner',
        metadata: { language, issueCount: issues.length, issues }
      });
    }

    return { safe, issues };
  }

  /**
   * Log user actions for audit trail
   */
  logAction(userId: string, action: string, resource: string, success: boolean = true, details?: Record<string, any>): void {
    if (!this.config.enableAuditLogging) return;

    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      userId,
      action,
      resource,
      timestamp: new Date(),
      success,
      details
    };

    this.auditLog.push(entry);

    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }

    this.emit('actionLogged', entry);

    // Check for suspicious patterns
    if (this.config.enableThreatDetection) {
      this.detectSuspiciousActivity(userId, action);
    }
  }

  /**
   * Basic threat detection based on user behavior
   */
  private detectSuspiciousActivity(userId: string, action: string): void {
    const recentActions = this.auditLog
      .filter(entry => entry.userId === userId && Date.now() - entry.timestamp.getTime() < 300000) // Last 5 minutes
      .slice(-20); // Last 20 actions

    // Detect rapid repeated actions
    const sameActionCount = recentActions.filter(entry => entry.action === action).length;
    if (sameActionCount > 10) {
      this.createAlert({
        type: 'suspicious_activity',
        severity: 'medium',
        title: 'Rapid Repeated Actions Detected',
        description: `User ${userId} performed "${action}" ${sameActionCount} times in 5 minutes`,
        source: 'threat_detector',
        metadata: { userId, action, count: sameActionCount }
      });
    }

    // Detect failed action patterns
    const failedActions = recentActions.filter(entry => !entry.success).length;
    if (failedActions > 5) {
      this.createAlert({
        type: 'suspicious_activity',
        severity: 'high',
        title: 'Multiple Failed Actions',
        description: `User ${userId} had ${failedActions} failed actions in 5 minutes`,
        source: 'threat_detector',
        metadata: { userId, failedCount: failedActions }
      });
    }
  }

  /**
   * Create a security alert
   */
  private createAlert(alertData: Omit<SecurityAlert, 'id' | 'timestamp' | 'resolved'>): void {
    const alert: SecurityAlert = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      resolved: false,
      ...alertData
    };

    this.alerts.push(alert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    this.emit('alertCreated', alert);
  }

  /**
   * Get all security alerts
   */
  getAlerts(unresolved = false): SecurityAlert[] {
    return unresolved 
      ? this.alerts.filter(alert => !alert.resolved)
      : this.alerts;
  }

  /**
   * Resolve a security alert
   */
  resolveAlert(id: string): boolean {
    const alert = this.alerts.find(alert => alert.id === id);
    if (alert) {
      alert.resolved = true;
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  /**
   * Get audit log entries
   */
  getAuditLog(userId?: string): AuditLogEntry[] {
    return userId 
      ? this.auditLog.filter(entry => entry.userId === userId)
      : this.auditLog;
  }

  /**
   * Generate security report
   */
  generateSecurityReport(): {
    totalAlerts: number;
    unresolvedAlerts: number;
    alertsByType: Record<string, number>;
    alertsBySeverity: Record<string, number>;
    recentActivity: number;
    topUsers: { userId: string; actionCount: number }[];
  } {
    const unresolvedAlerts = this.alerts.filter(alert => !alert.resolved);
    
    const alertsByType = this.alerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertsBySeverity = this.alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const recentActivity = this.auditLog.filter(entry => entry.timestamp.getTime() > last24h).length;

    const userActivity = this.auditLog.reduce((acc, entry) => {
      acc[entry.userId] = (acc[entry.userId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topUsers = Object.entries(userActivity)
      .map(([userId, actionCount]) => ({ userId, actionCount }))
      .sort((a, b) => b.actionCount - a.actionCount)
      .slice(0, 10);

    return {
      totalAlerts: this.alerts.length,
      unresolvedAlerts: unresolvedAlerts.length,
      alertsByType,
      alertsBySeverity,
      recentActivity,
      topUsers
    };
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      alerts: this.alerts.length,
      unresolvedAlerts: this.alerts.filter(a => !a.resolved).length,
      auditEntries: this.auditLog.length,
      config: this.config
    };
  }
}

// Export singleton instance
export const security = new SimpleSecurity();
export default security;