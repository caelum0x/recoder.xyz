/**
 * Resource governor — per-project/user parallelism caps, disk/session limits.
 *
 * Per docs/CONDUCTOR-ARCHITECTURE.md §6: hard caps on concurrent workspaces,
 * worktree disk, tmux sessions. Reject (truthfully) when over budget — never
 * silently degrade.
 *
 * The box is 16GB/94% disk in production, so the governor prevents the
 * conductor from exhausting resources when running many agents in parallel.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { statfs } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '../logger.js';
import { agentOsContainer } from '../agent-os/service-container';
import { TMUX_BIN } from './tmux-path.js';

const exec = promisify(execFile);
const logger = createLogger('conductor:governor');

export interface ResourceLimits {
  /** Max concurrent non-terminal workspaces per project. */
  maxConcurrentWorkspaces: number;
  /** Max concurrent non-terminal workspaces per user. */
  maxConcurrentPerUser: number;
  /** Max tmux sessions globally (safety valve). */
  maxTmuxSessions: number;
  /** Min free disk GB before rejecting new workspaces. */
  minFreeDiskGb: number;
  /** Max worktree disk usage in GB before rejecting. */
  maxWorktreeDiskGb: number;
}

export const DEFAULT_LIMITS: ResourceLimits = {
  maxConcurrentWorkspaces: Number(process.env.CONDUCTOR_MAX_CONCURRENT) || 10,
  maxConcurrentPerUser: Number(process.env.CONDUCTOR_MAX_PER_USER) || 5,
  maxTmuxSessions: Number(process.env.CONDUCTOR_MAX_TMUX_SESSIONS) || 50,
  minFreeDiskGb: Number(process.env.CONDUCTOR_MIN_FREE_DISK_GB) || 5,
  maxWorktreeDiskGb: Number(process.env.CONDUCTOR_MAX_WORKTREE_DISK_GB) || 50,
};

export interface AdmissionDecision {
  admitted: boolean;
  reason?: string;
  limits: ResourceLimits;
  current: {
    projectWorkspaces: number;
    userWorkspaces: number;
    tmuxSessions: number;
    freeDiskGb: number;
  };
}

/**
 * Check whether a new workspace can be admitted under the current resource
 * budget. Returns a truthful decision — never silently over-admits.
 */
export async function admitWorkspace(
  projectId: string,
  createdBy: string,
  limits: ResourceLimits = DEFAULT_LIMITS,
): Promise<AdmissionDecision> {
  const repository = () => agentOsContainer.repository;

  // Count active (non-terminal) workspaces.
  const workspaces = await repository().listWorkspaces();
  const active = workspaces.filter(
    (w) => !['archived', 'merged', 'failed', 'cancelled'].includes(w.state),
  );
  const projectCount = active.filter((w) => w.projectId === projectId).length;
  const userCount = active.filter((w) => w.createdBy === createdBy).length;

  // Count live tmux sessions.
  let tmuxCount = 0;
  try {
    const { stdout } = await exec(TMUX_BIN, ['list-sessions', '-F', '#{session_name}']);
    tmuxCount = stdout.split('\n').filter((s) => s.trim().startsWith('recoder-')).length;
  } catch {
    tmuxCount = 0;
  }

  // Check free disk.
  const worktreeRoot = process.env.CONDUCTOR_WORKTREE_ROOT || '/tmp/recoder-worktrees';
  let freeDiskGb = Infinity;
  try {
    const stats = await statfs(worktreeRoot);
    freeDiskGb = (stats.bavail * stats.bsize) / (1024 ** 3);
  } catch {
    // If the path doesn't exist, use the root filesystem.
    try {
      const stats = await statfs('/');
      freeDiskGb = (stats.bavail * stats.bsize) / (1024 ** 3);
    } catch {
      freeDiskGb = Infinity; // can't check — allow
    }
  }

  const current = { projectWorkspaces: projectCount, userWorkspaces: userCount, tmuxSessions: tmuxCount, freeDiskGb };

  // Evaluate limits in order — first failure wins.
  if (projectCount >= limits.maxConcurrentWorkspaces) {
    logger.warn({ projectId, projectCount, limit: limits.maxConcurrentWorkspaces }, 'admission rejected: project cap');
    return { admitted: false, reason: `project ${projectId} at max concurrent workspaces (${limits.maxConcurrentWorkspaces})`, limits, current };
  }
  if (userCount >= limits.maxConcurrentPerUser) {
    logger.warn({ createdBy, userCount, limit: limits.maxConcurrentPerUser }, 'admission rejected: user cap');
    return { admitted: false, reason: `user ${createdBy} at max concurrent workspaces (${limits.maxConcurrentPerUser})`, limits, current };
  }
  if (tmuxCount >= limits.maxTmuxSessions) {
    logger.warn({ tmuxCount, limit: limits.maxTmuxSessions }, 'admission rejected: tmux session cap');
    return { admitted: false, reason: `max tmux sessions reached (${limits.maxTmuxSessions})`, limits, current };
  }
  if (freeDiskGb < limits.minFreeDiskGb) {
    logger.warn({ freeDiskGb, limit: limits.minFreeDiskGb }, 'admission rejected: low disk');
    return { admitted: false, reason: `insufficient free disk (${freeDiskGb.toFixed(1)}GB < ${limits.minFreeDiskGb}GB minimum)`, limits, current };
  }

  logger.info({ projectId, createdBy, current }, 'workspace admitted');
  return { admitted: true, limits, current };
}

/**
 * Current resource utilization snapshot for the health endpoint.
 */
export async function resourceSnapshot(): Promise<{
  limits: ResourceLimits;
  current: AdmissionDecision['current'];
}> {
  const decision = await admitWorkspace('__snapshot__', '__snapshot__');
  return { limits: decision.limits, current: decision.current };
}
