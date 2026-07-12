/**
 * Recoder Conductor — parallel agent session orchestrator.
 *
 * The pivot product (Conductor.build-style, infra-grade): run MANY coding agents
 * in parallel, each in its own isolated git worktree, managed as a tmux session,
 * and tracked by the Agent OS control plane. Not a chat box.
 *
 *   task/run  ->  isolated git worktree  ->  tmux session running the agent
 *
 * Agents are the owned runtimes (pi / Claude Code / Codex). This module owns the
 * isolation + session lifecycle; the control plane (/api/agent-os/*) owns task,
 * run, approval, and delivery state.
 *
 * Runtime deps: `git` (worktrees) and `tmux` (sessions). Both are checked at call
 * time and the orchestrator degrades safely (available:false) when missing.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { createLogger } from '../logger.js';
import { TMUX_BIN } from './tmux-path.js';
import { injectRecoderMcp } from './mcp-inject.js';

const exec = promisify(execFile);
const logger = createLogger('conductor');

const SESSION_PREFIX = 'recoder-';
const WORKTREE_ROOT = process.env.CONDUCTOR_WORKTREE_ROOT || '/tmp/recoder-worktrees';

export interface ConductorSession {
  sessionId: string;
  tmuxName: string;
  worktreePath: string;
  branch: string;
  repoPath: string;
  command: string;
  createdAt: string;
}

export interface StartSessionInput {
  /** Stable id (task/run id). Used to name the tmux session + worktree. */
  sessionId: string;
  /** Absolute path to the git repo to branch a worktree from. */
  repoPath: string;
  /** Branch to create for the isolated worktree (defaults to recoder/<sessionId>). */
  branch?: string;
  /** Base ref to branch from (default: current HEAD). */
  baseRef?: string;
  /** Command the agent runs inside the worktree (e.g. the pi runtime invocation). */
  command: string;
  /**
   * Extra environment for the launched agent process. Merged over the conductor's
   * own process.env when spawning the tmux session, so the agent (and its MCP
   * stdio children, which inherit this env) see e.g. RECODER_A2A_URL pointing at
   * the LOCAL backend bridge. Omitted -> the session inherits process.env as-is.
   */
  env?: Record<string, string>;
}

const sessions = new Map<string, ConductorSession>();

async function commandExists(bin: string, args: string[] = ['--version']): Promise<boolean> {
  try {
    await exec(bin, args);
    return true;
  } catch {
    return false;
  }
}

/** Which tmux binary the conductor drives (vendored/pinned or system PATH). */
export function conductorTmuxBin(): string {
  return TMUX_BIN;
}

export async function conductorAvailability(): Promise<{ available: boolean; git: boolean; tmux: boolean; tmuxBin: string; reason?: string }> {
  const [git, tmux] = await Promise.all([
    commandExists('git'),
    // `tmux -V` is the canonical version flag.
    commandExists(TMUX_BIN, ['-V']),
  ]);
  const available = git && tmux;
  return {
    available,
    git,
    tmux,
    tmuxBin: TMUX_BIN,
    reason: available ? undefined : `missing: ${[!git && 'git', !tmux && 'tmux'].filter(Boolean).join(', ')}`,
  };
}

function tmuxNameFor(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/**
 * Start a parallel agent session: isolated git worktree + detached tmux session
 * running the agent command. Idempotent per sessionId.
 */
export async function startSession(input: StartSessionInput): Promise<ConductorSession> {
  const avail = await conductorAvailability();
  if (!avail.available) {
    throw new Error(`conductor unavailable (${avail.reason})`);
  }
  if (sessions.has(input.sessionId)) {
    return sessions.get(input.sessionId)!;
  }

  const branch = input.branch || `recoder/${input.sessionId}`;
  const tmuxName = tmuxNameFor(input.sessionId);
  const worktreePath = path.join(WORKTREE_ROOT, tmuxName);

  // Isolated worktree on its own branch — parallel agents never collide.
  await exec('git', ['-C', input.repoPath, 'worktree', 'add', '-B', branch, worktreePath, input.baseRef || 'HEAD']);

  // Give the agent Recoder's tools automatically: drop a `.mcp.json` registering
  // the Recoder MCP server so the launched CLI (Claude Code auto-discovers it)
  // can call the governed capability stack with zero user setup. Degrade-safe
  // and hidden from the review diff (see mcp-inject).
  injectRecoderMcp(worktreePath, input.repoPath);

  // Ensure remain-on-exit is globally on BEFORE launching the agent command.
  // This lets paneExitCode read #{pane_dead_status} after the agent exits,
  // distinguishing success (0) from crash (non-zero). The global option only
  // works when the tmux server is already running; bootstrap it idempotently.
  try {
    await exec(TMUX_BIN, ['set-option', '-g', 'remain-on-exit', 'on']);
  } catch {
    // Server not running yet — start it with a throwaway session, set the option.
    const init = `__recoder_init_${Date.now()}`;
    await exec(TMUX_BIN, ['new-session', '-d', '-s', init, 'true']);
    await exec(TMUX_BIN, ['set-option', '-g', 'remain-on-exit', 'on']);
    try { await exec(TMUX_BIN, ['kill-session', '-t', init]); } catch { /* gone */ }
  }

  // Detached tmux session running the agent inside the worktree. Pass the merged
  // env on the exec so the launched agent (and the MCP stdio children it spawns,
  // which inherit this env) see the injected vars — e.g. RECODER_A2A_URL pointing
  // at the LOCAL backend bridge. tmux only forwards env to a NEW server it spawns;
  // when an existing server already runs, also push the vars via `setenv -g` so
  // the new pane picks them up regardless of when the server was started.
  const sessionEnv = input.env ? { ...process.env, ...input.env } : undefined;
  if (input.env) {
    for (const [key, value] of Object.entries(input.env)) {
      try {
        await exec(TMUX_BIN, ['set-environment', '-g', key, value]);
      } catch {
        // No running server yet / unsupported — the env passed on the exec below
        // (which boots the server) still covers the fresh-server case.
      }
    }
  }
  await exec(TMUX_BIN, ['new-session', '-d', '-s', tmuxName, '-c', worktreePath, input.command], {
    ...(sessionEnv ? { env: sessionEnv } : {}),
  });

  // Set remain-on-exit PER-SESSION immediately after creation. The global option
  // above primes any tmux server we had to bootstrap, but a per-session option is
  // the deterministic guarantee: this exact session keeps its pane (and thus
  // #{pane_dead_status}) after a clean exit-code-0 completion, regardless of the
  // server's inherited global state or tmux version. Best-effort: a failure here
  // only weakens exit-code detection, it must not abort a successful launch.
  try {
    await exec(TMUX_BIN, ['set-option', '-t', tmuxName, 'remain-on-exit', 'on']);
  } catch (err) {
    logger.warn({ sessionId: input.sessionId, err }, 'per-session remain-on-exit set failed (best effort)');
  }

  const session: ConductorSession = {
    sessionId: input.sessionId,
    tmuxName,
    worktreePath,
    branch,
    repoPath: input.repoPath,
    command: input.command,
    createdAt: new Date().toISOString(),
  };
  sessions.set(input.sessionId, session);
  logger.info({ sessionId: input.sessionId, worktreePath, branch }, 'conductor session started');
  return session;
}

export interface ContinueSessionInput {
  /** Stable id (the workspace id) — reuses the same tmux session name. */
  sessionId: string;
  /** The EXISTING worktree to run in (the prior run's worktree, changes intact). */
  worktreePath: string;
  /** Command for the new run (the next chat message rendered to a CLI invocation). */
  command: string;
  /** Extra environment for the relaunched agent (see StartSessionInput.env). */
  env?: Record<string, string>;
}

/**
 * CONTINUE/CHAT: start ANOTHER agent run in the SAME existing worktree (no
 * `git worktree add` — the prior run's changes are intact). Kills any lingering
 * session for this id, then launches a fresh detached tmux session running the
 * new command in the existing worktree. This is how a local chat keeps directing
 * the same agent: each message is a new run over the accumulated work.
 */
export async function continueSession(input: ContinueSessionInput): Promise<ConductorSession> {
  const avail = await conductorAvailability();
  if (!avail.available) {
    throw new Error(`conductor unavailable (${avail.reason})`);
  }
  if (!existsSync(input.worktreePath)) {
    throw new Error(`worktree not found for continue: ${input.worktreePath}`);
  }

  const tmuxName = tmuxNameFor(input.sessionId);
  // Drop any prior (terminal) session for this id; KEEP the worktree.
  try {
    await exec(TMUX_BIN, ['kill-session', '-t', tmuxName]);
  } catch {
    /* already gone */
  }

  try {
    await exec(TMUX_BIN, ['set-option', '-g', 'remain-on-exit', 'on']);
  } catch {
    const init = `__recoder_init_${Date.now()}`;
    await exec(TMUX_BIN, ['new-session', '-d', '-s', init, 'true']);
    await exec(TMUX_BIN, ['set-option', '-g', 'remain-on-exit', 'on']);
    try { await exec(TMUX_BIN, ['kill-session', '-t', init]); } catch { /* gone */ }
  }

  // Merge the relaunch env (same local-bridge injection as startSession) onto the
  // spawned pane: push globals for an already-running server + pass env on the exec
  // that may boot a fresh server.
  const continueEnv = input.env ? { ...process.env, ...input.env } : undefined;
  if (input.env) {
    for (const [key, value] of Object.entries(input.env)) {
      try {
        await exec(TMUX_BIN, ['set-environment', '-g', key, value]);
      } catch {
        /* no running server yet / unsupported — exec env below covers cold start */
      }
    }
  }
  await exec(TMUX_BIN, ['new-session', '-d', '-s', tmuxName, '-c', input.worktreePath, input.command], {
    ...(continueEnv ? { env: continueEnv } : {}),
  });
  try {
    await exec(TMUX_BIN, ['set-option', '-t', tmuxName, 'remain-on-exit', 'on']);
  } catch (err) {
    logger.warn({ sessionId: input.sessionId, err }, 'per-session remain-on-exit set failed (best effort)');
  }

  const prior = sessions.get(input.sessionId);
  const session: ConductorSession = {
    sessionId: input.sessionId,
    tmuxName,
    worktreePath: input.worktreePath,
    branch: prior?.branch || `recoder/${input.sessionId}`,
    repoPath: prior?.repoPath || '',
    command: input.command,
    createdAt: new Date().toISOString(),
  };
  sessions.set(input.sessionId, session);
  logger.info({ sessionId: input.sessionId, worktreePath: input.worktreePath }, 'conductor session continued (new run, same worktree)');
  return session;
}

/** Live tmux session names (recoder-prefixed), queried directly from tmux.
 * Survives restarts: the in-memory map is only a cache; the tmux server is the source. */
export async function listSessions(): Promise<ConductorSession[]> {
  try {
    const { stdout } = await exec(TMUX_BIN, ['list-sessions', '-F', '#{session_name}']);
    const liveNames = new Set(
      stdout.split('\n').map((s) => s.trim()).filter((s) => s.startsWith(SESSION_PREFIX))
    );
    // Merge in-memory records with live tmux sessions discovered on the server.
    const known = new Map(sessions);
    for (const name of liveNames) {
      const sessionId = name.slice(SESSION_PREFIX.length);
      if (!known.has(sessionId)) {
        // Session exists on the tmux server but not in memory (restarted backend).
        // Reconstruct a minimal record from the deterministic naming.
        known.set(sessionId, {
          sessionId,
          tmuxName: name,
          worktreePath: path.join(WORKTREE_ROOT, name),
          branch: `recoder/${sessionId}`,
          repoPath: '',
          command: '',
          createdAt: new Date().toISOString(),
        });
      }
    }
    return [...known.values()].filter((s) => liveNames.has(s.tmuxName));
  } catch {
    return [];
  }
}

/**
 * tmux's remain-on-exit dead-pane banner, e.g.
 * "Pane is dead (status 0, Tue Jun 30 01:23:01 2026)". remain-on-exit is ON (we
 * need #{pane_dead_status} for exit-code detection), so a finished pane keeps
 * showing this banner in its captured output. It reads like a crash to a user,
 * and the real exit code is already surfaced as a friendly terminal event — so
 * strip the banner from the captured OUTPUT here, at the source, for every
 * consumer (run-tailer deltas, the terminal view, delivery summaries).
 */
const PANE_DEAD_BANNER = /\n*[ \t]*Pane is dead \(status\s*-?\d+[^)]*\)[ \t]*/gi;

/** Capture the agent's current terminal output. Survives restarts: derives the
 * tmux session name deterministically instead of relying on the in-memory map. */
export async function capturePane(sessionId: string, lines = 200): Promise<string> {
  const tmuxName = tmuxNameFor(sessionId);
  const { stdout } = await exec(TMUX_BIN, ['capture-pane', '-p', '-t', tmuxName, '-S', `-${lines}`]);
  // Remove tmux's dead-pane banner so the agent's real output reads cleanly.
  const cleaned = stdout.replace(PANE_DEAD_BANNER, '').replace(/[ \t]+\n/g, '\n').trimEnd();
  return cleaned ? cleaned + '\n' : '';
}

/** Send input/keys to an agent session (e.g. an approval, an interrupt).
 * Survives restarts: derives the tmux session name deterministically. */
export async function sendKeys(sessionId: string, keys: string): Promise<void> {
  const tmuxName = tmuxNameFor(sessionId);
  await exec(TMUX_BIN, ['send-keys', '-t', tmuxName, keys, 'Enter']);
}

/** Stop a session and remove its isolated worktree. Survives restarts: derives
 * the tmux name + worktree path deterministically when the in-memory record is gone. */
export async function killSession(sessionId: string, options?: { removeWorktree?: boolean; repoPath?: string; worktreePath?: string }): Promise<void> {
  const tmuxName = tmuxNameFor(sessionId);
  const session = sessions.get(sessionId);
  try {
    await exec(TMUX_BIN, ['kill-session', '-t', tmuxName]);
  } catch {
    /* already gone */
  }
  if (options?.removeWorktree !== false) {
    const repo = options?.repoPath ?? session?.repoPath;
    const wtPath = options?.worktreePath ?? session?.worktreePath ?? path.join(WORKTREE_ROOT, tmuxName);
    if (repo) {
      try {
        await exec('git', ['-C', repo, 'worktree', 'remove', '--force', wtPath]);
      } catch (err) {
        logger.warn({ sessionId, err }, 'worktree remove failed (best effort)');
      }
    } else if (existsSync(wtPath)) {
      // No repo ref — try to remove the worktree directory directly.
      try { rmSync(wtPath, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
  sessions.delete(sessionId);
  logger.info({ sessionId }, 'conductor session killed');
}

/**
 * Get the true exit code of a completed tmux session's pane.
 *
 * Uses `#{pane_dead}` and `#{pane_dead_status}` — the upgrade over "session gone
 * = done" called out in the substrate design. When the session still exists (pane
 * is alive), returns `undefined`. When the pane is dead, returns the exit status.
 * When the session is entirely gone (already killed), returns `null`.
 */
export async function paneExitCode(sessionName: string): Promise<number | null | undefined> {
  // Check if the session exists at all.
  try {
    await exec(TMUX_BIN, ['has-session', '-t', sessionName]);
  } catch {
    return null; // session entirely gone
  }
  // Session exists — check if the pane is dead.
  try {
    const { stdout: dead } = await exec(TMUX_BIN, [
      'display-message', '-p', '-t', sessionName, '#{pane_dead}',
    ]);
    if (dead.trim() !== '1') return undefined; // still alive
    // Pane is dead — read the exit status.
    const { stdout: status } = await exec(TMUX_BIN, [
      'display-message', '-p', '-t', sessionName, '#{pane_dead_status}',
    ]);
    const code = parseInt(status.trim(), 10);
    return Number.isNaN(code) ? 0 : code;
  } catch {
    return null; // can't query → treat as gone
  }
}
