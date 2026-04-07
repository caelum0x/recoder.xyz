"use strict";
/**
 * Abuse Prevention Service
 *
 * Detects and prevents abuse patterns:
 * - IP-based rate limiting and blocking
 * - Suspicious activity detection
 * - Automated abuse response
 * - Blocklist management
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbusePrevention = exports.abusePrevention = void 0;
const crypto_1 = __importDefault(require("crypto"));
const persistence_js_1 = require("../persistence.js");
const DEFAULT_CONFIG = {
    maxAuthFailures: 5,
    authFailureWindowMs: 15 * 60 * 1000, // 15 minutes
    tempBlockDurationMs: 60 * 60 * 1000, // 1 hour
    maxRateLimitHits: 20,
    rateLimitWindowMs: 5 * 60 * 1000, // 5 minutes
    maxStoredEvents: 10000,
    autoBlockEnabled: true,
    suspiciousPatterns: [
        /\.\.\//g, // Path traversal
        /<script>/gi, // XSS
        /union\s+select/gi, // SQL injection
        /\$\{.+\}/g, // Template injection
        /\beval\s*\(/gi, // Code injection
        /\bexec\s*\(/gi, // Command injection
        /\brequire\s*\(/gi, // Module injection in payloads
    ],
};
function loadAbuseStore() {
    return (0, persistence_js_1.loadStore)('abuse-prevention', {
        events: [],
        blocklist: [],
        ipFailures: [],
        rateLimitHits: [],
    });
}
function saveAbuseStore(data) {
    (0, persistence_js_1.debouncedSave)('abuse-prevention', data);
}
// ==================== Abuse Prevention Service ====================
class AbusePrevention {
    config;
    events = [];
    blocklist = new Map();
    ipFailures = new Map();
    rateLimitHits = new Map();
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        // Load persisted state
        const stored = loadAbuseStore();
        this.events = stored.events.slice(-this.config.maxStoredEvents);
        this.blocklist = new Map(stored.blocklist.map((e) => [e.id, e]));
        this.ipFailures = new Map(stored.ipFailures);
        this.rateLimitHits = new Map(stored.rateLimitHits);
        console.log(`[AbusePrevention] Loaded ${this.events.length} events, ${this.blocklist.size} blocklist entries`);
        // Clean up expired blocks periodically
        setInterval(() => this.cleanupExpiredBlocks(), 60000);
    }
    // ==================== Public API ====================
    /**
     * Check if a request should be blocked
     */
    isBlocked(source) {
        const now = Date.now();
        for (const entry of this.blocklist.values()) {
            // Skip expired entries
            if (entry.expiresAt && entry.expiresAt < now) {
                continue;
            }
            switch (entry.type) {
                case 'ip':
                    if (source.ip === entry.value) {
                        return { blocked: true, reason: entry.reason, entry };
                    }
                    break;
                case 'ip_range':
                    if (source.ip && this.ipInRange(source.ip, entry.value)) {
                        return { blocked: true, reason: entry.reason, entry };
                    }
                    break;
                case 'user_id':
                    if (source.userId === entry.value) {
                        return { blocked: true, reason: entry.reason, entry };
                    }
                    break;
                case 'api_key':
                    if (source.apiKeyId === entry.value) {
                        return { blocked: true, reason: entry.reason, entry };
                    }
                    break;
                case 'user_agent_pattern':
                    if (source.userAgent && new RegExp(entry.value, 'i').test(source.userAgent)) {
                        return { blocked: true, reason: entry.reason, entry };
                    }
                    break;
            }
        }
        return { blocked: false };
    }
    /**
     * Record an abuse event
     */
    recordEvent(type, severity, source, details = {}) {
        const event = {
            id: crypto_1.default.randomUUID(),
            type,
            severity,
            source,
            details,
            timestamp: Date.now(),
            handled: false,
        };
        this.events.push(event);
        // Trim events if too many
        if (this.events.length > this.config.maxStoredEvents) {
            this.events = this.events.slice(-this.config.maxStoredEvents);
        }
        // Auto-handle based on severity and type
        if (this.config.autoBlockEnabled) {
            const action = this.determineAction(event);
            if (action) {
                this.executeAction(event, action);
            }
        }
        this.persist();
        return event;
    }
    /**
     * Record an authentication failure
     */
    recordAuthFailure(ip, details = {}) {
        const now = Date.now();
        const existing = this.ipFailures.get(ip);
        if (existing) {
            // Check if within window
            if (now - existing.firstAt < this.config.authFailureWindowMs) {
                existing.count++;
                existing.lastAt = now;
            }
            else {
                // Reset window
                this.ipFailures.set(ip, { count: 1, firstAt: now, lastAt: now });
            }
        }
        else {
            this.ipFailures.set(ip, { count: 1, firstAt: now, lastAt: now });
        }
        const failures = this.ipFailures.get(ip);
        const severity = failures.count >= this.config.maxAuthFailures ? 'high' :
            failures.count >= Math.floor(this.config.maxAuthFailures / 2) ? 'medium' : 'low';
        return this.recordEvent('auth_failure', severity, { ip }, {
            ...details,
            failureCount: failures.count,
            windowStart: failures.firstAt,
        });
    }
    /**
     * Record a rate limit hit
     */
    recordRateLimitHit(source, details = {}) {
        const key = source.apiKeyId || source.ip || 'unknown';
        const now = Date.now();
        const existing = this.rateLimitHits.get(key);
        if (existing) {
            if (now - existing.firstAt < this.config.rateLimitWindowMs) {
                existing.count++;
            }
            else {
                this.rateLimitHits.set(key, { count: 1, firstAt: now });
            }
        }
        else {
            this.rateLimitHits.set(key, { count: 1, firstAt: now });
        }
        const hits = this.rateLimitHits.get(key);
        const severity = hits.count >= this.config.maxRateLimitHits ? 'high' :
            hits.count >= Math.floor(this.config.maxRateLimitHits / 2) ? 'medium' : 'low';
        return this.recordEvent('rate_limit_exceeded', severity, source, {
            ...details,
            hitCount: hits.count,
            windowStart: hits.firstAt,
        });
    }
    /**
     * Check request payload for suspicious patterns
     */
    checkPayload(payload, source) {
        const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const matchedPatterns = [];
        for (const pattern of this.config.suspiciousPatterns) {
            if (pattern.test(payloadStr)) {
                matchedPatterns.push(pattern.source);
            }
        }
        if (matchedPatterns.length > 0) {
            this.recordEvent('payload_attack', 'high', source, {
                patterns: matchedPatterns,
                payloadSnippet: payloadStr.slice(0, 200),
            });
            return { safe: false, patterns: matchedPatterns };
        }
        return { safe: true };
    }
    /**
     * Add an entry to the blocklist
     */
    addToBlocklist(entry) {
        const fullEntry = {
            ...entry,
            id: crypto_1.default.randomUUID(),
            createdAt: Date.now(),
        };
        this.blocklist.set(fullEntry.id, fullEntry);
        this.persist();
        console.log(`[AbusePrevention] Added to blocklist: ${entry.type}=${entry.value} (${entry.reason})`);
        return fullEntry;
    }
    /**
     * Remove an entry from the blocklist
     */
    removeFromBlocklist(id) {
        const deleted = this.blocklist.delete(id);
        if (deleted) {
            this.persist();
        }
        return deleted;
    }
    /**
     * Get abuse statistics
     */
    getStats() {
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        const eventsByType = {};
        const eventsBySeverity = {};
        let last24Hours = 0;
        let last7Days = 0;
        for (const event of this.events) {
            eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
            eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
            if (event.timestamp >= oneDayAgo)
                last24Hours++;
            if (event.timestamp >= sevenDaysAgo)
                last7Days++;
        }
        // Count active blocks
        let activeBlocks = 0;
        let blockedIPs = 0;
        let blockedUsers = 0;
        for (const entry of this.blocklist.values()) {
            if (!entry.expiresAt || entry.expiresAt > now) {
                activeBlocks++;
                if (entry.type === 'ip' || entry.type === 'ip_range')
                    blockedIPs++;
                if (entry.type === 'user_id')
                    blockedUsers++;
            }
        }
        return {
            totalEvents: this.events.length,
            eventsByType: eventsByType,
            eventsBySeverity: eventsBySeverity,
            activeBlocks,
            blockedIPs,
            blockedUsers,
            last24Hours,
            last7Days,
        };
    }
    /**
     * Get recent events
     */
    getRecentEvents(limit = 100) {
        return this.events.slice(-limit).reverse();
    }
    /**
     * Get blocklist entries
     */
    getBlocklist() {
        return Array.from(this.blocklist.values());
    }
    // ==================== Private Methods ====================
    determineAction(event) {
        // Critical severity always notifies admin
        if (event.severity === 'critical') {
            return 'notify_admin';
        }
        switch (event.type) {
            case 'auth_failure': {
                const failureCount = event.details.failureCount || 0;
                if (failureCount >= this.config.maxAuthFailures) {
                    return 'temporary_block';
                }
                break;
            }
            case 'rate_limit_exceeded': {
                const hitCount = event.details.hitCount || 0;
                if (hitCount >= this.config.maxRateLimitHits) {
                    return 'temporary_block';
                }
                break;
            }
            case 'payload_attack':
            case 'suspicious_pattern':
                return event.severity === 'high' ? 'temporary_block' : 'log';
            case 'resource_abuse':
                return event.severity === 'high' ? 'terminate_sessions' : 'rate_limit';
            case 'data_exfiltration':
                return 'permanent_block';
        }
        return 'log';
    }
    executeAction(event, action) {
        event.action = action;
        event.handled = true;
        switch (action) {
            case 'log':
                console.log(`[AbusePrevention] Event: ${event.type} (${event.severity}) from ${JSON.stringify(event.source)}`);
                break;
            case 'temporary_block':
                if (event.source.ip) {
                    this.addToBlocklist({
                        type: 'ip',
                        value: event.source.ip,
                        reason: `Auto-blocked: ${event.type}`,
                        expiresAt: Date.now() + this.config.tempBlockDurationMs,
                    });
                }
                break;
            case 'permanent_block':
                if (event.source.ip) {
                    this.addToBlocklist({
                        type: 'ip',
                        value: event.source.ip,
                        reason: `Permanent block: ${event.type}`,
                    });
                }
                if (event.source.userId) {
                    this.addToBlocklist({
                        type: 'user_id',
                        value: event.source.userId,
                        reason: `Permanent block: ${event.type}`,
                    });
                }
                break;
            case 'notify_admin':
                console.error(`[AbusePrevention] ADMIN ALERT: ${event.type} (${event.severity})`);
                console.error(`  Source: ${JSON.stringify(event.source)}`);
                console.error(`  Details: ${JSON.stringify(event.details)}`);
                this.sendAdminNotification(event).catch((err) => {
                    console.error('[AbusePrevention] Failed to send admin notification:', err);
                });
                break;
            case 'terminate_sessions':
                console.warn(`[AbusePrevention] Terminating sessions for: ${JSON.stringify(event.source)}`);
                this.terminateUserSessions(event.source).catch((err) => {
                    console.error('[AbusePrevention] Failed to terminate sessions:', err);
                });
                break;
            case 'rate_limit':
                // Rate limiting is already handled by the rate limiter
                break;
        }
    }
    async sendAdminNotification(event) {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL;
        if (!webhookUrl) {
            console.warn('[AbusePrevention] No webhook URL configured (SLACK_WEBHOOK_URL, DISCORD_WEBHOOK_URL, or ALERT_WEBHOOK_URL)');
            return;
        }
        const payload = {
            text: `🚨 *Abuse Alert* (${event.severity.toUpperCase()})\n` +
                `*Type:* ${event.type}\n` +
                `*Source:* IP=${event.source.ip || 'N/A'}, User=${event.source.userId || 'N/A'}\n` +
                `*Details:* ${JSON.stringify(event.details).slice(0, 500)}\n` +
                `*Time:* ${new Date(event.timestamp).toISOString()}`,
        };
        try {
            const resp = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!resp.ok) {
                console.error(`[AbusePrevention] Webhook returned ${resp.status}`);
            }
        }
        catch (err) {
            console.error('[AbusePrevention] Webhook request failed:', err);
        }
    }
    async terminateUserSessions(source) {
        try {
            // Dynamically import session store to avoid circular deps
            const { sessionStore } = await Promise.resolve().then(() => __importStar(require('../session-store.js')));
            // If we have a userId, clear all their sessions
            if (source.userId) {
                // Invalidate by adding user to blocklist (immediate effect on auth middleware)
                this.addToBlocklist({
                    type: 'user_id',
                    value: source.userId,
                    reason: `Session terminated: abuse detected`,
                    expiresAt: Date.now() + this.config.tempBlockDurationMs,
                });
                console.log(`[AbusePrevention] Terminated sessions for user: ${source.userId}`);
            }
            // If we have an IP, block it temporarily
            if (source.ip) {
                this.addToBlocklist({
                    type: 'ip',
                    value: source.ip,
                    reason: `Session terminated: abuse detected`,
                    expiresAt: Date.now() + this.config.tempBlockDurationMs,
                });
                console.log(`[AbusePrevention] Blocked IP for session termination: ${source.ip}`);
            }
        }
        catch (err) {
            console.error('[AbusePrevention] Session termination error:', err);
        }
    }
    cleanupExpiredBlocks() {
        const now = Date.now();
        let removed = 0;
        for (const [id, entry] of this.blocklist) {
            if (entry.expiresAt && entry.expiresAt < now) {
                this.blocklist.delete(id);
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`[AbusePrevention] Cleaned up ${removed} expired blocklist entries`);
            this.persist();
        }
    }
    ipInRange(ip, range) {
        // Simple CIDR check (e.g., 192.168.1.0/24)
        const [rangeIp, bits] = range.split('/');
        if (!bits)
            return ip === rangeIp;
        const ipParts = ip.split('.').map(Number);
        const rangeParts = rangeIp.split('.').map(Number);
        const mask = parseInt(bits, 10);
        const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
        const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
        const maskNum = ~((1 << (32 - mask)) - 1);
        return (ipNum & maskNum) === (rangeNum & maskNum);
    }
    persist() {
        saveAbuseStore({
            events: this.events,
            blocklist: Array.from(this.blocklist.values()),
            ipFailures: Array.from(this.ipFailures.entries()),
            rateLimitHits: Array.from(this.rateLimitHits.entries()),
        });
    }
}
exports.AbusePrevention = AbusePrevention;
// ==================== Singleton Export ====================
exports.abusePrevention = new AbusePrevention();
