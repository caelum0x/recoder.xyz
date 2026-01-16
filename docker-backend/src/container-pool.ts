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
  status: 'warming' | 'ready' | 'assigned';
}

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
  minSize: 3,
  maxSize: 10,
  imageName: 'recoder-workspace:latest',
  memoryLimit: 2 * 1024 * 1024 * 1024, // 2GB
  cpuQuota: 100000, // 100% of 1 CPU
  portRangeStart: 10000,
  portRangeEnd: 20000,
};

// External port allocator (set by server.ts to share port tracking)
type PortAllocator = () => Promise<{ preview: number; pty: number }>;
type PortReleaser = (port: number, ptyPort: number) => void;

class ContainerPool extends EventEmitter {
  private pool: PooledContainer[] = [];
  private config: PoolConfig;
  private isReplenishing = false;
  private replenishInterval?: ReturnType<typeof setInterval>;
  private initialized = false;
  
  // External port management (shared with server.ts)
  private externalPortAllocator?: PortAllocator;
  private externalPortReleaser?: PortReleaser;

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
   */
  async acquire(): Promise<PooledContainer | null> {
    // Try to get a ready container from pool
    const readyIndex = this.pool.findIndex(c => c.status === 'ready');
    
    if (readyIndex !== -1) {
      const container = this.pool[readyIndex];
      container.status = 'assigned';
      
      console.log(`[ContainerPool] Acquired container ${container.id.slice(0, 12)} from pool`);
      
      // Trigger background replenishment
      this.replenishPool();
      
      return container;
    }

    // No ready containers - create one on demand (cold start fallback)
    console.log('[ContainerPool] Pool empty, creating container on demand...');
    
    try {
      const container = await this.createContainer();
      container.status = 'assigned';
      return container;
    } catch (error: any) {
      console.error('[ContainerPool] Failed to create container:', error.message);
      return null;
    }
  }

  /**
   * Release a container back to pool or destroy it
   */
  async release(containerId: string, destroy = false): Promise<void> {
    const index = this.pool.findIndex(c => c.id === containerId);
    
    if (index === -1) {
      // Container not in pool, just stop it
      await this.destroyContainer(containerId);
      return;
    }

    const container = this.pool[index];
    
    if (destroy || this.pool.length > this.config.maxSize) {
      // Destroy container
      this.pool.splice(index, 1);
      // Release ports via external releaser if available
      if (this.externalPortReleaser) {
        this.externalPortReleaser(container.port, container.ptyPort);
      }
      await this.destroyContainer(containerId);
      console.log(`[ContainerPool] Destroyed container ${containerId.slice(0, 12)}`);
    } else {
      // Reset and return to pool
      await this.resetContainer(containerId);
      container.status = 'ready';
      console.log(`[ContainerPool] Returned container ${containerId.slice(0, 12)} to pool`);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): { total: number; ready: number; warming: number; assigned: number } {
    return {
      total: this.pool.length,
      ready: this.pool.filter(c => c.status === 'ready').length,
      warming: this.pool.filter(c => c.status === 'warming').length,
      assigned: this.pool.filter(c => c.status === 'assigned').length,
    };
  }

  /**
   * Warm up a new container and add to pool
   */
  private async warmContainer(): Promise<void> {
    try {
      console.log('[ContainerPool] Warming new container...');
      const container = await this.createContainer();
      container.status = 'ready';
      this.pool.push(container);
      console.log(`[ContainerPool] Warmed container ${container.id.slice(0, 12)}`);
      this.emit('container-ready', container);
    } catch (error: any) {
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
        PortBindings: {
          '3000/tcp': [{ HostPort: String(ports.preview) }],
          '5173/tcp': [{ HostPort: String(ports.preview + 1) }],
          '8080/tcp': [{ HostPort: String(ports.preview + 2) }],
          '9999/tcp': [{ HostPort: String(ports.pty) }],
        },
        SecurityOpt: ['no-new-privileges'],
        ReadonlyRootfs: false,
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
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    console.log('[ContainerPool] Shutting down...');
    
    if (this.replenishInterval) {
      clearInterval(this.replenishInterval);
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
