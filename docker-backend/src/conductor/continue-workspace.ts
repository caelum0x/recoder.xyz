/**
 * Conductor continue-workspace — CONTINUE / CHAT: send a NEW message to an
 * existing workspace and start ANOTHER agent run in the SAME worktree.
 *
 * This is how a LOCAL chat product keeps directing the agent: each user message
 * is a new run over the worktree the prior runs already changed (the agent sees
 * the accumulated work). The workspace lifecycle is reused — a message moves the
 * workspace back onto the running path and a fresh run-tail streams its output
 * into the SAME workspace event log (chat continuity).
 *
 * Degrade-safe + truthful:
 *   - The workspace must exist, have a live worktree, and not be terminal/archived.
 *   - The substrate must support an in-place relaunch (`continueRun`); otherwise we
 *     surface a clear error instead of re-provisioning a new worktree.
 *   - State machine is respected: a review-state workspace goes
 *     awaiting_review → changes_requested → running (a message = changes
 *     requested), a running workspace is rejected (one active run at a time).
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md (review → changes_requested → running).
 */
import type { TaskRun, Workspace } from '@recoder/agent-os';
import { resolveRuntimeCommand } from '@recoder/substrate';
import { createLogger } from '../logger';
import { agentOsContainer } from '../agent-os/service-container';
import { advanceWorkspace, getWorkspace } from './workspace-service.js';
import { getSubstrate } from './substrate.js';
import { enrichPrompt } from './bundle.js';
import { startRunTail, stopRunTail } from './run-tailer.js';

const logger = createLogger('conductor:continue');

export interface ContinueWorkspaceInput {
  /** The next user message — the new instruction for the agent. */
  text: string;
  /** Optional model override for this message's run. */
  model?: string;
  /** Actor sending the message (for provenance/enrichment scope). */
  createdBy?: string;
}

export interface ContinueWorkspaceResult {
  workspaceId: string;
  runId: string;
  state: Workspace['state'];
  substrate: Workspace['substrate'];
}

/** States from which a NEW message can start a run (the workspace is "idle"). */
const CONTINUABLE_STATES: ReadonlySet<Workspace['state']> = new Set([
  'awaiting_review',
  'changes_requested',
  'awaiting_approval',
]);

/**
 * Start a new agent run in an existing workspace's worktree, driven by `text`.
 *
 * The new run reuses the deterministic `run_<workspaceId>` id so its events
 * append to the SAME workspace event log the cockpit already streams (chat
 * continuity). Returns the workspace's new running state + run id.
 */
export async function continueWorkspace(
  workspaceId: string,
  input: ContinueWorkspaceInput,
): Promise<ContinueWorkspaceResult> {
  const text = input.text?.trim();
  if (!text) throw new Error('message text is required');

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  if (!workspace.worktreePath) {
    throw new Error(`workspace has no worktree to continue: ${workspaceId} (state ${workspace.state})`);
  }
  if (workspace.state === 'running') {
    throw new Error('workspace already has a running agent — wait for it to finish or steer it');
  }
  if (workspace.state === 'merging' || workspace.state === 'merged' || workspace.state === 'archived') {
    throw new Error(`cannot continue a ${workspace.state} workspace`);
  }
  if (!CONTINUABLE_STATES.has(workspace.state)) {
    throw new Error(`cannot continue from state ${workspace.state}`);
  }

  const substrate = getSubstrate(workspace.substrate);
  if (!substrate.continueRun) {
    throw new Error(`substrate ${workspace.substrate} does not support continue/chat (no in-place relaunch)`);
  }

  // Enrich the message with the same owned knowledge the first run got, then
  // resolve the runtime's CLI invocation (tmux) — the in_process path drives the
  // rendered prompt directly. Degrade-safe: enrichment failure falls back to raw.
  let prompt = text;
  try {
    const enriched = await enrichPrompt({
      prompt: text,
      taskId: workspace.taskId,
      repoPath: workspace.worktreePath,
      userId: input.createdBy ?? workspace.createdBy,
    });
    prompt = enriched.prompt;
  } catch (err) {
    logger.warn({ workspaceId, err }, 'continue prompt enrichment failed; using raw message');
  }

  let command: string | undefined;
  try {
    command = resolveRuntimeCommand(workspace.runtimeId, { prompt, model: input.model }).commandLine;
  } catch (err) {
    // in_process substrates drive the prompt directly (no shell command); only
    // surface the error for substrates that need a command (handled below).
    logger.debug({ workspaceId, err }, 'no shell command resolved (in_process drives prompt directly)');
  }

  // A message = changes requested, then back to running (state machine: review →
  // changes_requested → running). awaiting_approval → running is also allowed.
  if (workspace.state === 'awaiting_review') {
    await advanceWorkspace(workspaceId, 'changes_requested', undefined, { lastMessageAt: new Date().toISOString() });
  }

  // Stop any lingering tail for the prior (terminal) run before the new one.
  stopRunTail(workspaceId);

  const handle = await substrate.continueRun(
    { ref: workspaceId, sessionName: workspace.sessionName, worktreePath: workspace.worktreePath },
    {
      workspaceId,
      worktreePath: workspace.worktreePath,
      command,
      prompt,
      runtimeId: workspace.runtimeId,
    },
  );

  // Reuse the deterministic run id so events append to the same workspace log.
  const runId = `run_${workspaceId}`;
  const now = new Date().toISOString();
  const run: TaskRun = {
    runId,
    taskId: workspace.taskId,
    spaceId: workspace.spaceId,
    state: 'running',
    startedAt: now,
    updatedAt: now,
    metadata: { workspaceId, runtimeId: workspace.runtimeId, continued: true },
  };
  await Promise.resolve(agentOsContainer.repository.upsertRun(run));

  const running = await advanceWorkspace(
    workspaceId,
    'running',
    { runId, sessionName: handle.sessionName, worktreePath: handle.worktreePath },
    { lastMessage: text.slice(0, 280), continuedAt: now },
  );

  startRunTail({
    workspaceId,
    taskId: workspace.taskId,
    runId,
    substrate: workspace.substrate,
    sessionName: handle.sessionName ?? handle.ref,
    worktreePath: handle.worktreePath,
  });

  logger.info({ workspaceId, runId, substrate: workspace.substrate }, 'workspace continued with new message run');
  return { workspaceId, runId, state: running.state, substrate: running.substrate };
}
