/**
 * Port Manager Module
 *
 * Centralized port management for Docker containers with:
 * - In-memory port tracking (authoritative after initial sync)
 * - Smart port allocation starting from base port
 * - Port caching per container with labels
 * - Port release on container deletion
 * - Fallback logic for port conflicts
 * - Port reassignment if container restarts
 * - Background re-sync with Docker every 5 minutes
 *
 * Performance: Port allocation is synchronous after startup.
 * The in-memory usedPorts set is the source of truth for the hot path.
 * Docker API and lsof checks are only used during initial/periodic sync
 * and the exported isPortAvailable() diagnostic endpoint.
 *
 * Inspired by december's docker.ts port management
 */
import Docker from 'dockerode';
declare const BASE_PORT: number;
declare const MAX_PORT: number;
declare const PORTS_PER_CONTAINER = 6;
declare const PROJECT_LABEL = "recoder";
/**
 * Initialize the port manager with Docker client
 */
export declare function initPortManager(dockerClient: Docker): void;
/**
 * Check if a specific port is available using lsof
 * This is more reliable than just checking our internal tracking
 */
export declare function isPortAvailable(port: number): Promise<boolean>;
/**
 * Find an available port starting from a base port.
 *
 * Uses the in-memory usedPorts set directly -- no Docker API or lsof calls.
 * The set is authoritative after the initial syncWithDocker() on startup.
 * A background (non-blocking) re-sync is triggered if >5 minutes since last sync.
 *
 * @param basePort - Starting port to search from (default: BASE_PORT)
 * @param maxAttempts - Maximum number of ports to check (default: 2500)
 * @returns The first available port, or throws if none found
 */
export declare function findAvailablePort(basePort?: number, maxAttempts?: number): number;
/**
 * Find an available port with OS-level verification.
 * Use this for critical operations where we need to be sure the port is truly free.
 *
 * @param basePort - Starting port to search from (default: BASE_PORT)
 * @param maxAttempts - Maximum number of ports to check (default: 100)
 * @returns The first available port, or throws if none found
 */
export declare function findAvailablePortWithVerification(basePort?: number, maxAttempts?: number): Promise<number>;
/**
 * Reserve a port block for a container
 *
 * @param port - The base port to reserve
 * @param containerId - The container ID to associate with this port
 */
export declare function reservePort(port: number, containerId: string): void;
/**
 * Mark a port block as unavailable (e.g., detected conflict with external process)
 * This avoids retrying the same blocked ports.
 */
export declare function markPortBlockUnavailable(port: number): void;
/**
 * Release ports when a container stops or is deleted
 *
 * @param port - The base port to release
 */
export declare function releasePort(port: number): void;
/**
 * Release ports by container ID
 *
 * @param containerId - The container ID whose ports should be released
 */
export declare function releasePortsByContainer(containerId: string): void;
/**
 * Get the port for a specific container
 *
 * @param containerId - The container ID to look up
 * @returns The port info or undefined if not found
 */
export declare function getContainerPort(containerId: string): {
    preview: number;
    pty: number;
} | undefined;
/**
 * Get container ID by port
 *
 * @param port - The port to look up
 * @returns The container ID or undefined if not found
 */
export declare function getContainerByPort(port: number): string | undefined;
/**
 * Allocate a full port block for a container
 * This combines findAvailablePort and reservePort
 *
 * @param containerId - Optional container ID to associate
 * @returns The allocated port block
 */
export declare function allocatePortBlock(containerId?: string): {
    preview: number;
    pty: number;
};
/**
 * Allocate a full port block with OS-level verification.
 * Use this for production container creation.
 *
 * @param containerId - Optional container ID to associate
 * @returns The allocated port block
 */
export declare function allocatePortBlockWithVerification(containerId?: string): Promise<{
    preview: number;
    pty: number;
}>;
/**
 * Try to reclaim a previously assigned port for a restarting container
 * Returns the port if available, or allocates a new one if not
 *
 * @param containerId - The container being restarted
 * @param previousPort - The port the container had before
 * @returns The port to use (may be the same or different)
 */
export declare function reassignPortForRestart(containerId: string, previousPort: number): {
    preview: number;
    pty: number;
    changed: boolean;
};
/**
 * Sync internal state with actual Docker containers
 * Call this on startup to recover from crashes
 */
export declare function syncWithDocker(): Promise<void>;
/**
 * Scan for all ports in our range that are already in use by any process
 * This prevents port conflicts with orphaned containers or other processes
 */
export declare function scanAndMarkUsedPorts(): Promise<number>;
/**
 * Get statistics about port usage
 */
export declare function getPortStats(): {
    usedPortCount: number;
    containerCount: number;
    usedPorts: number[];
    portRange: {
        min: number;
        max: number;
    };
};
/**
 * Create Docker labels for port tracking
 * Use these labels when creating containers
 */
export declare function createPortLabels(port: number): Record<string, string>;
export { BASE_PORT, MAX_PORT, PORTS_PER_CONTAINER, PROJECT_LABEL };
