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
 *
 * TRUTHFUL-EVIDENCE SEAM (@recoder/governance): a delivery summary asserts what a
 * run produced (changed files, exit code, success). For that assertion to be
 * *truthful with evidence* — not merely a self-reported object a caller could
 * fabricate — the summary's evidence is sealed into the governance SHA-256 Merkle
 * audit chain when the summary is generated. We record one `decision.made`-class
 * audit entry (action `custom`, actor = the conductor) carrying the run's observed
 * outcome, and stamp the returned tamper-evident tip hash onto the summary as
 * `evidenceAuditHash`. This is the SAME audit subsystem the delivery APPROVAL gate
 * (governance-gate.ts) seals its verdicts into, so a delivery's full trail — the
 * approval verdict AND the completion evidence — lives on one verifiable chain.
 *
 * Degrade-safe by construction: governance is OPTIONAL here. If it cannot be
 * constructed or the record fails, we log and leave `evidenceAuditHash` undefined;
 * summary generation NEVER blocks on it (matching the conductor's coordination
 * posture — a completion artifact is always produced). The seal uses
 * `recordAuditViaDaemon` (daemon-first, falls back to the local Merkle chain) so an
 * audit write is never silently dropped when the Rust kernel is reachable.
 */
import { createLogger } from '../logger.js';
import { agentOsContainer } from '../agent-os/service-container';
import { getWorkspace, listWorkspaceEvents } from './workspace-service.js';
import { workspaceDiff } from './review.js';
import { Governance } from '@recoder/governance';
import type { Workspace, RunEvent } from '@recoder/agent-os';

const logger = createLogger('conductor:delivery');

/**
 * Lazily-built governance instance used ONLY to seal delivery evidence into the
 * Merkle audit chain. Audit is enabled; auto-approve is irrelevant (we never call
 * `decide()` here — only `recordAuditViaDaemon`). Built once. Daemon-aware: when
 * `GOVERNANCE_SOCKET` is published by an externally-managed Rust kernel,
 * `Governance.create` connects to it so the seal goes through the real daemon;
 * otherwise it uses the pure-TS local Merkle chain. Construction failure degrades
 * to "no governance" — sealing is then skipped, never fatal.
 *
 * NOTE: this is a SEPARATE construction from governance-gate.ts's singleton (that
 * module's instance is private to it and not exported), but it targets the same
 * daemon socket when one is published, so daemon-backed deployments share the one
 * authoritative chain. In the pure-TS fallback the two instances keep independent
 * local chains — acceptable: each is still tamper-evident on its own, and the seal
 * here is degrade-safe evidence, not an enforcement gate.
 */
let governanceForEvidence: Promise<Governance | null> | undefined;

function getEvidenceGovernance(): Promise<Governance | null> {
  if (!governanceForEvidence) {
    governanceForEvidence = (async () => {
      try {
        return await Governance.create({ auditEnabled: true });
      } catch (err) {
        logger.warn({ err }, 'evidence-audit governance construction failed — delivery summaries will not be sealed');
        return null;
      }
    })();
  }
  return governanceForEvidence;
}

/** Reset the evidence-governance instance (test seam only). */
export function __resetEvidenceGovernanceForTest(): void {
  governanceForEvidence = undefined;
}

/**
 * Seal a delivery summary's evidence into the governance Merkle audit chain and
 * return the resulting tamper-evident tip hash. Never throws: any failure (no
 * governance, daemon/record error) logs and resolves `undefined`, so summary
 * generation is never blocked by the audit seal.
 */
async function sealDeliveryEvidence(summary: DeliverySummary): Promise<string | undefined> {
  let governance: Governance | null;
  try {
    governance = await getEvidenceGovernance();
  } catch (err) {
    logger.warn({ workspaceId: summary.workspaceId, err }, 'evidence governance unavailable — summary not sealed');
    return undefined;
  }
  if (!governance) return undefined;

  // Sanitized, secret-free detail line describing the observed run outcome.
  const detail =
    `delivery summary task=${summary.taskId} run=${summary.runId} ` +
    `runtime=${summary.runtimeId} state=${summary.state} ` +
    `exit=${summary.exitCode ?? 'null'} changedFiles=${summary.changedFiles} ` +
    `untracked=${summary.untrackedFiles.length} success=${summary.success}`;

  try {
    const hash = await governance.recordAuditViaDaemon({
      timestamp: summary.completedAt,
      actor: `conductor:${summary.runtimeId}`,
      action: 'custom',
      detail,
      outcome: summary.success ? 'success' : 'failure',
      runId: summary.runId,
      metadata: {
        kind: 'delivery_summary',
        workspaceId: summary.workspaceId,
        taskId: summary.taskId,
        exitCode: summary.exitCode,
        changedFiles: summary.changedFiles,
        untrackedFiles: summary.untrackedFiles.length,
        diffStat: summary.diffStat,
      },
    });
    logger.info({ workspaceId: summary.workspaceId, evidenceAuditHash: hash }, 'delivery summary evidence sealed into audit chain');
    return hash;
  } catch (err) {
    // Degrade-safe: a failed seal must not block delivery-summary generation.
    logger.warn({ workspaceId: summary.workspaceId, err }, 'delivery summary evidence seal failed (summary still produced)');
    return undefined;
  }
}

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
  /**
   * Tamper-evident provenance for this summary: the SHA-256 Merkle audit tip hash
   * produced when the summary's evidence (changed files, exit code, success) was
   * sealed into the @recoder/governance audit chain. Present when governance was
   * reachable; `undefined` when the seal degraded (governance unavailable) — the
   * summary is still produced, just unsealed. A consumer can pass this hash to a
   * governance audit verify to prove the summary was not fabricated after the run.
   */
  evidenceAuditHash?: string;
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
    /**
     * The governance Merkle audit tip hash that sealed the underlying delivery
     * summary's evidence. Carries tamper-evident provenance into the proposed
     * memory so a reviewer can verify the candidate is backed by a real run, not a
     * fabricated claim. `undefined` when the seal degraded (governance unavailable).
     */
    evidenceAuditHash?: string;
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

  // Seal the summary's evidence into the governance Merkle audit chain so the
  // assertion is truthful with tamper-evident provenance. Degrade-safe: a failed
  // seal leaves evidenceAuditHash undefined and never blocks the summary.
  summary.evidenceAuditHash = await sealDeliveryEvidence(summary);

  logger.info(
    {
      workspaceId,
      changedFiles: summary.changedFiles,
      exitCode,
      success: summary.success,
      evidenceAuditHash: summary.evidenceAuditHash,
    },
    'delivery summary generated',
  );
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
      evidenceAuditHash: summary.evidenceAuditHash,
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
