/**
 * Container Lifecycle Manager
 * Handles keep-alive, cleanup, and resource management for Docker containers
 */

interface ContainerEntry {
  id: string;
  projectId: string;
  lastActive: number;
  port: number;
  ptyPort: number;
  backgroundDev?: boolean;
  resetTimer?: ReturnType<typeof setTimeout>;
}

const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const RESET_INTERVAL = 5 * 60 * 1000; // 5 minutes - reset timer more frequently

export class ContainerLifecycleManager {
  private containers: Map<string, ContainerEntry>;
  private onCleanup?: (projectId: string, containerId: string) => Promise<void>;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(containers: Map<string, any>) {
    this.containers = containers;
    this.startCleanupInterval();
  }

  /**
   * Set callback for when a container needs to be cleaned up
   */
  setCleanupHandler(handler: (projectId: string, containerId: string) => Promise<void>) {
    this.onCleanup = handler;
  }

  /**
   * Reset the idle timer for a container (called on user activity)
   */
  resetTimer(projectId: string) {
    const entry = this.containers.get(projectId);
    if (!entry) return;

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
  markActive(projectId: string) {
    const entry = this.containers.get(projectId);
    if (entry) {
      entry.lastActive = Date.now();
    }
  }

  /**
   * Get time remaining before container is considered idle
   */
  getIdleTimeRemaining(projectId: string): number {
    const entry = this.containers.get(projectId);
    if (!entry) return 0;

    const elapsed = Date.now() - entry.lastActive;
    return Math.max(0, IDLE_TIMEOUT - elapsed);
  }

  /**
   * Check if container should be kept alive
   */
  isActive(projectId: string): boolean {
    const entry = this.containers.get(projectId);
    if (!entry) return false;

    return Date.now() - entry.lastActive < IDLE_TIMEOUT;
  }

  /**
   * Get all active container IDs
   */
  getActiveContainers(): string[] {
    const active: string[] = [];
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
  private startCleanupInterval() {
    this.cleanupInterval = setInterval(async () => {
      const now = Date.now();
      const toCleanup: string[] = [];

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
          } catch (error: any) {
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
