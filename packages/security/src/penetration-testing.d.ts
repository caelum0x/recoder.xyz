/**
 * Penetration Testing Suite
 * Automated penetration testing tools for recoder.xyz platform
 */
import { EventEmitter } from 'events';
export interface PenTestTarget {
    id: string;
    name: string;
    baseUrl: string;
    scope: string[];
    excludedPaths: string[];
    authToken?: string;
    credentials?: {
        username: string;
        password: string;
    };
}
export interface PenTestConfig {
    target: PenTestTarget;
    maxConcurrency: number;
    timeout: number;
    userAgent: string;
    followRedirects: boolean;
    maxRedirects: number;
    aggressive: boolean;
    skipSlowTests: boolean;
    delayBetweenRequests: number;
    reportFormat: 'json' | 'html' | 'pdf';
}
export interface PenTestResult {
    id: string;
    testName: string;
    target: string;
    timestamp: Date;
    success: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    finding?: PenTestFinding;
    evidence: string[];
    httpRequests: HttpRequest[];
    httpResponses: HttpResponse[];
    executionTime: number;
}
export interface PenTestFinding {
    id: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    cwe?: number;
    cvss?: number;
    impact: string;
    remediation: string;
    references: string[];
    affectedUrls: string[];
}
export interface HttpRequest {
    id: string;
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    timestamp: Date;
}
export interface HttpResponse {
    requestId: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    responseTime: number;
    timestamp: Date;
}
export interface PenTestReport {
    id: string;
    target: PenTestTarget;
    startTime: Date;
    endTime: Date;
    duration: number;
    totalTests: number;
    totalFindings: number;
    riskDistribution: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    results: PenTestResult[];
    findings: PenTestFinding[];
    executiveSummary: string;
    technicalSummary: string;
    recommendations: string[];
}
export declare class PenetrationTester extends EventEmitter {
    private config;
    private results;
    private findings;
    private isRunning;
    private abortController?;
    constructor(config: PenTestConfig);
    /**
     * Start penetration testing
     */
    startTest(): Promise<PenTestReport>;
    /**
     * Stop penetration testing
     */
    stopTest(): void;
    /**
     * Phase 1: Information Gathering
     */
    private informationGathering;
    /**
     * Phase 2: Vulnerability Scanning
     */
    private vulnerabilityScanning;
    /**
     * Phase 3: Authentication Testing
     */
    private authenticationTesting;
    /**
     * Phase 4: Authorization Testing
     */
    private authorizationTesting;
    /**
     * Phase 5: Input Validation Testing
     */
    private inputValidationTesting;
    /**
     * Phase 6: Business Logic Testing
     */
    private businessLogicTesting;
    /**
     * Phase 7: Session Management Testing
     */
    private sessionManagementTesting;
    private testDirectoryDiscovery;
    private testTechnologyDetection;
    private testHttpMethods;
    private testRobotsTxt;
    private testErrorPages;
    private testSSLConfiguration;
    private testSecurityHeaders;
    private testKnownVulnerabilities;
    private testBruteForceProtection;
    private testDefaultCredentials;
    private testPasswordReset;
    private testMultiFactorAuth;
    private testPrivilegeEscalation;
    private testBrokenAccessControl;
    private testDirectObjectReferences;
    private testSQLInjection;
    private testNoSQLInjection;
    private testXSS;
    private testCommandInjection;
    private testPathTraversal;
    private testXXE;
    private testWorkflowBypass;
    private testRaceConditions;
    private testPriceManipulation;
    private testSessionFixation;
    private testSessionHijacking;
    private testCSRFProtection;
    /**
     * Make HTTP request to target
     */
    private makeRequest;
    /**
     * Add finding to results
     */
    private addFinding;
    /**
     * Add test result
     */
    private addResult;
    /**
     * Generate penetration test report
     */
    private generateReport;
    private generateExecutiveSummary;
    private generateTechnicalSummary;
    private generateRecommendations;
    /**
     * Get current status
     */
    getStatus(): {
        isRunning: boolean;
        results: number;
        findings: number;
    };
}
export declare function createPenetrationTester(config: PenTestConfig): PenetrationTester;
export default PenetrationTester;
//# sourceMappingURL=penetration-testing.d.ts.map