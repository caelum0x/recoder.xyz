/**
 * Conductor hook gate — in-process fusion of @recoder/agent-hooks into the
 * runtime launch path.
 *
 * DECISION (see src/conductor/README.md): the embedded backend uses the
 * in-process helpers (evaluatePreToolUse / evaluatePostToolUse / scanSecrets /
 * createArtifactCapture) directly on the conductor run loop's own call stack —
 * faster and we own the process. The subprocess `runHookCli` from the same
 * package stays available for external-Claude-Code hook parity, but it is NOT
 * the path wired here.
 *
 * This module gates a real agent launch (`launchRuntime`) BEFORE the substrate
 * spawns the agent: it secret-scans the agent-controlled prompt + the resolved
 * command line and runs the deterministic policy gate (forbidden paths /
 * dangerous commands). A `block` decision (e.g. a secret-bearing write) stops
 * the launch; everything else proceeds.
 *
 * DEGRADE-SAFE: if the hook package is unavailable or throws, we log and fall
 * back to prior behavior (allow the launch). A policy gate must never crash a
 * launch — it can only deny a launch it positively decided to block.
 */
import { createLogger } from '../logger.js';
import {
  evaluatePreToolUse,
  evaluatePostToolUse,
  type AgentHookDecision,
} from '@recoder/agent-hooks';

/**
 * Structural artifact type derived from the hook decision so we avoid a
 * fragile subpath import (the index re-exports the value, not the type).
 */
type AgentHookArtifact = NonNullable<AgentHookDecision['artifacts']>[number];

const logger = createLogger('conductor:hook-gate');

export interface LaunchGateInput {
  workspaceId: string;
  taskId: string;
  runId: string;
  /** Resolved CLI command line that the substrate will spawn. */
  commandLine: string;
  /** Agent-controlled prompt text (the most likely place secrets leak in). */
  prompt: string;
  /** Repo + branch the agent will write to (path policy surface). */
  repoPath: string;
  branch: string;
  runtimeId: string;
  createdBy: string;
}

export interface LaunchGateResult {
  /** True when the launch may proceed. */
  allowed: boolean;
  /** Present only when the gate positively blocked the launch. */
  blockedReason?: string;
  /** The underlying hook decision (undefined when the gate degraded). */
  decision?: AgentHookDecision;
}

/**
 * Pre-launch gate. Returns `{ allowed: false, blockedReason }` ONLY when the
 * in-process hook positively returns a `block` decision (forbidden path,
 * forbidden action, or detected secret material). Any error degrades to
 * `{ allowed: true }` so a failing gate never blocks a launch.
 */
export function gateLaunch(input: LaunchGateInput): LaunchGateResult {
  let decision: AgentHookDecision;
  try {
    decision = evaluatePreToolUse({
      action: 'command.run',
      taskId: input.taskId,
      runId: input.runId,
      actor: { agentId: input.createdBy, runtime: input.runtimeId },
      target: {
        command: input.commandLine,
        // The agent-controlled prompt is the content surface that gets
        // secret-scanned; repoPath/branch feed the path policy check.
        content: input.prompt,
        path: input.repoPath,
      },
    });
  } catch (err) {
    // DEGRADE-SAFE: a broken hook must not block a real launch.
    logger.warn(
      { workspaceId: input.workspaceId, taskId: input.taskId, err },
      'pre-launch hook gate failed; allowing launch (degrade-safe)',
    );
    return { allowed: true };
  }

  if (decision.decision === 'block') {
    logger.warn(
      {
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        reason: decision.reason,
        findingCount: decision.findings?.length ?? 0,
      },
      'pre-launch hook gate BLOCKED launch',
    );
    return { allowed: false, blockedReason: decision.reason, decision };
  }

  if (decision.decision === 'needs_approval') {
    // We surface the decision but do not block the sandboxed launch here; the
    // launch is additive and existing reconcile/approval flows own approval.
    logger.info(
      { workspaceId: input.workspaceId, taskId: input.taskId, reason: decision.reason },
      'pre-launch hook gate flagged needs_approval; proceeding (sandboxed launch)',
    );
  }

  return { allowed: true, decision };
}

/**
 * Post-launch artifact capture. Produces a degrade-safe artifact describing the
 * launched command for the run's audit trail. Never throws.
 */
export function captureLaunchArtifact(input: {
  taskId: string;
  runId: string;
  commandLine: string;
  changedFiles?: string[];
}): AgentHookArtifact | undefined {
  try {
    const decision = evaluatePostToolUse({
      taskId: input.taskId,
      runId: input.runId,
      target: { command: input.commandLine },
      changedFiles: input.changedFiles,
    });
    return decision.artifacts?.[0];
  } catch (err) {
    logger.warn({ taskId: input.taskId, err }, 'post-launch artifact capture failed (degrade-safe)');
    return undefined;
  }
}
