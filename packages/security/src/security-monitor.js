/**
 * Security Monitor
 * Monitors security events and generates reports
 */
import { __awaiter } from "tslib";
import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';
import { CodeVulnerabilityScanner } from './code-vulnerability-scanner';
export class SecurityMonitor extends EventEmitter {
    constructor() {
        super();
        this.events = [];
        this.vulnerabilityScanner = new CodeVulnerabilityScanner();
    }
    recordEvent(event) {
        const securityEvent = Object.assign({ id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, timestamp: new Date(), resolved: false }, event);
        this.events.push(securityEvent);
        // Keep only last 1000 events
        if (this.events.length > 1000) {
            this.events = this.events.slice(-1000);
        }
        this.emit('securityEvent', securityEvent);
        if (securityEvent.severity === 'critical' || securityEvent.severity === 'high') {
            Logger.warn(`Security event: ${securityEvent.type}`, securityEvent);
        }
    }
    generateSecurityReport(projectPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const vulnerabilities = yield this.vulnerabilityScanner.scanDirectory(projectPath);
            const scanResult = this.vulnerabilityScanner.generateReport(vulnerabilities);
            // Detect secrets (basic implementation)
            const secrets = vulnerabilities
                .filter(v => v.category === 'hardcoded_secret')
                .map(v => ({
                type: v.title,
                file: v.file,
                line: v.line
            }));
            // Basic compliance checks
            const complianceIssues = [];
            // Check for common compliance issues
            if (secrets.length > 0) {
                complianceIssues.push({
                    rule: 'No hardcoded secrets',
                    description: 'Secrets should not be hardcoded in source code',
                    severity: 'high'
                });
            }
            // Generate recommendations
            const recommendations = [];
            if (scanResult.summary.critical > 0) {
                recommendations.push({
                    title: 'Fix Critical Vulnerabilities',
                    description: `${scanResult.summary.critical} critical vulnerabilities found that need immediate attention`,
                    priority: 'critical'
                });
            }
            if (secrets.length > 0) {
                recommendations.push({
                    title: 'Remove Hardcoded Secrets',
                    description: 'Move all hardcoded secrets to environment variables or secure configuration',
                    priority: 'high'
                });
            }
            if (scanResult.summary.high > 0) {
                recommendations.push({
                    title: 'Address High-Priority Issues',
                    description: `${scanResult.summary.high} high-severity issues found`,
                    priority: 'high'
                });
            }
            return {
                timestamp: new Date(),
                overallScore: scanResult.securityScore,
                securityScore: scanResult.securityScore,
                totalEvents: this.events.length,
                vulnerabilities,
                secrets,
                complianceIssues,
                recommendations,
                summary: scanResult.summary
            };
        });
    }
    getSecurityEvents(resolved = false) {
        return resolved
            ? this.events.filter(event => event.resolved)
            : this.events.filter(event => !event.resolved);
    }
    resolveEvent(eventId) {
        const event = this.events.find(e => e.id === eventId);
        if (event) {
            event.resolved = true;
            this.emit('eventResolved', event);
            return true;
        }
        return false;
    }
    getSecurityScore() {
        const recentEvents = this.events.filter(e => Date.now() - e.timestamp.getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
        );
        if (recentEvents.length === 0)
            return 100;
        const criticalCount = recentEvents.filter(e => e.severity === 'critical').length;
        const highCount = recentEvents.filter(e => e.severity === 'high').length;
        const mediumCount = recentEvents.filter(e => e.severity === 'medium').length;
        const lowCount = recentEvents.filter(e => e.severity === 'low').length;
        const weightedScore = (criticalCount * 20) + (highCount * 10) + (mediumCount * 5) + (lowCount * 1);
        return Math.max(0, 100 - weightedScore);
    }
}
//# sourceMappingURL=security-monitor.js.map