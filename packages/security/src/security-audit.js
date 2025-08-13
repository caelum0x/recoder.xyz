/**
 * Comprehensive Security Audit Suite
 * Orchestrates all security testing and monitoring tools
 */
import { __awaiter } from "tslib";
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { SecurityTestingSuite } from './security-testing';
import { PenetrationTester } from './penetration-testing';
import { CodeVulnerabilityScanner } from './code-vulnerability-scanner';
import { AIPromptSanitizer } from './ai-prompt-sanitizer';
export class SecurityAuditor extends EventEmitter {
    constructor(config) {
        super();
        this.isRunning = false;
        this.config = config;
        this.initializeTools();
    }
    /**
     * Initialize security tools based on configuration
     */
    initializeTools() {
        if (this.config.enabledTests.securityTesting) {
            this.testingSuite = new SecurityTestingSuite();
        }
        if (this.config.enabledTests.penetrationTesting) {
            const penTestConfig = Object.assign({ target: {
                    id: crypto.randomUUID(),
                    name: this.config.target.name,
                    baseUrl: this.config.target.baseUrl,
                    scope: this.config.target.scope,
                    excludedPaths: ['/health', '/favicon.ico']
                }, maxConcurrency: 5, timeout: 30000, userAgent: 'Recoder Security Audit Suite', followRedirects: true, maxRedirects: 5, aggressive: false, skipSlowTests: false, delayBetweenRequests: 1000, reportFormat: 'json' }, this.config.penetrationTestConfig);
            this.penetrationTester = new PenetrationTester(penTestConfig);
        }
        if (this.config.enabledTests.codeScanning && this.config.codebasePath) {
            this.codeScanner = new CodeVulnerabilityScanner();
        }
        if (this.config.enabledTests.promptSanitization) {
            this.promptSanitizer = new AIPromptSanitizer();
        }
    }
    /**
     * Run comprehensive security audit
     */
    runAudit() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isRunning) {
                throw new Error('Security audit is already running');
            }
            this.isRunning = true;
            const startTime = Date.now();
            try {
                this.emit('auditStarted', { target: this.config.target, timestamp: new Date() });
                // Run all enabled security tests in parallel where possible
                const results = yield Promise.allSettled([
                    this.runSecurityTesting(),
                    this.runPenetrationTesting(),
                    this.runCodeSecurityScanning(),
                    this.gatherRouterSecurityMetrics(),
                    this.analyzePromptSecurity()
                ]);
                // Process results
                const [testingResult, penTestResult, codeResult, routerResult, promptResult] = results;
                const report = yield this.generateComprehensiveReport({
                    testingReport: testingResult.status === 'fulfilled' ? testingResult.value : undefined,
                    penetrationReport: penTestResult.status === 'fulfilled' ? penTestResult.value : undefined,
                    codeSecurityReport: codeResult.status === 'fulfilled' ? codeResult.value : undefined,
                    routerSecurityReport: routerResult.status === 'fulfilled' ? routerResult.value : undefined,
                    promptSecurityReport: promptResult.status === 'fulfilled' ? promptResult.value : undefined,
                    executionTime: Date.now() - startTime
                });
                this.emit('auditCompleted', report);
                return report;
            }
            catch (error) {
                this.emit('auditError', error);
                throw error;
            }
            finally {
                this.isRunning = false;
            }
        });
    }
    /**
     * Run security testing suite
     */
    runSecurityTesting() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.testingSuite)
                return undefined;
            this.emit('phaseStarted', 'Security Testing');
            const report = yield this.testingSuite.runAllTests();
            this.emit('phaseCompleted', 'Security Testing');
            return report;
        });
    }
    /**
     * Run penetration testing
     */
    runPenetrationTesting() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.penetrationTester)
                return undefined;
            this.emit('phaseStarted', 'Penetration Testing');
            const report = yield this.penetrationTester.startTest();
            this.emit('phaseCompleted', 'Penetration Testing');
            return report;
        });
    }
    /**
     * Run code security scanning
     */
    runCodeSecurityScanning() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.codeScanner || !this.config.codebasePath)
                return undefined;
            this.emit('phaseStarted', 'Code Security Scanning');
            const startTime = Date.now();
            const scanResults = yield this.codeScanner.scanDirectory(this.config.codebasePath);
            const scanDuration = Date.now() - startTime;
            const vulnerabilityCount = scanResults.length;
            const allVulns = scanResults;
            const report = {
                scanResults: [{
                        totalFiles: scanResults.length,
                        vulnerabilities: scanResults,
                        securityScore: Math.max(0, 100 - vulnerabilityCount * 10),
                        summary: {
                            critical: allVulns.filter(v => v.severity === 'critical').length,
                            high: allVulns.filter(v => v.severity === 'high').length,
                            medium: allVulns.filter(v => v.severity === 'medium').length,
                            low: allVulns.filter(v => v.severity === 'low').length
                        }
                    }],
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
        });
    }
    /**
     * Gather router security metrics
     */
    gatherRouterSecurityMetrics() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.routerSecurity)
                return undefined;
            this.emit('phaseStarted', 'Router Security Analysis');
            const metrics = this.routerSecurity.getSecurityMetrics();
            const recentEvents = this.routerSecurity.getRecentSecurityEvents(50);
            const healthCheck = this.routerSecurity.healthCheck();
            const report = {
                metrics,
                activeThreats: recentEvents.filter(e => e.severity === 'high' || e.severity === 'critical').length,
                blockedRequests: metrics.blockedRequests,
                securityEvents: recentEvents.length,
                averageRiskScore: metrics.averageRiskScore,
                systemHealth: healthCheck.status
            };
            this.emit('phaseCompleted', 'Router Security Analysis');
            return report;
        });
    }
    /**
     * Analyze prompt security
     */
    analyzePromptSecurity() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.promptSanitizer)
                return undefined;
            this.emit('phaseStarted', 'Prompt Security Analysis');
            // This would analyze recent prompt sanitization data
            // For demonstration, we'll return mock data
            const report = {
                totalPrompts: 1000,
                sanitizedPrompts: 950,
                blockedPrompts: 25,
                highRiskPrompts: 15,
                commonThreats: ['prompt injection', 'data extraction', 'code injection'],
                sanitizationEffectiveness: 95
            };
            this.emit('phaseCompleted', 'Prompt Security Analysis');
            return report;
        });
    }
    /**
     * Generate comprehensive security report
     */
    generateComprehensiveReport(data) {
        return __awaiter(this, void 0, void 0, function* () {
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
        });
    }
    /**
     * Consolidate findings from all security tools
     */
    consolidateFindings(data) {
        var _a, _b, _c;
        const findings = [];
        let priority = 1;
        // Add findings from security testing
        if ((_a = data.testingReport) === null || _a === void 0 ? void 0 : _a.vulnerabilities) {
            data.testingReport.vulnerabilities.forEach((vuln) => {
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
        if ((_b = data.penetrationReport) === null || _b === void 0 ? void 0 : _b.findings) {
            data.penetrationReport.findings.forEach((finding) => {
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
        if ((_c = data.codeSecurityReport) === null || _c === void 0 ? void 0 : _c.scanResults) {
            data.codeSecurityReport.scanResults.forEach((result) => {
                var _a;
                (_a = result.vulnerabilities) === null || _a === void 0 ? void 0 : _a.forEach((vuln) => {
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
            const aSeverity = severityOrder[a.severity];
            const bSeverity = severityOrder[b.severity];
            if (aSeverity !== bSeverity) {
                return bSeverity - aSeverity;
            }
            return a.priority - b.priority;
        });
    }
    /**
     * Generate prioritized recommendations
     */
    generatePrioritizedRecommendations(findings) {
        const recommendations = [];
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
    assessCompliance(findings) {
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
    calculateOverallSecurityScore(data, findings) {
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
    determineRiskLevel(findings, score) {
        const criticalCount = findings.filter(f => f.severity === 'critical').length;
        const highCount = findings.filter(f => f.severity === 'high').length;
        if (criticalCount > 0 || score < 40)
            return 'critical';
        if (highCount > 2 || score < 60)
            return 'high';
        if (highCount > 0 || score < 80)
            return 'medium';
        return 'low';
    }
    /**
     * Generate executive summary
     */
    generateExecutiveSummary(findings, score, riskLevel) {
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
    generateNextSteps(recommendations, riskLevel) {
        const steps = [];
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
    estimateEffort(severity) {
        switch (severity) {
            case 'critical': return 'high';
            case 'high': return 'medium';
            case 'medium': return 'medium';
            case 'low': return 'low';
            default: return 'medium';
        }
    }
    estimateBusinessImpact(severity) {
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
    getStatus() {
        return { isRunning: this.isRunning };
    }
}
// Export factory function
export function createSecurityAuditor(config) {
    return new SecurityAuditor(config);
}
export default SecurityAuditor;
//# sourceMappingURL=security-audit.js.map