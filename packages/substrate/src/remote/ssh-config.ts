/**
 * SSH substrate config — resolve the `ssh` substrate's target from env.
 *
 * The `ssh` substrate is OPT-IN and env-gated: absent `RECODER_SSH_HOST` /
 * `RECODER_SSH_REPO_PATH`, `readSshConfig` returns `null` and
 * `createSshSubstrateFromEnv` returns `null` — the substrate is then never
 * registered, so it is simply never selected (the selector degrades to the local
 * `tmux_worktree` substrate). This keeps the flip additive and reversible.
 *
 * The durable-SSH transport itself is always INJECTED (see `SshExecPort`); env
 * only supplies static config (host + remote repo + worktree root).
 */
import type { ConductorSubstrate } from '../contract/index.js';
import type { SshExecPort } from '../ports/ssh-exec.port.js';
import type { LoggerPort } from '../ports/logger.port.js';
import { createSshSubstrate, type SshSubstrateConfig } from './ssh-substrate.js';

/** Minimal env shape (a subset of `process.env`). */
export type SshEnv = Record<string, string | undefined>;

/** Drop a trailing slash so derived paths stay clean. */
function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Resolve SSH substrate config from env, or `null` when unconfigured.
 * `worktreeRoot` defaults to a sibling `<repoPath>-worktrees` directory.
 */
export function readSshConfig(env: SshEnv = process.env): SshSubstrateConfig | null {
  const host = (env['RECODER_SSH_HOST'] ?? '').trim();
  const repoPath = trimTrailingSlash((env['RECODER_SSH_REPO_PATH'] ?? '').trim());
  if (!host || !repoPath) {
    return null;
  }
  const worktreeRoot =
    trimTrailingSlash((env['RECODER_SSH_WORKTREE_ROOT'] ?? '').trim()) || `${repoPath}-worktrees`;
  return { host, repoPath, worktreeRoot };
}

export interface SshSubstrateFromEnvDeps {
  /** Injected durable-SSH transport. */
  exec: SshExecPort;
  /** Env to read config from (defaults to `process.env`). */
  env?: SshEnv;
  /** Structured logger; defaults to a no-op inside the substrate. */
  logger?: LoggerPort;
}

/**
 * Build the `ssh` substrate ONLY when SSH host/repo env is configured; otherwise
 * return `null` so the caller can skip registration (truthful, degrade-safe).
 */
export function createSshSubstrateFromEnv(
  deps: SshSubstrateFromEnvDeps,
): ConductorSubstrate | null {
  const config = readSshConfig(deps.env);
  if (!config) {
    return null;
  }
  return createSshSubstrate({ exec: deps.exec, config, logger: deps.logger });
}
