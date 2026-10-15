/**
 * `createChildProcessPtyProcess` — a minimal, dependency-free `PtyProcessLike`
 * backed by a REAL `node:child_process` subprocess (no pseudo-tty; stdio
 * pipes). Not a production engine choice (no real tty means no resize
 * semantics, no job-control signals a genuine PTY would carry) — this
 * exists so `governed-pty-adapter.test.ts` can prove
 * `createGovernedPtyProcess` in front of an ACTUAL running process, not a
 * stub that only records calls. The real engine choices this wrapper
 * governs identically are node-pty (`NodePtyAdapter.ts`, Windows today) and
 * the Loom/herdr-backed adapter the `recoder-wtlm` terminal seam will add
 * for macOS/Linux — both satisfy the same `PtyProcessLike` shape.
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Writable, Readable } from 'node:stream';
import type { PtyProcessLike } from './governed-pty-adapter';

export interface ChildProcessPtyOptions {
  readonly shell?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export function createChildProcessPtyProcess(options: ChildProcessPtyOptions = {}): PtyProcessLike {
  const child: ChildProcessByStdio<Writable, Readable, Readable> = spawn(
    options.shell ?? '/bin/sh',
    options.args ? [...options.args] : [],
    {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  return {
    get pid() {
      return child.pid ?? -1;
    },
    write(data: string): void {
      child.stdin.write(data);
    },
    resize(): void {
      // No real tty backs this adapter — resize is a deliberate no-op.
    },
    kill(signal?: string): void {
      child.kill((signal as NodeJS.Signals | undefined) ?? 'SIGTERM');
    },
    onData(callback: (data: string) => void): () => void {
      const onStdout = (chunk: Buffer) => callback(chunk.toString('utf8'));
      const onStderr = (chunk: Buffer) => callback(chunk.toString('utf8'));
      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
      return () => {
        child.stdout.off('data', onStdout);
        child.stderr.off('data', onStderr);
      };
    },
    onExit(callback: (event: { exitCode: number; signal: number | null }) => void): () => void {
      const onExit = (code: number | null) => callback({ exitCode: code ?? -1, signal: null });
      child.on('exit', onExit);
      return () => {
        child.off('exit', onExit);
      };
    },
  };
}
