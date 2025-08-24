"use strict";
/**
 * SOC 2 Compliance Scanner for Generated Code
 * KILLER FEATURE: Enterprise-grade security compliance validation
 * Cursor/Copilot have NO compliance scanning - we dominate enterprise market!
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOC2ComplianceScanner = exports.RecommendationType = exports.RiskLevel = exports.IndustryStandard = exports.ProjectType = exports.DataClassification = exports.ComplianceSeverity = exports.SOC2Category = void 0;
const logger_1 = require("../logger");
var SOC2Category;
(function (SOC2Category) {
    SOC2Category["SECURITY"] = "security";
    SOC2Category["AVAILABILITY"] = "availability";
    SOC2Category["PROCESSING_INTEGRITY"] = "processing_integrity";
    SOC2Category["CONFIDENTIALITY"] = "confidentiality";
    SOC2Category["PRIVACY"] = "privacy";
})(SOC2Category || (exports.SOC2Category = SOC2Category = {}));
var ComplianceSeverity;
(function (ComplianceSeverity) {
    ComplianceSeverity["CRITICAL"] = "critical";
    ComplianceSeverity["HIGH"] = "high";
    ComplianceSeverity["MEDIUM"] = "medium";
    ComplianceSeverity["LOW"] = "low";
    ComplianceSeverity["INFO"] = "info";
})(ComplianceSeverity || (exports.ComplianceSeverity = ComplianceSeverity = {}));
var DataClassification;
(function (DataClassification) {
    DataClassification["PUBLIC"] = "public";
    DataClassification["INTERNAL"] = "internal";
    DataClassification["CONFIDENTIAL"] = "confidential";
    DataClassification["RESTRICTED"] = "restricted";
    DataClassification["PII"] = "pii";
    DataClassification["PHI"] = "phi";
    DataClassification["PCI"] = "pci";
})(DataClassification || (exports.DataClassification = DataClassification = {}));
var ProjectType;
(function (ProjectType) {
    ProjectType["WEB_APPLICATION"] = "web_application";
    ProjectType["API_SERVICE"] = "api_service";
    ProjectType["DATABASE_SYSTEM"] = "database_system";
    ProjectType["PAYMENT_SYSTEM"] = "payment_system";
    ProjectType["HEALTHCARE_SYSTEM"] = "healthcare_system";
    ProjectType["FINANCIAL_SYSTEM"] = "financial_system";
    ProjectType["IOT_SYSTEM"] = "iot_system";
    ProjectType["CLOUD_INFRASTRUCTURE"] = "cloud_infrastructure";
})(ProjectType || (exports.ProjectType = ProjectType = {}));
var IndustryStandard;
(function (IndustryStandard) {
    IndustryStandard["HIPAA"] = "hipaa";
    IndustryStandard["PCI_DSS"] = "pci_dss";
    IndustryStandard["GDPR"] = "gdpr";
    IndustryStandard["SOX"] = "sox";
    IndustryStandard["FISMA"] = "fisma";
    IndustryStandard["ISO_27001"] = "iso_27001";
    IndustryStandard["NIST"] = "nist";
})(IndustryStandard || (exports.IndustryStandard = IndustryStandard = {}));
var RiskLevel;
(function (RiskLevel) {
    RiskLevel["VERY_LOW"] = "very_low";
    RiskLevel["LOW"] = "low";
    RiskLevel["MEDIUM"] = "medium";
    RiskLevel["HIGH"] = "high";
    RiskLevel["VERY_HIGH"] = "very_high";
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
var RecommendationType;
(function (RecommendationType) {
    RecommendationType["CODE_CHANGE"] = "code_change";
    RecommendationType["ARCHITECTURE_CHANGE"] = "architecture_change";
    RecommendationType["CONFIGURATION"] = "configuration";
    RecommendationType["POLICY"] = "policy";
    RecommendationType["TRAINING"] = "training";
    RecommendationType["MONITORING"] = "monitoring";
})(RecommendationType || (exports.RecommendationType = RecommendationType = {}));
class SOC2ComplianceScanner {
    constructor() {
        this.rules = new Map();
        this.auditTrail = [];
        this.initializeRules();
    }
    initializeRules() {
        // Security Category Rules
        this.addRule({
            id: 'SEC-001',
            name: 'Input Validation Required',
            category: SOC2Category.SECURITY,
            description: 'All user input must be validated and sanitized',
            severity: ComplianceSeverity.CRITICAL,
            check: this.checkInputValidation.bind(this),
            remediation: 'Add proper input validation using whitelisting and sanitization',
            references: ['SOC 2 CC6.1', 'OWASP Top 10 A03:2021']
        });
        this.addRule({
            id: 'SEC-002',
            name: 'SQL Injection Prevention',
            category: SOC2Category.SECURITY,
            description: 'Prevent SQL injection through parameterized queries',
            severity: ComplianceSeverity.CRITICAL,
            check: this.checkSQLInjection.bind(this),
            remediation: 'Use parameterized queries or ORM with proper escaping',
            references: ['SOC 2 CC6.1', 'OWASP A03:2021']
        });
        this.addRule({
            id: 'SEC-003',
            name: 'Authentication Required',
            category: SOC2Category.SECURITY,
            description: 'Sensitive operations must require authentication',
            severity: ComplianceSeverity.HIGH,
            check: this.checkAuthentication.bind(this),
            remediation: 'Implement proper authentication checks before sensitive operations',
            references: ['SOC 2 CC6.2']
        });
        this.addRule({
            id: 'SEC-004',
            name: 'Authorization Controls',
            category: SOC2Category.SECURITY,
            description: 'Access control checks must be in place',
            severity: ComplianceSeverity.HIGH,
            check: this.checkAuthorization.bind(this),
            remediation: 'Implement role-based access control (RBAC) or attribute-based access control (ABAC)',
            references: ['SOC 2 CC6.3']
        });
        this.addRule({
            id: 'SEC-005',
            name: 'Encryption at Rest',
            category: SOC2Category.CONFIDENTIALITY,
            description: 'Sensitive data must be encrypted when stored',
            severity: ComplianceSeverity.CRITICAL,
            check: this.checkEncryptionAtRest.bind(this),
            remediation: 'Implement AES-256 encryption for sensitive data storage',
            references: ['SOC 2 CC6.7']
        });
        this.addRule({
            id: 'SEC-006',
            name: 'Encryption in Transit',
            category: SOC2Category.CONFIDENTIALITY,
            description: 'Data transmission must use secure protocols',
            severity: ComplianceSeverity.CRITICAL,
            check: this.checkEncryptionInTransit.bind(this),
            remediation: 'Use TLS 1.3 or higher for all data transmission',
            references: ['SOC 2 CC6.7']
        });
        // Availability Rules
        this.addRule({
            id: 'AVL-001',
            name: 'Error Handling',
            category: SOC2Category.AVAILABILITY,
            description: 'Proper error handling must be implemented',
            severity: ComplianceSeverity.MEDIUM,
            check: this.checkErrorHandling.bind(this),
            remediation: 'Implement comprehensive try-catch blocks and graceful error handling',
            references: ['SOC 2 CC7.1']
        });
        this.addRule({
            id: 'AVL-002',
            name: 'Rate Limiting',
            category: SOC2Category.AVAILABILITY,
            description: 'API endpoints must have rate limiting',
            severity: ComplianceSeverity.HIGH,
            check: this.checkRateLimiting.bind(this),
            remediation: 'Implement rate limiting to prevent denial of service attacks',
            references: ['SOC 2 CC7.1']
        });
        // Processing Integrity Rules
        this.addRule({
            id: 'INT-001',
            name: 'Data Validation',
            category: SOC2Category.PROCESSING_INTEGRITY,
            description: 'Data integrity checks must be performed',
            severity: ComplianceSeverity.HIGH,
            check: this.checkDataIntegrity.bind(this),
            remediation: 'Implement checksums, digital signatures, or hash verification',
            references: ['SOC 2 CC8.1']
        });
        this.addRule({
            id: 'INT-002',
            name: 'Transaction Integrity',
            category: SOC2Category.PROCESSING_INTEGRITY,
            description: 'Database transactions must be atomic and consistent',
            severity: ComplianceSeverity.HIGH,
            check: this.checkTransactionIntegrity.bind(this),
            remediation: 'Use database transactions with proper rollback mechanisms',
            references: ['SOC 2 CC8.1']
        });
        // Privacy Rules
        this.addRule({
            id: 'PRI-001',
            name: 'PII Protection',
            category: SOC2Category.PRIVACY,
            description: 'Personally Identifiable Information must be protected',
            severity: ComplianceSeverity.CRITICAL,
            check: this.checkPIIProtection.bind(this),
            remediation: 'Implement data classification and protection for PII',
            references: ['SOC 2 P1.0', 'GDPR Article 32']
        });
        this.addRule({
            id: 'PRI-002',
            name: 'Data Retention Policies',
            category: SOC2Category.PRIVACY,
            description: 'Data retention and deletion policies must be enforced',
            severity: ComplianceSeverity.MEDIUM,
            check: this.checkDataRetention.bind(this),
            remediation: 'Implement automated data retention and deletion policies',
            references: ['SOC 2 P2.1', 'GDPR Article 17']
        });
        logger_1.Logger.info(`Initialized ${this.rules.size} SOC 2 compliance rules`);
    }
    addRule(rule) {
        this.rules.set(rule.id, rule);
    }
    async scanCode(code, context) {
        const startTime = Date.now();
        this.logAudit('scan_started', 'system', { context });
        const violations = [];
        const passedRules = [];
        logger_1.Logger.info(`Starting SOC 2 compliance scan for ${context.filePath}`);
        for (const [ruleId, rule] of this.rules) {
            try {
                const ruleViolations = await rule.check(code, context);
                if (ruleViolations.length > 0) {
                    violations.push(...ruleViolations);
                }
                else {
                    passedRules.push(ruleId);
                }
            }
            catch (error) {
                logger_1.Logger.error(`Error checking rule ${ruleId}:`, error);
            }
        }
        const summary = this.calculateSummary(violations, passedRules);
        const recommendations = this.generateRecommendations(violations);
        const certificateEligibility = this.assessCertificateEligibility(summary, violations);
        const report = {
            summary,
            violations,
            passedRules,
            recommendations,
            certificateEligibility,
            auditTrail: [...this.auditTrail],
            generatedAt: new Date(),
            scanDuration: Date.now() - startTime
        };
        this.logAudit('scan_completed', 'system', {
            violations: violations.length,
            score: summary.overallScore
        });
        logger_1.Logger.info(`SOC 2 compliance scan completed: ${summary.overallScore}% compliant`);
        return report;
    }
    // Rule Implementation Methods
    async checkInputValidation(code, context) {
        const violations = [];
        const lines = code.split('\n');
        // Patterns that indicate unvalidated input
        const dangerousPatterns = [
            /req\.body\.[^)\s]*(?!\.(validate|sanitize|escape))/g,
            /req\.params\.[^)\s]*(?!\.(validate|sanitize|escape))/g,
            /req\.query\.[^)\s]*(?!\.(validate|sanitize|escape))/g,
            /process\.argv\[[^\]]+\](?!\.(validate|sanitize|escape))/g,
            /document\.createElement\([^)]*\+[^)]*\)/g // DOM XSS
        ];
        lines.forEach((line, index) => {
            dangerousPatterns.forEach(pattern => {
                const matches = line.match(pattern);
                if (matches) {
                    violations.push({
                        ruleId: 'SEC-001',
                        ruleName: 'Input Validation Required',
                        category: SOC2Category.SECURITY,
                        severity: ComplianceSeverity.CRITICAL,
                        message: 'Unvalidated user input detected - potential security vulnerability',
                        line: index + 1,
                        column: line.indexOf(matches[0]) + 1,
                        evidence: line.trim(),
                        remediation: 'Add input validation using schema validation (Joi, Yup) or manual sanitization',
                        references: ['SOC 2 CC6.1', 'OWASP Top 10 A03:2021'],
                        riskScore: 9.0
                    });
                }
            });
        });
        return violations;
    }
    async checkSQLInjection(code, context) {
        const violations = [];
        const lines = code.split('\n');
        // SQL injection vulnerability patterns
        const sqlInjectionPatterns = [
            /(['"`]).*\$\{.*\}.*\1/, // Template literal in SQL string
            /(['"`]).*\+.*\1/, // String concatenation in SQL
            /query\s*\(\s*['"`].*\$\{/, // Direct template literal in query
            /execute\s*\(\s*['"`].*\+/, // String concatenation in execute
            /sql\s*=.*\+/, // SQL assignment with concatenation
        ];
        lines.forEach((line, index) => {
            sqlInjectionPatterns.forEach(pattern => {
                if (pattern.test(line) && line.toLowerCase().includes('select') ||
                    line.toLowerCase().includes('insert') ||
                    line.toLowerCase().includes('update') ||
                    line.toLowerCase().includes('delete')) {
                    violations.push({
                        ruleId: 'SEC-002',
                        ruleName: 'SQL Injection Prevention',
                        category: SOC2Category.SECURITY,
                        severity: ComplianceSeverity.CRITICAL,
                        message: 'Potential SQL injection vulnerability detected',
                        line: index + 1,
                        column: 1,
                        evidence: line.trim(),
                        remediation: 'Use parameterized queries or prepared statements',
                        references: ['SOC 2 CC6.1', 'OWASP A03:2021'],
                        riskScore: 9.5
                    });
                }
            });
        });
        return violations;
    }
    async checkAuthentication(code, context) {
        const violations = [];
        const lines = code.split('\n');
        // Look for routes or functions that should require authentication
        const sensitiveOperations = [
            /app\.(post|put|delete|patch)\s*\(['"`].*admin/i,
            /app\.(post|put|delete|patch)\s*\(['"`].*user/i,
            /app\.(post|put|delete|patch)\s*\(['"`].*profile/i,
            /app\.(post|put|delete|patch)\s*\(['"`].*account/i,
            /router\.(post|put|delete|patch)/i,
        ];
        lines.forEach((line, index) => {
            sensitiveOperations.forEach(pattern => {
                if (pattern.test(line)) {
                    // Check if authentication middleware is present
                    const hasAuth = line.includes('authenticate') ||
                        line.includes('requireAuth') ||
                        line.includes('isAuthenticated') ||
                        line.includes('verifyToken');
                    if (!hasAuth) {
                        violations.push({
                            ruleId: 'SEC-003',
                            ruleName: 'Authentication Required',
                            category: SOC2Category.SECURITY,
                            severity: ComplianceSeverity.HIGH,
                            message: 'Sensitive endpoint without authentication middleware',
                            line: index + 1,
                            column: 1,
                            evidence: line.trim(),
                            remediation: 'Add authentication middleware to protect sensitive endpoints',
                            references: ['SOC 2 CC6.2'],
                            riskScore: 7.5
                        });
                    }
                }
            });
        });
        return violations;
    }
    async checkAuthorization(code, context) {
        const violations = [];
        const lines = code.split('\n');
        // Authorization patterns to check
        lines.forEach((line, index) => {
            if (line.includes('admin') && !line.includes('role') && !line.includes('permission')) {
                if (line.includes('app.') || line.includes('router.')) {
                    violations.push({
                        ruleId: 'SEC-004',
                        ruleName: 'Authorization Controls',
                        category: SOC2Category.SECURITY,
                        severity: ComplianceSeverity.HIGH,
                        message: 'Admin endpoint without proper authorization checks',
                        line: index + 1,
                        column: 1,
                        evidence: line.trim(),
                        remediation: 'Implement role-based access control (RBAC) middleware',
                        references: ['SOC 2 CC6.3'],
                        riskScore: 8.0
                    });
                }
            }
        });
        return violations;
    }
    async checkEncryptionAtRest(code, context) {
        const violations = [];
        if (context.dataClassification === DataClassification.PII ||
            context.dataClassification === DataClassification.CONFIDENTIAL) {
            const lines = code.split('\n');
            const hasEncryption = lines.some(line => line.includes('encrypt') ||
                line.includes('AES') ||
                line.includes('crypto') ||
                line.includes('bcrypt') ||
                line.includes('scrypt'));
            if (!hasEncryption && lines.some(line => line.includes('password') ||
                line.includes('ssn') ||
                line.includes('credit') ||
                line.includes('sensitive'))) {
                violations.push({
                    ruleId: 'SEC-005',
                    ruleName: 'Encryption at Rest',
                    category: SOC2Category.CONFIDENTIALITY,
                    severity: ComplianceSeverity.CRITICAL,
                    message: 'Sensitive data stored without encryption',
                    line: 1,
                    column: 1,
                    evidence: 'File contains sensitive data without encryption implementation',
                    remediation: 'Implement AES-256 encryption for sensitive data storage',
                    references: ['SOC 2 CC6.7'],
                    affectedStandards: [IndustryStandard.GDPR, IndustryStandard.HIPAA],
                    riskScore: 9.0
                });
            }
        }
        return violations;
    }
    async checkEncryptionInTransit(code, context) {
        const violations = [];
        const lines = code.split('\n');
        // Check for HTTP usage instead of HTTPS
        const httpPatterns = [
            /http:\/\/(?!localhost|127\.0\.0\.1)/g,
            /fetch\s*\(\s*['"`]http:/g,
            /axios\.get\s*\(\s*['"`]http:/g,
            /request\s*\(\s*['"`]http:/g
        ];
        lines.forEach((line, index) => {
            httpPatterns.forEach(pattern => {
                if (pattern.test(line)) {
                    violations.push({
                        ruleId: 'SEC-006',
                        ruleName: 'Encryption in Transit',
                        category: SOC2Category.CONFIDENTIALITY,
                        severity: ComplianceSeverity.CRITICAL,
                        message: 'Unencrypted HTTP communication detected',
                        line: index + 1,
                        column: 1,
                        evidence: line.trim(),
                        remediation: 'Use HTTPS/TLS 1.3 for all network communications',
                        references: ['SOC 2 CC6.7'],
                        riskScore: 8.5
                    });
                }
            });
        });
        return violations;
    }
    async checkErrorHandling(code, context) {
        const violations = [];
        const lines = code.split('\n');
        let inTryBlock = false;
        let hasCatch = false;
        lines.forEach((line, index) => {
            if (line.trim().startsWith('try')) {
                inTryBlock = true;
                hasCatch = false;
            }
            else if (line.trim().startsWith('catch')) {
                hasCatch = true;
            }
            else if (line.trim().startsWith('}') && inTryBlock) {
                if (!hasCatch) {
                    violations.push({
                        ruleId: 'AVL-001',
                        ruleName: 'Error Handling',
                        category: SOC2Category.AVAILABILITY,
                        severity: ComplianceSeverity.MEDIUM,
                        message: 'Try block without catch - potential availability impact',
                        line: index + 1,
                        column: 1,
                        evidence: 'Try block found without corresponding catch block',
                        remediation: 'Add proper error handling with try-catch blocks',
                        references: ['SOC 2 CC7.1'],
                        riskScore: 5.0
                    });
                }
                inTryBlock = false;
            }
        });
        return violations;
    }
    async checkRateLimiting(code, context) {
        const violations = [];
        const lines = code.split('\n');
        const hasRateLimit = lines.some(line => line.includes('rateLimit') ||
            line.includes('rate-limit') ||
            line.includes('express-rate-limit') ||
            line.includes('slowDown'));
        const hasAPIEndpoints = lines.some(line => line.includes('app.get') ||
            line.includes('app.post') ||
            line.includes('router.'));
        if (hasAPIEndpoints && !hasRateLimit) {
            violations.push({
                ruleId: 'AVL-002',
                ruleName: 'Rate Limiting',
                category: SOC2Category.AVAILABILITY,
                severity: ComplianceSeverity.HIGH,
                message: 'API endpoints without rate limiting - DoS vulnerability',
                line: 1,
                column: 1,
                evidence: 'API endpoints detected without rate limiting middleware',
                remediation: 'Implement rate limiting middleware (express-rate-limit)',
                references: ['SOC 2 CC7.1'],
                riskScore: 7.0
            });
        }
        return violations;
    }
    async checkDataIntegrity(code, context) {
        const violations = [];
        const lines = code.split('\n');
        const hasIntegrityChecks = lines.some(line => line.includes('checksum') ||
            line.includes('hash') ||
            line.includes('signature') ||
            line.includes('verify'));
        if (context.dataClassification === DataClassification.CONFIDENTIAL && !hasIntegrityChecks) {
            violations.push({
                ruleId: 'INT-001',
                ruleName: 'Data Validation',
                category: SOC2Category.PROCESSING_INTEGRITY,
                severity: ComplianceSeverity.HIGH,
                message: 'Confidential data processing without integrity checks',
                line: 1,
                column: 1,
                evidence: 'Confidential data handling without integrity validation',
                remediation: 'Implement data integrity checks (checksums, digital signatures)',
                references: ['SOC 2 CC8.1'],
                riskScore: 7.5
            });
        }
        return violations;
    }
    async checkTransactionIntegrity(code, context) {
        const violations = [];
        const lines = code.split('\n');
        let hasTransactionStart = false;
        let hasCommit = false;
        let hasRollback = false;
        lines.forEach((line, index) => {
            if (line.includes('transaction') || line.includes('BEGIN')) {
                hasTransactionStart = true;
            }
            else if (line.includes('COMMIT')) {
                hasCommit = true;
            }
            else if (line.includes('ROLLBACK')) {
                hasRollback = true;
            }
        });
        if (hasTransactionStart && (!hasCommit || !hasRollback)) {
            violations.push({
                ruleId: 'INT-002',
                ruleName: 'Transaction Integrity',
                category: SOC2Category.PROCESSING_INTEGRITY,
                severity: ComplianceSeverity.HIGH,
                message: 'Database transaction without proper commit/rollback handling',
                line: 1,
                column: 1,
                evidence: 'Transaction detected without complete commit/rollback pattern',
                remediation: 'Implement proper transaction management with commit/rollback',
                references: ['SOC 2 CC8.1'],
                riskScore: 6.5
            });
        }
        return violations;
    }
    async checkPIIProtection(code, context) {
        const violations = [];
        const lines = code.split('\n');
        const piiPatterns = [
            /ssn|social.*security/i,
            /credit.*card|cc.*number/i,
            /phone.*number|mobile/i,
            /email.*address/i,
            /date.*birth|dob/i,
            /driver.*license/i
        ];
        lines.forEach((line, index) => {
            piiPatterns.forEach(pattern => {
                if (pattern.test(line) && !line.includes('encrypt') && !line.includes('hash')) {
                    violations.push({
                        ruleId: 'PRI-001',
                        ruleName: 'PII Protection',
                        category: SOC2Category.PRIVACY,
                        severity: ComplianceSeverity.CRITICAL,
                        message: 'Personally Identifiable Information without proper protection',
                        line: index + 1,
                        column: 1,
                        evidence: line.trim(),
                        remediation: 'Implement PII encryption and access controls',
                        references: ['SOC 2 P1.0', 'GDPR Article 32'],
                        affectedStandards: [IndustryStandard.GDPR, IndustryStandard.HIPAA],
                        riskScore: 9.0
                    });
                }
            });
        });
        return violations;
    }
    async checkDataRetention(code, context) {
        const violations = [];
        const lines = code.split('\n');
        const hasRetentionPolicy = lines.some(line => line.includes('retention') ||
            line.includes('expire') ||
            line.includes('ttl') ||
            line.includes('delete'));
        if (context.dataClassification === DataClassification.PII && !hasRetentionPolicy) {
            violations.push({
                ruleId: 'PRI-002',
                ruleName: 'Data Retention Policies',
                category: SOC2Category.PRIVACY,
                severity: ComplianceSeverity.MEDIUM,
                message: 'PII handling without data retention policy',
                line: 1,
                column: 1,
                evidence: 'PII processing detected without retention policy implementation',
                remediation: 'Implement automated data retention and deletion policies',
                references: ['SOC 2 P2.1', 'GDPR Article 17'],
                affectedStandards: [IndustryStandard.GDPR],
                riskScore: 6.0
            });
        }
        return violations;
    }
    calculateSummary(violations, passedRules) {
        const totalRules = this.rules.size;
        const failedRules = violations.length;
        const criticalViolations = violations.filter(v => v.severity === ComplianceSeverity.CRITICAL).length;
        const highViolations = violations.filter(v => v.severity === ComplianceSeverity.HIGH).length;
        const mediumViolations = violations.filter(v => v.severity === ComplianceSeverity.MEDIUM).length;
        const lowViolations = violations.filter(v => v.severity === ComplianceSeverity.LOW).length;
        const compliancePercentage = Math.round((passedRules.length / totalRules) * 100);
        // Calculate weighted score based on severity
        const severityWeights = {
            [ComplianceSeverity.CRITICAL]: 10,
            [ComplianceSeverity.HIGH]: 7,
            [ComplianceSeverity.MEDIUM]: 4,
            [ComplianceSeverity.LOW]: 1,
            [ComplianceSeverity.INFO]: 0
        };
        const totalPossibleScore = totalRules * 10;
        const violationPenalty = violations.reduce((sum, v) => sum + (severityWeights[v.severity] ?? 0), 0);
        const overallScore = Math.max(0, Math.round(((totalPossibleScore - violationPenalty) / totalPossibleScore) * 100));
        let riskLevel;
        if (criticalViolations > 0)
            riskLevel = RiskLevel.VERY_HIGH;
        else if (highViolations > 3)
            riskLevel = RiskLevel.HIGH;
        else if (mediumViolations > 5)
            riskLevel = RiskLevel.MEDIUM;
        else if (lowViolations > 10)
            riskLevel = RiskLevel.LOW;
        else
            riskLevel = RiskLevel.VERY_LOW;
        return {
            totalRules,
            passedRules: passedRules.length,
            failedRules,
            criticalViolations,
            highViolations,
            mediumViolations,
            lowViolations,
            overallScore,
            compliancePercentage,
            riskLevel
        };
    }
    generateRecommendations(violations) {
        const recommendations = [];
        // Group violations by category for strategic recommendations
        const violationsByCategory = violations.reduce((acc, v) => {
            if (!acc[v.category])
                acc[v.category] = [];
            acc[v.category].push(v);
            return acc;
        }, {});
        Object.entries(violationsByCategory).forEach(([category, categoryViolations]) => {
            recommendations.push({
                type: RecommendationType.CODE_CHANGE,
                priority: categoryViolations.filter(v => v.severity === ComplianceSeverity.CRITICAL).length,
                title: `Address ${category} violations`,
                description: `Fix ${categoryViolations.length} ${category} compliance issues`,
                implementation: `Review and remediate all ${category} violations according to SOC 2 requirements`,
                estimatedEffort: this.estimateEffort(categoryViolations.length),
                complianceImpact: Math.min(categoryViolations.length * 10, 100)
            });
        });
        return recommendations.sort((a, b) => b.priority - a.priority);
    }
    estimateEffort(violationCount) {
        if (violationCount <= 2)
            return '1-2 hours';
        if (violationCount <= 5)
            return '4-8 hours';
        if (violationCount <= 10)
            return '1-2 days';
        if (violationCount <= 20)
            return '3-5 days';
        return '1-2 weeks';
    }
    assessCertificateEligibility(summary, violations) {
        const criticalBlocking = violations.filter(v => v.severity === ComplianceSeverity.CRITICAL);
        const highBlocking = violations.filter(v => v.severity === ComplianceSeverity.HIGH);
        const soc2Type1 = criticalBlocking.length === 0 && summary.overallScore >= 85;
        const soc2Type2 = criticalBlocking.length === 0 && highBlocking.length === 0 && summary.overallScore >= 95;
        const requiredChanges = [];
        if (criticalBlocking.length > 0) {
            requiredChanges.push(`Fix ${criticalBlocking.length} critical security violations`);
        }
        if (highBlocking.length > 0) {
            requiredChanges.push(`Address ${highBlocking.length} high-priority compliance gaps`);
        }
        let estimatedTimeframe = '1-2 weeks';
        if (violations.length > 20)
            estimatedTimeframe = '1-2 months';
        else if (violations.length > 10)
            estimatedTimeframe = '2-4 weeks';
        const auditReadiness = Math.min(summary.overallScore, 100);
        return {
            soc2Type1,
            soc2Type2,
            requiredChanges,
            estimatedTimeframe,
            auditReadiness
        };
    }
    logAudit(action, user, details) {
        this.auditTrail.push({
            timestamp: new Date(),
            action,
            user,
            details
        });
        // Keep only last 1000 audit entries
        if (this.auditTrail.length > 1000) {
            this.auditTrail = this.auditTrail.slice(-1000);
        }
    }
    getRuleDetails(ruleId) {
        return this.rules.get(ruleId) || null;
    }
    getAllRules() {
        return Array.from(this.rules.values());
    }
    addCustomRule(rule) {
        this.addRule(rule);
        this.logAudit('custom_rule_added', 'system', { ruleId: rule.id });
    }
    removeRule(ruleId) {
        const removed = this.rules.delete(ruleId);
        if (removed) {
            this.logAudit('rule_removed', 'system', { ruleId });
        }
        return removed;
    }
    exportReport(report, format = 'json') {
        switch (format) {
            case 'json':
                return JSON.stringify(report, null, 2);
            case 'html':
                return this.generateHTMLReport(report);
            case 'pdf':
                // In production, integrate with PDF generation library
                return 'PDF generation would be implemented with puppeteer or similar';
            default:
                return JSON.stringify(report, null, 2);
        }
    }
    generateHTMLReport(report) {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>SOC 2 Compliance Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: white; border: 1px solid #ddd; padding: 15px; border-radius: 4px; }
        .violation { margin: 10px 0; padding: 15px; border-left: 4px solid #dc3545; background: #f8f9fa; }
        .critical { border-left-color: #dc3545; }
        .high { border-left-color: #fd7e14; }
        .medium { border-left-color: #ffc107; }
        .low { border-left-color: #28a745; }
    </style>
</head>
<body>
    <div class="header">
        <h1>SOC 2 Compliance Report</h1>
        <p>Generated: ${report.generatedAt.toISOString()}</p>
        <p>Overall Score: <strong>${report.summary.overallScore}%</strong></p>
        <p>Risk Level: <strong>${report.summary.riskLevel}</strong></p>
    </div>
    
    <div class="summary">
        <div class="metric">
            <h3>Rules</h3>
            <p>Passed: ${report.summary.passedRules}</p>
            <p>Failed: ${report.summary.failedRules}</p>
        </div>
        <div class="metric">
            <h3>Violations</h3>
            <p>Critical: ${report.summary.criticalViolations}</p>
            <p>High: ${report.summary.highViolations}</p>
            <p>Medium: ${report.summary.mediumViolations}</p>
            <p>Low: ${report.summary.lowViolations}</p>
        </div>
    </div>
    
    <h2>Violations</h2>
    ${report.violations.map(v => `
        <div class="violation ${v.severity}">
            <h4>${v.ruleName} (${v.ruleId})</h4>
            <p><strong>Severity:</strong> ${v.severity}</p>
            <p><strong>Message:</strong> ${v.message}</p>
            <p><strong>Location:</strong> Line ${v.line}</p>
            <p><strong>Evidence:</strong> <code>${v.evidence}</code></p>
            <p><strong>Remediation:</strong> ${v.remediation}</p>
        </div>
    `).join('')}
    
    <h2>Recommendations</h2>
    ${report.recommendations.map(r => `
        <div class="metric">
            <h4>${r.title}</h4>
            <p>${r.description}</p>
            <p><strong>Implementation:</strong> ${r.implementation}</p>
            <p><strong>Estimated Effort:</strong> ${r.estimatedEffort}</p>
        </div>
    `).join('')}
</body>
</html>`;
    }
}
exports.SOC2ComplianceScanner = SOC2ComplianceScanner;
