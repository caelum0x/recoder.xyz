/**
 * Execution Time Limits
 * Tracks compute time per user and enforces daily/monthly limits
 */

import { v4 as uuid } from 'uuid';
import {
  SubscriptionTier,
  ExecutionLimits,
  ResourceAlert,
  LimitEnforcementResult,
} from './types.js';
import { getTierResourceLimits, hasUnlimitedExecution, getUpgradeSuggestion } from './tier-limits.js';

// ==================== Constants ====================

/** Warning threshold for daily execution (80%) */
const DAILY_WARNING_THRESHOLD = 0.8;
/** Warning threshold for monthly execution (80%) */
const MONTHLY_WARNING_THRESHOLD = 0.8;
/** Update interval for execution tracking (ms) */
const TRACKING_INTERVAL_MS = 60000; // 1 minute

// ==================== Types ====================

interface ExecutionRecord {
  userId: string;
  tier: SubscriptionTier;
  /** Execution minutes used today */
  dailyMinutes: number;
  /** Day of the year for daily tracking */
  dailyResetDay: number;
  /** Execution hours used this month */
  monthlyHours: number;
  /** Month for monthly tracking */
  monthlyResetMonth: number;
  /** Whether user is currently paused */
  isPaused: boolean;
  pauseReason?: 'daily_limit' | 'monthly_limit';
  /** Active container sessions */
  activeSessions: Map<string, {
    projectId: string;
    containerId: string;
    startedAt: Date;
    lastUpdated: Date;
  }>;
  /** Last updated timestamp */
  lastUpdated: Date;
}

// ==================== Execution Tracking ====================

/**
 * In-memory execution tracking
 * In production, this should be persisted to a database
 */
class ExecutionTracker {
  private records = new Map<string, ExecutionRecord>();
  private alerts: ResourceAlert[] = [];
  private trackingInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic tracking
    this.startTracking();
  }

  /**
   * Get or create execution record for a user
   */
  private getOrCreateRecord(userId: string, tier: SubscriptionTier): ExecutionRecord {
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
  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  /**
   * Start a container session
   */
  startSession(
    userId: string,
    projectId: string,
    containerId: string,
    tier: SubscriptionTier
  ): boolean {
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
  endSession(userId: string, projectId: string): void {
    const record = this.records.get(userId);
    if (!record) return;

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
   * Update active sessions (called periodically)
   */
  private updateActiveSessions(): void {
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
  private checkAndEnforceLimits(record: ExecutionRecord): void {
    const limits = getTierResourceLimits(record.tier);

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
  private createLimitAlert(record: ExecutionRecord, type: 'daily' | 'monthly'): void {
    const alert: ResourceAlert = {
      id: uuid(),
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
  private createWarningAlert(record: ExecutionRecord, type: 'daily' | 'monthly', percent: number): void {
    // Avoid duplicate warnings
    const existingWarning = this.alerts.find(
      a => a.userId === record.userId &&
           a.type === 'execution_warning' &&
           (a.details as any)?.type === type &&
           !a.acknowledged
    );

    if (existingWarning) return;

    const alert: ResourceAlert = {
      id: uuid(),
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
  private startTracking(): void {
    if (this.trackingInterval) return;

    this.trackingInterval = setInterval(() => {
      this.updateActiveSessions();
    }, TRACKING_INTERVAL_MS);

    console.log('[ExecutionLimits] Started execution tracking');
  }

  /**
   * Stop periodic tracking
   */
  stopTracking(): void {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  /**
   * Get execution limits for a user
   */
  getExecutionLimits(userId: string, tier: SubscriptionTier): ExecutionLimits {
    const record = this.getOrCreateRecord(userId, tier);
    const limits = getTierResourceLimits(tier);

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
  canStartSession(userId: string, tier: SubscriptionTier): LimitEnforcementResult {
    if (hasUnlimitedExecution(tier)) {
      return { allowed: true };
    }

    const record = this.getOrCreateRecord(userId, tier);
    const limits = getTierResourceLimits(tier);

    if (record.isPaused) {
      const suggestion = getUpgradeSuggestion(tier, 'execution');

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
  getAlerts(userId: string): ResourceAlert[] {
    return this.alerts.filter(a => a.userId === userId && !a.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  /**
   * Get all users with active sessions
   */
  getActiveUsers(): string[] {
    const activeUsers: string[] = [];
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
  getStats(): {
    totalUsers: number;
    activeUsers: number;
    totalActiveSessions: number;
    pausedUsers: number;
    alertCount: number;
  } {
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

// Singleton instance
const executionTracker = new ExecutionTracker();

// ==================== Public API ====================

/**
 * Start an execution session
 */
export function startExecutionSession(
  userId: string,
  projectId: string,
  containerId: string,
  tier: SubscriptionTier
): boolean {
  return executionTracker.startSession(userId, projectId, containerId, tier);
}

/**
 * End an execution session
 */
export function endExecutionSession(userId: string, projectId: string): void {
  executionTracker.endSession(userId, projectId);
}

/**
 * Get execution limits for a user
 */
export function getExecutionLimits(userId: string, tier: SubscriptionTier): ExecutionLimits {
  return executionTracker.getExecutionLimits(userId, tier);
}

/**
 * Check if user can start a new session
 */
export function canStartExecutionSession(
  userId: string,
  tier: SubscriptionTier
): LimitEnforcementResult {
  return executionTracker.canStartSession(userId, tier);
}

/**
 * Get execution alerts for a user
 */
export function getExecutionAlerts(userId: string): ResourceAlert[] {
  return executionTracker.getAlerts(userId);
}

/**
 * Acknowledge an execution alert
 */
export function acknowledgeExecutionAlert(alertId: string): void {
  executionTracker.acknowledgeAlert(alertId);
}

/**
 * Get execution tracking stats
 */
export function getExecutionStats() {
  return executionTracker.getStats();
}

/**
 * Stop execution tracking (for cleanup)
 */
export function stopExecutionTracking(): void {
  executionTracker.stopTracking();
}

export { executionTracker };
