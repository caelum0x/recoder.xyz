"use strict";
/**
 * Execution Time Limits
 * Tracks compute time per user and enforces daily/monthly limits
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.executionTracker = exports.ExecutionTracker = void 0;
exports.startExecutionSession = startExecutionSession;
exports.endExecutionSession = endExecutionSession;
exports.getExecutionLimits = getExecutionLimits;
exports.canStartExecutionSession = canStartExecutionSession;
exports.getExecutionAlerts = getExecutionAlerts;
exports.acknowledgeExecutionAlert = acknowledgeExecutionAlert;
exports.getExecutionStats = getExecutionStats;
exports.stopExecutionTracking = stopExecutionTracking;
const uuid_1 = require("uuid");
const types_js_1 = require("./types.js");
const tier_limits_js_1 = require("./tier-limits.js");
// ==================== Constants ====================
/** Warning threshold for daily execution (80%) */
const DAILY_WARNING_THRESHOLD = 0.8;
/** Warning threshold for monthly execution (80%) */
const MONTHLY_WARNING_THRESHOLD = 0.8;
/** Update interval for execution tracking (ms) */
const TRACKING_INTERVAL_MS = 60000; // 1 minute
// ==================== Execution Tracking ====================
/**
 * In-memory execution tracking
 * In production, this should be persisted to a database
 */
class ExecutionTracker {
    records = new Map();
    alerts = [];
    trackingInterval = null;
    constructor(autoStartTracking = true) {
        // Start periodic tracking
        if (autoStartTracking) {
            this.startTracking();
        }
    }
    /**
     * Get or create execution record for a user
     */
    getOrCreateRecord(userId, tier) {
        let record = this.records.get(userId);
        const now = new Date();
        const dayOfYear = this.getDayOfYear(now);
        const month = now.getMonth();
        if (!record) {
            record = {
                userId,
                tier,
                dailyMinutes: 0,
                dailyResetDay: dayOfYear,
                monthlyHours: 0,
                monthlyResetMonth: month,
                isPaused: false,
                activeSessions: new Map(),
                lastUpdated: now,
            };
            this.records.set(userId, record);
        }
        // Check for daily reset
        if (record.dailyResetDay !== dayOfYear) {
            record.dailyMinutes = 0;
            record.dailyResetDay = dayOfYear;
            if (record.pauseReason === 'daily_limit') {
                record.isPaused = false;
                record.pauseReason = undefined;
            }
        }
        // Check for monthly reset
        if (record.monthlyResetMonth !== month) {
            record.monthlyHours = 0;
            record.monthlyResetMonth = month;
            if (record.pauseReason === 'monthly_limit') {
                record.isPaused = false;
                record.pauseReason = undefined;
            }
        }
        // Update tier if changed
        record.tier = tier;
        return record;
    }
    /**
     * Get day of year (1-366)
     */
    getDayOfYear(date) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date.getTime() - start.getTime();
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }
    /**
     * Start a container session
     */
    startSession(userId, projectId, containerId, tier) {
        const record = this.getOrCreateRecord(userId, tier);
        // Check if user is paused
        if (record.isPaused) {
            console.log(`[ExecutionLimits] User ${userId} is paused (${record.pauseReason}), cannot start session`);
            return false;
        }
        // Add session
        record.activeSessions.set(projectId, {
            projectId,
            containerId,
            startedAt: new Date(),
            lastUpdated: new Date(),
        });
        console.log(`[ExecutionLimits] Started session for user ${userId}, project ${projectId}`);
        return true;
    }
    /**
     * End a container session
     */
    endSession(userId, projectId) {
        const record = this.records.get(userId);
        if (!record)
            return;
        const session = record.activeSessions.get(projectId);
        if (session) {
            // Calculate final duration and add to totals
            const durationMs = Date.now() - session.lastUpdated.getTime();
            const durationMinutes = durationMs / 60000;
            record.dailyMinutes += durationMinutes;
            record.monthlyHours += durationMinutes / 60;
            record.activeSessions.delete(projectId);
            console.log(`[ExecutionLimits] Ended session for user ${userId}, project ${projectId}, +${durationMinutes.toFixed(1)}min`);
        }
    }
    /**
     * Update a user's subscription tier (called on subscription activation/cancellation)
     */
    updateUserTier(userId, tier) {
        const record = this.records.get(userId);
        if (record) {
            record.tier = tier;
            // Unpause if upgrading from free and was paused due to limits
            if (tier !== types_js_1.SubscriptionTier.FREE && record.isPaused) {
                const limits = (0, tier_limits_js_1.getTierResourceLimits)(tier);
                if ((record.pauseReason === 'daily_limit' && ((0, tier_limits_js_1.hasUnlimitedExecution)(tier) || record.dailyMinutes < limits.dailyExecutionMinutes)) ||
                    (record.pauseReason === 'monthly_limit' && ((0, tier_limits_js_1.hasUnlimitedExecution)(tier) || record.monthlyHours < limits.monthlyExecutionHours))) {
                    record.isPaused = false;
                    record.pauseReason = undefined;
                }
            }
            console.log(`[ExecutionLimits] Updated tier for user ${userId}: ${tier}`);
        }
        else {
            // Create a new record with the given tier
            this.getOrCreateRecord(userId, tier);
            console.log(`[ExecutionLimits] Created record for user ${userId} with tier ${tier}`);
        }
    }
    /**
     * Update active sessions (called periodically)
     */
    updateActiveSessions() {
        const now = new Date();
        for (const record of this.records.values()) {
            for (const session of record.activeSessions.values()) {
                // Calculate time since last update
                const durationMs = now.getTime() - session.lastUpdated.getTime();
                const durationMinutes = durationMs / 60000;
                // Add to totals
                record.dailyMinutes += durationMinutes;
                record.monthlyHours += durationMinutes / 60;
                // Update last updated
                session.lastUpdated = now;
                // Check limits
                this.checkAndEnforceLimits(record);
            }
            record.lastUpdated = now;
        }
    }
    /**
     * Check and enforce limits for a user
     */
    checkAndEnforceLimits(record) {
        const limits = (0, tier_limits_js_1.getTierResourceLimits)(record.tier);
        // Check daily limit
        if (limits.dailyExecutionMinutes > 0 && record.dailyMinutes >= limits.dailyExecutionMinutes) {
            if (!record.isPaused) {
                record.isPaused = true;
                record.pauseReason = 'daily_limit';
                this.createLimitAlert(record, 'daily');
                console.log(`[ExecutionLimits] User ${record.userId} reached daily limit (${record.dailyMinutes.toFixed(1)}min)`);
            }
        }
        // Check monthly limit
        if (limits.monthlyExecutionHours > 0 && record.monthlyHours >= limits.monthlyExecutionHours) {
            if (!record.isPaused) {
                record.isPaused = true;
                record.pauseReason = 'monthly_limit';
                this.createLimitAlert(record, 'monthly');
                console.log(`[ExecutionLimits] User ${record.userId} reached monthly limit (${record.monthlyHours.toFixed(1)}h)`);
            }
        }
        // Check warning thresholds
        if (limits.dailyExecutionMinutes > 0) {
            const dailyPercent = record.dailyMinutes / limits.dailyExecutionMinutes;
            if (dailyPercent >= DAILY_WARNING_THRESHOLD && dailyPercent < 1) {
                this.createWarningAlert(record, 'daily', dailyPercent);
            }
        }
        if (limits.monthlyExecutionHours > 0) {
            const monthlyPercent = record.monthlyHours / limits.monthlyExecutionHours;
            if (monthlyPercent >= MONTHLY_WARNING_THRESHOLD && monthlyPercent < 1) {
                this.createWarningAlert(record, 'monthly', monthlyPercent);
            }
        }
    }
    /**
     * Create limit reached alert
     */
    createLimitAlert(record, type) {
        const alert = {
            id: (0, uuid_1.v4)(),
            userId: record.userId,
            type: 'execution_limit',
            severity: 'error',
            message: type === 'daily'
                ? `Daily execution limit reached (${record.dailyMinutes.toFixed(0)} minutes). Containers will be paused until tomorrow.`
                : `Monthly execution limit reached (${record.monthlyHours.toFixed(1)} hours). Containers will be paused until next month.`,
            details: {
                type,
                used: type === 'daily' ? record.dailyMinutes : record.monthlyHours,
                tier: record.tier,
            },
            createdAt: new Date(),
            acknowledged: false,
        };
        this.alerts.push(alert);
    }
    /**
     * Create warning alert
     */
    createWarningAlert(record, type, percent) {
        // Avoid duplicate warnings
        const existingWarning = this.alerts.find(a => a.userId === record.userId &&
            a.type === 'execution_warning' &&
            a.details?.type === type &&
            !a.acknowledged);
        if (existingWarning)
            return;
        const alert = {
            id: (0, uuid_1.v4)(),
            userId: record.userId,
            type: 'execution_warning',
            severity: 'warning',
            message: type === 'daily'
                ? `Daily execution at ${(percent * 100).toFixed(0)}% (${record.dailyMinutes.toFixed(0)} minutes used)`
                : `Monthly execution at ${(percent * 100).toFixed(0)}% (${record.monthlyHours.toFixed(1)} hours used)`,
            details: {
                type,
                percent: percent * 100,
                used: type === 'daily' ? record.dailyMinutes : record.monthlyHours,
                tier: record.tier,
            },
            createdAt: new Date(),
            acknowledged: false,
        };
        this.alerts.push(alert);
    }
    /**
     * Start periodic tracking
     */
    startTracking() {
        if (this.trackingInterval)
            return;
        this.trackingInterval = setInterval(() => {
            this.updateActiveSessions();
        }, TRACKING_INTERVAL_MS);
        console.log('[ExecutionLimits] Started execution tracking');
    }
    /**
     * Stop periodic tracking
     */
    stopTracking() {
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }
    }
    /**
     * Get execution limits for a user
     */
    getExecutionLimits(userId, tier) {
        const record = this.getOrCreateRecord(userId, tier);
        const limits = (0, tier_limits_js_1.getTierResourceLimits)(tier);
        const dailyRemaining = limits.dailyExecutionMinutes > 0
            ? Math.max(0, limits.dailyExecutionMinutes - record.dailyMinutes)
            : -1;
        const monthlyRemaining = limits.monthlyExecutionHours > 0
            ? Math.max(0, limits.monthlyExecutionHours - record.monthlyHours)
            : -1;
        // Calculate reset times
        const now = new Date();
        const dailyReset = new Date(now);
        dailyReset.setDate(dailyReset.getDate() + 1);
        dailyReset.setHours(0, 0, 0, 0);
        const monthlyReset = new Date(now);
        monthlyReset.setMonth(monthlyReset.getMonth() + 1);
        monthlyReset.setDate(1);
        monthlyReset.setHours(0, 0, 0, 0);
        return {
            userId,
            tier,
            dailyUsedMinutes: Math.round(record.dailyMinutes * 100) / 100,
            dailyLimitMinutes: limits.dailyExecutionMinutes,
            dailyRemainingMinutes: dailyRemaining === -1 ? -1 : Math.round(dailyRemaining * 100) / 100,
            monthlyUsedHours: Math.round(record.monthlyHours * 100) / 100,
            monthlyLimitHours: limits.monthlyExecutionHours,
            monthlyRemainingHours: monthlyRemaining === -1 ? -1 : Math.round(monthlyRemaining * 100) / 100,
            isPaused: record.isPaused,
            pauseReason: record.pauseReason,
            dailyResetAt: dailyReset,
            monthlyResetAt: monthlyReset,
        };
    }
    /**
     * Check if user can start a new session
     */
    canStartSession(userId, tier) {
        if ((0, tier_limits_js_1.hasUnlimitedExecution)(tier)) {
            return { allowed: true };
        }
        const record = this.getOrCreateRecord(userId, tier);
        const limits = (0, tier_limits_js_1.getTierResourceLimits)(tier);
        if (record.isPaused) {
            const suggestion = (0, tier_limits_js_1.getUpgradeSuggestion)(tier, 'execution');
            if (record.pauseReason === 'daily_limit') {
                const resetTime = new Date();
                resetTime.setDate(resetTime.getDate() + 1);
                resetTime.setHours(0, 0, 0, 0);
                return {
                    allowed: false,
                    reason: 'Daily execution limit reached',
                    suggestedAction: suggestion ? 'upgrade' : 'wait',
                    resetIn: resetTime.getTime() - Date.now(),
                    usage: {
                        current: record.dailyMinutes,
                        limit: limits.dailyExecutionMinutes,
                        unit: 'minutes',
                    },
                };
            }
            if (record.pauseReason === 'monthly_limit') {
                const resetTime = new Date();
                resetTime.setMonth(resetTime.getMonth() + 1);
                resetTime.setDate(1);
                resetTime.setHours(0, 0, 0, 0);
                return {
                    allowed: false,
                    reason: 'Monthly execution limit reached',
                    suggestedAction: suggestion ? 'upgrade' : 'wait',
                    resetIn: resetTime.getTime() - Date.now(),
                    usage: {
                        current: record.monthlyHours,
                        limit: limits.monthlyExecutionHours,
                        unit: 'hours',
                    },
                };
            }
        }
        return { allowed: true };
    }
    /**
     * Get alerts for a user
     */
    getAlerts(userId) {
        return this.alerts.filter(a => a.userId === userId && !a.acknowledged);
    }
    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
        }
    }
    /**
     * Get all users with active sessions
     */
    getActiveUsers() {
        const activeUsers = [];
        for (const [userId, record] of this.records) {
            if (record.activeSessions.size > 0) {
                activeUsers.push(userId);
            }
        }
        return activeUsers;
    }
    /**
     * Get stats for monitoring
     */
    getStats() {
        let activeUsers = 0;
        let totalActiveSessions = 0;
        let pausedUsers = 0;
        for (const record of this.records.values()) {
            if (record.activeSessions.size > 0) {
                activeUsers++;
                totalActiveSessions += record.activeSessions.size;
            }
            if (record.isPaused) {
                pausedUsers++;
            }
        }
        return {
            totalUsers: this.records.size,
            activeUsers,
            totalActiveSessions,
            pausedUsers,
            alertCount: this.alerts.filter(a => !a.acknowledged).length,
        };
    }
}
exports.ExecutionTracker = ExecutionTracker;
// Singleton instance
const executionTracker = new ExecutionTracker();
exports.executionTracker = executionTracker;
// ==================== Public API ====================
/**
 * Start an execution session
 */
function startExecutionSession(userId, projectId, containerId, tier) {
    return executionTracker.startSession(userId, projectId, containerId, tier);
}
/**
 * End an execution session
 */
function endExecutionSession(userId, projectId) {
    executionTracker.endSession(userId, projectId);
}
/**
 * Get execution limits for a user
 */
function getExecutionLimits(userId, tier) {
    return executionTracker.getExecutionLimits(userId, tier);
}
/**
 * Check if user can start a new session
 */
function canStartExecutionSession(userId, tier) {
    return executionTracker.canStartSession(userId, tier);
}
/**
 * Get execution alerts for a user
 */
function getExecutionAlerts(userId) {
    return executionTracker.getAlerts(userId);
}
/**
 * Acknowledge an execution alert
 */
function acknowledgeExecutionAlert(alertId) {
    executionTracker.acknowledgeAlert(alertId);
}
/**
 * Get execution tracking stats
 */
function getExecutionStats() {
    return executionTracker.getStats();
}
/**
 * Stop execution tracking (for cleanup)
 */
function stopExecutionTracking() {
    executionTracker.stopTracking();
}
