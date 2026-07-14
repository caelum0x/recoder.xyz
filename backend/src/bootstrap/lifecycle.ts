/**
 * Process lifecycle orchestration + graceful shutdown.
 *
 * Collects ordered stop hooks (HTTP drain, engine stop, pool close, …) and runs
 * them in reverse registration order on SIGTERM/SIGINT — last-registered stops
 * first, mirroring construction order. Shutdown is idempotent and bounded so a
 * hung hook cannot wedge the process forever.
 */
import type { Logger } from '../shared/logger.js';

export type StopHook = () => Promise<void> | void;

interface RegisteredHook {
  readonly name: string;
  readonly fn: StopHook;
}

export interface LifecycleOptions {
  readonly logger: Logger;
  /** Hard cap on total shutdown time before force-exit. */
  readonly shutdownTimeoutMs?: number;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;

export class Lifecycle {
  private readonly logger: Logger;
  private readonly shutdownTimeoutMs: number;
  private readonly stopHooks: RegisteredHook[] = [];
  private shuttingDown = false;
  private signalsInstalled = false;

  constructor(options: LifecycleOptions) {
    this.logger = options.logger;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  }

  /** Register a stop hook. Hooks run in reverse order on shutdown. */
  onStop(name: string, fn: StopHook): this {
    this.stopHooks.push({ name, fn });
    return this;
  }

  /** Install SIGTERM/SIGINT + fatal handlers exactly once. */
  installSignalHandlers(): this {
    if (this.signalsInstalled) return this;
    this.signalsInstalled = true;

    const onSignal = (signal: NodeJS.Signals): void => {
      this.logger.info({ signal }, 'shutdown signal received');
      void this.shutdown(signal).then((code) => process.exit(code));
    };
    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);

    process.on('unhandledRejection', (reason) => {
      this.logger.error({ reason: reasonString(reason) }, 'unhandled promise rejection');
    });
    process.on('uncaughtException', (error) => {
      this.logger.fatal({ err: error?.message, stack: error?.stack }, 'uncaught exception — shutting down');
      void this.shutdown('uncaughtException').then(() => process.exit(1));
    });

    return this;
  }

  /**
   * Run every stop hook in reverse order, bounded by `shutdownTimeoutMs`.
   * Idempotent: concurrent/repeated calls resolve to the same outcome.
   * Returns the intended process exit code (0 clean, 1 if any hook failed).
   */
  async shutdown(reason: string): Promise<number> {
    if (this.shuttingDown) {
      this.logger.debug({ reason }, 'shutdown already in progress');
      return 0;
    }
    this.shuttingDown = true;
    this.logger.info({ reason, hooks: this.stopHooks.length }, 'draining');

    let exitCode = 0;
    const drain = (async (): Promise<void> => {
      for (const hook of [...this.stopHooks].reverse()) {
        try {
          await hook.fn();
          this.logger.debug({ hook: hook.name }, 'stop hook complete');
        } catch (error) {
          exitCode = 1;
          this.logger.error({ hook: hook.name, err: reasonString(error) }, 'stop hook failed');
        }
      }
    })();

    try {
      await withHardTimeout(drain, this.shutdownTimeoutMs);
      this.logger.info('shutdown complete');
    } catch {
      exitCode = 1;
      this.logger.error({ timeoutMs: this.shutdownTimeoutMs }, 'shutdown timed out — forcing exit');
    }
    return exitCode;
  }
}

function withHardTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`shutdown timed out after ${ms}ms`)), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function reasonString(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

/** Construct a lifecycle orchestrator. */
export function createLifecycle(options: LifecycleOptions): Lifecycle {
  return new Lifecycle(options);
}
