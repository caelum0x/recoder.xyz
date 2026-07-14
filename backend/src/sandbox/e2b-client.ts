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
let injectedModule: E2BModule | null | undefined;

async function loadE2B(): Promise<E2BModule | null> {
  if (injectedModule !== undefined) return injectedModule;
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

/** Test-only: inject a fake E2B module (pass undefined to restore the real one). */
export function __setE2BModuleForTest(mod: E2BModule | null | undefined): void {
  injectedModule = mod;
}

/** Sandbox metadata key stamping the owning Recoder user (the ownership anchor). */
export const OWNER_METADATA_KEY = 'recoderOwnerId';

/** Thrown when a caller tries to act on a sandbox they do not own (IDOR guard). */
export class E2bOwnershipError extends Error {
  constructor(sandboxId: string) {
    super(`forbidden: E2B sandbox ${sandboxId} belongs to another user`);
    this.name = 'E2bOwnershipError';
  }
}

/**
 * Assert the caller owns the sandbox before connecting to a caller-supplied id.
 * Fail-closed: a sandbox whose owner metadata is absent or does not match the
 * caller is refused. Skipped only when no caller identity is available
 * (internal/unauthenticated back-compat) — those paths carry their own trust.
 */
async function assertSandboxOwnership(
  Sandbox: E2BModule['Sandbox'],
  sandboxId: string,
  userId: string | undefined,
): Promise<void> {
  if (!userId) return; // no verifiable identity to enforce against
  let owner: string | undefined;
  try {
    const listed = (await (Sandbox as { list: () => Promise<Array<{ sandboxId: string; metadata?: Record<string, string> }>> }).list()) ?? [];
    const match = listed.find((s) => s.sandboxId === sandboxId);
    owner = match?.metadata?.[OWNER_METADATA_KEY];
  } catch (err) {
    // If we cannot verify ownership, fail closed rather than risk an IDOR.
    logger.warn({ err, sandboxId }, 'E2B ownership check could not list sandboxes; refusing');
    throw new E2bOwnershipError(sandboxId);
  }
  if (owner !== userId) {
    throw new E2bOwnershipError(sandboxId);
  }
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
  /** The verified caller: stamped as the owner at create, checked on connect. */
  userId?: string;
}

export interface E2BRunCodeParams {
  code: string;
  language?: 'python' | 'node' | 'bash';
  timeoutMs?: number;
  envs?: Record<string, string>;
  sandboxId?: string;
  keepAlive?: boolean;
  /** The verified caller: stamped as the owner at create, checked on connect. */
  userId?: string;
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
  params: { sandboxId?: string; keepAlive?: boolean; timeoutMs?: number; userId?: string },
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
    // IDOR guard: a caller-supplied sandboxId must be owned by the caller.
    await assertSandboxOwnership(Sandbox, params.sandboxId, params.userId);
    sandbox = await Sandbox.connect(params.sandboxId, { apiKey });
  } else {
    // Stamp the owner at create so later exec/run/kill can be ownership-checked.
    const metadata = params.userId ? { [OWNER_METADATA_KEY]: params.userId } : undefined;
    sandbox = await Sandbox.create({ apiKey, timeoutMs, ...(metadata ? { metadata } : {}) });
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

export async function e2bKill(sandboxId: string, userId?: string): Promise<boolean> {
  const mod = await loadE2B();
  if (!mod || !isE2BConfigured()) return false;
  // IDOR guard: only the owner may kill a caller-supplied sandbox. An ownership
  // failure propagates (the route maps it to 403); other errors are swallowed.
  await assertSandboxOwnership(mod.Sandbox, sandboxId, userId);
  try {
    const sandbox = await mod.Sandbox.connect(sandboxId, { apiKey: process.env.E2B_API_KEY });
    await sandbox.kill();
    return true;
  } catch (err) {
    logger.warn({ err, sandboxId }, 'E2B kill by id failed');
    return false;
  }
}
