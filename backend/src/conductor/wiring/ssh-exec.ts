/**
 * Concrete SshExecPort transport for the `ssh` substrate (@recoder/substrate).
 *
 * The substrate package inverts the SSH dependency: it expresses every worktree/
 * tmux/git operation as a remote shell command run through {@link SshExecPort.run}
 * and never opens a socket itself. This module is the backend adapter that shells
 * `ssh -o BatchMode=yes <host> <command>` over a durable SSH session (Wave's SSH
 * survives reconnects), and registers the resulting substrate into the conductor
 * registry — but ONLY when `RECODER_SSH_HOST` + `RECODER_SSH_REPO_PATH` are set,
 * so on a normal boot this is completely inert.
 *
 * Degrade-safe: with no host configured `isConfigured()` is false and the
 * substrate is never registered (the selector keeps degrading to tmux_worktree).
 * `run` rejects ONLY on a genuine transport failure (ssh missing, host
 * unreachable, auth failure ⇒ ssh exit 255); a non-255 remote exit resolves with
 * the remote command's real exitCode — never a fabricated success.
 */
import { spawn } from 'node:child_process';
import {
  createSshSubstrateFromEnv,
  type SshExecPort,
  type SshExecResult,
  type SshExecOptions,
} from '@recoder/substrate';
import { registerSubstrate, type ConductorSubstrate } from '../substrate.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('conductor:ssh-exec');

/** ssh's own exit code for a connection/authentication failure (not the remote command). */
const SSH_CONNECTION_FAILURE_CODE = 255;
/** Default TCP connect timeout for the ssh handshake (seconds). */
const DEFAULT_CONNECT_TIMEOUT_SECS = 10;
/** Fallback per-command timeout when the caller does not specify one (ms). */
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;

/** Minimal env shape (a subset of `process.env`). */
export type SshEnv = Record<string, string | undefined>;

/**
 * Injectable process runner (so tests never spawn a real ssh). Resolves with the
 * captured output + exit code, or REJECTS on a spawn/transport failure.
 */
export type SshProcessRunner = (
  argv: readonly string[],
  opts: { timeoutMs: number },
) => Promise<SshExecResult>;

export interface SshExecTransportDeps {
  /** Env to read `RECODER_SSH_HOST` from (defaults to `process.env`). */
  env?: SshEnv;
  /** Process runner (defaults to a real `spawn`-backed runner). */
  run?: SshProcessRunner;
}

/** Single-quote a value for a POSIX remote shell (wraps + escapes embedded quotes). */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Default runner: spawn ssh directly (no local shell), capture stdout/stderr/exit. */
function defaultRunner(argv: readonly string[], opts: { timeoutMs: number }): Promise<SshExecResult> {
  return new Promise<SshExecResult>((resolve, reject) => {
    const [cmd, ...args] = argv;
    const child = spawn(cmd, args, { timeout: opts.timeoutMs });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (err) => {
      // ssh binary missing / cannot spawn → a genuine transport failure.
      reject(err);
    });
    child.on('close', (code) => {
      if (code === SSH_CONNECTION_FAILURE_CODE) {
        // ssh could not establish the session (unreachable / auth) — transport
        // failure, NOT a remote command result. Reject so the substrate treats it
        // as an unreachable probe instead of a finished workspace.
        reject(new Error(`ssh transport failure (exit 255): ${stderr.trim() || 'connection failed'}`));
        return;
      }
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

/**
 * Build the concrete SSH transport. Reads the target host from `RECODER_SSH_HOST`;
 * `run` shells `ssh -o BatchMode=yes -o ConnectTimeout=N <host> <remoteCommand>`,
 * prepending `cd <cwd> &&` when a cwd is given. All deps are injectable.
 */
export function createSshExecTransport(deps: SshExecTransportDeps = {}): SshExecPort {
  const env = deps.env ?? process.env;
  const run = deps.run ?? defaultRunner;
  const host = (env['RECODER_SSH_HOST'] ?? '').trim();

  return {
    isConfigured(): boolean {
      return host.length > 0;
    },
    async run(command: string, options?: SshExecOptions): Promise<SshExecResult> {
      const remote = options?.cwd ? `cd ${shellQuote(options.cwd)} && ${command}` : command;
      const connectTimeout = DEFAULT_CONNECT_TIMEOUT_SECS;
      const argv = [
        'ssh',
        '-o',
        'BatchMode=yes',
        '-o',
        `ConnectTimeout=${connectTimeout}`,
        host,
        remote,
      ];
      const timeoutMs = options?.timeoutSecs ? options.timeoutSecs * 1000 : DEFAULT_COMMAND_TIMEOUT_MS;
      return run(argv, { timeoutMs });
    },
  };
}

/**
 * Register the `ssh` substrate into the conductor registry — a safe no-op unless
 * `RECODER_SSH_HOST` + `RECODER_SSH_REPO_PATH` are configured (then the durable-SSH
 * remote substrate becomes selectable via `Workspace.substrate: 'ssh'`).
 *
 * The package's `ConductorSubstrate` is the backend contract "verbatim" (the local
 * type only makes `capabilities()` optional + widens `launch` input), so it is
 * runtime-compatible with `registerSubstrate`; the cast bridges the nominal type
 * difference only.
 */
export function registerSshConductorSubstrate(deps: SshExecTransportDeps = {}): boolean {
  const exec = createSshExecTransport(deps);
  const substrate = createSshSubstrateFromEnv({ exec, env: deps.env });
  if (!substrate) {
    logger.debug('ssh substrate not configured (no RECODER_SSH_HOST/REPO_PATH) — not registered');
    return false;
  }
  registerSubstrate(substrate as unknown as ConductorSubstrate);
  logger.info('ssh substrate registered (durable-SSH remote worktrees enabled)');
  return true;
}
