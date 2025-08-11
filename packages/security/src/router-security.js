/**
 * Enhanced Router Security Service with Threat Detection
 * Provides comprehensive security for AI model routing and API access
 */
import { __awaiter } from "tslib";
import crypto from 'crypto';
import { EventEmitter } from 'events';
export class RouterSecurityService extends EventEmitter {
    constructor(config) {
        super();
        this.requestHistory = new Map();
        this.bannedIPs = new Set();
        this.failedAttempts = new Map();
        this.rateLimitCounters = new Map();
        this.securityEvents = [];
        this.isInitialized = false;
        this.config = config;
        this.initialize();
    }
    initialize() {
        // Initialize default threat patterns if none provided
        if (!this.config.suspiciousPatterns.length) {
            this.config.suspiciousPatterns = this.getDefaultThreatPatterns();
        }
        // Start background cleanup tasks
        this.startCleanupTasks();
        this.isInitialized = true;
        this.emit('initialized');
    }
    /**
     * Analyze incoming request for security threats
     */
    analyzeRequest(context) {
        return __awaiter(this, void 0, void 0, function* () {
            const reasons = [];
            let riskScore = 0;
            let action = 'allow';
            // Check if IP is banned
            if (this.bannedIPs.has(context.ip)) {
                reasons.push('IP address is banned');
                riskScore = 100;
                action = 'ban';
                yield this.logSecurityEvent({
                    type: 'intrusion',
                    severity: 'critical',
                    source: context,
                    details: { reason: 'Banned IP access attempt' },
                    riskScore: 100
                });
                return { allowed: false, riskScore, reasons, action };
            }
            // Rate limiting check
            if (this.config.enableRateLimiting) {
                const rateLimitResult = this.checkRateLimit(context.ip);
                if (!rateLimitResult.allowed) {
                    reasons.push(`Rate limit exceeded: ${rateLimitResult.reason}`);
                    riskScore += 30;
                    action = 'block';
                }
            }
            // Geolocation check
            if (this.config.enableGeoBlocking && context.geolocation) {
                const geoResult = this.checkGeolocation(context.geolocation);
                if (!geoResult.allowed) {
                    reasons.push(`Blocked country: ${context.geolocation.country}`);
                    riskScore += 50;
                    action = 'block';
                }
            }
            // Threat pattern analysis
            if (this.config.enableThreatDetection) {
                const threatResult = yield this.analyzeThreatPatterns(context);
                riskScore += threatResult.riskScore;
                reasons.push(...threatResult.reasons);
                if (threatResult.action === 'ban' || threatResult.action === 'block') {
                    action = threatResult.action;
                }
            }
            // Anomaly detection
            if (this.config.enableAnomalyDetection) {
                const anomalyResult = this.detectAnomalies(context);
                riskScore += anomalyResult.riskScore;
                reasons.push(...anomalyResult.reasons);
            }
            // Store request for analysis
            this.storeRequest(context);
            // Log security event if risk is significant
            if (riskScore > 30) {
                yield this.logSecurityEvent({
                    type: riskScore > 70 ? 'intrusion' : 'anomaly',
                    severity: riskScore > 70 ? 'high' : 'medium',
                    source: context,
                    details: { reasons, action },
                    riskScore
                });
            }
            // Handle failed attempts
            if (action === 'block' || action === 'ban') {
                this.recordFailedAttempt(context.ip);
            }
            return {
                allowed: action === 'allow' || action === 'warn',
                riskScore,
                reasons,
                action
            };
        });
    }
    /**
     * Check rate limiting for IP address
     */
    checkRateLimit(ip) {
        const now = new Date();
        const counters = this.rateLimitCounters.get(ip) || {
            minute: 0,
            hour: 0,
            lastReset: now
        };
        // Reset counters if time window passed
        const timeSinceReset = (now.getTime() - counters.lastReset.getTime()) / 1000;
        if (timeSinceReset >= 60) {
            counters.minute = 0;
        }
        if (timeSinceReset >= 3600) {
            counters.hour = 0;
            counters.lastReset = now;
        }
        // Check limits
        if (counters.minute >= this.config.maxRequestsPerMinute) {
            return { allowed: false, reason: 'Per-minute limit exceeded' };
        }
        if (counters.hour >= this.config.maxRequestsPerHour) {
            return { allowed: false, reason: 'Per-hour limit exceeded' };
        }
        // Increment counters
        counters.minute++;
        counters.hour++;
        this.rateLimitCounters.set(ip, counters);
        return { allowed: true };
    }
    /**
     * Check geolocation restrictions
     */
    checkGeolocation(geo) {
        if (this.config.allowedCountries && this.config.allowedCountries.length > 0) {
            return { allowed: this.config.allowedCountries.includes(geo.country) };
        }
        return { allowed: true };
    }
    /**
     * Analyze request against threat patterns
     */
    analyzeThreatPatterns(context) {
        return __awaiter(this, void 0, void 0, function* () {
            let riskScore = 0;
            const reasons = [];
            let highestAction = 'allow';
            for (const pattern of this.config.suspiciousPatterns) {
                const matches = yield this.evaluatePattern(pattern, context);
                if (matches) {
                    const patternRisk = this.getSeverityScore(pattern.severity);
                    riskScore += patternRisk;
                    reasons.push(`Threat pattern: ${pattern.name}`);
                    if (this.getActionPriority(pattern.action) > this.getActionPriority(highestAction)) {
                        highestAction = pattern.action;
                    }
                }
            }
            return { riskScore, reasons, action: highestAction };
        });
    }
    /**
     * Detect anomalies in request patterns
     */
    detectAnomalies(context) {
        let riskScore = 0;
        const reasons = [];
        const ipHistory = this.requestHistory.get(context.ip) || [];
        // Check for unusual request frequency
        const recentRequests = ipHistory.filter(req => (context.timestamp.getTime() - req.timestamp.getTime()) < 60000 // Last minute
        );
        if (recentRequests.length > 20) {
            riskScore += 20;
            reasons.push('Unusually high request frequency');
        }
        // Check for endpoint scanning behavior
        const uniqueEndpoints = new Set(recentRequests.map(req => req.endpoint));
        if (uniqueEndpoints.size > 10) {
            riskScore += 25;
            reasons.push('Potential endpoint scanning detected');
        }
        // Check for suspicious user agent
        if (this.isSuspiciousUserAgent(context.userAgent)) {
            riskScore += 15;
            reasons.push('Suspicious user agent detected');
        }
        return { riskScore, reasons };
    }
    /**
     * Evaluate threat pattern against request context
     */
    evaluatePattern(pattern, context) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const rule of pattern.rules) {
                const result = this.evaluateRule(rule, context);
                if (!result) {
                    return false; // All rules must match
                }
            }
            return true;
        });
    }
    /**
     * Evaluate individual threat rule
     */
    evaluateRule(rule, context) {
        let targetValue;
        // Extract target value based on condition
        switch (rule.condition) {
            case 'userAgent':
                targetValue = context.userAgent;
                break;
            case 'endpoint':
                targetValue = context.endpoint;
                break;
            case 'method':
                targetValue = context.method;
                break;
            case 'payloadSize':
                targetValue = JSON.stringify(context.payload || {}).length;
                break;
            case 'requestsPerMinute':
                const ipHistory = this.requestHistory.get(context.ip) || [];
                const recentRequests = ipHistory.filter(req => (context.timestamp.getTime() - req.timestamp.getTime()) < 60000);
                targetValue = recentRequests.length;
                break;
            default:
                return false;
        }
        // Apply operator
        switch (rule.operator) {
            case 'equals':
                return targetValue === rule.value;
            case 'greater':
                return targetValue > rule.value;
            case 'less':
                return targetValue < rule.value;
            case 'contains':
                return String(targetValue).includes(rule.value);
            case 'matches':
                return new RegExp(rule.value).test(String(targetValue));
            default:
                return false;
        }
    }
    /**
     * Check if user agent is suspicious
     */
    isSuspiciousUserAgent(userAgent) {
        const suspiciousPatterns = [
            /bot/i,
            /crawler/i,
            /scanner/i,
            /curl/i,
            /wget/i,
            /python-requests/i,
            /go-http-client/i
        ];
        return suspiciousPatterns.some(pattern => pattern.test(userAgent));
    }
    /**
     * Record failed authentication attempt
     */
    recordFailedAttempt(ip) {
        const attempts = this.failedAttempts.get(ip) || 0;
        const newAttempts = attempts + 1;
        this.failedAttempts.set(ip, newAttempts);
        if (newAttempts >= this.config.maxFailedAttemptsBeforeBan) {
            this.banIP(ip);
        }
    }
    /**
     * Ban IP address
     */
    banIP(ip) {
        this.bannedIPs.add(ip);
        // Auto-unban after configured duration
        setTimeout(() => {
            this.bannedIPs.delete(ip);
            this.failedAttempts.delete(ip);
        }, this.config.banDurationMinutes * 60 * 1000);
        this.emit('ipBanned', ip);
    }
    /**
     * Store request for analysis
     */
    storeRequest(context) {
        const ipHistory = this.requestHistory.get(context.ip) || [];
        ipHistory.push(context);
        // Keep only last 100 requests per IP
        if (ipHistory.length > 100) {
            ipHistory.shift();
        }
        this.requestHistory.set(context.ip, ipHistory);
    }
    /**
     * Log security event
     */
    logSecurityEvent(event) {
        return __awaiter(this, void 0, void 0, function* () {
            const securityEvent = Object.assign({ id: crypto.randomUUID(), timestamp: new Date() }, event);
            this.securityEvents.push(securityEvent);
            // Keep only last 1000 events
            if (this.securityEvents.length > 1000) {
                this.securityEvents.shift();
            }
            this.emit('securityEvent', securityEvent);
        });
    }
    /**
     * Get default threat patterns
     */
    getDefaultThreatPatterns() {
        return [
            {
                name: 'SQL Injection Attempt',
                description: 'Detects potential SQL injection patterns in requests',
                severity: 'high',
                action: 'block',
                rules: [
                    {
                        condition: 'endpoint',
                        operator: 'contains',
                        value: 'union select'
                    }
                ]
            },
            {
                name: 'Excessive API Calls',
                description: 'Detects unusually high API call frequency',
                severity: 'medium',
                action: 'warn',
                rules: [
                    {
                        condition: 'requestsPerMinute',
                        operator: 'greater',
                        value: 30
                    }
                ]
            },
            {
                name: 'Bot User Agent',
                description: 'Detects automated bot requests',
                severity: 'low',
                action: 'log',
                rules: [
                    {
                        condition: 'userAgent',
                        operator: 'matches',
                        value: '(bot|crawler|spider|scraper)'
                    }
                ]
            },
            {
                name: 'Large Payload Attack',
                description: 'Detects unusually large request payloads',
                severity: 'medium',
                action: 'block',
                rules: [
                    {
                        condition: 'payloadSize',
                        operator: 'greater',
                        value: 1000000 // 1MB
                    }
                ]
            }
        ];
    }
    /**
     * Get severity score
     */
    getSeverityScore(severity) {
        switch (severity) {
            case 'low': return 10;
            case 'medium': return 25;
            case 'high': return 50;
            case 'critical': return 75;
            default: return 0;
        }
    }
    /**
     * Get action priority for comparison
     */
    getActionPriority(action) {
        switch (action) {
            case 'log': return 1;
            case 'warn': return 2;
            case 'block': return 3;
            case 'ban': return 4;
            default: return 0;
        }
    }
    /**
     * Start background cleanup tasks
     */
    startCleanupTasks() {
        // Clean up old request history every hour
        setInterval(() => {
            const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
            for (const [ip, requests] of this.requestHistory.entries()) {
                const filteredRequests = requests.filter(req => req.timestamp.getTime() > cutoff);
                if (filteredRequests.length === 0) {
                    this.requestHistory.delete(ip);
                }
                else {
                    this.requestHistory.set(ip, filteredRequests);
                }
            }
        }, 60 * 60 * 1000); // Every hour
        // Reset rate limit counters every minute
        setInterval(() => {
            const now = Date.now();
            for (const [ip, counters] of this.rateLimitCounters.entries()) {
                if (now - counters.lastReset.getTime() > 60000) {
                    counters.minute = 0;
                }
                if (now - counters.lastReset.getTime() > 3600000) {
                    counters.hour = 0;
                    counters.lastReset = new Date(now);
                }
            }
        }, 60 * 1000); // Every minute
    }
    /**
     * Get security metrics
     */
    getSecurityMetrics() {
        const totalRequests = Array.from(this.requestHistory.values())
            .reduce((sum, requests) => sum + requests.length, 0);
        const blockedRequests = this.securityEvents.filter(event => event.details.action === 'block' || event.details.action === 'ban').length;
        const suspiciousRequests = this.securityEvents.filter(event => event.riskScore > 30).length;
        const uniqueIPs = this.requestHistory.size;
        const attackTypes = this.securityEvents.reduce((acc, event) => {
            acc[event.type] = (acc[event.type] || 0) + 1;
            return acc;
        }, {});
        const topAttackTypes = Object.entries(attackTypes)
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        const averageRiskScore = this.securityEvents.length > 0
            ? this.securityEvents.reduce((sum, event) => sum + event.riskScore, 0) / this.securityEvents.length
            : 0;
        const lastThreatDetected = this.securityEvents.length > 0
            ? this.securityEvents[this.securityEvents.length - 1].timestamp
            : undefined;
        return {
            totalRequests,
            blockedRequests,
            suspiciousRequests,
            uniqueIPs,
            topAttackTypes,
            averageRiskScore,
            lastThreatDetected
        };
    }
    /**
     * Get recent security events
     */
    getRecentSecurityEvents(limit = 50) {
        return this.securityEvents.slice(-limit);
    }
    /**
     * Manually ban IP address
     */
    manuallyBanIP(ip, reason) {
        this.bannedIPs.add(ip);
        this.logSecurityEvent({
            type: 'intrusion',
            severity: 'high',
            source: { ip, userAgent: 'manual-ban' },
            details: { reason: `Manual ban: ${reason}` },
            riskScore: 100
        });
        this.emit('ipBanned', ip);
    }
    /**
     * Unban IP address
     */
    unbanIP(ip) {
        this.bannedIPs.delete(ip);
        this.failedAttempts.delete(ip);
        this.emit('ipUnbanned', ip);
    }
    /**
     * Update security configuration
     */
    updateConfig(newConfig) {
        this.config = Object.assign(Object.assign({}, this.config), newConfig);
        this.emit('configUpdated', this.config);
    }
    /**
     * Check if service is healthy
     */
    healthCheck() {
        try {
            const metrics = this.getSecurityMetrics();
            const recentEvents = this.getRecentSecurityEvents(10);
            const criticalEvents = recentEvents.filter(event => event.severity === 'critical' &&
                (Date.now() - event.timestamp.getTime()) < 5 * 60 * 1000 // Last 5 minutes
            );
            if (criticalEvents.length > 0) {
                return {
                    status: 'degraded',
                    details: {
                        message: 'Critical security events detected',
                        criticalEvents: criticalEvents.length,
                        metrics
                    }
                };
            }
            return {
                status: 'healthy',
                details: {
                    initialized: this.isInitialized,
                    bannedIPs: this.bannedIPs.size,
                    metrics
                }
            };
        }
        catch (error) {
            return {
                status: 'error',
                details: { error: error instanceof Error ? error.message : 'Unknown error' }
            };
        }
    }
}
// Export factory function
export function createRouterSecurity(config) {
    return new RouterSecurityService(config);
}
// Export default configuration
export const DEFAULT_ROUTER_SECURITY_CONFIG = {
    enableThreatDetection: true,
    enableRateLimiting: true,
    enableAnomalyDetection: true,
    maxRequestsPerMinute: 60,
    maxRequestsPerHour: 1000,
    maxFailedAttemptsBeforeBan: 5,
    banDurationMinutes: 60,
    suspiciousPatterns: [],
    enableGeoBlocking: false,
    allowedCountries: [],
    blockedIPs: []
};
//# sourceMappingURL=router-security.js.map