"use strict";
/**
 * Storage Quota Management
 * Tracks and enforces per-project storage limits
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CRITICAL_THRESHOLD_PERCENT = exports.WARNING_THRESHOLD_PERCENT = exports.storageTracker = void 0;
exports.calculateStorageUsage = calculateStorageUsage;
exports.calculateStorageBreakdown = calculateStorageBreakdown;
exports.checkStorageQuota = checkStorageQuota;
exports.enforceStorageLimit = enforceStorageLimit;
exports.cleanupStorage = cleanupStorage;
exports.cleanupNpmCache = cleanupNpmCache;
const uuid_1 = require("uuid");
const tier_limits_js_1 = require("./tier-limits.js");
// ==================== Constants ====================
/** Warning threshold as percentage (75%) */
const WARNING_THRESHOLD_PERCENT = 75;
exports.WARNING_THRESHOLD_PERCENT = WARNING_THRESHOLD_PERCENT;
/** Critical threshold as percentage (90%) */
const CRITICAL_THRESHOLD_PERCENT = 90;
exports.CRITICAL_THRESHOLD_PERCENT = CRITICAL_THRESHOLD_PERCENT;
/** Minimum interval between storage checks (ms) */
const MIN_CHECK_INTERVAL_MS = 60000; // 1 minute
/** Files to exclude from storage calculation */
const EXCLUDED_PATHS = [
    '/workspace/node_modules',
    '/workspace/.git/objects',
    '/workspace/.pnpm-store',
];
// ==================== Storage Tracking ====================
/**
 * In-memory storage quota tracking
 * In production, this should be persisted to a database
 */
class StorageQuotaTracker {
    quotas = new Map();
    alerts = new Map();
    /**
     * Get or create storage quota for a project
     */
    getQuota(projectId) {
        return this.quotas.get(projectId);
    }
    /**
     * Update storage quota for a project
     */
    updateQuota(quota) {
        this.quotas.set(quota.projectId, quota);
    }
    /**
     * Remove storage quota tracking for a project
     */
    removeQuota(projectId) {
        this.quotas.delete(projectId);
        this.alerts.delete(projectId);
    }
    /**
     * Get all quotas for a user
     */
    getUserQuotas(userId) {
        return Array.from(this.quotas.values()).filter(q => q.userId === userId);
    }
    /**
     * Get total storage used by a user
     */
    getTotalUserStorage(userId) {
        return this.getUserQuotas(userId).reduce((total, q) => total + q.usedBytes, 0);
    }
    /**
     * Add an alert
     */
    addAlert(alert) {
        const projectId = alert.projectId || 'global';
        const projectAlerts = this.alerts.get(projectId) || [];
        projectAlerts.push(alert);
        this.alerts.set(projectId, projectAlerts);
    }
    /**
     * Get alerts for a project
     */
    getAlerts(projectId) {
        return this.alerts.get(projectId) || [];
    }
    /**
     * Clear acknowledged alerts
     */
    clearAcknowledgedAlerts(projectId) {
        const projectAlerts = this.alerts.get(projectId) || [];
        this.alerts.set(projectId, projectAlerts.filter(a => !a.acknowledged));
    }
    /**
     * Get all quotas
     */
    getAllQuotas() {
        return Array.from(this.quotas.values());
    }
}
// Singleton instance
const storageTracker = new StorageQuotaTracker();
exports.storageTracker = storageTracker;
// ==================== Storage Measurement ====================
/**
 * Calculate storage usage for a container's workspace
 */
async function calculateStorageUsage(docker, containerId) {
    try {
        const container = docker.getContainer(containerId);
        // Check if container is running
        const info = await container.inspect();
        if (!info.State.Running) {
            console.log(`[StorageQuota] Container ${containerId.slice(0, 12)} not running, returning 0`);
            return 0;
        }
        // Build exclusion patterns for du command
        const excludeArgs = EXCLUDED_PATHS.map(p => `--exclude='${p}'`).join(' ');
        // Use du to calculate workspace size, excluding node_modules and .git objects
        const exec = await container.exec({
            Cmd: [
                'sh', '-c',
                `du -sb /workspace ${excludeArgs} 2>/dev/null | tail -1 | awk '{print $1}'`,
            ],
            AttachStdout: true,
            AttachStderr: true,
        });
        const stream = await exec.start({ Detach: false });
        const output = await collectStreamOutput(stream);
        const sizeBytes = parseInt(output.trim(), 10);
        if (isNaN(sizeBytes)) {
            console.warn(`[StorageQuota] Failed to parse storage size: ${output}`);
            return 0;
        }
        return sizeBytes;
    }
    catch (error) {
        console.error(`[StorageQuota] Error calculating storage for container ${containerId}: ${error.message}`);
        return 0;
    }
}
/**
 * Calculate storage with detailed breakdown
 */
async function calculateStorageBreakdown(docker, containerId) {
    try {
        const container = docker.getContainer(containerId);
        const exec = await container.exec({
            Cmd: [
                'sh', '-c',
                `
          echo "workspace:$(du -sb /workspace --exclude='/workspace/node_modules' --exclude='/workspace/.git' 2>/dev/null | awk '{print $1}')"
          echo "node_modules:$(du -sb /workspace/node_modules 2>/dev/null | awk '{print $1}' || echo 0)"
          echo "git:$(du -sb /workspace/.git 2>/dev/null | awk '{print $1}' || echo 0)"
          echo "total:$(du -sb /workspace 2>/dev/null | awk '{print $1}')"
        `,
            ],
            AttachStdout: true,
            AttachStderr: true,
        });
        const stream = await exec.start({ Detach: false });
        const output = await collectStreamOutput(stream);
        const breakdown = {
            total: 0,
            workspace: 0,
            nodeModules: 0,
            git: 0,
            other: 0,
        };
        for (const line of output.split('\n')) {
            const [key, value] = line.split(':');
            const size = parseInt(value?.trim() || '0', 10);
            if (isNaN(size))
                continue;
            switch (key) {
                case 'workspace':
                    breakdown.workspace = size;
                    break;
                case 'node_modules':
                    breakdown.nodeModules = size;
                    break;
                case 'git':
                    breakdown.git = size;
                    break;
                case 'total':
                    breakdown.total = size;
                    break;
            }
        }
        breakdown.other = Math.max(0, breakdown.total - breakdown.workspace - breakdown.nodeModules - breakdown.git);
        return breakdown;
    }
    catch (error) {
        console.error(`[StorageQuota] Error getting storage breakdown: ${error.message}`);
        return { total: 0, workspace: 0, nodeModules: 0, git: 0, other: 0 };
    }
}
/**
 * Helper to collect stream output
 */
async function collectStreamOutput(stream) {
    return new Promise((resolve) => {
        let output = '';
        stream.on('data', (chunk) => {
            output += chunk.toString();
        });
        stream.on('end', () => {
            resolve(output);
        });
        stream.on('error', () => {
            resolve(output);
        });
        setTimeout(() => resolve(output), 10000); // 10s timeout
    });
}
// ==================== Quota Enforcement ====================
/**
 * Check and update storage quota for a project
 */
async function checkStorageQuota(docker, containerId, projectId, userId, tier) {
    const limits = (0, tier_limits_js_1.getTierResourceLimits)(tier);
    const usedBytes = await calculateStorageUsage(docker, containerId);
    const usagePercent = (usedBytes / limits.storage) * 100;
    const warningThreshold = usagePercent >= WARNING_THRESHOLD_PERCENT;
    const criticalThreshold = usagePercent >= CRITICAL_THRESHOLD_PERCENT;
    const quota = {
        projectId,
        userId,
        usedBytes,
        limitBytes: limits.storage,
        usagePercent: Math.round(usagePercent * 100) / 100,
        warningThreshold,
        criticalThreshold,
        lastChecked: new Date(),
    };
    // Update tracking
    storageTracker.updateQuota(quota);
    // Create alerts if thresholds reached
    if (criticalThreshold) {
        createStorageAlert(userId, projectId, 'storage_critical', quota);
    }
    else if (warningThreshold) {
        createStorageAlert(userId, projectId, 'storage_warning', quota);
    }
    return quota;
}
/**
 * Create a storage alert
 */
function createStorageAlert(userId, projectId, type, quota) {
    const usedMB = Math.round(quota.usedBytes / (1024 * 1024));
    const limitMB = Math.round(quota.limitBytes / (1024 * 1024));
    const alert = {
        id: (0, uuid_1.v4)(),
        userId,
        projectId,
        type,
        severity: type === 'storage_critical' ? 'critical' : 'warning',
        message: type === 'storage_critical'
            ? `Storage at ${quota.usagePercent.toFixed(1)}% (${usedMB}MB / ${limitMB}MB). Consider cleaning up or upgrading.`
            : `Storage approaching limit: ${quota.usagePercent.toFixed(1)}% (${usedMB}MB / ${limitMB}MB)`,
        details: {
            usedBytes: quota.usedBytes,
            limitBytes: quota.limitBytes,
            usagePercent: quota.usagePercent,
        },
        createdAt: new Date(),
        acknowledged: false,
    };
    storageTracker.addAlert(alert);
    console.log(`[StorageQuota] Alert created for ${projectId}: ${alert.message}`);
}
/**
 * Enforce storage limit - check if write is allowed
 */
async function enforceStorageLimit(docker, containerId, projectId, userId, tier, additionalBytes = 0) {
    const limits = (0, tier_limits_js_1.getTierResourceLimits)(tier);
    // Get current quota or calculate fresh
    let quota = storageTracker.getQuota(projectId);
    // Recalculate if stale or not found
    if (!quota || Date.now() - quota.lastChecked.getTime() > MIN_CHECK_INTERVAL_MS) {
        quota = await checkStorageQuota(docker, containerId, projectId, userId, tier);
    }
    const projectedUsage = quota.usedBytes + additionalBytes;
    if (projectedUsage > limits.storage) {
        const usedMB = Math.round(quota.usedBytes / (1024 * 1024));
        const limitMB = Math.round(limits.storage / (1024 * 1024));
        const suggestion = (0, tier_limits_js_1.getUpgradeSuggestion)(tier, 'storage');
        return {
            allowed: false,
            reason: `Storage limit exceeded: ${usedMB}MB used of ${limitMB}MB`,
            suggestedAction: suggestion ? 'upgrade' : 'cleanup',
            usage: {
                current: quota.usedBytes,
                limit: limits.storage,
                unit: 'bytes',
            },
        };
    }
    return {
        allowed: true,
        usage: {
            current: quota.usedBytes,
            limit: limits.storage,
            unit: 'bytes',
        },
    };
}
// ==================== Cleanup Functions ====================
/**
 * Clean up old/unused files to free storage
 */
async function cleanupStorage(docker, containerId, options = {}) {
    const { olderThanDays = 7, patterns = [], dryRun = false } = options;
    try {
        const container = docker.getContainer(containerId);
        // Default patterns to clean
        const cleanPatterns = [
            '*.log',
            '*.tmp',
            '.cache',
            'coverage',
            'dist',
            '.next/cache',
            ...patterns,
        ];
        // Build find commands
        const findCommands = cleanPatterns.map(p => `find /workspace -name "${p}" -type f -mtime +${olderThanDays} 2>/dev/null`).join('; ');
        // First, calculate what would be cleaned
        const sizeExec = await container.exec({
            Cmd: [
                'sh', '-c',
                `(${findCommands}) | xargs -r du -cb 2>/dev/null | tail -1 | awk '{print $1}'`,
            ],
            AttachStdout: true,
            AttachStderr: true,
        });
        const sizeStream = await sizeExec.start({ Detach: false });
        const sizeOutput = await collectStreamOutput(sizeStream);
        const potentialFreed = parseInt(sizeOutput.trim(), 10) || 0;
        if (dryRun) {
            return {
                success: true,
                freedBytes: potentialFreed,
                filesRemoved: 0,
                message: `Dry run: would free ${Math.round(potentialFreed / 1024)}KB`,
            };
        }
        // Actually remove the files
        const removeExec = await container.exec({
            Cmd: [
                'sh', '-c',
                `(${findCommands}) | xargs -r rm -rf 2>/dev/null; echo $?`,
            ],
            AttachStdout: true,
            AttachStderr: true,
        });
        await removeExec.start({ Detach: false });
        console.log(`[StorageQuota] Cleaned up ${Math.round(potentialFreed / 1024)}KB for container ${containerId.slice(0, 12)}`);
        return {
            success: true,
            freedBytes: potentialFreed,
            filesRemoved: 0, // Would need more complex parsing to count
            message: `Cleaned up ${Math.round(potentialFreed / 1024)}KB of old files`,
        };
    }
    catch (error) {
        console.error(`[StorageQuota] Cleanup failed: ${error.message}`);
        return {
            success: false,
            freedBytes: 0,
            filesRemoved: 0,
            message: `Cleanup failed: ${error.message}`,
        };
    }
}
/**
 * Clean npm/pnpm cache to free storage
 */
async function cleanupNpmCache(docker, containerId) {
    try {
        const container = docker.getContainer(containerId);
        // Get cache size before
        const beforeExec = await container.exec({
            Cmd: ['sh', '-c', 'du -sb /root/.npm /root/.pnpm-store 2>/dev/null | awk \'{sum+=$1} END {print sum}\''],
            AttachStdout: true,
            AttachStderr: true,
        });
        const beforeStream = await beforeExec.start({ Detach: false });
        const beforeOutput = await collectStreamOutput(beforeStream);
        const beforeSize = parseInt(beforeOutput.trim(), 10) || 0;
        // Clean caches
        const cleanExec = await container.exec({
            Cmd: ['sh', '-c', 'npm cache clean --force 2>/dev/null; pnpm store prune 2>/dev/null || true'],
            AttachStdout: true,
            AttachStderr: true,
        });
        await cleanExec.start({ Detach: false });
        // Get cache size after
        const afterExec = await container.exec({
            Cmd: ['sh', '-c', 'du -sb /root/.npm /root/.pnpm-store 2>/dev/null | awk \'{sum+=$1} END {print sum}\''],
            AttachStdout: true,
            AttachStderr: true,
        });
        const afterStream = await afterExec.start({ Detach: false });
        const afterOutput = await collectStreamOutput(afterStream);
        const afterSize = parseInt(afterOutput.trim(), 10) || 0;
        const freedBytes = Math.max(0, beforeSize - afterSize);
        return {
            success: true,
            freedBytes,
            message: `Cleaned npm cache, freed ${Math.round(freedBytes / 1024)}KB`,
        };
    }
    catch (error) {
        return {
            success: false,
            freedBytes: 0,
            message: `Failed to clean npm cache: ${error.message}`,
        };
    }
}
