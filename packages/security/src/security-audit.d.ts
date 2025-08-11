/**
 * Comprehensive Security Audit Suite
 * Orchestrates all security testing and monitoring tools
 */
import { EventEmitter } from 'events';
import { SecurityAuditReport as TestingReport } from './security-testing';
import { PenTestReport, PenTestConfig } from './penetration-testing';
import { SecurityMetrics } from './router-security';
import { ScanResult } from './code-vulnerability-scanner';
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
    testingReport?: TestingReport;
    penetrationReport?: PenTestReport;
    codeSecurityReport?: CodeSecurityReport;
    routerSecurityReport?: RouterSecurityReport;
    promptSecurityReport?: PromptSecurityReport;
    consolidatedFindings: ConsolidatedFinding[];
    prioritizedRecommendations: PrioritizedRecommendation[];
    complianceAssessment: ComplianceAssessment;
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
    sources: string[];
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
    findings: string[];
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
export declare class SecurityAuditor extends EventEmitter {
    private config;
    private testingSuite?;
    private penetrationTester?;
    private codeScanner?;
    private routerSecurity?;
    private promptSanitizer?;
    private isRunning;
    constructor(config: SecurityAuditConfig);
    /**
     * Initialize security tools based on configuration
     */
    private initializeTools;
    /**
     * Run comprehensive security audit
     */
    runAudit(): Promise<ComprehensiveSecurityReport>;
    /**
     * Run security testing suite
     */
    private runSecurityTesting;
    /**
     * Run penetration testing
     */
    private runPenetrationTesting;
    /**
     * Run code security scanning
     */
    private runCodeSecurityScanning;
    /**
     * Gather router security metrics
     */
    private gatherRouterSecurityMetrics;
    /**
     * Analyze prompt security
     */
    private analyzePromptSecurity;
    /**
     * Generate comprehensive security report
     */
    private generateComprehensiveReport;
    /**
     * Consolidate findings from all security tools
     */
    private consolidateFindings;
    /**
     * Generate prioritized recommendations
     */
    private generatePrioritizedRecommendations;
    /**
     * Assess compliance with various standards
     */
    private assessCompliance;
    /**
     * Calculate overall security score
     */
    private calculateOverallSecurityScore;
    /**
     * Determine overall risk level
     */
    private determineRiskLevel;
    /**
     * Generate executive summary
     */
    private generateExecutiveSummary;
    /**
     * Generate next steps
     */
    private generateNextSteps;
    /**
     * Helper methods
     */
    private estimateEffort;
    private estimateBusinessImpact;
    /**
     * Get audit status
     */
    getStatus(): {
        isRunning: boolean;
    };
}
export declare function createSecurityAuditor(config: SecurityAuditConfig): SecurityAuditor;
export default SecurityAuditor;
//# sourceMappingURL=security-audit.d.ts.map