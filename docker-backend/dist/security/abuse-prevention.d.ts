/**
 * Abuse Prevention Service
 *
 * Detects and prevents abuse patterns:
 * - IP-based rate limiting and blocking
 * - Suspicious activity detection
 * - Automated abuse response
 * - Blocklist management
 */
export interface AbuseEvent {
    id: string;
    type: AbuseType;
    severity: AbuseSeverity;
    source: {
        ip?: string;
        userId?: string;
        apiKeyId?: string;
        userAgent?: string;
    };
    details: Record<string, unknown>;
    timestamp: number;
    handled: boolean;
    action?: AbuseAction;
}
export type AbuseType = 'rate_limit_exceeded' | 'auth_failure' | 'invalid_request' | 'suspicious_pattern' | 'resource_abuse' | 'bot_behavior' | 'payload_attack' | 'data_exfiltration';
export type AbuseSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AbuseAction = 'log' | 'rate_limit' | 'temporary_block' | 'permanent_block' | 'notify_admin' | 'terminate_sessions';
export interface BlocklistEntry {
    id: string;
    type: 'ip' | 'ip_range' | 'user_id' | 'api_key' | 'user_agent_pattern';
    value: string;
    reason: string;
    createdAt: number;
    expiresAt?: number;
    createdBy?: string;
}
export interface AbuseStats {
    totalEvents: number;
    eventsByType: Record<AbuseType, number>;
    eventsBySeverity: Record<AbuseSeverity, number>;
    activeBlocks: number;
    blockedIPs: number;
    blockedUsers: number;
    last24Hours: number;
    last7Days: number;
}
interface AbuseConfig {
    /** Max auth failures before temporary block */
    maxAuthFailures: number;
    /** Auth failure window in ms */
    authFailureWindowMs: number;
    /** Temporary block duration in ms */
    tempBlockDurationMs: number;
    /** Max rate limit hits before escalation */
    maxRateLimitHits: number;
    /** Rate limit escalation window in ms */
    rateLimitWindowMs: number;
    /** Max events to store */
    maxStoredEvents: number;
    /** Enable automatic blocking */
    autoBlockEnabled: boolean;
    /** Suspicious patterns to detect */
    suspiciousPatterns: RegExp[];
}
declare class AbusePrevention {
    private config;
    private events;
    private blocklist;
    private ipFailures;
    private rateLimitHits;
    constructor(config?: Partial<AbuseConfig>);
    /**
     * Check if a request should be blocked
     */
    isBlocked(source: {
        ip?: string;
        userId?: string;
        apiKeyId?: string;
        userAgent?: string;
    }): {
        blocked: boolean;
        reason?: string;
        entry?: BlocklistEntry;
    };
    /**
     * Record an abuse event
     */
    recordEvent(type: AbuseType, severity: AbuseSeverity, source: AbuseEvent['source'], details?: Record<string, unknown>): AbuseEvent;
    /**
     * Record an authentication failure
     */
    recordAuthFailure(ip: string, details?: Record<string, unknown>): AbuseEvent;
    /**
     * Record a rate limit hit
     */
    recordRateLimitHit(source: AbuseEvent['source'], details?: Record<string, unknown>): AbuseEvent;
    /**
     * Check request payload for suspicious patterns
     */
    checkPayload(payload: unknown, source: AbuseEvent['source']): {
        safe: boolean;
        patterns?: string[];
    };
    /**
     * Add an entry to the blocklist
     */
    addToBlocklist(entry: Omit<BlocklistEntry, 'id' | 'createdAt'>): BlocklistEntry;
    /**
     * Remove an entry from the blocklist
     */
    removeFromBlocklist(id: string): boolean;
    /**
     * Get abuse statistics
     */
    getStats(): AbuseStats;
    /**
     * Get recent events
     */
    getRecentEvents(limit?: number): AbuseEvent[];
    /**
     * Get blocklist entries
     */
    getBlocklist(): BlocklistEntry[];
    private determineAction;
    private executeAction;
    private cleanupExpiredBlocks;
    private ipInRange;
    private persist;
}
export declare const abusePrevention: AbusePrevention;
export { AbusePrevention };
