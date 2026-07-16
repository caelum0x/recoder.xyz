/**
 * Conductor continue op — CONTINUE / CHAT: send a NEW message to an existing
 * workspace and start ANOTHER agent run in the SAME worktree. Ported from the
 * proven v1 `conductor/continue-workspace.ts` onto the domain's injected seams.
 *
 * This is how the local chat product keeps directing the agent: each user
 * message is a new run over the worktree the prior runs already changed (the
 * agent sees the accumulated work). The new run reuses the deterministic
 * `run_<workspaceId>` id so its events append to the SAME workspace event log
 * the cockpit already streams (chat continuity), and the user's message is
 * persisted as a `user_message` RunEvent so the transcript survives a reload.
 *
 * Degrade-safe + truthful:
 *   - The workspace must exist, have a live worktree, and not be terminal.
 *   - The substrate must support an in-place relaunch (`continueRun`); otherwise
 *     a clear error surfaces instead of re-provisioning a new worktree.
 *   - State machine respected: awaiting_review → changes_requested → running
 *     (a message = changes requested); a running workspace is rejected.
 */
import { randomUUID } from 'node:crypto';
import { resolveRuntimeCommand } from '@recoder/substrate';
import type { TaskRun, Workspace, WorkspaceSubstrate } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { ConductorSubstrate, WorkspaceRepositoryPort } from '../ports/index.js';
import type { ConductorBrainMemory } from '../adapters/brain-memory.adapter.js';
import type { ConductorRunTailer } from '../adapters/run-tailer.adapter.js';
import type { AdvanceWorkspaceFn } from './workspace-review.ops.js';

export interface ContinueOpsDeps {
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  readonly advanceWorkspace: AdvanceWorkspaceFn;
  readonly getSubstrate: (id: WorkspaceSubstrate) => ConductorSubstrate;
  readonly repository: Pick<WorkspaceRepositoryPort, 'upsertRun' | 'appendEvent'>;
  readonly tailer: ConductorRunTailer;
  readonly logger: Logger;
  /** Optional memory brain — the follow-up message gets the same enrichment as launch. */
  readonly brain?: ConductorBrainMemory;
}

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
 * Returns the workspace's new running state + run id.
 */
export async function continueWorkspace(
  deps: ContinueOpsDeps,
  workspaceId: string,
  input: ContinueWorkspaceInput,
): Promise<ContinueWorkspaceResult> {
  const text = input.text?.trim();
  if (!text) throw new Error('message text is required');

  const workspace = await deps.getWorkspace(workspaceId);
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

  const substrate = deps.getSubstrate(workspace.substrate);
  if (!substrate.continueRun) {
    throw new Error(`substrate ${workspace.substrate} does not support continue/chat (no in-place relaunch)`);
  }

  // Enrich the message with the same owned knowledge the first run got, then
  // resolve the runtime's CLI invocation. Degrade-safe: enrichment failure falls
  // back to the raw message.
  let prompt = text;
  if (deps.brain) {
    try {
      const enriched = await deps.brain.enrichPrompt({
        prompt: text,
        taskId: workspace.taskId,
        repoPath: workspace.worktreePath,
        userId: input.createdBy ?? workspace.createdBy,
      });
      prompt = enriched.prompt;
    } catch (err) {
      deps.logger.warn({ workspaceId, err }, 'continue prompt enrichment failed; using raw message');
    }
  }

  let command: string | undefined;
  try {
    command = resolveRuntimeCommand(workspace.runtimeId, {
      prompt,
      ...(input.model ? { model: input.model } : {}),
      // Keep the workspace interactive across follow-up runs when it was created
      // interactive (the terminal-first center shows the live TUI).
      interactive: workspace.metadata?.interactive === true,
    }).commandLine;
  } catch (err) {
    // in_process substrates drive the prompt directly (no shell command); a
    // command-requiring substrate surfaces the truthful error from continueRun.
    deps.logger.info({ workspaceId, err }, 'no shell command resolved (in_process drives prompt directly)');
  }

  // A message = changes requested, then back to running (state machine: review →
  // changes_requested → running). awaiting_approval → running is also allowed.
  if (workspace.state === 'awaiting_review') {
    await deps.advanceWorkspace(workspaceId, 'changes_requested', undefined, {
      lastMessageAt: new Date().toISOString(),
    });
  }

  const handle = await substrate.continueRun(
    { ref: workspaceId, sessionName: workspace.sessionName, worktreePath: workspace.worktreePath },
    {
      workspaceId,
      worktreePath: workspace.worktreePath,
      ...(command ? { command } : {}),
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
  await deps.repository.upsertRun(run);

  // Persist the USER's message to the SAME event log as an audited event, so it
  // survives a reload and interleaves with the agent's reply (the cockpit renders
  // it as a user bubble). Without this, user messages would live only in the
  // frontend's optimistic state and vanish on refresh.
  await deps.repository.appendEvent({
    eventId: `event_${randomUUID()}`,
    type: 'user_message',
    taskId: workspace.taskId,
    runId,
    agentId: input.createdBy ?? workspace.createdBy,
    message: text,
    createdAt: now,
    data: { role: 'user' },
  });

  const running = await deps.advanceWorkspace(
    workspaceId,
    'running',
    { runId, sessionName: handle.sessionName, worktreePath: handle.worktreePath },
    { lastMessage: text.slice(0, 280), continuedAt: now },
  );

  deps.tailer.start({
    workspaceId,
    taskId: workspace.taskId,
    runId,
    substrate: workspace.substrate,
    sessionName: handle.sessionName ?? handle.ref,
    ...(handle.worktreePath ? { worktreePath: handle.worktreePath } : {}),
  });

  deps.logger.info(
    { workspaceId, runId, substrate: workspace.substrate },
    'workspace continued with new message run',
  );
  return { workspaceId, runId, state: running.state, substrate: running.substrate };
}
