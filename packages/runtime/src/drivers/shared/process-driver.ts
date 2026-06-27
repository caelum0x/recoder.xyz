import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import type { CliInvocation } from '../../contracts/cli-invocation';
import { spawnProcess } from './spawn';
import { waitForChildProcess } from './wait-for-exit';
import { classifyProcessFailure } from '../../errors/error-classifier';
import { RuntimeAdapterError } from '../../errors/runtime-error';

export type SpawnedProcess = {
  child: ChildProcessByStdio<Writable | null, Readable, Readable>;
  stdout: Readable;
  stderr: Readable;
  stdin: Writable | null;
};

/**
 * Base process plumbing shared by every spawned-CLI driver. It only owns lifecycle:
 * spawn the invocation, expose stdio streams, await exit, and convert a non-zero exit
 * into a `RuntimeAdapterError`. Frame parsing is the concrete driver's job.
 *
 * Fail-safe: a spawn error or non-zero exit becomes a classified error — never a silent
 * success.
 */
export function spawnInvocation(invocation: CliInvocation): SpawnedProcess {
  const child = spawnProcess(invocation.command, [...invocation.args], {
    cwd: invocation.cwd,
    env: invocation.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessByStdio<Writable, Readable, Readable>;

  if (invocation.stdin !== undefined && child.stdin) {
    child.stdin.write(invocation.stdin);
    if (!invocation.keepStdinOpen) {
      child.stdin.end();
    }
  } else if (!invocation.keepStdinOpen && child.stdin) {
    child.stdin.end();
  }

  return {
    child,
    stdout: child.stdout,
    stderr: child.stderr,
    stdin: child.stdin ?? null,
  };
}

/**
 * Await a spawned process to terminate. Resolves with the exit code on success,
 * throws a classified `RuntimeAdapterError` on a non-zero/abnormal exit.
 */
export async function awaitProcessExit(
  spawned: SpawnedProcess,
  options: { stderrTail?: () => string; command?: string } = {},
): Promise<number> {
  let exitCode: number | null;
  try {
    exitCode = await waitForChildProcess(spawned.child);
  } catch (error) {
    throw classifyProcessFailure({
      stderrTail: options.stderrTail?.(),
      command: options.command,
      signal: null,
      exitCode: null,
    });
  }

  if (exitCode === 0) {
    return 0;
  }

  throw classifyProcessFailure({
    exitCode,
    signal: spawned.child.signalCode ?? null,
    stderrTail: options.stderrTail?.(),
    command: options.command,
  });
}

export function killProcess(spawned: SpawnedProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!spawned.child.killed) {
    spawned.child.kill(signal);
  }
}

export { RuntimeAdapterError };
