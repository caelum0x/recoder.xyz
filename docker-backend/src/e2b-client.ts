/**
 * @module e2b-client
 *
 * Thin, fail-safe wrapper over the E2B JS SDK (`e2b`) for running AI-generated
 * code and shell commands in secure, ephemeral cloud sandboxes — the "secure
 * sandbox / local runner" pillar, complementing the durable Daytona sandboxes
 * used for live project workspaces.
 *
 * Design goals:
 *  - **Fail safe**: if the SDK isn't installed or `E2B_API_KEY` is missing, the
 *    runner reports `available: false` with a truthful reason and every exec
 *    throws an explicit error. It never fakes success.
 *  - **No hard dependency at load time**: the SDK is dynamically imported and
 *    cached, so the backend boots fine even before `npm i e2b` has run.
 *  - **Ephemeral by default**: each exec spins up a sandbox and kills it when
 *    done, unless the caller opts into a persistent sandbox via `sandboxId`.
 */

import { createLogger } from './logger';

const logger = createLogger('e2b-client');

type E2BModule = typeof import('e2b');

let cachedModule: Promise<E2BModule | null> | null = null;

async function loadE2B(): Promise<E2BModule | null> {
  if (!cachedModule) {
    cachedModule = import('e2b')
      .then((mod) => mod)
      .catch((err) => {
        logger.warn({ err }, 'E2B SDK not installed (run `npm i e2b`); E2B runner disabled');
        return null;
      });
  }
  return cachedModule;
}

export function isE2BConfigured(): boolean {
  return !!process.env.E2B_API_KEY;
}

export interface E2BHealth {
  available: boolean;
  sdkInstalled: boolean;
  apiKeyPresent: boolean;
  reason?: string;
}

export interface E2BExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  sandboxId: string;
  durationMs: number;
  killed: boolean;
}

export interface E2BExecParams {
  /** Shell command to run inside the sandbox. */
  command: string;
  /** Per-command timeout (ms). Also used as the create timeout for new sandboxes. */
  timeoutMs?: number;
  /** Extra environment variables for the command. */
  envs?: Record<string, string>;
  /** Connect to an existing sandbox instead of creating an ephemeral one. */
  sandboxId?: string;
  /** Keep a freshly created sandbox alive after the command (default: false). */
  keepAlive?: boolean;
}

export interface E2BRunCodeParams {
  code: string;
  language?: 'python' | 'node' | 'bash';
  timeoutMs?: number;
  envs?: Record<string, string>;
  sandboxId?: string;
  keepAlive?: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;

const RUNNERS: Record<NonNullable<E2BRunCodeParams['language']>, { file: string; cmd: (file: string) => string }> = {
  python: { file: 'main.py', cmd: (f) => `python3 ${f}` },
  node: { file: 'main.mjs', cmd: (f) => `node ${f}` },
  bash: { file: 'main.sh', cmd: (f) => `bash ${f}` },
};

export async function e2bHealth(): Promise<E2BHealth> {
  const mod = await loadE2B();
  const sdkInstalled = !!mod;
  const apiKeyPresent = isE2BConfigured();

  if (!sdkInstalled) {
    return { available: false, sdkInstalled: false, apiKeyPresent, reason: 'e2b SDK not installed' };
  }
  if (!apiKeyPresent) {
    return { available: false, sdkInstalled: true, apiKeyPresent: false, reason: 'E2B_API_KEY not set' };
  }
  return { available: true, sdkInstalled: true, apiKeyPresent: true };
}

/** Narrow an unknown error into command-result fields when E2B threw on a non-zero exit. */
function extractExitError(err: unknown): { stdout: string; stderr: string; exitCode: number } | null {
  if (err && typeof err === 'object' && 'exitCode' in err) {
    const e = err as { stdout?: unknown; stderr?: unknown; exitCode?: unknown };
    return {
      stdout: typeof e.stdout === 'string' ? e.stdout : '',
      stderr: typeof e.stderr === 'string' ? e.stderr : String((err as { message?: unknown }).message ?? ''),
      exitCode: typeof e.exitCode === 'number' ? e.exitCode : 1,
    };
  }
  return null;
}

async function withSandbox<T>(
  params: { sandboxId?: string; keepAlive?: boolean; timeoutMs?: number },
  fn: (sandbox: import('e2b').Sandbox) => Promise<T>,
): Promise<{ value: T; sandboxId: string; killed: boolean }> {
  const mod = await loadE2B();
  if (!mod) {
    throw new Error('E2B SDK is not installed (run `npm i e2b`)');
  }
  if (!isE2BConfigured()) {
    throw new Error('E2B_API_KEY is not configured');
  }

  const { Sandbox } = mod;
  const apiKey = process.env.E2B_API_KEY;
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let sandbox: import('e2b').Sandbox;
  let created = false;

  if (params.sandboxId) {
    sandbox = await Sandbox.connect(params.sandboxId, { apiKey });
  } else {
    sandbox = await Sandbox.create({ apiKey, timeoutMs });
    created = true;
  }

  const shouldKill = created && !params.keepAlive;
  try {
    const value = await fn(sandbox);
    return { value, sandboxId: sandbox.sandboxId, killed: shouldKill };
  } finally {
    if (shouldKill) {
      await sandbox.kill().catch((err: unknown) => logger.warn({ err }, 'E2B sandbox kill failed'));
    }
  }
}

export async function e2bExec(params: E2BExecParams): Promise<E2BExecResult> {
  const start = Date.now();
  const { value, sandboxId, killed } = await withSandbox(params, async (sandbox) => {
    try {
      const result = await sandbox.commands.run(params.command, {
        envs: params.envs,
        timeoutMs: params.timeoutMs,
      });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
    } catch (err) {
      const exitError = extractExitError(err);
      if (exitError) return exitError;
      throw err;
    }
  });

  return {
    ...value,
    sandboxId,
    killed,
    durationMs: Date.now() - start,
  };
}

export async function e2bRunCode(params: E2BRunCodeParams): Promise<E2BExecResult> {
  const language = params.language ?? 'python';
  const runner = RUNNERS[language];
  const start = Date.now();

  const { value, sandboxId, killed } = await withSandbox(params, async (sandbox) => {
    const path = `/home/user/${runner.file}`;
    await sandbox.files.write(path, params.code);
    try {
      const result = await sandbox.commands.run(runner.cmd(path), {
        envs: params.envs,
        timeoutMs: params.timeoutMs,
      });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
    } catch (err) {
      const exitError = extractExitError(err);
      if (exitError) return exitError;
      throw err;
    }
  });

  return {
    ...value,
    sandboxId,
    killed,
    durationMs: Date.now() - start,
  };
}

export async function e2bKill(sandboxId: string): Promise<boolean> {
  const mod = await loadE2B();
  if (!mod || !isE2BConfigured()) return false;
  try {
    const sandbox = await mod.Sandbox.connect(sandboxId, { apiKey: process.env.E2B_API_KEY });
    await sandbox.kill();
    return true;
  } catch (err) {
    logger.warn({ err, sandboxId }, 'E2B kill by id failed');
    return false;
  }
}
