/**
 * dmux operator-console adapter — the optional view layer over the tmux substrate.
 *
 * Per docs/subsystems/substrate.md §4.3 and docs/RECODER-PRODUCT-ARCHITECTURE.md §8c
 * (LOCKED): dmux is a vendored multiplexer (ts/dmux) used as an OPTIONAL operator
 * grid over N parallel agents. It is NEVER on the critical path — if dmux is absent,
 * the Conductor substrate is fully functional via tmux alone.
 *
 * dmux is an interactive TUI (Ink/React over tmux) that a human operator attaches to.
 * It manages its own project-scoped tmux session, worktree-backed panes, and AI-agent
 * launches. The Conductor runs headless agent sessions in `recoder-*` tmux sessions;
 * dmux can observe and interact with those sessions since they share one tmux server.
 *
 * This adapter:
 *   - resolves the dmux binary (vendored ts/dmux or system PATH)
 *   - reports truthful availability
 *   - launches dmux as an operator console for a repo
 *   - bridges conductor workspaces → dmux-visible tmux sessions
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { createLogger } from '../logger.js';
import { TMUX_BIN, TMUX_IS_VENDORED } from './tmux-path.js';

const exec = promisify(execFile);
const logger = createLogger('conductor:dmux');

/**
 * Environment that pins dmux to the SAME tmux binary the Conductor drives.
 *
 * dmux resolves its tmux binary from `DMUX_TMUX_BIN`/`CONDUCTOR_TMUX_BIN` (see
 * ts/dmux/src/utils/tmuxBin.ts, which mirrors this package's tmux-path.ts). Without
 * this, a vendored/pinned tmux would be invisible to the operator console and dmux
 * would fall back to a system `tmux` on PATH — a different tmux server that cannot see
 * the conductor's `recoder-*` sessions. Propagating it makes the bridge real: one
 * tmux server, observed by both the headless conductor and the operator console.
 *
 * When tmux is just system `tmux` (not vendored), we add nothing — dmux's own PATH
 * resolution is already correct and identical.
 */
export function dmuxTmuxEnv(): NodeJS.ProcessEnv {
  if (!TMUX_IS_VENDORED) return {};
  return { DMUX_TMUX_BIN: TMUX_BIN, CONDUCTOR_TMUX_BIN: TMUX_BIN };
}

/**
 * Resolve the dmux binary. Order:
 *   1. CONDUCTOR_DMUX_BIN env override.
 *   2. The vendored ts/dmux/dmux launcher (with a built dist/).
 *   3. System `dmux` on PATH (returns the bare name for `command -v` resolution).
 */
export function resolveDmuxBin(): string {
  if (process.env.CONDUCTOR_DMUX_BIN && existsSync(process.env.CONDUCTOR_DMUX_BIN)) {
    return process.env.CONDUCTOR_DMUX_BIN;
  }
  // Resolve the vendored launcher relative to the repo root (contains ts/dmux/dmux).
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const vendored = path.join(dir, 'ts', 'dmux', 'dmux');
    const vendoredDist = path.join(dir, 'ts', 'dmux', 'dist', 'index.js');
    if (existsSync(vendored) && existsSync(vendoredDist)) {
      return vendored;
    }
    if (existsSync(path.join(dir, 'c', 'tmux', 'tmux.c'))) break; // hit repo root
    dir = path.dirname(dir);
  }
  return 'dmux'; // fall back to system PATH
}

export interface DmuxAvailability {
  /** Is dmux usable as an operator console? */
  available: boolean;
  /** Resolved binary path (vendored, override, or system 'dmux'). */
  bin: string;
  /** True when the resolved binary is the vendored ts/dmux build. */
  vendored: boolean;
  /** The tmux binary dmux will be pinned to (shared with the conductor). */
  tmuxBin: string;
  /** True when that tmux is the vendored/pinned binary (not bare system PATH). */
  tmuxPinned: boolean;
  /** Truthful reason when unavailable. */
  reason?: string;
}

/** Check whether dmux is installed and runnable (truthful, never assumed). */
export async function dmuxAvailability(): Promise<DmuxAvailability> {
  const bin = resolveDmuxBin();
  const vendored = bin !== 'dmux';
  const tmuxBin = TMUX_BIN;
  const tmuxPinned = TMUX_IS_VENDORED;
  if (!vendored && !process.env.CONDUCTOR_DMUX_BIN) {
    // System PATH check for `dmux`.
    try {
      await exec('command', ['-v', 'dmux'], { shell: '/bin/sh' });
      return { available: true, bin: 'dmux', vendored: false, tmuxBin, tmuxPinned };
    } catch {
      return {
        available: false,
        bin: 'dmux',
        vendored: false,
        tmuxBin,
        tmuxPinned,
        reason: 'dmux not found on PATH and no vendored build at ts/dmux/dist',
      };
    }
  }
  // Vendored/override: verify the launcher + dist exist.
  if (!existsSync(bin)) {
    return { available: false, bin, vendored, tmuxBin, tmuxPinned, reason: `dmux binary not found at ${bin}` };
  }
  return { available: true, bin, vendored, tmuxBin, tmuxPinned };
}

export interface DmuxLaunchInput {
  /** Absolute path to the git repo the operator console should open. */
  repoPath: string;
  /** Extra args forwarded to dmux verbatim. */
  extraArgs?: string[];
}

export interface DmuxLaunchResult {
  pid: number;
  bin: string;
  repoPath: string;
  command: string[];
}

/**
 * Launch dmux as an operator console for a repo.
 *
 * dmux is an interactive TUI that needs a real TTY. When invoked from the backend
 * (no TTY) it is spawned detached so the operator can attach in their terminal.
 * Returns the pid + exact command for the caller to surface (e.g. an attach hint).
 */
export function launchDmuxConsole(input: DmuxLaunchInput): DmuxLaunchResult {
  const bin = resolveDmuxBin();
  const args = [input.repoPath, ...(input.extraArgs ?? [])];
  // Pin dmux to the conductor's tmux binary so the console shares one tmux server.
  const tmuxEnv = dmuxTmuxEnv();
  const child = spawn(bin, args, {
    detached: true,
    stdio: 'ignore',
    cwd: input.repoPath,
    env: { ...process.env, ...tmuxEnv },
  });
  child.on('error', (err) => {
    logger.warn({ err, bin, repoPath: input.repoPath }, 'dmux console launch failed (best effort)');
  });
  child.unref();
  logger.info(
    { pid: child.pid, bin, repoPath: input.repoPath, tmuxBin: tmuxEnv.DMUX_TMUX_BIN ?? '(system PATH)' },
    'dmux operator console launched',
  );
  return { pid: child.pid!, bin, repoPath: input.repoPath, command: [bin, ...args] };
}

/**
 * The command line an operator should run manually to attach a dmux console.
 *
 * When tmux is vendored/pinned, the command is prefixed with the env assignment so a
 * manually-launched console attaches to the same tmux server as the conductor.
 */
export function dmuxAttachCommand(repoPath: string): string {
  const bin = resolveDmuxBin();
  const tmuxEnv = dmuxTmuxEnv();
  const prefix = tmuxEnv.DMUX_TMUX_BIN ? `DMUX_TMUX_BIN='${tmuxEnv.DMUX_TMUX_BIN}' ` : '';
  return `${prefix}${bin} ${repoPath}`;
}

/**
 * Bridge conductor workspace tmux sessions → dmux-visible sessions.
 *
 * The conductor creates `recoder-<workspaceId>` tmux sessions; dmux operates on the
 * same tmux server, so these are observable. This lists which conductor sessions are
 * live right now (queried directly from tmux — survives restarts).
 */
export async function dmuxVisibleSessions(): Promise<string[]> {
  try {
    const { stdout } = await exec(TMUX_BIN, ['list-sessions', '-F', '#{session_name}']);
    return stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('recoder-'));
  } catch {
    return [];
  }
}
