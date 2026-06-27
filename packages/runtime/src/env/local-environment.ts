import { promises as fs } from 'node:fs';
import type { CliInvocation } from '../contracts/cli-invocation';
import { spawnProcess } from '../drivers/shared/spawn';
import { spawnInvocation, type SpawnedProcess } from '../drivers/shared/process-driver';
import type {
  ExecResult,
  ExecStreamChunk,
  ExecutionEnvironment,
} from './execution-environment';

const DEFAULT_EXEC_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The default execution environment: spawn child processes on the local host. Every other
 * environment (`sandbox`, `hosted`) implements the same `ExecutionEnvironment` port so a
 * driver is identical regardless of where it runs.
 *
 * Fail-safe: a spawn failure surfaces as a rejected promise / non-zero exit, never a fake
 * success — the engine converts that into a `failed` RunEvent.
 */
export class LocalEnvironment implements ExecutionEnvironment {
  readonly kind = 'local';

  async spawn(invocation: CliInvocation): Promise<SpawnedProcess> {
    return spawnInvocation(invocation);
  }

  async exec(input: {
    command: string;
    args: readonly string[];
    cwd: string;
    env?: Readonly<Record<string, string>>;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      const child = spawnProcess(input.command, [...input.args], {
        cwd: input.cwd,
        env: input.env ? { ...input.env } : undefined,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, input.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS);

      const onAbort = (): void => {
        if (!child.killed) child.kill('SIGKILL');
      };
      input.signal?.addEventListener('abort', onAbort, { once: true });

      const finish = (exitCode: number | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        input.signal?.removeEventListener('abort', onAbort);
        resolve({ exitCode, stdout, stderr });
      };

      child.stdout?.on('data', (c: Buffer) => {
        stdout += c.toString('utf8');
      });
      child.stderr?.on('data', (c: Buffer) => {
        stderr += c.toString('utf8');
      });
      child.on('error', (err) => {
        stderr += stderr ? `\n${err.message}` : err.message;
        finish(null);
      });
      child.on('close', (code) => finish(code));
    });
  }

  async *execStream(input: {
    command: string;
    args: readonly string[];
    cwd: string;
    env?: Readonly<Record<string, string>>;
    signal?: AbortSignal;
  }): AsyncIterable<ExecStreamChunk> {
    const queue: ExecStreamChunk[] = [];
    let ended = false;
    let wake: (() => void) | null = null;
    const signalWake = (): void => {
      if (wake) {
        const w = wake;
        wake = null;
        w();
      }
    };

    const child = spawnProcess(input.command, [...input.args], {
      cwd: input.cwd,
      env: input.env ? { ...input.env } : undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const onAbort = (): void => {
      if (!child.killed) child.kill('SIGKILL');
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (c: Buffer) => {
      queue.push({ stream: 'stdout', chunk: c.toString('utf8') });
      signalWake();
    });
    child.stderr?.on('data', (c: Buffer) => {
      queue.push({ stream: 'stderr', chunk: c.toString('utf8') });
      signalWake();
    });
    child.on('close', () => {
      ended = true;
      signalWake();
    });
    child.on('error', () => {
      ended = true;
      signalWake();
    });

    try {
      while (true) {
        while (queue.length > 0) {
          yield queue.shift() as ExecStreamChunk;
        }
        if (ended) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      input.signal?.removeEventListener('abort', onAbort);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    // Local environment holds no persistent resources.
  }
}

export function createLocalEnvironment(): ExecutionEnvironment {
  return new LocalEnvironment();
}
