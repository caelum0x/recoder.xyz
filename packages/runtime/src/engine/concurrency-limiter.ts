import type { AgentSurface } from '@recoder/agent-os';

type SurfaceKey = AgentSurface | 'browser_agent';

/**
 * Per-surface + global semaphore bounding concurrent runs. `acquire` resolves a release
 * token once both the global and (optional) per-surface slots are available.
 */
export class ConcurrencyLimiter {
  private globalInUse = 0;
  private readonly surfaceInUse = new Map<SurfaceKey, number>();
  private readonly waiters: Array<{ surface: SurfaceKey; resume: () => void }> = [];

  constructor(
    private readonly globalMax: number,
    private readonly perSurfaceMax: Partial<Record<SurfaceKey, number>> = {},
  ) {
    if (globalMax < 1) throw new Error('Global concurrency must be >= 1');
  }

  async acquire(surface: SurfaceKey): Promise<() => void> {
    while (!this.hasCapacity(surface)) {
      await new Promise<void>((resume) => this.waiters.push({ surface, resume }));
    }
    this.globalInUse += 1;
    this.surfaceInUse.set(surface, (this.surfaceInUse.get(surface) ?? 0) + 1);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.globalInUse -= 1;
      this.surfaceInUse.set(surface, Math.max(0, (this.surfaceInUse.get(surface) ?? 1) - 1));
      this.drainWaiters();
    };
  }

  private hasCapacity(surface: SurfaceKey): boolean {
    if (this.globalInUse >= this.globalMax) return false;
    const surfaceMax = this.perSurfaceMax[surface];
    if (surfaceMax !== undefined && (this.surfaceInUse.get(surface) ?? 0) >= surfaceMax) {
      return false;
    }
    return true;
  }

  private drainWaiters(): void {
    for (let i = 0; i < this.waiters.length; i += 1) {
      const waiter = this.waiters[i];
      if (waiter && this.hasCapacity(waiter.surface)) {
        this.waiters.splice(i, 1);
        waiter.resume();
        return;
      }
    }
  }
}
