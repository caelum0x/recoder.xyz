/**
 * Execution Time Limits
 * Tracks compute time per user and enforces daily/monthly limits
 */
import { SubscriptionTier, ExecutionLimits, ResourceAlert, LimitEnforcementResult } from './types.js';
/**
 * In-memory execution tracking
 * In production, this should be persisted to a database
 */
declare class ExecutionTracker {
    private records;
    private alerts;
    private trackingInterval;
    constructor();
    /**
     * Get or create execution record for a user
     */
    private getOrCreateRecord;
    /**
     * Get day of year (1-366)
     */
    private getDayOfYear;
    /**
     * Start a container session
     */
    startSession(userId: string, projectId: string, containerId: string, tier: SubscriptionTier): boolean;
    /**
     * End a container session
     */
    endSession(userId: string, projectId: string): void;
    /**
     * Update active sessions (called periodically)
     */
    private updateActiveSessions;
    /**
     * Check and enforce limits for a user
     */
    private checkAndEnforceLimits;
    /**
     * Create limit reached alert
     */
    private createLimitAlert;
    /**
     * Create warning alert
     */
    private createWarningAlert;
    /**
     * Start periodic tracking
     */
    private startTracking;
    /**
     * Stop periodic tracking
     */
    stopTracking(): void;
    /**
     * Get execution limits for a user
     */
    getExecutionLimits(userId: string, tier: SubscriptionTier): ExecutionLimits;
    /**
     * Check if user can start a new session
     */
    canStartSession(userId: string, tier: SubscriptionTier): LimitEnforcementResult;
    /**
     * Get alerts for a user
     */
    getAlerts(userId: string): ResourceAlert[];
    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId: string): void;
    /**
     * Get all users with active sessions
     */
    getActiveUsers(): string[];
    /**
     * Get stats for monitoring
     */
    getStats(): {
        totalUsers: number;
        activeUsers: number;
        totalActiveSessions: number;
        pausedUsers: number;
        alertCount: number;
    };
}
declare const executionTracker: ExecutionTracker;
/**
 * Start an execution session
 */
export declare function startExecutionSession(userId: string, projectId: string, containerId: string, tier: SubscriptionTier): boolean;
/**
 * End an execution session
 */
export declare function endExecutionSession(userId: string, projectId: string): void;
/**
 * Get execution limits for a user
 */
export declare function getExecutionLimits(userId: string, tier: SubscriptionTier): ExecutionLimits;
/**
 * Check if user can start a new session
 */
export declare function canStartExecutionSession(userId: string, tier: SubscriptionTier): LimitEnforcementResult;
/**
 * Get execution alerts for a user
 */
export declare function getExecutionAlerts(userId: string): ResourceAlert[];
/**
 * Acknowledge an execution alert
 */
export declare function acknowledgeExecutionAlert(alertId: string): void;
/**
 * Get execution tracking stats
 */
export declare function getExecutionStats(): {
    totalUsers: number;
    activeUsers: number;
    totalActiveSessions: number;
    pausedUsers: number;
    alertCount: number;
};
/**
 * Stop execution tracking (for cleanup)
 */
export declare function stopExecutionTracking(): void;
export { executionTracker };
