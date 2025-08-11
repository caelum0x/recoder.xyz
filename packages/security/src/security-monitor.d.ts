/**
 * Security Monitor
 * Monitors security events and generates reports
 */
import { EventEmitter } from 'events';
import { VulnerabilityFinding } from './code-vulnerability-scanner';
export interface SecurityEvent {
    id: string;
    type: 'threat_detected' | 'vulnerability_found' | 'access_violation' | 'suspicious_activity';
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: Date;
    source: string;
    details: Record<string, any>;
    resolved: boolean;
}
export interface SecurityReport {
    timestamp: Date;
    overallScore: number;
    securityScore: number;
    totalEvents: number;
    vulnerabilities: VulnerabilityFinding[];
    secrets: Array<{
        type: string;
        file: string;
        line: number;
    }>;
    complianceIssues: Array<{
        rule: string;
        description: string;
        severity: string;
    }>;
    recommendations: Array<{
        title: string;
        description: string;
        priority: 'low' | 'medium' | 'high' | 'critical';
    }>;
    summary: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
}
export declare class SecurityMonitor extends EventEmitter {
    private events;
    private vulnerabilityScanner;
    constructor();
    recordEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved'>): void;
    generateSecurityReport(projectPath: string): Promise<SecurityReport>;
    getSecurityEvents(resolved?: boolean): SecurityEvent[];
    resolveEvent(eventId: string): boolean;
    getSecurityScore(): number;
}
//# sourceMappingURL=security-monitor.d.ts.map