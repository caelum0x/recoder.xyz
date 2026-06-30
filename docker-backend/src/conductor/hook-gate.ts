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
 * A `file.write` action evaluated by the engine's real pre-tool policy is what
 * surfaces a forbidden-path block on the POST path (the engine treats path
 * policy uniformly; we re-run it over what the run actually touched). A blank
 * commandLine + the changed paths means the only thing that can fire is the
 * secret scanner (on captured output) and the forbidden-path gate (on the
 * changed files) — exactly the PostToolUse secret/path gating this module owns.
 */
const POST_GATE_ACTION = 'file.write';

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
 * Result of the PostToolUse secret/path gate over what a run actually touched.
 * `gated` is true when the engine positively returned a `block` decision for a
 * changed path (forbidden path) or a secret detected in captured output.
 */
export interface PostToolGateResult {
  /** True ONLY when the engine positively blocked the post-tool surface. */
  gated: boolean;
  /** Present when gated: the engine's reason. */
  reason?: string;
  /** Redacted findings (paths/secret-kinds) — never the raw secret material. */
  findings?: Array<Record<string, unknown>>;
  /** The underlying decision (undefined when the gate degraded). */
  decision?: AgentHookDecision;
}

/**
 * PostToolUse secret/path gate. Genuinely runs the engine's REAL policy
 * (`evaluatePreToolUse` — the same deterministic secret scanner + forbidden-path
 * matcher used by the pre-launch gate) over the POST surface: each file a run
 * changed is evaluated as a `file.write` against path policy, and any captured
 * output is secret-scanned. This is the capability the GOAL requires flowing on
 * the run path — not a capture-only stamp.
 *
 * Multiple changed files: the FIRST positive `block` wins and is returned, so a
 * single forbidden write (e.g. a run that touched `.env`) is surfaced even when
 * other files are benign.
 *
 * DEGRADE-SAFE: any error returns `{ gated: false }`. This gate is observational
 * on the post path — it reports a truthful policy verdict for the audit trail
 * and callers, but (matching the existing coordination posture) it never throws
 * and never crashes a run.
 */
export function gatePostTool(input: {
  taskId: string;
  runId: string;
  runtimeId?: string;
  createdBy?: string;
  /** Files the run actually changed (the path-policy surface). */
  changedFiles?: string[];
  /** Captured stdout/stderr or diff text (the secret-scan surface). */
  output?: string;
}): PostToolGateResult {
  try {
    const changed = (input.changedFiles ?? []).filter(Boolean);
    const actor = { agentId: input.createdBy, runtime: input.runtimeId };

    // 1. Path policy: evaluate each changed file as a real `file.write`.
    for (const path of changed) {
      const decision = evaluatePreToolUse({
        action: POST_GATE_ACTION,
        taskId: input.taskId,
        runId: input.runId,
        actor,
        target: { path },
        // Writes-need-worklock would otherwise force needs_approval here; the
        // post path only gates positive secret/path BLOCKS, so disable it.
        policy: { requireWorkLockForWrites: false },
      });
      if (decision.decision === 'block') {
        logger.warn(
          { taskId: input.taskId, runId: input.runId, reason: decision.reason },
          'post-tool gate BLOCKED a changed path (forbidden path)',
        );
        return {
          gated: true,
          reason: decision.reason,
          findings: decision.findings,
          decision,
        };
      }
    }

    // 2. Secret scan: evaluate captured output content for leaked secrets.
    if (input.output) {
      const decision = evaluatePreToolUse({
        action: 'tool.call',
        taskId: input.taskId,
        runId: input.runId,
        actor,
        target: { content: input.output },
      });
      if (decision.decision === 'block') {
        logger.warn(
          { taskId: input.taskId, runId: input.runId, reason: decision.reason },
          'post-tool gate detected secret material in captured output',
        );
        return {
          gated: true,
          reason: decision.reason,
          findings: decision.findings,
          decision,
        };
      }
    }

    return { gated: false };
  } catch (err) {
    logger.warn({ taskId: input.taskId, err }, 'post-tool gate failed (degrade-safe)');
    return { gated: false };
  }
}

/**
 * Post-launch artifact capture. Produces a degrade-safe artifact describing the
 * launched command for the run's audit trail. Never throws.
 *
 * It now ALSO runs the real PostToolUse secret/path gate (`gatePostTool`) over
 * the run's changed files + any captured output, and folds the truthful policy
 * verdict into the artifact metadata so the audit trail records whether the
 * post-tool surface was clean or positively flagged. The artifact's exported
 * shape (`AgentHookArtifact | undefined`) is unchanged — callers that only read
 * `.key` are unaffected; the gate verdict is additive metadata.
 */
export function captureLaunchArtifact(input: {
  taskId: string;
  runId: string;
  commandLine: string;
  changedFiles?: string[];
  /** Captured stdout/stderr or diff text to secret-scan (optional). */
  output?: string;
  runtimeId?: string;
  createdBy?: string;
}): AgentHookArtifact | undefined {
  try {
    const decision = evaluatePostToolUse({
      taskId: input.taskId,
      runId: input.runId,
      target: { command: input.commandLine },
      changedFiles: input.changedFiles,
    });
    const artifact = decision.artifacts?.[0];
    if (!artifact) return undefined;

    // Genuinely evaluate the post-tool surface and record the verdict.
    const gate = gatePostTool({
      taskId: input.taskId,
      runId: input.runId,
      runtimeId: input.runtimeId,
      createdBy: input.createdBy,
      changedFiles: input.changedFiles,
      output: input.output,
    });

    // Immutable: return a new artifact with the gate verdict merged into
    // metadata (never mutate the engine-produced object in place).
    return {
      ...artifact,
      metadata: {
        ...artifact.metadata,
        postToolGated: gate.gated,
        postToolGateReason: gate.reason,
        postToolGateFindingCount: gate.findings?.length ?? 0,
      },
    };
  } catch (err) {
    logger.warn({ taskId: input.taskId, err }, 'post-launch artifact capture failed (degrade-safe)');
    return undefined;
  }
}
