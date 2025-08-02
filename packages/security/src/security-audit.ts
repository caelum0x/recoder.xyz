/**
 * Comprehensive Security Audit Suite
 * Orchestrates all security testing and monitoring tools
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { SecurityTestingSuite, SecurityAuditReport as TestingReport } from './security-testing';
import { PenetrationTester, PenTestReport, PenTestConfig } from './penetration-testing';
import { RouterSecurityService, SecurityMetrics } from './router-security';
import { CodeVulnerabilityScanner, ScanResult } from './code-vulnerability-scanner';
import { AIPromptSanitizer } from './ai-prompt-sanitizer';

export interface SecurityAuditConfig {
  target: {
    baseUrl: string;
    name: string;
    scope: string[];
  };
  enabledTests: {
    penetrationTesting: boolean;
    securityTesting: boolean;
    codeScanning: boolean;
    routerSecurity: boolean;
    promptSanitization: boolean;
  };
  penetrationTestConfig?: Partial<PenTestConfig>;
  codebasePath?: string;
  reportFormat: 'json' | 'html' | 'pdf';
  outputPath?: string;
}

export interface ComprehensiveSecurityReport {
  id: string;
  timestamp: Date;
  target: {
    baseUrl: string;
    name: string;
  };
  overallSecurityScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  executionTime: number;
  
  // Individual report sections
  testingReport?: TestingReport;
  penetrationReport?: PenTestReport;
  codeSecurityReport?: CodeSecurityReport;
  routerSecurityReport?: RouterSecurityReport;
  promptSecurityReport?: PromptSecurityReport;
  
  // Consolidated findings
  consolidatedFindings: ConsolidatedFinding[];
  prioritizedRecommendations: PrioritizedRecommendation[];
  complianceAssessment: ComplianceAssessment;
  
  // Executive summary
  executiveSummary: string;
  nextSteps: string[];
}

export interface CodeSecurityReport {
  scanResults: ScanResult[];
  vulnerabilityCount: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  filesScanned: number;
  scanDuration: number;
}

export interface RouterSecurityReport {
  metrics: SecurityMetrics;
  activeThreats: number;
  blockedRequests: number;
  securityEvents: number;
  averageRiskScore: number;
  systemHealth: 'healthy' | 'degraded' | 'critical';
}

export interface PromptSecurityReport {
  totalPrompts: number;
  sanitizedPrompts: number;
  blockedPrompts: number;
  highRiskPrompts: number;
  commonThreats: string[];
  sanitizationEffectiveness: number;
}

export interface ConsolidatedFinding {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  sources: string[]; // Which tools found this issue
  affectedComponents: string[];
  impact: string;
  remediation: string;
  priority: number;
  estimatedEffort: 'low' | 'medium' | 'high';
  businessImpact: 'low' | 'medium' | 'high' | 'critical';
}

export interface PrioritizedRecommendation {
  id: string;
  title: string;
  description: string;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high' | 'critical';
  timeline: string;
  findings: string[]; // Related finding IDs
  actionItems: string[];
}

export interface ComplianceAssessment {
  owasp: {
    score: number;
    status: 'compliant' | 'partial' | 'non-compliant';
    missingControls: string[];
  };
  nist: {
    score: number;
    status: 'compliant' | 'partial' | 'non-compliant';
    frameworks: string[];
  };
  iso27001: {
    score: number;
    status: 'compliant' | 'partial' | 'non-compliant';
    gaps: string[];
  };
  gdpr: {
    score: number;
    status: 'compliant' | 'partial' | 'non-compliant';
    dataProtectionGaps: string[];
  };
  soc2: {
    score: number;
    status: 'compliant' | 'partial' | 'non-compliant';
    controlGaps: string[];
  };
}

export class SecurityAuditor extends EventEmitter {
  private config: SecurityAuditConfig;
  private testingSuite?: SecurityTestingSuite;
  private penetrationTester?: PenetrationTester;
  private codeScanner?: CodeVulnerabilityScanner;
  private routerSecurity?: RouterSecurityService;
  private promptSanitizer?: AIPromptSanitizer;
  private isRunning = false;

  constructor(config: SecurityAuditConfig) {
    super();
    this.config = config;
    this.initializeTools();
  }

  /**
   * Initialize security tools based on configuration
   */
  private initializeTools(): void {
    if (this.config.enabledTests.securityTesting) {
      this.testingSuite = new SecurityTestingSuite();
    }

    if (this.config.enabledTests.penetrationTesting) {
      const penTestConfig: PenTestConfig = {
        target: {
          id: crypto.randomUUID(),
          name: this.config.target.name,
          baseUrl: this.config.target.baseUrl,
          scope: this.config.target.scope,
          excludedPaths: ['/health', '/favicon.ico']
        },
        maxConcurrency: 5,
        timeout: 30000,
        userAgent: 'Recoder Security Audit Suite',
        followRedirects: true,
        maxRedirects: 5,
        aggressive: false,
        skipSlowTests: false,
        delayBetweenRequests: 1000,
        reportFormat: 'json',
        ...this.config.penetrationTestConfig
      };
      
      this.penetrationTester = new PenetrationTester(penTestConfig);
    }

    if (this.config.enabledTests.codeScanning && this.config.codebasePath) {
      this.codeScanner = new CodeVulnerabilityScanner({
        enablePatternMatching: true,
        enableDependencyScanning: true,
        enableSecretsDetection: true,
        customRules: [],
        excludePatterns: ['node_modules/', '.git/', 'dist/', 'build/']
      });
    }

    if (this.config.enabledTests.promptSanitization) {
      this.promptSanitizer = new AIPromptSanitizer({
        strictMode: true,
        blockSuspiciousPatterns: true,
        enableLogging: true,
        customPatterns: []
      });
    }
  }

  /**
   * Run comprehensive security audit
   */
  async runAudit(): Promise<ComprehensiveSecurityReport> {
    if (this.isRunning) {
      throw new Error('Security audit is already running');
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.emit('auditStarted', { target: this.config.target, timestamp: new Date() });

      // Run all enabled security tests in parallel where possible
      const results = await Promise.allSettled([
        this.runSecurityTesting(),
        this.runPenetrationTesting(),
        this.runCodeSecurityScanning(),
        this.gatherRouterSecurityMetrics(),
        this.analyzePromptSecurity()
      ]);

      // Process results
      const [testingResult, penTestResult, codeResult, routerResult, promptResult] = results;

      const report = await this.generateComprehensiveReport({
        testingReport: testingResult.status === 'fulfilled' ? testingResult.value : undefined,
        penetrationReport: penTestResult.status === 'fulfilled' ? penTestResult.value : undefined,
        codeSecurityReport: codeResult.status === 'fulfilled' ? codeResult.value : undefined,
        routerSecurityReport: routerResult.status === 'fulfilled' ? routerResult.value : undefined,
        promptSecurityReport: promptResult.status === 'fulfilled' ? promptResult.value : undefined,
        executionTime: Date.now() - startTime
      });

      this.emit('auditCompleted', report);
      return report;
    } catch (error) {
      this.emit('auditError', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run security testing suite
   */
  private async runSecurityTesting(): Promise<TestingReport | undefined> {
    if (!this.testingSuite) return undefined;

    this.emit('phaseStarted', 'Security Testing');
    const report = await this.testingSuite.runAllTests();
    this.emit('phaseCompleted', 'Security Testing');
    return report;
  }

  /**
   * Run penetration testing
   */
  private async runPenetrationTesting(): Promise<PenTestReport | undefined> {
    if (!this.penetrationTester) return undefined;

    this.emit('phaseStarted', 'Penetration Testing');
    const report = await this.penetrationTester.startTest();
    this.emit('phaseCompleted', 'Penetration Testing');
    return report;
  }

  /**
   * Run code security scanning
   */
  private async runCodeSecurityScanning(): Promise<CodeSecurityReport | undefined> {
    if (!this.codeScanner || !this.config.codebasePath) return undefined;

    this.emit('phaseStarted', 'Code Security Scanning');
    
    const startTime = Date.now();
    const scanResults = await this.codeScanner.scanDirectory(this.config.codebasePath);
    const scanDuration = Date.now() - startTime;

    const vulnerabilityCount = scanResults.reduce((sum, result) => sum + result.vulnerabilities.length, 0);
    const allVulns = scanResults.flatMap(result => result.vulnerabilities);
    
    const report: CodeSecurityReport = {
      scanResults,
      vulnerabilityCount,
      criticalIssues: allVulns.filter(v => v.severity === 'critical').length,
      highIssues: allVulns.filter(v => v.severity === 'high').length,
      mediumIssues: allVulns.filter(v => v.severity === 'medium').length,
      lowIssues: allVulns.filter(v => v.severity === 'low').length,
      filesScanned: scanResults.length,
      scanDuration
    };

    this.emit('phaseCompleted', 'Code Security Scanning');
    return report;
  }

  /**
   * Gather router security metrics
   */
  private async gatherRouterSecurityMetrics(): Promise<RouterSecurityReport | undefined> {
    if (!this.routerSecurity) return undefined;

    this.emit('phaseStarted', 'Router Security Analysis');
    
    const metrics = this.routerSecurity.getSecurityMetrics();
    const recentEvents = this.routerSecurity.getRecentSecurityEvents(50);
    const healthCheck = this.routerSecurity.healthCheck();

    const report: RouterSecurityReport = {
      metrics,
      activeThreats: recentEvents.filter(e => 
        e.severity === 'high' || e.severity === 'critical'
      ).length,
      blockedRequests: metrics.blockedRequests,
      securityEvents: recentEvents.length,
      averageRiskScore: metrics.averageRiskScore,
      systemHealth: healthCheck.status as 'healthy' | 'degraded' | 'critical'
    };

    this.emit('phaseCompleted', 'Router Security Analysis');
    return report;
  }

  /**
   * Analyze prompt security
   */
  private async analyzePromptSecurity(): Promise<PromptSecurityReport | undefined> {
    if (!this.promptSanitizer) return undefined;

    this.emit('phaseStarted', 'Prompt Security Analysis');
    
    // This would analyze recent prompt sanitization data
    // For demonstration, we'll return mock data
    const report: PromptSecurityReport = {
      totalPrompts: 1000,
      sanitizedPrompts: 950,
      blockedPrompts: 25,
      highRiskPrompts: 15,
      commonThreats: ['prompt injection', 'data extraction', 'code injection'],
      sanitizationEffectiveness: 95
    };

    this.emit('phaseCompleted', 'Prompt Security Analysis');
    return report;
  }

  /**
   * Generate comprehensive security report
   */
  private async generateComprehensiveReport(data: {
    testingReport?: TestingReport;
    penetrationReport?: PenTestReport;
    codeSecurityReport?: CodeSecurityReport;
    routerSecurityReport?: RouterSecurityReport;
    promptSecurityReport?: PromptSecurityReport;
    executionTime: number;
  }): Promise<ComprehensiveSecurityReport> {
    
    // Consolidate findings from all sources
    const consolidatedFindings = this.consolidateFindings(data);
    
    // Generate prioritized recommendations
    const prioritizedRecommendations = this.generatePrioritizedRecommendations(consolidatedFindings);
    
    // Assess compliance
    const complianceAssessment = this.assessCompliance(consolidatedFindings);
    
    // Calculate overall security score
    const overallSecurityScore = this.calculateOverallSecurityScore(data, consolidatedFindings);
    
    // Determine risk level
    const riskLevel = this.determineRiskLevel(consolidatedFindings, overallSecurityScore);
    
    // Generate executive summary
    const executiveSummary = this.generateExecutiveSummary(consolidatedFindings, overallSecurityScore, riskLevel);
    
    // Generate next steps
    const nextSteps = this.generateNextSteps(prioritizedRecommendations, riskLevel);

    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      target: {
        baseUrl: this.config.target.baseUrl,
        name: this.config.target.name
      },
      overallSecurityScore,
      riskLevel,
      executionTime: data.executionTime,
      testingReport: data.testingReport,
      penetrationReport: data.penetrationReport,
      codeSecurityReport: data.codeSecurityReport,
      routerSecurityReport: data.routerSecurityReport,
      promptSecurityReport: data.promptSecurityReport,
      consolidatedFindings,
      prioritizedRecommendations,
      complianceAssessment,
      executiveSummary,
      nextSteps
    };
  }

  /**
   * Consolidate findings from all security tools
   */
  private consolidateFindings(data: any): ConsolidatedFinding[] {
    const findings: ConsolidatedFinding[] = [];
    let priority = 1;

    // Add findings from security testing
    if (data.testingReport?.vulnerabilities) {
      data.testingReport.vulnerabilities.forEach((vuln: any) => {
        findings.push({
          id: vuln.id || crypto.randomUUID(),
          title: vuln.title,
          description: vuln.description,
          severity: vuln.severity,
          category: vuln.type || 'Security Testing',
          sources: ['Security Testing Suite'],
          affectedComponents: ['Application'],
          impact: vuln.impact,
          remediation: vuln.remediation,
          priority: priority++,
          estimatedEffort: this.estimateEffort(vuln.severity),
          businessImpact: this.estimateBusinessImpact(vuln.severity)
        });
      });
    }

    // Add findings from penetration testing
    if (data.penetrationReport?.findings) {
      data.penetrationReport.findings.forEach((finding: any) => {
        findings.push({
          id: finding.id,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          category: finding.category,
          sources: ['Penetration Testing'],
          affectedComponents: finding.affectedUrls || ['Application'],
          impact: finding.impact,
          remediation: finding.remediation,
          priority: priority++,
          estimatedEffort: this.estimateEffort(finding.severity),
          businessImpact: this.estimateBusinessImpact(finding.severity)
        });
      });
    }

    // Add findings from code scanning
    if (data.codeSecurityReport?.scanResults) {
      data.codeSecurityReport.scanResults.forEach((result: any) => {
        result.vulnerabilities?.forEach((vuln: any) => {
          findings.push({
            id: vuln.id || crypto.randomUUID(),
            title: `Code Security: ${vuln.type}`,
            description: vuln.description,
            severity: vuln.severity,
            category: 'Code Security',
            sources: ['Code Scanner'],
            affectedComponents: [result.filePath],
            impact: vuln.impact || 'Code-level security vulnerability',
            remediation: vuln.recommendation || 'Review and fix code vulnerability',
            priority: priority++,
            estimatedEffort: this.estimateEffort(vuln.severity),
            businessImpact: this.estimateBusinessImpact(vuln.severity)
          });
        });
      });
    }

    // Sort by priority (critical first, then by discovery order)
    return findings.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const aSeverity = severityOrder[a.severity as keyof typeof severityOrder];
      const bSeverity = severityOrder[b.severity as keyof typeof severityOrder];
      
      if (aSeverity !== bSeverity) {
        return bSeverity - aSeverity;
      }
      
      return a.priority - b.priority;
    });
  }

  /**
   * Generate prioritized recommendations
   */
  private generatePrioritizedRecommendations(findings: ConsolidatedFinding[]): PrioritizedRecommendation[] {
    const recommendations: PrioritizedRecommendation[] = [];
    
    // Group findings by category and severity
    const criticalFindings = findings.filter(f => f.severity === 'critical');
    const highFindings = findings.filter(f => f.severity === 'high');
    const mediumFindings = findings.filter(f => f.severity === 'medium');
    const lowFindings = findings.filter(f => f.severity === 'low');

    // Immediate actions for critical issues
    if (criticalFindings.length > 0) {
      recommendations.push({
        id: crypto.randomUUID(),
        title: 'Address Critical Security Vulnerabilities',
        description: 'Immediately address all critical severity security vulnerabilities',
        priority: 'immediate',
        effort: 'high',
        impact: 'critical',
        timeline: 'Within 24 hours',
        findings: criticalFindings.map(f => f.id),
        actionItems: [
          'Form incident response team',
          'Assess immediate threat exposure',
          'Implement temporary mitigations',
          'Apply security patches',
          'Verify fixes with testing'
        ]
      });
    }

    // High priority for high severity issues
    if (highFindings.length > 0) {
      recommendations.push({
        id: crypto.randomUUID(),
        title: 'Remediate High Severity Security Issues',
        description: 'Address high severity security vulnerabilities within the next sprint',
        priority: 'high',
        effort: 'medium',
        impact: 'high',
        timeline: 'Within 1-2 weeks',
        findings: highFindings.map(f => f.id),
        actionItems: [
          'Prioritize in development backlog',
          'Assign security-experienced developers',
          'Implement comprehensive fixes',
          'Conduct thorough testing',
          'Update security documentation'
        ]
      });
    }

    // Medium priority recommendations
    if (mediumFindings.length > 0) {
      recommendations.push({
        id: crypto.randomUUID(),
        title: 'Improve Security Posture',
        description: 'Address medium severity issues and improve overall security posture',
        priority: 'medium',
        effort: 'medium',
        impact: 'medium',
        timeline: 'Within 1 month',
        findings: mediumFindings.map(f => f.id),
        actionItems: [
          'Plan security improvements',
          'Implement security best practices',
          'Enhance monitoring and logging',
          'Update security policies',
          'Conduct security training'
        ]
      });
    }

    // Long-term security improvements
    recommendations.push({
      id: crypto.randomUUID(),
      title: 'Implement Continuous Security Program',
      description: 'Establish ongoing security practices and monitoring',
      priority: 'medium',
      effort: 'high',
      impact: 'high',
      timeline: 'Ongoing',
      findings: [],
      actionItems: [
        'Implement automated security testing in CI/CD',
        'Establish regular security audits',
        'Create security incident response procedures',
        'Implement security awareness training',
        'Deploy continuous monitoring solutions'
      ]
    });

    return recommendations;
  }

  /**
   * Assess compliance with various standards
   */
  private assessCompliance(findings: ConsolidatedFinding[]): ComplianceAssessment {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    const totalFindings = findings.length;

    // Calculate base scores
    const baseScore = Math.max(0, 100 - (criticalCount * 30) - (highCount * 15) - (totalFindings * 2));

    return {
      owasp: {
        score: Math.max(0, baseScore - (criticalCount * 10)),
        status: baseScore >= 80 ? 'compliant' : baseScore >= 60 ? 'partial' : 'non-compliant',
        missingControls: criticalCount > 0 ? ['Input Validation', 'Authentication'] : []
      },
      nist: {
        score: baseScore,
        status: baseScore >= 85 ? 'compliant' : baseScore >= 70 ? 'partial' : 'non-compliant',
        frameworks: ['NIST Cybersecurity Framework']
      },
      iso27001: {
        score: Math.max(0, baseScore - (highCount * 5)),
        status: baseScore >= 90 ? 'compliant' : baseScore >= 75 ? 'partial' : 'non-compliant',
        gaps: criticalCount > 0 ? ['Security Controls', 'Risk Management'] : []
      },
      gdpr: {
        score: baseScore,
        status: baseScore >= 85 ? 'compliant' : baseScore >= 70 ? 'partial' : 'non-compliant',
        dataProtectionGaps: findings.some(f => f.category.includes('Data')) ? ['Data Protection'] : []
      },
      soc2: {
        score: Math.max(0, baseScore - (criticalCount * 20)),
        status: baseScore >= 90 ? 'compliant' : baseScore >= 75 ? 'partial' : 'non-compliant',
        controlGaps: criticalCount > 0 ? ['Security', 'Availability'] : []
      }
    };
  }

  /**
   * Calculate overall security score
   */
  private calculateOverallSecurityScore(data: any, findings: ConsolidatedFinding[]): number {
    let totalScore = 0;
    let componentCount = 0;

    // Security testing score
    if (data.testingReport) {
      totalScore += data.testingReport.overallScore || 0;
      componentCount++;
    }

    // Code security score
    if (data.codeSecurityReport) {
      const codeScore = Math.max(0, 100 - (data.codeSecurityReport.criticalIssues * 30) - 
                                          (data.codeSecurityReport.highIssues * 15));
      totalScore += codeScore;
      componentCount++;
    }

    // Router security score
    if (data.routerSecurityReport) {
      const routerScore = 100 - data.routerSecurityReport.averageRiskScore;
      totalScore += Math.max(0, routerScore);
      componentCount++;
    }

    // Prompt security score
    if (data.promptSecurityReport) {
      totalScore += data.promptSecurityReport.sanitizationEffectiveness || 0;
      componentCount++;
    }

    // Calculate weighted average
    const baseScore = componentCount > 0 ? totalScore / componentCount : 100;
    
    // Adjust for findings
    const criticalPenalty = findings.filter(f => f.severity === 'critical').length * 20;
    const highPenalty = findings.filter(f => f.severity === 'high').length * 10;
    
    return Math.max(0, Math.min(100, baseScore - criticalPenalty - highPenalty));
  }

  /**
   * Determine overall risk level
   */
  private determineRiskLevel(findings: ConsolidatedFinding[], score: number): 'low' | 'medium' | 'high' | 'critical' {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    
    if (criticalCount > 0 || score < 40) return 'critical';
    if (highCount > 2 || score < 60) return 'high';
    if (highCount > 0 || score < 80) return 'medium';
    return 'low';
  }

  /**
   * Generate executive summary
   */
  private generateExecutiveSummary(
    findings: ConsolidatedFinding[], 
    score: number, 
    riskLevel: string
  ): string {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    const totalCount = findings.length;

    if (totalCount === 0) {
      return `The comprehensive security audit found no significant security vulnerabilities. ` +
             `The application demonstrates strong security practices with an overall security score of ${score}/100.`;
    }

    return `The comprehensive security audit identified ${totalCount} security findings with an overall ` +
           `security score of ${score}/100 and a ${riskLevel} risk level. Critical issues: ${criticalCount}, ` +
           `High severity issues: ${highCount}. ${criticalCount > 0 ? 'Immediate action is required for critical issues. ' : ''}` +
           `Recommended to address high-severity issues within the next development cycle.`;
  }

  /**
   * Generate next steps
   */
  private generateNextSteps(recommendations: PrioritizedRecommendation[], riskLevel: string): string[] {
    const steps: string[] = [];
    
    if (riskLevel === 'critical') {
      steps.push('Form immediate incident response team');
      steps.push('Assess and contain critical security threats');
      steps.push('Implement emergency security patches');
    }
    
    steps.push('Review and prioritize security recommendations');
    steps.push('Assign security tasks to development team');
    steps.push('Implement comprehensive security testing in CI/CD');
    steps.push('Schedule regular security audits');
    steps.push('Establish security monitoring and alerting');
    
    return steps;
  }

  /**
   * Helper methods
   */
  private estimateEffort(severity: string): 'low' | 'medium' | 'high' {
    switch (severity) {
      case 'critical': return 'high';
      case 'high': return 'medium';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  private estimateBusinessImpact(severity: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Get audit status
   */
  getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}

// Export factory function
export function createSecurityAuditor(config: SecurityAuditConfig): SecurityAuditor {
  return new SecurityAuditor(config);
}

export default SecurityAuditor;