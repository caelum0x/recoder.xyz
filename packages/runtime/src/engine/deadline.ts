import { runtimeError } from '../errors/runtime-error';

export type DeadlineOptions = {
  wallClockTimeoutMs: number;
  idleTimeoutMs: number;
  /** Injected for tests; defaults to Date.now. */
  now?: () => number;
};

/**
 * Tracks wall-clock + idle timeouts for one run and aborts the run's controller when
 * either is exceeded. The thrown/aborted condition surfaces as a `timeout` error.
 */
export class Deadline {
  private readonly start: number;
  private lastActivity: number;
  private wallTimer?: NodeJS.Timeout;
  private idleTimer?: NodeJS.Timeout;
  private readonly now: () => number;
  private disposed = false;

  constructor(
    private readonly options: DeadlineOptions,
    private readonly onTimeout: (error: ReturnType<typeof runtimeError>) => void,
  ) {
    this.now = options.now ?? Date.now;
    this.start = this.now();
    this.lastActivity = this.start;
  }

  /** Arm the wall-clock + idle timers. */
  arm(): void {
    this.wallTimer = setTimeout(() => this.fire('wall-clock'), this.options.wallClockTimeoutMs);
    this.armIdle();
  }

  /** Call on every frame to reset the idle timer. */
  touch(): void {
    if (this.disposed) return;
    this.lastActivity = this.now();
    this.armIdle();
  }

  dispose(): void {
    this.disposed = true;
    if (this.wallTimer) clearTimeout(this.wallTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }

  private armIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.fire('idle'), this.options.idleTimeoutMs);
  }

  private fire(reason: 'wall-clock' | 'idle'): void {
    if (this.disposed) return;
    this.dispose();
    this.onTimeout(
      runtimeError('timeout', `Run exceeded ${reason} timeout.`, {
        details: { reason, elapsedMs: this.now() - this.start },
      }),
    );
  }
}
