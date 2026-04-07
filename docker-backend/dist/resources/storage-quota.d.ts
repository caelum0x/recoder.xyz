/**
 * Storage Quota Management
 * Tracks and enforces per-project storage limits
 */
import Docker from 'dockerode';
import { SubscriptionTier, StorageQuota, ResourceAlert, LimitEnforcementResult } from './types.js';
/** Warning threshold as percentage (75%) */
declare const WARNING_THRESHOLD_PERCENT = 75;
/** Critical threshold as percentage (90%) */
declare const CRITICAL_THRESHOLD_PERCENT = 90;
/**
 * In-memory storage quota tracking
 * In production, this should be persisted to a database
 */
declare class StorageQuotaTracker {
    private quotas;
    private alerts;
    /**
     * Get or create storage quota for a project
     */
    getQuota(projectId: string): StorageQuota | undefined;
    /**
     * Update storage quota for a project
     */
    updateQuota(quota: StorageQuota): void;
    /**
     * Remove storage quota tracking for a project
     */
    removeQuota(projectId: string): void;
    /**
     * Get all quotas for a user
     */
    getUserQuotas(userId: string): StorageQuota[];
    /**
     * Get total storage used by a user
     */
    getTotalUserStorage(userId: string): number;
    /**
     * Add an alert
     */
    addAlert(alert: ResourceAlert): void;
    /**
     * Get alerts for a project
     */
    getAlerts(projectId: string): ResourceAlert[];
    /**
     * Clear acknowledged alerts
     */
    clearAcknowledgedAlerts(projectId: string): void;
    /**
     * Get all quotas
     */
    getAllQuotas(): StorageQuota[];
}
declare const storageTracker: StorageQuotaTracker;
/**
 * Calculate storage usage for a container's workspace
 */
export declare function calculateStorageUsage(docker: Docker, containerId: string): Promise<number>;
/**
 * Calculate storage with detailed breakdown
 */
export declare function calculateStorageBreakdown(docker: Docker, containerId: string): Promise<{
    total: number;
    workspace: number;
    nodeModules: number;
    git: number;
    other: number;
}>;
/**
 * Check and update storage quota for a project
 */
export declare function checkStorageQuota(docker: Docker, containerId: string, projectId: string, userId: string, tier: SubscriptionTier): Promise<StorageQuota>;
/**
 * Enforce storage limit - check if write is allowed
 */
export declare function enforceStorageLimit(docker: Docker, containerId: string, projectId: string, userId: string, tier: SubscriptionTier, additionalBytes?: number): Promise<LimitEnforcementResult>;
/**
 * Clean up old/unused files to free storage
 */
export declare function cleanupStorage(docker: Docker, containerId: string, options?: {
    /** Remove files older than X days */
    olderThanDays?: number;
    /** Remove specific patterns */
    patterns?: string[];
    /** Dry run - only report what would be deleted */
    dryRun?: boolean;
}): Promise<{
    success: boolean;
    freedBytes: number;
    filesRemoved: number;
    message: string;
}>;
/**
 * Clean npm/pnpm cache to free storage
 */
export declare function cleanupNpmCache(docker: Docker, containerId: string): Promise<{
    success: boolean;
    freedBytes: number;
    message: string;
}>;
export { storageTracker, WARNING_THRESHOLD_PERCENT, CRITICAL_THRESHOLD_PERCENT, };
