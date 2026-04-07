/**
 * Admin Alert System
 *
 * Sends notifications to admins when suspicious activity is detected.
 * Integrates with the abuse prevention system and health monitoring.
 *
 * Alert channels:
 * - Console (always on)
 * - Webhook (Slack/Discord) if configured
 * - In-memory alert log for admin dashboard
 */
import { type AbuseEvent, type AbuseSeverity } from './abuse-prevention.js';
export interface AdminAlert {
    id: string;
    severity: AbuseSeverity;
    category: AlertCategory;
    title: string;
    message: string;
    details: Record<string, unknown>;
    timestamp: number;
    acknowledged: boolean;
    acknowledgedBy?: string;
    acknowledgedAt?: number;
}
export type AlertCategory = 'security' | 'abuse' | 'system' | 'performance' | 'container';
/**
 * Send an admin alert.
 */
export declare function sendAlert(severity: AbuseSeverity, category: AlertCategory, title: string, message: string, details?: Record<string, unknown>): AdminAlert | null;
/**
 * Convert an abuse event into an admin alert if warranted.
 */
export declare function alertFromAbuseEvent(event: AbuseEvent): void;
/**
 * Get recent alerts, optionally filtered.
 */
export declare function getAlerts(options?: {
    limit?: number;
    severity?: AbuseSeverity;
    category?: AlertCategory;
    unacknowledgedOnly?: boolean;
}): AdminAlert[];
/**
 * Acknowledge an alert.
 */
export declare function acknowledgeAlert(alertId: string, userId: string): boolean;
/**
 * Get alert counts by severity.
 */
export declare function getAlertCounts(): Record<AbuseSeverity, number>;
/**
 * Alert when WebSocket rate limit is exceeded.
 */
export declare function alertWsRateLimitExceeded(endpoint: string, projectId: string, userId?: string, messageCount?: number): void;
/**
 * Alert on multiple auth failures.
 */
export declare function alertAuthFailure(ip: string, failureCount: number): void;
/**
 * Alert on suspicious request patterns.
 */
export declare function alertSuspiciousRequest(ip: string, path: string, patterns: string[]): void;
/**
 * Alert on system issues.
 */
export declare function alertSystemIssue(title: string, message: string, severity?: AbuseSeverity, details?: Record<string, unknown>): void;
