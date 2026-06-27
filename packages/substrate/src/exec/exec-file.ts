/**
 * execFileSafe — promisified execFile with sane maxBuffer + timeout defaults.
 *
 * Shared by the local (git/tmux) and remote substrates. Rejections are
 * normalized to a typed ExecError (no loose property access on `unknown`).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExecOptions, ExecResult } from './exec-result.js';
import { toExecError } from './exec-error.js';

const exec = promisify(execFile);

/** 32 MiB — git diffs and long pane captures can be large. */
const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;

export async function execFileSafe(
  bin: string,
  args: readonly string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await exec(bin, [...args], {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : undefined,
      maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
      timeout: options.timeoutMs,
    });
    return { stdout: String(stdout), stderr: String(stderr), code: 0 };
  } catch (error) {
    throw toExecError(bin, args, error);
  }
}
