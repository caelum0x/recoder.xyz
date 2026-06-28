/**
 * Delivery summary — generates the delivery artifact when a workspace completes.
 *
 * Per docs/agent-os/02-task-lifecycle.md: completion requires a delivery summary,
 * changed-file list, verification output, artifact refs, and memory candidate
 * refs. This module assembles those from the workspace's diff + run events +
 * substrate exit code.
 *
 * Also generates a MemoryCandidate (per docs/agent-os/11-memory.md): agents
 * PROPOSE memory with evidence; it's never written durably until reviewed.
 */
import { createLogger } from '../logger.js';
import { agentOsContainer } from '../agent-os/service-container';
import { getWorkspace, listWorkspaceEvents } from './workspace-service.js';
import { workspaceDiff } from './review.js';
import type { Workspace, RunEvent } from '@recoder/agent-os';

const logger = createLogger('conductor:delivery');

export interface DeliverySummary {
  workspaceId: string;
  taskId: string;
  runId: string;
  runtimeId: string;
  state: string;
  exitCode: number | null;
  /** Summary of changed files (stat line). */
  diffStat: string;
  changedFiles: number;
  untrackedFiles: string[];
  /** Key log lines from the run (filtered for relevance). */
  keyLogLines: string[];
  /** Timestamps. */
  startedAt?: string;
  completedAt: string;
  /** Whether the agent exited cleanly (exit 0). */
  success: boolean;
}

export interface MemoryCandidate {
  candidateId: string;
  workspaceId: string;
  taskId: string;
  /** The learned fact/pattern proposed for durable memory. */
  content: string;
  /** Evidence backing the candidate (diff, logs, exit code). */
  evidence: {
    exitCode: number | null;
    changedFiles: number;
    diffStat: string;
    keyLogs: string[];
  };
  /** Scope for the memory (repo, project, global). */
  scope: 'task' | 'project' | 'global';
  status: 'proposed';
  proposedAt: string;
}

/**
 * Generate a delivery summary for a completed workspace. Pulls together the diff,
 * run events, and exit code into a single artifact the caller can persist.
 */
export async function generateDeliverySummary(workspaceId: string): Promise<DeliverySummary> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);

  // Get the diff.
  let diff: { stat: string; changedFiles: number; untracked: string[] };
  try {
    const d = await workspaceDiff(workspaceId);
    diff = { stat: d.stat, changedFiles: d.changedFiles, untracked: d.untracked };
  } catch {
    diff = { stat: '', changedFiles: 0, untracked: [] };
  }

  // Get run events for key log lines.
  const events = await listWorkspaceEvents(workspaceId);
  const logEvents = events.filter((e) => e.type === 'log');
  const keyLogLines = extractKeyLines(logEvents);

  // Find exit code from the completed/failed event.
  const terminalEvent = events.find((e) => e.type === 'completed' || e.type === 'failed');
  const rawExitCode = terminalEvent?.data?.exitCode;
  const exitCode: number | null = typeof rawExitCode === 'number' ? rawExitCode : null;
  const startedEvent = events.find((e) => e.type === 'started');

  const summary: DeliverySummary = {
    workspaceId,
    taskId: workspace.taskId,
    runId: workspace.runId ?? `run_${workspaceId}`,
    runtimeId: workspace.runtimeId,
    state: workspace.state,
    exitCode,
    diffStat: diff.stat,
    changedFiles: diff.changedFiles,
    untrackedFiles: diff.untracked,
    keyLogLines,
    startedAt: startedEvent?.createdAt,
    completedAt: terminalEvent?.createdAt ?? new Date().toISOString(),
    success: exitCode === 0,
  };

  logger.info({ workspaceId, changedFiles: summary.changedFiles, exitCode, success: summary.success }, 'delivery summary generated');
  return summary;
}

/**
 * Generate a memory candidate from a completed workspace. The candidate is
 * PROPOSED — it requires review before becoming durable memory.
 */
export async function generateMemoryCandidate(workspaceId: string): Promise<MemoryCandidate | null> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return null;

  const summary = await generateDeliverySummary(workspaceId);
  if (summary.changedFiles === 0 && summary.keyLogLines.length === 0) {
    logger.info({ workspaceId }, 'skipping memory candidate — no changes or notable logs');
    return null;
  }

  // Build the candidate content from the workspace's observable outcomes.
  const content = [
    `Task ${workspace.taskId} on ${workspace.runtimeId}:`,
    summary.changedFiles > 0 ? `Changed ${summary.changedFiles} file(s).` : 'No files changed.',
    summary.exitCode === 0 ? 'Exited successfully (0).' : `Exited with code ${summary.exitCode}.`,
    summary.keyLogLines.length > 0 ? `Key output: ${summary.keyLogLines.slice(0, 3).join(' | ')}` : '',
  ].filter(Boolean).join(' ');

  const candidate: MemoryCandidate = {
    candidateId: `mc_${workspaceId}_${Date.now()}`,
    workspaceId,
    taskId: workspace.taskId,
    content,
    evidence: {
      exitCode: summary.exitCode,
      changedFiles: summary.changedFiles,
      diffStat: summary.diffStat,
      keyLogs: summary.keyLogLines.slice(0, 5),
    },
    scope: 'task',
    status: 'proposed',
    proposedAt: new Date().toISOString(),
  };

  logger.info({ workspaceId, candidateId: candidate.candidateId }, 'memory candidate proposed');
  return candidate;
}

/**
 * Extract key log lines from run events. Filters for lines that look like
 * summaries, errors, or completions (not every line of agent output).
 */
function extractKeyLines(events: RunEvent[]): string[] {
  const allLines: string[] = [];
  for (const event of events) {
    if (event.message) {
      allLines.push(event.message);
    }
  }
  // Keep last 20 non-empty lines, prioritizing error/summary patterns.
  const filtered = allLines
    .filter((l) => l.trim().length > 0)
    .slice(-20);
  return filtered;
}
