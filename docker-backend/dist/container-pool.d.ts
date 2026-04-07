/**
 * Container Pool Manager
 * Pre-warms Docker containers for instant project creation
 * Reduces cold start from ~5-10s to ~100ms
 */
import { EventEmitter } from 'events';
export interface PooledContainer {
    id: string;
    port: number;
    ptyPort: number;
    createdAt: number;
    lastUsedAt?: number;
    recycleCount: number;
    status: 'warming' | 'ready' | 'assigned';
}
declare const RECYCLE_CONFIG: {
    maxRecycles: number;
    maxAgeMs: number;
    staleTimeoutMs: number;
    healthCheckTimeoutMs: number;
};
export interface PoolMetrics {
    avgAcquireTimeMs: number;
    avgWarmTimeMs: number;
    avgRecycleTimeMs: number;
    avgHealthCheckTimeMs: number;
    poolHitRate: number;
    recycleSuccessRate: number;
    totalAcquires: number;
    poolHits: number;
    poolMisses: number;
    totalRecycles: number;
    recycleSuccesses: number;
    recycleFailures: number;
    totalWarms: number;
    warmFailures: number;
    currentPoolSize: number;
    readyContainers: number;
    warmingContainers: number;
    assignedContainers: number;
    lastAcquireTime: number;
    lastWarmTime: number;
    uptime: number;
}
export interface PoolConfig {
    minSize: number;
    maxSize: number;
    imageName: string;
    memoryLimit: number;
    cpuQuota: number;
    portRangeStart: number;
    portRangeEnd: number;
}
type PortAllocator = () => Promise<{
    preview: number;
    pty: number;
}>;
type PortReleaser = (port: number, ptyPort: number) => void;
declare class ContainerPool extends EventEmitter {
    private pool;
    private config;
    private isReplenishing;
    private replenishInterval?;
    private staleCleanupInterval?;
    private initialized;
    private externalPortAllocator?;
    private externalPortReleaser?;
    private metrics;
    constructor(config?: Partial<PoolConfig>);
    /**
     * Set external port allocator/releaser to share with server.ts
     * This prevents port conflicts between pool and on-demand containers
     */
    setPortManager(allocator: PortAllocator, releaser: PortReleaser): void;
    /**
     * Initialize the pool with pre-warmed containers
     */
    initialize(): Promise<void>;
    /**
     * Get a container from the pool (instant) or create new one (fallback)
     * PERFORMANCE: Pool hits ~100ms vs cold start ~5-10s
     */
    acquire(): Promise<PooledContainer | null>;
    /**
     * Release a container back to pool or destroy it
     * Uses smart recycling: health check, age check, recycle count check
     */
    release(containerId: string, destroy?: boolean): Promise<void>;
    /**
     * Try to recycle a container (reset + health check)
     * PERFORMANCE: Recycling ~500ms vs new container ~5s
     */
    private tryRecycleContainer;
    /**
     * Health check: verify container is responsive
     * PERFORMANCE: Fast health checks prevent recycling bad containers
     */
    private healthCheck;
    /**
     * Get pool statistics including recycling metrics
     */
    getStats(): {
        total: number;
        ready: number;
        warming: number;
        assigned: number;
        avgRecycleCount: number;
        avgAgeMinutes: number;
        config: typeof RECYCLE_CONFIG;
    };
    /**
     * Get detailed performance metrics
     * PERFORMANCE: Use this to monitor pool efficiency
     */
    getMetrics(): PoolMetrics;
    /**
     * Reset metrics (useful for testing or periodic reset)
     */
    resetMetrics(): void;
    /**
     * Warm up a new container and add to pool
     * PERFORMANCE: Pre-warming reduces cold starts from ~5-10s to ~100ms
     */
    private warmContainer;
    /**
     * Create a new Docker container
     */
    private createContainer;
    /**
     * Reset a container for reuse (clear workspace, reset state)
     */
    private resetContainer;
    /**
     * Destroy a container
     */
    private destroyContainer;
    /**
     * Allocate ports for a container (uses external allocator if set)
     */
    private allocatePorts;
    /**
     * Replenish pool to minimum size
     */
    private replenishPool;
    /**
     * Start background replenishment interval
     */
    private startReplenishInterval;
    /**
     * Clean up stale containers that have been idle too long
     */
    private cleanupStaleContainers;
    /**
     * Shutdown the pool
     */
    shutdown(): Promise<void>;
}
export declare const containerPool: ContainerPool;
export default ContainerPool;
