/**
 * Security Testing and Audit Suite
 * Comprehensive testing tools for security validation and penetration testing
 */
import { EventEmitter } from 'events';
export interface SecurityTest {
    id: string;
    name: string;
    description: string;
    category: 'authentication' | 'authorization' | 'injection' | 'xss' | 'csrf' | 'rce' | 'dos' | 'misconfiguration';
    severity: 'low' | 'medium' | 'high' | 'critical';
    execute: () => Promise<SecurityTestResult>;
}
export interface SecurityTestResult {
    testId: string;
    passed: boolean;
    score: number;
    vulnerabilities: SecurityVulnerability[];
    recommendations: string[];
    executionTime: number;
    details: Record<string, any>;
}
export interface SecurityVulnerability {
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    location?: string;
    impact: string;
    remediation: string;
    cve?: string;
    cvss?: number;
}
export interface SecurityAuditReport {
    id: string;
    timestamp: Date;
    overallScore: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    vulnerabilities: SecurityVulnerability[];
    testResults: SecurityTestResult[];
    recommendations: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    complianceStatus: {
        owasp: {
            score: number;
            status: 'compliant' | 'non-compliant' | 'partial';
        };
        gdpr: {
            score: number;
            status: 'compliant' | 'non-compliant' | 'partial';
        };
        soc2: {
            score: number;
            status: 'compliant' | 'non-compliant' | 'partial';
        };
    };
}
export interface PenetrationTestConfig {
    target: string;
    scope: string[];
    excludedPaths: string[];
    authToken?: string;
    maxConcurrency: number;
    timeout: number;
    aggressive: boolean;
    skipSlowTests: boolean;
}
export declare class SecurityTestingSuite extends EventEmitter {
    private tests;
    private results;
    private isRunning;
    constructor();
    /**
     * Initialize default security tests
     */
    private initializeDefaultTests;
    /**
     * Add a custom security test
     */
    addTest(test: SecurityTest): void;
    /**
     * Remove a security test
     */
    removeTest(testId: string): boolean;
    /**
     * Run all security tests
     */
    runAllTests(config?: {
        categories?: string[];
        severities?: string[];
    }): Promise<SecurityAuditReport>;
    /**
     * Run a single security test
     */
    private runSingleTest;
    /**
     * Filter tests based on criteria
     */
    private filterTests;
    /**
     * Split array into chunks
     */
    private chunkArray;
    /**
     * Generate comprehensive audit report
     */
    private generateAuditReport;
    /**
     * Calculate overall risk level
     */
    private calculateRiskLevel;
    /**
     * Generate security recommendations
     */
    private generateRecommendations;
    /**
     * Assess compliance with security standards
     */
    private assessCompliance;
    private testWeakPasswords;
    private testSessionManagement;
    private testBruteForceProtection;
    private testPrivilegeEscalation;
    private testBrokenAccessControl;
    private testSQLInjection;
    private testNoSQLInjection;
    private testCommandInjection;
    private testReflectedXSS;
    private testStoredXSS;
    private testCSRFProtection;
    private testSecurityHeaders;
    private testHTTPSEnforcement;
    private testRateLimiting;
    /**
     * Get test results
     */
    getResults(): SecurityTestResult[];
    /**
     * Get available tests
     */
    getAvailableTests(): SecurityTest[];
    /**
     * Check if tests are currently running
     */
    isTestsRunning(): boolean;
}
export declare function createSecurityTestingSuite(): SecurityTestingSuite;
export default SecurityTestingSuite;
//# sourceMappingURL=security-testing.d.ts.map