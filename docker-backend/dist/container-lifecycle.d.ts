/**
 * Container Lifecycle Manager
 * Handles keep-alive, cleanup, and resource management for Docker containers
 */
export declare class ContainerLifecycleManager {
    private containers;
    private onCleanup?;
    private cleanupInterval?;
    constructor(containers: Map<string, any>);
    /**
     * Set callback for when a container needs to be cleaned up
     */
    setCleanupHandler(handler: (projectId: string, containerId: string) => Promise<void>): void;
    /**
     * Reset the idle timer for a container (called on user activity)
     */
    resetTimer(projectId: string): void;
    /**
     * Mark container as active (call on any user interaction)
     */
    markActive(projectId: string): void;
    /**
     * Get time remaining before container is considered idle
     */
    getIdleTimeRemaining(projectId: string): number;
    /**
     * Check if container should be kept alive
     */
    isActive(projectId: string): boolean;
    /**
     * Get all active container IDs
     */
    getActiveContainers(): string[];
    /**
     * Start periodic cleanup of idle containers
     */
    private startCleanupInterval;
    /**
     * Stop the lifecycle manager
     */
    stop(): void;
}
