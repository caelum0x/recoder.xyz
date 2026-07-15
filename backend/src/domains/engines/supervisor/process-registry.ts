/**
 * `ProcessRegistry` — tracks every child process the daemon + sidecar
 * supervisors spawn so lifecycle `stop()` can SIGTERM (then SIGKILL after a
 * grace) all of them. Prevents orphan daemons/sidecars outliving the backend.
 *
 * Every spawn registers here; every intentional stop marks the child as
 * `suppressed` so the supervisor's exit handler skips its restart loop. The
 * registry owns NO restart policy — only the child inventory + graceful kill.
 */
import type { ChildProcess } from 'node:child_process';
import type { Logger } from '../../../shared/logger.js';
import { SIGKILL_GRACE_MS } from '../constants.js';

interface Tracked {
  readonly engineId: string;
  readonly child: ChildProcess;
  /** True once an intentional stop began — the exit handler must skip restart. */
  suppressed: boolean;
}

export class ProcessRegistry {
  private readonly children = new Map<string, Tracked>();

  constructor(private readonly log: Logger) {}

  /**
   * Register a spawned child under an engine id. A prior child for the same id is
   * first killed (suppressed) so we never leak a superseded process.
   */
  registerChild(engineId: string, child: ChildProcess): void {
    const prior = this.children.get(engineId);
    if (prior && prior.child !== child) {
      this.killChild(prior);
    }
    this.children.set(engineId, { engineId, child, suppressed: false });
  }

  /** The tracked child for an engine, or `undefined`. */
  get(engineId: string): ChildProcess | undefined {
    return this.children.get(engineId)?.child;
  }

  /** True when a stop for this engine has begun (restart loops must skip). */
  isSuppressed(engineId: string): boolean {
    return this.children.get(engineId)?.suppressed ?? false;
  }

  /** Mark a stop as intentional so the exit handler does not restart. */
  suppress(engineId: string): void {
    const tracked = this.children.get(engineId);
    if (tracked) tracked.suppressed = true;
  }

  /** Forget a child (after it has fully exited). */
  forget(engineId: string): void {
    this.children.delete(engineId);
  }

  /**
   * Gracefully stop one child: mark suppressed, SIGTERM, then SIGKILL after the
   * grace window if it has not exited. Idempotent + best-effort (never throws).
   */
  async stop(engineId: string): Promise<void> {
    const tracked = this.children.get(engineId);
    if (!tracked) return;
    tracked.suppressed = true;
    await this.gracefulKill(tracked);
    this.children.delete(engineId);
  }

  /** SIGTERM → SIGKILL every tracked child (lifecycle shutdown). */
  async shutdownAll(): Promise<void> {
    const all = [...this.children.values()];
    for (const tracked of all) tracked.suppressed = true;
    await Promise.all(all.map((tracked) => this.gracefulKill(tracked)));
    this.children.clear();
  }

  /** The number of tracked children (for health detail). */
  size(): number {
    return this.children.size;
  }

  private async gracefulKill(tracked: Tracked): Promise<void> {
    const { child, engineId } = tracked;
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      child.kill('SIGTERM');
    } catch (err) {
      this.log.warn({ err: message(err), engineId }, 'SIGTERM failed (already dead?)');
      return;
    }
    const exited = await this.waitForExit(child, SIGKILL_GRACE_MS);
    if (!exited && child.exitCode === null && child.signalCode === null) {
      this.log.warn({ engineId }, 'child did not exit on SIGTERM — sending SIGKILL');
      try {
        child.kill('SIGKILL');
      } catch (err) {
        this.log.warn({ err: message(err), engineId }, 'SIGKILL failed');
      }
    }
  }

  private killChild(tracked: Tracked): void {
    tracked.suppressed = true;
    try {
      tracked.child.kill('SIGTERM');
    } catch {
      /* best-effort */
    }
  }

  private waitForExit(child: ChildProcess, graceMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (value: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => done(false), graceMs);
      child.once('exit', () => done(true));
    });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
