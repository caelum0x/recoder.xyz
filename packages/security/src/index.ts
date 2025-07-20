/**
 * Security Package Entry Point
 * Export all security components and utilities
 */

// Core Security Components
export { AIPromptSanitizer, type PromptSanitizationConfig, type SanitizationResult, type SecurityViolation } from './ai-prompt-sanitizer';
export { CodeVulnerabilityScanner, type VulnerabilityRule, type VulnerabilityFinding, type ScanResult, type ScanConfig } from './code-vulnerability-scanner';
export { DataEncryption, type EncryptionConfig, type EncryptedData, type EncryptionContext, type KeyMetadata } from './data-encryption';
export { SecretDetector, type SecretPattern, type SecretDetection, type ScanResult as SecretScanResult, type SecretDetectorConfig } from './secret-detector';
export { ComplianceEngine, type ComplianceFramework, type ComplianceRequirement, type ComplianceControl, type ComplianceReport, type DataProcessingRecord, type PrivacyImpactAssessment, type ComplianceConfig } from './compliance-engine';
export { AuditTrail, type AuditEvent, type AuditQuery, type AuditReport, type AuditConfig, type SecurityAlert } from './audit-trail';
export { ThreatDetectionEngine, type ThreatSignature, type ThreatIntelligence, type ThreatEvent, type BehaviorProfile, type ThreatHuntingQuery, type ThreatDetectionConfig } from './threat-detection';
export { SecurityMonitor, type SecurityMetric, type AlertRule, type AlertAction, type SecurityDashboard, type MonitoringConfig } from './security-monitor';

// Security Utilities and Constants
export const SECURITY_CONSTANTS = {
  // Encryption
  DEFAULT_ENCRYPTION_ALGORITHM: 'aes-256-gcm',
  DEFAULT_KEY_SIZE: 256,
  DEFAULT_IV_SIZE: 12,
  DEFAULT_TAG_SIZE: 16,
  
  // Compliance
  DATA_RETENTION_PERIODS: {
    GDPR: 2555, // ~7 years in days
    HIPAA: 2555,
    SOC2: 2555,
    PCI_DSS: 365,
    DEFAULT: 2555,
  },
  
  // Threat Detection
  RISK_SCORE_THRESHOLDS: {
    LOW: 25,
    MEDIUM: 50,
    HIGH: 75,
    CRITICAL: 90,
  },
  
  // Vulnerability Scanning
  VULNERABILITY_SEVERITIES: ['low', 'medium', 'high', 'critical'] as const,
  
  // Secret Detection
  SECRET_CATEGORIES: ['api_key', 'password', 'token', 'certificate', 'database', 'cloud', 'generic'] as const,
  
  // Audit Trail
  AUDIT_EVENT_TYPES: ['authentication', 'authorization', 'data_access', 'data_modification', 'system_access', 'security_incident', 'compliance', 'admin_action'] as const,
  AUDIT_CATEGORIES: ['security', 'privacy', 'compliance', 'operations', 'user_activity'] as const,
  
  // Compliance Frameworks
  SUPPORTED_FRAMEWORKS: ['gdpr', 'hipaa', 'sox', 'pci_dss', 'iso27001', 'nist'] as const,
};

// Security Utility Functions
export const SecurityUtils = {
  /**
   * Calculate password strength score
   */
  calculatePasswordStrength(password: string): { score: number; feedback: string[] } {
    let score = 0;
    const feedback: string[] = [];
    
    if (password.length >= 8) score += 25;
    else feedback.push('Password should be at least 8 characters long');
    
    if (/[a-z]/.test(password)) score += 15;
    else feedback.push('Add lowercase letters');
    
    if (/[A-Z]/.test(password)) score += 15;
    else feedback.push('Add uppercase letters');
    
    if (/[0-9]/.test(password)) score += 15;
    else feedback.push('Add numbers');
    
    if (/[^a-zA-Z0-9]/.test(password)) score += 20;
    else feedback.push('Add special characters');
    
    if (password.length >= 12) score += 10;
    
    return { score, feedback };
  },

  /**
   * Generate secure random string
   */
  generateSecureRandom(length: number = 32, charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
    const crypto = require('crypto');
    let result = '';
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    
    for (let i = 0; i < length; i++) {
      result += charset[values[i] % charset.length];
    }
    
    return result;
  },

  /**
   * Hash data with salt
   */
  hashWithSalt(data: string, salt?: string): { hash: string; salt: string } {
    const crypto = require('crypto');
    const usedSalt = salt || crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(data, usedSalt, 100000, 64, 'sha512').toString('hex');
    
    return { hash, salt: usedSalt };
  },

  /**
   * Verify hashed data
   */
  verifyHash(data: string, hash: string, salt: string): boolean {
    const crypto = require('crypto');
    const verifyHash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  },

  /**
   * Sanitize input for SQL injection prevention
   */
  sanitizeForSQL(input: string): string {
    return input.replace(/'/g, "''").replace(/;/g, '');
  },

  /**
   * Validate email format
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Validate IP address format
   */
  isValidIP(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  },

  /**
   * Check if URL is safe (basic validation)
   */
  isSafeURL(url: string, allowedDomains?: string[]): boolean {
    try {
      const parsedUrl = new URL(url);
      
      // Check protocol
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return false;
      }
      
      // Check domain if allowlist provided
      if (allowedDomains && allowedDomains.length > 0) {
        return allowedDomains.some(domain => parsedUrl.hostname.endsWith(domain));
      }
      
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Rate limiting helper
   */
  createRateLimit(windowMs: number = 900000, maxRequests: number = 100): {
    check: (identifier: string) => boolean;
    reset: (identifier: string) => void;
  } {
    const requests = new Map<string, { count: number; resetTime: number }>();
    
    return {
      check: (identifier: string): boolean => {
        const now = Date.now();
        const record = requests.get(identifier);
        
        if (!record || now > record.resetTime) {
          requests.set(identifier, { count: 1, resetTime: now + windowMs });
          return true;
        }
        
        if (record.count >= maxRequests) {
          return false;
        }
        
        record.count++;
        return true;
      },
      
      reset: (identifier: string): void => {
        requests.delete(identifier);
      },
    };
  },

  /**
   * Redact sensitive data for logging
   */
  redactSensitiveData(data: any, sensitiveFields: string[] = ['password', 'token', 'key', 'secret']): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }
    
    const redacted = Array.isArray(data) ? [] : {};
    
    for (const [key, value] of Object.entries(data)) {
      const shouldRedact = sensitiveFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      );
      
      if (shouldRedact) {
        (redacted as any)[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        (redacted as any)[key] = this.redactSensitiveData(value, sensitiveFields);
      } else {
        (redacted as any)[key] = value;
      }
    }
    
    return redacted;
  },
};

// Security Error Classes
export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class EncryptionError extends SecurityError {
  constructor(message: string, operation: 'encrypt' | 'decrypt' | 'key_generation' | 'key_rotation') {
    super(message, `ENCRYPTION_${operation.toUpperCase()}_FAILED`, 'high');
    this.name = 'EncryptionError';
  }
}

export class ComplianceError extends SecurityError {
  constructor(message: string, framework: string, requirement?: string) {
    const code = requirement 
      ? `COMPLIANCE_${framework.toUpperCase()}_${requirement.toUpperCase()}_VIOLATION`
      : `COMPLIANCE_${framework.toUpperCase()}_VIOLATION`;
    super(message, code, 'high');
    this.name = 'ComplianceError';
  }
}

export class ThreatDetectionError extends SecurityError {
  constructor(message: string, threatType: string) {
    super(message, `THREAT_${threatType.toUpperCase()}_DETECTED`, 'critical');
    this.name = 'ThreatDetectionError';
  }
}

// Security Configuration Types
export interface SecurityConfig {
  encryption: {
    enabled: boolean;
    algorithm: string;
    keyRotationDays: number;
    keySize: number;
  };
  
  secretDetection: {
    enabled: boolean;
    scanGenerated: boolean;
    scanUploaded: boolean;
    autoRemediate: boolean;
  };
  
  vulnerabilityScanning: {
    enabled: boolean;
    scanTypes: ('sast' | 'dast' | 'dependency' | 'secrets')[];
    failOnSeverity: 'low' | 'medium' | 'high' | 'critical' | 'never';
  };
  
  compliance: {
    enabledFrameworks: string[];
    automaticAssessment: boolean;
    dataMinimization: boolean;
    rightToErasure: boolean;
  };
  
  auditTrail: {
    enabled: boolean;
    realTimeAlerts: boolean;
    retentionDays: number;
    encryptionEnabled: boolean;
  };
  
  threatDetection: {
    enabled: boolean;
    realTimeMonitoring: boolean;
    behaviorAnalysis: boolean;
    responseAutomation: boolean;
    confidenceThreshold: number;
  };
  
  promptSanitization: {
    enabled: boolean;
    strictMode: boolean;
    maxLength: number;
    logViolations: boolean;
  };
}

// Default Security Configuration
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  encryption: {
    enabled: true,
    algorithm: 'aes-256-gcm',
    keyRotationDays: 90,
    keySize: 256,
  },
  
  secretDetection: {
    enabled: true,
    scanGenerated: true,
    scanUploaded: true,
    autoRemediate: true,
  },
  
  vulnerabilityScanning: {
    enabled: true,
    scanTypes: ['sast', 'dependency', 'secrets'],
    failOnSeverity: 'high',
  },
  
  compliance: {
    enabledFrameworks: ['gdpr'],
    automaticAssessment: true,
    dataMinimization: true,
    rightToErasure: true,
  },
  
  auditTrail: {
    enabled: true,
    realTimeAlerts: true,
    retentionDays: 2555, // ~7 years
    encryptionEnabled: true,
  },
  
  threatDetection: {
    enabled: true,
    realTimeMonitoring: true,
    behaviorAnalysis: true,
    responseAutomation: false, // Disabled by default for safety
    confidenceThreshold: 70,
  },
  
  promptSanitization: {
    enabled: true,
    strictMode: true,
    maxLength: 10000,
    logViolations: true,
  },
};

// Security Manager - Central orchestrator
export class SecurityManager {
  private readonly config: SecurityConfig;
  private readonly promptSanitizer: AIPromptSanitizer;
  private readonly vulnerabilityScanner: CodeVulnerabilityScanner;
  private readonly encryption: DataEncryption;
  private readonly secretDetector: SecretDetector;
  private readonly complianceEngine: ComplianceEngine;
  private readonly auditTrail: AuditTrail;
  private readonly threatDetection: ThreatDetectionEngine;
  private readonly securityMonitor: SecurityMonitor;

  constructor(config?: Partial<SecurityConfig>) {
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...config };
    
    // Initialize security components
    this.promptSanitizer = new AIPromptSanitizer(this.config.promptSanitization);
    this.vulnerabilityScanner = new CodeVulnerabilityScanner(this.config.vulnerabilityScanning);
    this.encryption = new DataEncryption(this.config.encryption);
    this.secretDetector = new SecretDetector(this.config.secretDetection);
    this.complianceEngine = new ComplianceEngine(this.config.compliance);
    this.auditTrail = new AuditTrail(this.config.auditTrail);
    this.threatDetection = new ThreatDetectionEngine(this.config.threatDetection);
    this.securityMonitor = new SecurityMonitor({
      enabled: true,
      realTimeMonitoring: true,
      alertingEnabled: true,
    });
    
    // Setup integrations
    this.setupIntegrations();
  }

  /**
   * Get all security components
   */
  getComponents() {
    return {
      promptSanitizer: this.promptSanitizer,
      vulnerabilityScanner: this.vulnerabilityScanner,
      encryption: this.encryption,
      secretDetector: this.secretDetector,
      complianceEngine: this.complianceEngine,
      auditTrail: this.auditTrail,
      threatDetection: this.threatDetection,
      securityMonitor: this.securityMonitor,
    };
  }

  /**
   * Get security status overview
   */
  async getSecurityStatus() {
    return {
      encryption: this.encryption.getEncryptionStats(),
      vulnerabilities: this.vulnerabilityScanner.getStatus(),
      secrets: this.secretDetector.getStatistics(),
      compliance: this.complianceEngine.getComplianceDashboard(),
      audit: this.auditTrail.getStatistics(),
      threats: this.threatDetection.getThreatDashboard(),
      monitoring: this.securityMonitor.getMonitoringStats(),
      dashboard: await this.securityMonitor.getSecurityDashboard(),
    };
  }

  /**
   * Setup integrations between components
   */
  private setupIntegrations(): void {
    // Audit trail integration
    this.auditTrail.on('securityAlert', (alert) => {
      // Forward to threat detection
      this.threatDetection.emit('externalAlert', alert);
      // Forward to monitoring
      this.securityMonitor.recordSecurityEvent({
        eventType: 'security_incident',
        category: 'security',
        severity: alert.severity === 'critical' ? 'critical' : 'warning',
        source: 'audit-trail',
        actor: { type: 'system', id: 'audit-trail' },
        action: 'security_alert',
        resource: { type: 'system', id: 'security-system' },
        outcome: 'success',
        details: {
          description: alert.description,
          metadata: alert.metadata,
        },
        compliance: {
          frameworks: ['SOC2', 'ISO27001'],
          retention: this.config.auditTrail.retentionDays,
          classification: 'sensitive',
        },
        id: alert.id,
        timestamp: alert.timestamp,
        integrity: { hash: '', signature: '', verified: true },
      });
    });

    // Threat detection integration
    this.threatDetection.on('threatDetected', async (threat) => {
      // Log to audit trail
      await this.auditTrail.logEvent({
        eventType: 'security_incident',
        category: 'security',
        severity: threat.severity === 'critical' ? 'critical' : 'warning',
        source: 'threat-detection',
        actor: { type: 'system', id: 'threat-detection' },
        action: 'threat_detected',
        resource: { type: 'system', id: threat.target.id },
        outcome: 'success',
        details: {
          description: `Threat detected: ${threat.signature.name}`,
          metadata: {
            threatId: threat.id,
            confidence: threat.confidence,
            signature: threat.signature.id,
          },
        },
        compliance: {
          frameworks: ['SOC2', 'ISO27001'],
          retention: this.config.auditTrail.retentionDays,
          classification: 'sensitive',
        },
      });

      // Forward to monitoring
      await this.securityMonitor.recordThreatDetection(threat);
    });

    // Secret detector integration
    this.secretDetector.on('secretDetected', async (detection) => {
      await this.securityMonitor.recordSecretDetection(detection);
    });

    // Vulnerability scanner integration
    this.vulnerabilityScanner.on('vulnerabilityFound', async (finding) => {
      await this.securityMonitor.recordVulnerabilityFinding(finding);
    });
  }
}

// Re-export types for convenience
export type { SecurityConfig };

// Version information
export const SECURITY_PACKAGE_VERSION = '1.0.0';

// Package metadata
export const SECURITY_PACKAGE_INFO = {
  name: '@recoder/security',
  version: SECURITY_PACKAGE_VERSION,
  description: 'Comprehensive security and compliance framework for CodeCraft CLI',
  components: [
    'AI Prompt Sanitization',
    'Code Vulnerability Scanning',
    'End-to-End Encryption',
    'Secret Detection',
    'Compliance Engine',
    'Audit Trail',
    'Threat Detection',
    'Security Monitoring & Alerting',
  ],
  frameworks: [
    'GDPR',
    'HIPAA',
    'SOC 2',
    'ISO 27001',
    'NIST',
    'PCI DSS',
  ],
  standards: [
    'OWASP Top 10',
    'MITRE ATT&CK',
    'CWE',
    'CVE',
  ],
};