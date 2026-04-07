"use strict";
/**
 * Container Lifecycle Manager
 * Handles keep-alive, cleanup, and resource management for Docker containers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContainerLifecycleManager = void 0;
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const RESET_INTERVAL = 5 * 60 * 1000; // 5 minutes - reset timer more frequently
class ContainerLifecycleManager {
    containers;
    onCleanup;
    cleanupInterval;
    constructor(containers) {
        this.containers = containers;
        this.startCleanupInterval();
    }
    /**
     * Set callback for when a container needs to be cleaned up
     */
    setCleanupHandler(handler) {
        this.onCleanup = handler;
    }
    /**
     * Reset the idle timer for a container (called on user activity)
     */
    resetTimer(projectId) {
        const entry = this.containers.get(projectId);
        if (!entry)
            return;
        entry.lastActive = Date.now();
        // Clear existing timer
        if (entry.resetTimer) {
            clearTimeout(entry.resetTimer);
        }
        // Set new timer
        entry.resetTimer = setTimeout(async () => {
            console.log(`[Lifecycle] Container idle timeout: ${projectId}`);
            if (this.onCleanup) {
                await this.onCleanup(projectId, entry.id);
            }
        }, IDLE_TIMEOUT);
        console.log(`[Lifecycle] Timer reset for ${projectId}`);
    }
    /**
     * Mark container as active (call on any user interaction)
     */
    markActive(projectId) {
        const entry = this.containers.get(projectId);
        if (entry) {
            entry.lastActive = Date.now();
        }
    }
    /**
     * Get time remaining before container is considered idle
     */
    getIdleTimeRemaining(projectId) {
        const entry = this.containers.get(projectId);
        if (!entry)
            return 0;
        const elapsed = Date.now() - entry.lastActive;
        return Math.max(0, IDLE_TIMEOUT - elapsed);
    }
    /**
     * Check if container should be kept alive
     */
    isActive(projectId) {
        const entry = this.containers.get(projectId);
        if (!entry)
            return false;
        return Date.now() - entry.lastActive < IDLE_TIMEOUT;
    }
    /**
     * Get all active container IDs
     */
    getActiveContainers() {
        const active = [];
        for (const [projectId, entry] of this.containers) {
            if (this.isActive(projectId)) {
                active.push(projectId);
            }
        }
        return active;
    }
    /**
     * Start periodic cleanup of idle containers
     */
    startCleanupInterval() {
        this.cleanupInterval = setInterval(async () => {
            const now = Date.now();
            const toCleanup = [];
            for (const [projectId, entry] of this.containers) {
                if (now - entry.lastActive > IDLE_TIMEOUT) {
                    toCleanup.push(projectId);
                }
            }
            for (const projectId of toCleanup) {
                const entry = this.containers.get(projectId);
                if (entry && this.onCleanup) {
                    console.log(`[Lifecycle] Cleaning up idle container: ${projectId}`);
                    try {
                        await this.onCleanup(projectId, entry.id);
                    }
                    catch (error) {
                        console.error(`[Lifecycle] Cleanup failed for ${projectId}:`, error.message);
                    }
                }
            }
        }, 60000); // Check every minute
    }
    /**
     * Stop the lifecycle manager
     */
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        // Clear all reset timers
        for (const entry of this.containers.values()) {
            if (entry.resetTimer) {
                clearTimeout(entry.resetTimer);
            }
        }
    }
}
exports.ContainerLifecycleManager = ContainerLifecycleManager;
