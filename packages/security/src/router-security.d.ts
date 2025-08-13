/**
 * Enhanced Router Security Service with Threat Detection
 * Provides comprehensive security for AI model routing and API access
 */
import { EventEmitter } from 'events';
export interface SecurityEvent {
    id: string;
    timestamp: Date;
    type: 'authentication' | 'authorization' | 'anomaly' | 'abuse' | 'intrusion';
    severity: 'low' | 'medium' | 'high' | 'critical';
    source: {
        ip: string;
        userAgent?: string;
        userId?: string;
        deviceId?: string;
    };
    details: Record<string, any>;
    riskScore: number;
}
export interface ThreatPattern {
    name: string;
    description: string;
    rules: ThreatRule[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    action: 'allow' | 'warn' | 'block' | 'ban';
}
export interface ThreatRule {
    condition: string;
    threshold?: number;
    timeWindow?: number;
    operator: 'equals' | 'greater' | 'less' | 'contains' | 'matches';
    value: any;
}
export interface RouterSecurityConfig {
    enableThreatDetection: boolean;
    enableRateLimiting: boolean;
    enableAnomalyDetection: boolean;
    maxRequestsPerMinute: number;
    maxRequestsPerHour: number;
    maxFailedAttemptsBeforeBan: number;
    banDurationMinutes: number;
    suspiciousPatterns: ThreatPattern[];
    allowedCountries?: string[];
    blockedIPs?: string[];
    enableGeoBlocking: boolean;
}
export interface RequestContext {
    ip: string;
    userAgent: string;
    userId?: string;
    deviceId?: string;
    endpoint: string;
    method: string;
    payload?: any;
    timestamp: Date;
    headers: Record<string, string>;
    geolocation?: {
        country: string;
        region: string;
        city: string;
    };
}
export interface SecurityMetrics {
    totalRequests: number;
    blockedRequests: number;
    suspiciousRequests: number;
    uniqueIPs: number;
    topAttackTypes: Array<{
        type: string;
        count: number;
    }>;
    averageRiskScore: number;
    lastThreatDetected?: Date;
}
export declare class RouterSecurityService extends EventEmitter {
    private config;
    private requestHistory;
    private bannedIPs;
    private failedAttempts;
    private rateLimitCounters;
    private securityEvents;
    private isInitialized;
    constructor(config: RouterSecurityConfig);
    private initialize;
    /**
     * Analyze incoming request for security threats
     */
    analyzeRequest(context: RequestContext): Promise<{
        allowed: boolean;
        riskScore: number;
        reasons: string[];
        action: 'allow' | 'warn' | 'block' | 'ban';
    }>;
    /**
     * Check rate limiting for IP address
     */
    private checkRateLimit;
    /**
     * Check geolocation restrictions
     */
    private checkGeolocation;
    /**
     * Analyze request against threat patterns
     */
    private analyzeThreatPatterns;
    /**
     * Detect anomalies in request patterns
     */
    private detectAnomalies;
    /**
     * Evaluate threat pattern against request context
     */
    private evaluatePattern;
    /**
     * Evaluate individual threat rule
     */
    private evaluateRule;
    /**
     * Check if user agent is suspicious
     */
    private isSuspiciousUserAgent;
    /**
     * Record failed authentication attempt
     */
    private recordFailedAttempt;
    /**
     * Ban IP address
     */
    private banIP;
    /**
     * Store request for analysis
     */
    private storeRequest;
    /**
     * Log security event
     */
    private logSecurityEvent;
    /**
     * Get default threat patterns
     */
    private getDefaultThreatPatterns;
    /**
     * Get severity score
     */
    private getSeverityScore;
    /**
     * Get action priority for comparison
     */
    private getActionPriority;
    /**
     * Start background cleanup tasks
     */
    private startCleanupTasks;
    /**
     * Get security metrics
     */
    getSecurityMetrics(): SecurityMetrics;
    /**
     * Get recent security events
     */
    getRecentSecurityEvents(limit?: number): SecurityEvent[];
    /**
     * Manually ban IP address
     */
    manuallyBanIP(ip: string, reason: string): void;
    /**
     * Unban IP address
     */
    unbanIP(ip: string): void;
    /**
     * Update security configuration
     */
    updateConfig(newConfig: Partial<RouterSecurityConfig>): void;
    /**
     * Check if service is healthy
     */
    healthCheck(): {
        status: 'healthy' | 'degraded' | 'error';
        details: any;
    };
}
export declare function createRouterSecurity(config: RouterSecurityConfig): RouterSecurityService;
export declare const DEFAULT_ROUTER_SECURITY_CONFIG: RouterSecurityConfig;
//# sourceMappingURL=router-security.d.ts.map