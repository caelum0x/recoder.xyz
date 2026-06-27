import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { spawnProcess } from '../shared/spawn';

/**
 * Result of a shell command execution. Mirrors open-agents `ExecResult` so the fused
 * tools keep their exact return shape.
 */
export type ExecResult = {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
};

/** File stats subset used by the fused tools (mirrors open-agents `SandboxStats`). */
export type SandboxStats = {
  isDirectory(): boolean;
  isFile(): boolean;
  size: number;
  mtimeMs: number;
};

/**
 * The operational substrate the in-process (ToolLoopAgent) tools run against.
 *
 * FUSION: the open-agents tools (`read/write/edit/bash/grep/glob`) were authored against
 * the cloud `@open-agents/sandbox` `Sandbox` interface. Rather than dragging the Vercel
 * cloud sandbox package into `@recoder/runtime`, we implement the same operational subset
 * (`readFile/writeFile/stat/mkdir/exec`) directly over the local filesystem, scoped to a
 * policy-bounded working directory. The CLI runs in-process; this is the local execution
 * environment the spec calls for (`drivers/in-process/tool-loop-context.ts` builds the
 * `AgentSandboxContext` from `DriverContext`).
 */
export type LocalSandboxOptions = {
  /** Policy-bounded working directory (the cwd handed in by the engine). */
  readonly workingDirectory: string;
  /** Secret-redacted, policy-scoped child env for shell commands. */
  readonly env?: Readonly<Record<string, string>>;
  /** Current git branch, if known (used in the system prompt). */
  readonly currentBranch?: string;
  /** Whether shell execution is permitted by policy (`policy.allowShell`). */
  readonly allowShell?: boolean;
  /** Max combined stdout/stderr bytes returned by `exec` before truncation. */
  readonly maxExecOutputBytes?: number;
};

const DEFAULT_MAX_EXEC_OUTPUT_BYTES = 50_000;

export class LocalSandbox {
  readonly type = 'cloud' as const;
  readonly workingDirectory: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly currentBranch?: string;

  readonly #allowShell: boolean;
  readonly #maxExecOutputBytes: number;

  constructor(options: LocalSandboxOptions) {
    this.workingDirectory = options.workingDirectory;
    this.env = options.env;
    this.currentBranch = options.currentBranch;
    this.#allowShell = options.allowShell ?? false;
    this.#maxExecOutputBytes = options.maxExecOutputBytes ?? DEFAULT_MAX_EXEC_OUTPUT_BYTES;
  }

  async readFile(filePath: string, _encoding: 'utf-8'): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeFile(filePath: string, content: string, _encoding: 'utf-8'): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async stat(filePath: string): Promise<SandboxStats> {
    const stats = await fs.stat(filePath);
    return {
      isDirectory: () => stats.isDirectory(),
      isFile: () => stats.isFile(),
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    };
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.mkdir(dirPath, { recursive: options?.recursive ?? false });
  }

  /**
   * Execute a shell command non-interactively, honoring the abort signal. When
   * `policy.allowShell` is false the sandbox refuses to spawn (truthful failure, never a
   * fake success), mirroring the runtime `shell-guard` contract at the tool boundary.
   */
  async exec(
    command: string,
    cwd: string,
    timeoutMs: number,
    options?: { signal?: AbortSignal },
  ): Promise<ExecResult> {
    if (!this.#allowShell) {
      return {
        success: false,
        exitCode: null,
        stdout: '',
        stderr: 'Shell execution is disabled by policy (allowShell=false).',
        truncated: false,
      };
    }

    const resolvedCwd = path.isAbsolute(cwd) ? cwd : path.resolve(this.workingDirectory, cwd);

    return new Promise<ExecResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let truncated = false;
      let settled = false;

      const child = spawnProcess('bash', ['-c', command], {
        cwd: resolvedCwd,
        env: this.env ? { ...this.env } : undefined,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const appendCapped = (target: 'out' | 'err', chunk: Buffer): void => {
        const text = chunk.toString('utf-8');
        if (target === 'out') {
          if (stdout.length < this.#maxExecOutputBytes) {
            stdout += text;
            if (stdout.length > this.#maxExecOutputBytes) {
              stdout = stdout.slice(0, this.#maxExecOutputBytes);
              truncated = true;
            }
          } else {
            truncated = true;
          }
          return;
        }
        if (stderr.length < this.#maxExecOutputBytes) {
          stderr += text;
          if (stderr.length > this.#maxExecOutputBytes) {
            stderr = stderr.slice(0, this.#maxExecOutputBytes);
            truncated = true;
          }
        } else {
          truncated = true;
        }
      };

      child.stdout?.on('data', (c: Buffer) => appendCapped('out', c));
      child.stderr?.on('data', (c: Buffer) => appendCapped('err', c));

      const timer = setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, timeoutMs);

      const onAbort = (): void => {
        if (!child.killed) child.kill('SIGKILL');
      };
      options?.signal?.addEventListener('abort', onAbort, { once: true });

      const finish = (exitCode: number | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', onAbort);
        resolve({ success: exitCode === 0, exitCode, stdout, stderr, truncated });
      };

      child.on('error', (err) => {
        stderr += stderr ? `\n${err.message}` : err.message;
        finish(null);
      });
      child.on('close', (code) => finish(code));
    });
  }
}
