/**
 * Security Integration Service
 * Integrates recoder.xyz security package with production engine
 */

import { logger } from '../utils/logger';
import { GeneratedFile } from './real-code-generator-service';

// Import security components
export interface SecurityValidationResult {
  success: boolean;
  securityScore: number;
  vulnerabilities: VulnerabilityFinding[];
  secrets: SecretDetection[];
  complianceIssues: ComplianceIssue[];
  sanitizationViolations: SanitizationViolation[];
  recommendations: SecurityRecommendation[];
  metadata: {
    scanDuration: number;
    scannedFiles: number;
    rulesApplied: number;
  };
}

export interface VulnerabilityFinding {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  file: string;
  line?: number;
  column?: number;
  rule: string;
  recommendation: string;
  cweId?: string;
}

export interface SecretDetection {
  id: string;
  type: string;
  description: string;
  file: string;
  line?: number;
  confidence: number;
  pattern: string;
  remediation: string;
}

export interface ComplianceIssue {
  framework: string;
  requirement: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  remediation: string;
}

export interface SanitizationViolation {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  remediation: string;
}

export interface SecurityRecommendation {
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  implementation: string;
}

export class SecurityIntegrationService {
  private securityManager: any;
  private initialized: boolean = false;

  constructor() {
    this.initializeSecurityManager().catch(error => {
      logger.error('Failed to initialize security manager:', error);
    });
  }

  private async initializeSecurityManager(): Promise<void> {
    try {
      // Import security package
      const { SecurityManager, DEFAULT_SECURITY_CONFIG } = await import('../../../packages/security/src/index');
      
      // Initialize with production-ready configuration
      this.securityManager = new SecurityManager({
        ...DEFAULT_SECURITY_CONFIG,
        vulnerabilityScanning: {
          enabled: true,
          scanTypes: ['sast', 'dependency', 'secrets'],
          failOnSeverity: 'high',
        },
        secretDetection: {
          enabled: true,
          scanGenerated: true,
          scanUploaded: true,
          autoRemediate: true,
        },
        promptSanitization: {
          enabled: true,
          strictMode: true,
          maxLength: 10000,
          logViolations: true,
        },
        compliance: {
          enabledFrameworks: ['gdpr', 'hipaa', 'sox'],
          automaticAssessment: true,
          dataMinimization: true,
          rightToErasure: true,
        }
      });

      this.initialized = true;
      logger.info('✅ Security integration initialized');
    } catch (error: any) {
      logger.error(`Security integration failed: ${error.message}`);
      logger.warn('Security scanning will be disabled');
    }
  }

  /**
   * Validate generated code for security issues
   */
  async validateGeneratedCode(files: GeneratedFile[], projectType: string): Promise<SecurityValidationResult> {
    const startTime = Date.now();
    
    if (!this.initialized) {
      logger.warn('Security manager not initialized, skipping validation');
      return this.createEmptyResult(startTime, files.length);
    }

    try {
      logger.info(`🔒 Starting security validation for ${files.length} files`);

      const components = this.securityManager.getComponents();
      
      // Scan for vulnerabilities
      const vulnerabilities = await this.scanVulnerabilities(files, components.vulnerabilityScanner);
      
      // Detect secrets
      const secrets = await this.detectSecrets(files, components.secretDetector);
      
      // Check compliance
      const complianceIssues = await this.checkCompliance(files, projectType, components.complianceEngine);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(vulnerabilities, secrets, complianceIssues);
      
      // Calculate security score
      const securityScore = this.calculateSecurityScore(vulnerabilities, secrets, complianceIssues);

      const result: SecurityValidationResult = {
        success: true,
        securityScore,
        vulnerabilities,
        secrets,
        complianceIssues,
        sanitizationViolations: [], // Would be implemented for prompt sanitization
        recommendations,
        metadata: {
          scanDuration: Date.now() - startTime,
          scannedFiles: files.length,
          rulesApplied: this.countAppliedRules(vulnerabilities, secrets)
        }
      };

      logger.info(`🔒 Security validation completed: score ${securityScore}/100, ${vulnerabilities.length} vulnerabilities, ${secrets.length} secrets`);
      
      return result;
    } catch (error: any) {
      logger.error(`Security validation failed: ${error.message}`);
      return {
        success: false,
        securityScore: 0,
        vulnerabilities: [],
        secrets: [],
        complianceIssues: [],
        sanitizationViolations: [],
        recommendations: [{
          category: 'security',
          priority: 'high',
          title: 'Security Validation Failed',
          description: `Security validation could not be completed: ${error.message}`,
          implementation: 'Please review the generated code manually for security issues.'
        }],
        metadata: {
          scanDuration: Date.now() - startTime,
          scannedFiles: files.length,
          rulesApplied: 0
        }
      };
    }
  }

  /**
   * Scan files for code vulnerabilities
   */
  private async scanVulnerabilities(files: GeneratedFile[], scanner: any): Promise<VulnerabilityFinding[]> {
    const vulnerabilities: VulnerabilityFinding[] = [];
    
    for (const file of files) {
      try {
        const scanResult = await scanner.scanCode(file.content, {
          filename: file.path,
          language: this.detectLanguage(file.path),
          scanTypes: ['sast', 'dependency']
        });

        if (scanResult.findings) {
          vulnerabilities.push(...scanResult.findings.map((finding: any) => ({
            id: finding.id || `vuln-${Date.now()}-${Math.random()}`,
            severity: finding.severity || 'medium',
            type: finding.type || 'code_quality',
            description: finding.description || 'Security vulnerability detected',
            file: file.path,
            line: finding.line,
            column: finding.column,
            rule: finding.rule || 'security-check',
            recommendation: finding.recommendation || 'Review and fix the identified issue',
            cweId: finding.cweId
          })));
        }
      } catch (error: any) {
        logger.warn(`Failed to scan ${file.path}: ${error.message}`);
      }
    }

    return vulnerabilities;
  }

  /**
   * Detect secrets in generated files
   */
  private async detectSecrets(files: GeneratedFile[], detector: any): Promise<SecretDetection[]> {
    const secrets: SecretDetection[] = [];
    
    for (const file of files) {
      try {
        const scanResult = await detector.scanText(file.content, {
          filename: file.path,
          strictMode: true
        });

        if (scanResult.detections) {
          secrets.push(...scanResult.detections.map((detection: any) => ({
            id: detection.id || `secret-${Date.now()}-${Math.random()}`,
            type: detection.type || 'generic_secret',
            description: detection.description || 'Potential secret detected',
            file: file.path,
            line: detection.line,
            confidence: detection.confidence || 0.8,
            pattern: detection.pattern || 'secret-pattern',
            remediation: detection.remediation || 'Remove or encrypt the detected secret'
          })));
        }
      } catch (error: any) {
        logger.warn(`Failed to scan secrets in ${file.path}: ${error.message}`);
      }
    }

    return secrets;
  }

  /**
   * Check compliance requirements
   */
  private async checkCompliance(files: GeneratedFile[], projectType: string, engine: any): Promise<ComplianceIssue[]> {
    const issues: ComplianceIssue[] = [];
    
    try {
      const assessment = await engine.performAssessment({
        projectType,
        files: files.map(f => ({ path: f.path, content: f.content })),
        frameworks: ['gdpr', 'hipaa', 'sox']
      });

      if (assessment.violations) {
        issues.push(...assessment.violations.map((violation: any) => ({
          framework: violation.framework || 'general',
          requirement: violation.requirement || 'compliance-check',
          description: violation.description || 'Compliance violation detected',
          severity: violation.severity || 'medium',
          remediation: violation.remediation || 'Review and address the compliance issue'
        })));
      }
    } catch (error: any) {
      logger.warn(`Compliance check failed: ${error.message}`);
    }

    return issues;
  }

  /**
   * Generate security recommendations
   */
  private generateRecommendations(
    vulnerabilities: VulnerabilityFinding[],
    secrets: SecretDetection[],
    complianceIssues: ComplianceIssue[]
  ): SecurityRecommendation[] {
    const recommendations: SecurityRecommendation[] = [];

    // High-priority vulnerability recommendations
    const criticalVulns = vulnerabilities.filter(v => v.severity === 'critical');
    if (criticalVulns.length > 0) {
      recommendations.push({
        category: 'vulnerability',
        priority: 'critical',
        title: 'Critical Vulnerabilities Detected',
        description: `Found ${criticalVulns.length} critical security vulnerabilities that must be addressed immediately.`,
        implementation: 'Review and fix all critical vulnerabilities before deploying to production.'
      });
    }

    // Secret detection recommendations
    if (secrets.length > 0) {
      recommendations.push({
        category: 'secrets',
        priority: 'high',
        title: 'Secrets Management',
        description: `Detected ${secrets.length} potential secrets in the codebase.`,
        implementation: 'Use environment variables or secure secret management systems like HashiCorp Vault, AWS Secrets Manager, or Azure Key Vault.'
      });
    }

    // Compliance recommendations
    const highComplianceIssues = complianceIssues.filter(i => i.severity === 'high' || i.severity === 'critical');
    if (highComplianceIssues.length > 0) {
      recommendations.push({
        category: 'compliance',
        priority: 'high',
        title: 'Compliance Issues',
        description: `Found ${highComplianceIssues.length} high-priority compliance issues.`,
        implementation: 'Address compliance requirements before handling sensitive data or deploying to production.'
      });
    }

    // General security recommendations
    recommendations.push({
      category: 'general',
      priority: 'medium',
      title: 'Security Best Practices',
      description: 'Implement comprehensive security measures for production deployment.',
      implementation: 'Add input validation, implement proper authentication, use HTTPS, set up monitoring and logging.'
    });

    return recommendations;
  }

  /**
   * Calculate overall security score (0-100)
   */
  private calculateSecurityScore(
    vulnerabilities: VulnerabilityFinding[],
    secrets: SecretDetection[],
    complianceIssues: ComplianceIssue[]
  ): number {
    let score = 100;

    // Deduct points for vulnerabilities
    vulnerabilities.forEach(vuln => {
      switch (vuln.severity) {
        case 'critical': score -= 25; break;
        case 'high': score -= 15; break;
        case 'medium': score -= 5; break;
        case 'low': score -= 1; break;
      }
    });

    // Deduct points for secrets
    secrets.forEach(secret => {
      score -= Math.ceil(secret.confidence * 10);
    });

    // Deduct points for compliance issues
    complianceIssues.forEach(issue => {
      switch (issue.severity) {
        case 'critical': score -= 20; break;
        case 'high': score -= 10; break;
        case 'medium': score -= 3; break;
        case 'low': score -= 1; break;
      }
    });

    return Math.max(0, score);
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'cs': 'csharp',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'rb': 'ruby',
      'sol': 'solidity'
    };

    return languageMap[ext || ''] || 'text';
  }

  private countAppliedRules(vulnerabilities: VulnerabilityFinding[], secrets: SecretDetection[]): number {
    const rules = new Set<string>();
    vulnerabilities.forEach(v => rules.add(v.rule));
    secrets.forEach(s => rules.add(s.pattern));
    return rules.size;
  }

  private createEmptyResult(startTime: number, fileCount: number): SecurityValidationResult {
    return {
      success: false,
      securityScore: 50, // Neutral score when validation is unavailable
      vulnerabilities: [],
      secrets: [],
      complianceIssues: [],
      sanitizationViolations: [],
      recommendations: [{
        category: 'security',
        priority: 'medium',
        title: 'Security Validation Unavailable',
        description: 'Security validation could not be performed. Manual security review recommended.',
        implementation: 'Review the generated code manually for security issues and implement appropriate security measures.'
      }],
      metadata: {
        scanDuration: Date.now() - startTime,
        scannedFiles: fileCount,
        rulesApplied: 0
      }
    };
  }
}

// Export singleton instance
export const securityIntegrationService = new SecurityIntegrationService();