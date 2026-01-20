/**
 * Container Pool Manager
 * Pre-warms Docker containers for instant project creation
 * Reduces cold start from ~5-10s to ~100ms
 */

import Docker from 'dockerode';
import { EventEmitter } from 'events';

const docker = new Docker();

export interface PooledContainer {
  id: string;
  port: number;
  ptyPort: number;
  createdAt: number;
  lastUsedAt?: number;
  recycleCount: number;
  status: 'warming' | 'ready' | 'assigned';
}

// Recycling configuration
const RECYCLE_CONFIG = {
  maxRecycles: Number(process.env.CONTAINER_MAX_RECYCLES) || 10,  // Max times to recycle before destroy
  maxAgeMs: Number(process.env.CONTAINER_MAX_AGE_MS) || 2 * 60 * 60 * 1000,  // 2 hours max age
  staleTimeoutMs: Number(process.env.CONTAINER_STALE_TIMEOUT_MS) || 30 * 60 * 1000,  // 30 min idle timeout
  healthCheckTimeoutMs: 5000,  // 5 second health check timeout
};

// ==================== PERFORMANCE METRICS ====================
// Tracks container pool performance for monitoring and optimization

export interface PoolMetrics {
  // Timing metrics
  avgAcquireTimeMs: number;
  avgWarmTimeMs: number;
  avgRecycleTimeMs: number;
  avgHealthCheckTimeMs: number;

  // Success rates
  poolHitRate: number;  // % of acquires served from pool
  recycleSuccessRate: number;  // % of recycles that passed health check

  // Counts
  totalAcquires: number;
  poolHits: number;
  poolMisses: number;
  totalRecycles: number;
  recycleSuccesses: number;
  recycleFailures: number;
  totalWarms: number;
  warmFailures: number;

  // Current state
  currentPoolSize: number;
  readyContainers: number;
  warmingContainers: number;
  assignedContainers: number;

  // Timestamps
  lastAcquireTime: number;
  lastWarmTime: number;
  uptime: number;
}

class MetricsCollector {
  private startTime = Date.now();

  // Timing samples (rolling window of last 100)
  private acquireTimes: number[] = [];
  private warmTimes: number[] = [];
  private recycleTimes: number[] = [];
  private healthCheckTimes: number[] = [];

  // Counters
  totalAcquires = 0;
  poolHits = 0;
  poolMisses = 0;
  totalRecycles = 0;
  recycleSuccesses = 0;
  recycleFailures = 0;
  totalWarms = 0;
  warmFailures = 0;

  lastAcquireTime = 0;
  lastWarmTime = 0;

  private addSample(arr: number[], value: number, maxSize = 100): void {
    arr.push(value);
    if (arr.length > maxSize) arr.shift();
  }

  private avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  recordAcquire(durationMs: number, fromPool: boolean): void {
    this.addSample(this.acquireTimes, durationMs);
    this.totalAcquires++;
    this.lastAcquireTime = Date.now();
    if (fromPool) {
      this.poolHits++;
    } else {
      this.poolMisses++;
    }
  }

  recordWarm(durationMs: number, success: boolean): void {
    this.addSample(this.warmTimes, durationMs);
    this.totalWarms++;
    this.lastWarmTime = Date.now();
    if (!success) this.warmFailures++;
  }

  recordRecycle(durationMs: number, success: boolean): void {
    this.addSample(this.recycleTimes, durationMs);
    this.totalRecycles++;
    if (success) {
      this.recycleSuccesses++;
    } else {
      this.recycleFailures++;
    }
  }

  recordHealthCheck(durationMs: number): void {
    this.addSample(this.healthCheckTimes, durationMs);
  }

  getMetrics(poolState: { total: number; ready: number; warming: number; assigned: number }): PoolMetrics {
    return {
      avgAcquireTimeMs: Math.round(this.avg(this.acquireTimes)),
      avgWarmTimeMs: Math.round(this.avg(this.warmTimes)),
      avgRecycleTimeMs: Math.round(this.avg(this.recycleTimes)),
      avgHealthCheckTimeMs: Math.round(this.avg(this.healthCheckTimes)),

      poolHitRate: this.totalAcquires > 0
        ? Math.round((this.poolHits / this.totalAcquires) * 100)
        : 0,
      recycleSuccessRate: this.totalRecycles > 0
        ? Math.round((this.recycleSuccesses / this.totalRecycles) * 100)
        : 0,

      totalAcquires: this.totalAcquires,
      poolHits: this.poolHits,
      poolMisses: this.poolMisses,
      totalRecycles: this.totalRecycles,
      recycleSuccesses: this.recycleSuccesses,
      recycleFailures: this.recycleFailures,
      totalWarms: this.totalWarms,
      warmFailures: this.warmFailures,

      currentPoolSize: poolState.total,
      readyContainers: poolState.ready,
      warmingContainers: poolState.warming,
      assignedContainers: poolState.assigned,

      lastAcquireTime: this.lastAcquireTime,
      lastWarmTime: this.lastWarmTime,
      uptime: Date.now() - this.startTime,
    };
  }

  reset(): void {
    this.acquireTimes = [];
    this.warmTimes = [];
    this.recycleTimes = [];
    this.healthCheckTimes = [];
    this.totalAcquires = 0;
    this.poolHits = 0;
    this.poolMisses = 0;
    this.totalRecycles = 0;
    this.recycleSuccesses = 0;
    this.recycleFailures = 0;
    this.totalWarms = 0;
    this.warmFailures = 0;
  }
}

// ==================== END METRICS ====================

export interface PoolConfig {
  minSize: number;        // Minimum containers to keep warm
  maxSize: number;        // Maximum pool size
  imageName: string;      // Docker image name
  memoryLimit: number;    // Memory limit in bytes
  cpuQuota: number;       // CPU quota
  portRangeStart: number; // Start of port range
  portRangeEnd: number;   // End of port range
}

const DEFAULT_CONFIG: PoolConfig = {
  minSize: Number(process.env.CONTAINER_POOL_MIN_SIZE) || 10,  // Pre-warm 10 containers for production
  maxSize: Number(process.env.CONTAINER_POOL_MAX_SIZE) || 25,  // Allow up to 25 containers
  imageName: process.env.CONTAINER_IMAGE || 'recoder-workspace:latest',
  memoryLimit: Number(process.env.CONTAINER_MEMORY_LIMIT) || 2 * 1024 * 1024 * 1024, // 2GB
  cpuQuota: Number(process.env.CONTAINER_CPU_QUOTA) || 100000, // 100% of 1 CPU
  portRangeStart: Number(process.env.CONTAINER_PORT_START) || 10000,
  portRangeEnd: Number(process.env.CONTAINER_PORT_END) || 20000,
};

// External port allocator (set by server.ts to share port tracking)
type PortAllocator = () => Promise<{ preview: number; pty: number }>;
type PortReleaser = (port: number, ptyPort: number) => void;

class ContainerPool extends EventEmitter {
  private pool: PooledContainer[] = [];
  private config: PoolConfig;
  private isReplenishing = false;
  private replenishInterval?: ReturnType<typeof setInterval>;
  private staleCleanupInterval?: ReturnType<typeof setInterval>;
  private initialized = false;

  // External port management (shared with server.ts)
  private externalPortAllocator?: PortAllocator;
  private externalPortReleaser?: PortReleaser;

  // Performance metrics collector
  private metrics = new MetricsCollector();

  constructor(config: Partial<PoolConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set external port allocator/releaser to share with server.ts
   * This prevents port conflicts between pool and on-demand containers
   */
  setPortManager(allocator: PortAllocator, releaser: PortReleaser) {
    this.externalPortAllocator = allocator;
    this.externalPortReleaser = releaser;
  }

  /**
   * Initialize the pool with pre-warmed containers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log(`[ContainerPool] Initializing pool with ${this.config.minSize} containers...`);
    
    // Pre-warm containers
    const warmPromises: Promise<void>[] = [];
    for (let i = 0; i < this.config.minSize; i++) {
      warmPromises.push(this.warmContainer());
    }

    await Promise.allSettled(warmPromises);
    
    // Start background replenishment
    this.startReplenishInterval();
    
    this.initialized = true;
    console.log(`[ContainerPool] Pool ready with ${this.pool.filter(c => c.status === 'ready').length} containers`);
  }

  /**
   * Get a container from the pool (instant) or create new one (fallback)
   * PERFORMANCE: Pool hits ~100ms vs cold start ~5-10s
   */
  async acquire(): Promise<PooledContainer | null> {
    const startTime = Date.now();

    // Try to get a ready container from pool
    const readyIndex = this.pool.findIndex(c => c.status === 'ready');

    if (readyIndex !== -1) {
      const container = this.pool[readyIndex];
      container.status = 'assigned';

      const duration = Date.now() - startTime;
      this.metrics.recordAcquire(duration, true);  // Pool hit

      console.log(`[ContainerPool] Acquired container ${container.id.slice(0, 12)} from pool (${duration}ms)`);

      // Trigger background replenishment
      this.replenishPool();

      return container;
    }

    // No ready containers - create one on demand (cold start fallback)
    console.log('[ContainerPool] Pool empty, creating container on demand...');

    try {
      const container = await this.createContainer();
      container.status = 'assigned';

      const duration = Date.now() - startTime;
      this.metrics.recordAcquire(duration, false);  // Pool miss (cold start)

      console.log(`[ContainerPool] Created container on demand ${container.id.slice(0, 12)} (${duration}ms - cold start)`);

      return container;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.metrics.recordAcquire(duration, false);

      console.error('[ContainerPool] Failed to create container:', error.message);
      return null;
    }
  }

  /**
   * Release a container back to pool or destroy it
   * Uses smart recycling: health check, age check, recycle count check
   */
  async release(containerId: string, destroy = false): Promise<void> {
    const index = this.pool.findIndex(c => c.id === containerId);

    if (index === -1) {
      // Container not in pool, just stop it
      await this.destroyContainer(containerId);
      return;
    }

    const container = this.pool[index];
    const now = Date.now();

    // Determine if container should be destroyed vs recycled
    const shouldDestroy =
      destroy ||
      this.pool.length > this.config.maxSize ||
      container.recycleCount >= RECYCLE_CONFIG.maxRecycles ||
      (now - container.createdAt) > RECYCLE_CONFIG.maxAgeMs;

    if (shouldDestroy) {
      // Destroy container
      this.pool.splice(index, 1);
      // Release ports via external releaser if available
      if (this.externalPortReleaser) {
        this.externalPortReleaser(container.port, container.ptyPort);
      }
      await this.destroyContainer(containerId);
      const reason = destroy ? 'explicit' :
        container.recycleCount >= RECYCLE_CONFIG.maxRecycles ? 'max-recycles' :
        (now - container.createdAt) > RECYCLE_CONFIG.maxAgeMs ? 'max-age' : 'pool-full';
      console.log(`[ContainerPool] Destroyed container ${containerId.slice(0, 12)} (${reason})`);
    } else {
      // Try to recycle container
      const recycled = await this.tryRecycleContainer(container);

      if (recycled) {
        container.status = 'ready';
        container.lastUsedAt = now;
        container.recycleCount++;
        console.log(`[ContainerPool] Recycled container ${containerId.slice(0, 12)} (recycle #${container.recycleCount})`);
      } else {
        // Health check failed, destroy instead
        this.pool.splice(index, 1);
        if (this.externalPortReleaser) {
          this.externalPortReleaser(container.port, container.ptyPort);
        }
        await this.destroyContainer(containerId);
        console.log(`[ContainerPool] Destroyed unhealthy container ${containerId.slice(0, 12)}`);
      }
    }
  }

  /**
   * Try to recycle a container (reset + health check)
   * PERFORMANCE: Recycling ~500ms vs new container ~5s
   */
  private async tryRecycleContainer(pooledContainer: PooledContainer): Promise<boolean> {
    const startTime = Date.now();
    try {
      // Reset the container
      await this.resetContainer(pooledContainer.id);

      // Health check: verify container is responsive
      const isHealthy = await this.healthCheck(pooledContainer.id);

      const duration = Date.now() - startTime;
      this.metrics.recordRecycle(duration, isHealthy);

      return isHealthy;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.metrics.recordRecycle(duration, false);

      console.error(`[ContainerPool] Recycle failed for ${pooledContainer.id.slice(0, 12)}:`, error.message);
      return false;
    }
  }

  /**
   * Health check: verify container is responsive
   * PERFORMANCE: Fast health checks prevent recycling bad containers
   */
  private async healthCheck(containerId: string): Promise<boolean> {
    const startTime = Date.now();
    try {
      const container = docker.getContainer(containerId);

      // Check container is running
      const info = await container.inspect();
      if (!info.State.Running) {
        this.metrics.recordHealthCheck(Date.now() - startTime);
        return false;
      }

      // Run a simple command to verify responsiveness
      const exec = await container.exec({
        Cmd: ['echo', 'health-check'],
        AttachStdout: true,
        AttachStderr: true,
      });

      // Execute with timeout
      const result = await Promise.race([
        exec.start({ Detach: false }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), RECYCLE_CONFIG.healthCheckTimeoutMs)
        ),
      ]);

      this.metrics.recordHealthCheck(Date.now() - startTime);
      return true;
    } catch (error: any) {
      this.metrics.recordHealthCheck(Date.now() - startTime);
      console.error(`[ContainerPool] Health check failed for ${containerId.slice(0, 12)}:`, error.message);
      return false;
    }
  }

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
  } {
    const now = Date.now();
    const readyContainers = this.pool.filter(c => c.status === 'ready');

    const avgRecycleCount = this.pool.length > 0
      ? this.pool.reduce((sum, c) => sum + c.recycleCount, 0) / this.pool.length
      : 0;

    const avgAgeMinutes = this.pool.length > 0
      ? this.pool.reduce((sum, c) => sum + (now - c.createdAt), 0) / this.pool.length / 1000 / 60
      : 0;

    return {
      total: this.pool.length,
      ready: readyContainers.length,
      warming: this.pool.filter(c => c.status === 'warming').length,
      assigned: this.pool.filter(c => c.status === 'assigned').length,
      avgRecycleCount: Math.round(avgRecycleCount * 10) / 10,
      avgAgeMinutes: Math.round(avgAgeMinutes * 10) / 10,
      config: RECYCLE_CONFIG,
    };
  }

  /**
   * Get detailed performance metrics
   * PERFORMANCE: Use this to monitor pool efficiency
   */
  getMetrics(): PoolMetrics {
    const poolState = {
      total: this.pool.length,
      ready: this.pool.filter(c => c.status === 'ready').length,
      warming: this.pool.filter(c => c.status === 'warming').length,
      assigned: this.pool.filter(c => c.status === 'assigned').length,
    };
    return this.metrics.getMetrics(poolState);
  }

  /**
   * Reset metrics (useful for testing or periodic reset)
   */
  resetMetrics(): void {
    this.metrics.reset();
  }

  /**
   * Warm up a new container and add to pool
   * PERFORMANCE: Pre-warming reduces cold starts from ~5-10s to ~100ms
   */
  private async warmContainer(): Promise<void> {
    const startTime = Date.now();
    try {
      console.log('[ContainerPool] Warming new container...');
      const container = await this.createContainer();
      container.status = 'ready';
      this.pool.push(container);

      const duration = Date.now() - startTime;
      this.metrics.recordWarm(duration, true);

      console.log(`[ContainerPool] Warmed container ${container.id.slice(0, 12)} (${duration}ms)`);
      this.emit('container-ready', container);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.metrics.recordWarm(duration, false);

      console.error('[ContainerPool] Failed to warm container:', error.message);
      console.error('[ContainerPool] Full error:', error);
    }
  }

  /**
   * Create a new Docker container
   */
  private async createContainer(): Promise<PooledContainer> {
    console.log('[ContainerPool] Allocating ports...');
    const ports = await this.allocatePorts();
    console.log(`[ContainerPool] Ports allocated: preview=${ports.preview}, pty=${ports.pty}`);

    console.log(`[ContainerPool] Creating container with image: ${this.config.imageName}`);
    const container = await docker.createContainer({
      Image: this.config.imageName,
      Tty: true,
      OpenStdin: true,
      WorkingDir: '/workspace',
      Env: [
        'TERM=xterm-256color',
        'COLORTERM=truecolor',
        'FORCE_COLOR=1',
        `PORT=${ports.preview}`,
        `PTY_PORT=${ports.pty}`,
      ],
      HostConfig: {
        Memory: this.config.memoryLimit,
        CpuQuota: this.config.cpuQuota,
        CpuPeriod: 100000,
        PortBindings: {
          '3000/tcp': [{ HostPort: String(ports.preview) }],
          '5173/tcp': [{ HostPort: String(ports.preview + 1) }],
          '8080/tcp': [{ HostPort: String(ports.preview + 2) }],
          '9999/tcp': [{ HostPort: String(ports.pty) }],
        },
        // Security hardening options
        SecurityOpt: ['no-new-privileges', 'seccomp=unconfined'],
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE', 'FOWNER', 'NET_BIND_SERVICE'],
        ReadonlyRootfs: false,
        PidsLimit: 256,
        Ulimits: [
          { Name: 'nofile', Soft: 4096, Hard: 8192 },
          { Name: 'nproc', Soft: 128, Hard: 256 },
        ],
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=512m',
        },
      },
      ExposedPorts: {
        '3000/tcp': {},
        '5173/tcp': {},
        '8080/tcp': {},
        '9999/tcp': {},
      },
    });

    console.log(`[ContainerPool] Container created: ${container.id.slice(0, 12)}, starting...`);
    await container.start();
    console.log(`[ContainerPool] Container started: ${container.id.slice(0, 12)}`);

    return {
      id: container.id,
      port: ports.preview,
      ptyPort: ports.pty,
      createdAt: Date.now(),
      recycleCount: 0,
      status: 'warming',
    };
  }

  /**
   * Reset a container for reuse (clear workspace, reset state)
   */
  private async resetContainer(containerId: string): Promise<void> {
    try {
      const container = docker.getContainer(containerId);
      
      // Clear workspace
      const exec = await container.exec({
        Cmd: ['sh', '-c', 'rm -rf /workspace/* /workspace/.[!.]* 2>/dev/null || true'],
        AttachStdout: true,
        AttachStderr: true,
      });
      
      await exec.start({ Detach: false });
      
      // Kill any running processes (dev servers, etc.)
      const killExec = await container.exec({
        Cmd: ['sh', '-c', 'pkill -9 node; pkill -9 npm; pkill -9 bun || true'],
        AttachStdout: true,
        AttachStderr: true,
      });
      
      await killExec.start({ Detach: false });
    } catch (error: any) {
      console.error(`[ContainerPool] Reset failed for ${containerId}:`, error.message);
      throw error;
    }
  }

  /**
   * Destroy a container
   */
  private async destroyContainer(containerId: string): Promise<void> {
    try {
      const container = docker.getContainer(containerId);
      await container.stop({ t: 5 }).catch(() => {});
      await container.remove({ force: true });
    } catch (error: any) {
      console.error(`[ContainerPool] Destroy failed for ${containerId}:`, error.message);
    }
  }

  /**
   * Allocate ports for a container (uses external allocator if set)
   */
  private async allocatePorts(): Promise<{ preview: number; pty: number }> {
    // Use external allocator if available (shared with server.ts)
    if (this.externalPortAllocator) {
      return this.externalPortAllocator();
    }
    
    // Fallback: standalone port allocation
    const dockerContainers = await docker.listContainers({ all: true });
    const usedPorts = new Set<number>();
    
    // Collect used ports from Docker
    for (const c of dockerContainers) {
      for (const p of c.Ports || []) {
        if (p.PublicPort) {
          usedPorts.add(p.PublicPort);
        }
      }
    }
    
    // Find free port range (need 4 consecutive ports)
    for (let port = this.config.portRangeStart; port < this.config.portRangeEnd; port += 4) {
      const portsNeeded = [port, port + 1, port + 2, port + 3];
      const allFree = portsNeeded.every(p => !usedPorts.has(p));
      
      if (allFree) {
        return {
          preview: port,
          pty: port + 3,
        };
      }
    }
    
    throw new Error('No free ports available');
  }

  /**
   * Replenish pool to minimum size
   */
  private async replenishPool(): Promise<void> {
    if (this.isReplenishing) return;
    
    const readyCount = this.pool.filter(c => c.status === 'ready').length;
    const needed = this.config.minSize - readyCount;
    
    if (needed <= 0) return;
    
    this.isReplenishing = true;
    console.log(`[ContainerPool] Replenishing ${needed} containers...`);
    
    try {
      const promises: Promise<void>[] = [];
      for (let i = 0; i < needed; i++) {
        promises.push(this.warmContainer());
      }
      await Promise.allSettled(promises);
    } finally {
      this.isReplenishing = false;
    }
  }

  /**
   * Start background replenishment interval
   */
  private startReplenishInterval(): void {
    // Check every 30 seconds
    this.replenishInterval = setInterval(() => {
      this.replenishPool();
    }, 30000);

    // Start stale container cleanup (every 5 minutes)
    this.staleCleanupInterval = setInterval(() => {
      this.cleanupStaleContainers();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up stale containers that have been idle too long
   */
  private async cleanupStaleContainers(): Promise<void> {
    const now = Date.now();
    const staleContainers = this.pool.filter(c =>
      c.status === 'ready' &&
      c.lastUsedAt &&
      (now - c.lastUsedAt) > RECYCLE_CONFIG.staleTimeoutMs
    );

    if (staleContainers.length === 0) return;

    console.log(`[ContainerPool] Cleaning up ${staleContainers.length} stale containers...`);

    for (const container of staleContainers) {
      const index = this.pool.findIndex(c => c.id === container.id);
      if (index !== -1) {
        this.pool.splice(index, 1);
        if (this.externalPortReleaser) {
          this.externalPortReleaser(container.port, container.ptyPort);
        }
        await this.destroyContainer(container.id);
        console.log(`[ContainerPool] Removed stale container ${container.id.slice(0, 12)} (idle ${Math.round((now - (container.lastUsedAt || now)) / 1000 / 60)}min)`);
      }
    }

    // Replenish if we dropped below minimum
    this.replenishPool();
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    console.log('[ContainerPool] Shutting down...');

    if (this.replenishInterval) {
      clearInterval(this.replenishInterval);
    }

    if (this.staleCleanupInterval) {
      clearInterval(this.staleCleanupInterval);
    }

    // Release ports and destroy all pooled containers
    for (const container of this.pool) {
      if (this.externalPortReleaser) {
        this.externalPortReleaser(container.port, container.ptyPort);
      }
      await this.destroyContainer(container.id).catch(() => {});
    }
    
    this.pool = [];
    this.initialized = false;
    
    console.log('[ContainerPool] Shutdown complete');
  }
}

// Singleton instance
export const containerPool = new ContainerPool();

export default ContainerPool;
