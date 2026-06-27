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
import { createLogger } from '../logger.js';
import { TMUX_BIN } from './tmux-path.js';

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

  // Detached tmux session running the agent inside the worktree.
  await exec(TMUX_BIN, ['new-session', '-d', '-s', tmuxName, '-c', worktreePath, input.command]);

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

/** Live tmux session names (recoder-prefixed). */
export async function listSessions(): Promise<ConductorSession[]> {
  try {
    const { stdout } = await exec(TMUX_BIN, ['list-sessions', '-F', '#{session_name}']);
    const live = new Set(stdout.split('\n').map((s) => s.trim()).filter(Boolean));
    return [...sessions.values()].filter((s) => live.has(s.tmuxName));
  } catch {
    return [];
  }
}

/** Capture the agent's current terminal output. */
export async function capturePane(sessionId: string, lines = 200): Promise<string> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`session not found: ${sessionId}`);
  const { stdout } = await exec(TMUX_BIN, ['capture-pane', '-p', '-t', session.tmuxName, '-S', `-${lines}`]);
  return stdout;
}

/** Send input/keys to an agent session (e.g. an approval, an interrupt). */
export async function sendKeys(sessionId: string, keys: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`session not found: ${sessionId}`);
  await exec(TMUX_BIN, ['send-keys', '-t', session.tmuxName, keys, 'Enter']);
}

/** Stop a session and remove its isolated worktree. */
export async function killSession(sessionId: string, options?: { removeWorktree?: boolean }): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  try {
    await exec(TMUX_BIN, ['kill-session', '-t', session.tmuxName]);
  } catch {
    /* already gone */
  }
  if (options?.removeWorktree !== false) {
    try {
      await exec('git', ['-C', session.repoPath, 'worktree', 'remove', '--force', session.worktreePath]);
    } catch (err) {
      logger.warn({ sessionId, err }, 'worktree remove failed (best effort)');
    }
  }
  sessions.delete(sessionId);
  logger.info({ sessionId }, 'conductor session killed');
}
