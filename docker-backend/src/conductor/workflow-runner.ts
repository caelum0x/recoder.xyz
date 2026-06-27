/**
 * Multi-agent workflow runner — orchestrates multiple agents on a task.
 *
 * Per docs/agent-os/02-task-lifecycle.md and docs/subsystems/coordination.md:
 * supports four orchestration patterns:
 *   - direct:     one agent → one workspace (the default)
 *   - fan-out:    N agents in parallel on the same task (different scopes)
 *   - pipeline:   sequential agents (output of one feeds the next)
 *   - competitive: race N agents on the same task, pick the best diff
 *
 * Each pattern creates isolated worktrees per agent (no collisions), governs
 * resources via the resource-governor, and tracks all runs as RunEvents.
 */
import { randomUUID } from 'node:crypto';
import { createLogger } from '../logger.js';
import { agentOsContainer } from '../agent-os/service-container';
import { resolveRuntimeCommand, type ConductorRuntimeId } from './runtime-commands.js';
import { launchRuntime, stopRuntime, type RuntimeLaunchResult } from './runtime-driver.js';
import { admitWorkspace, type ResourceLimits } from './resource-governor.js';
import { enrichPrompt } from './bundle.js';
import {
  transitionWorkspace,
  type Workspace,
  type TaskRun,
  type WorkspaceState,
} from '@recoder/agent-os';

const logger = createLogger('conductor:workflow');
const repository = () => agentOsContainer.repository;

export type WorkflowPattern = 'direct' | 'fan_out' | 'pipeline' | 'competitive';

export interface WorkflowStep {
  runtimeId: ConductorRuntimeId;
  prompt: string;
  model?: string;
  extraArgs?: string[];
  /** Scope label for fan-out (identifies which slice of the task this covers). */
  scope?: string;
}

export interface WorkflowRequest {
  spaceId: string;
  projectId: string;
  taskId: string;
  repoPath: string;
  createdBy: string;
  pattern: WorkflowPattern;
  steps: WorkflowStep[];
  baseRef?: string;
  env?: Record<string, string>;
  limits?: ResourceLimits;
}

export interface WorkflowResult {
  workflowId: string;
  pattern: WorkflowPattern;
  workspaceIds: string[];
  runs: { workspaceId: string; runId: string; runtimeId: ConductorRuntimeId; scope?: string }[];
  results: RuntimeLaunchResult[];
  state: 'running' | 'failed' | 'rejected';
  reason?: string;
}

/**
 * Execute a multi-agent workflow. Creates isolated workspaces per step,
 * launches agents according to the pattern, and returns the run bindings.
 *
 * Patterns:
 *   - direct:     one step → one workspace (fast path)
 *   - fan_out:    all steps launch in parallel (different scopes)
 *   - pipeline:   steps run sequentially (base ref shifts to previous HEAD)
 *   - competitive: all steps race on the same base, first to finish wins
 */
export async function executeWorkflow(request: WorkflowRequest): Promise<WorkflowResult> {
  const workflowId = `wf_${randomUUID()}`;
  const workspaceIds: string[] = [];
  const runs: WorkflowResult['runs'] = [];
  const results: RuntimeLaunchResult[] = [];

  if (request.steps.length === 0) {
    return { workflowId, pattern: request.pattern, workspaceIds, runs, results, state: 'failed', reason: 'no steps' };
  }

  // Resource-govern: check admission for each step BEFORE launching any.
  for (let i = 0; i < request.steps.length; i++) {
    const admission = await admitWorkspace(request.projectId, request.createdBy, request.limits);
    if (!admission.admitted) {
      return {
        workflowId,
        pattern: request.pattern,
        workspaceIds,
        runs,
        results,
        state: 'rejected',
        reason: `resource limit hit at step ${i}: ${admission.reason}`,
      };
    }
  }

  logger.info({ workflowId, pattern: request.pattern, steps: request.steps.length }, 'workflow starting');

  switch (request.pattern) {
    case 'direct':
      return executeDirect(request, workflowId);
    case 'fan_out':
      return executeFanOut(request, workflowId);
    case 'pipeline':
      return executePipeline(request, workflowId);
    case 'competitive':
      return executeCompetitive(request, workflowId);
    default:
      return { workflowId, pattern: request.pattern, workspaceIds, runs, results, state: 'failed', reason: `unknown pattern: ${request.pattern}` };
  }
}

// ---- Direct: one step → one workspace ----

async function executeDirect(req: WorkflowRequest, workflowId: string): Promise<WorkflowResult> {
  const step = req.steps[0];
  const result = await launchStep(req, step, req.baseRef || 'HEAD', workflowId, 0);
  return {
    workflowId,
    pattern: 'direct',
    workspaceIds: result.workspaceId ? [result.workspaceId] : [],
    runs: result.workspaceId ? [{ workspaceId: result.workspaceId, runId: result.runId!, runtimeId: step.runtimeId, scope: step.scope }] : [],
    results: [result.launchResult],
    state: result.launchResult.success ? 'running' : 'failed',
    reason: result.launchResult.error,
  };
}

// ---- Fan-out: all steps in parallel ----

async function executeFanOut(req: WorkflowRequest, workflowId: string): Promise<WorkflowResult> {
  const baseRef = req.baseRef || 'HEAD';
  const launchPromises = req.steps.map((step, i) => launchStep(req, step, baseRef, workflowId, i));
  const stepResults = await Promise.all(launchPromises);

  const workspaceIds = stepResults.filter((r) => r.workspaceId).map((r) => r.workspaceId!);
  const runs = stepResults.filter((r) => r.workspaceId).map((r, i) => ({
    workspaceId: r.workspaceId!,
    runId: r.runId!,
    runtimeId: req.steps[i].runtimeId,
    scope: req.steps[i].scope,
  }));
  const results = stepResults.map((r) => r.launchResult);
  const allSuccess = results.every((r) => r.success);

  return {
    workflowId,
    pattern: 'fan_out',
    workspaceIds,
    runs,
    results,
    state: allSuccess ? 'running' : 'failed',
    reason: allSuccess ? undefined : 'one or more agents failed to launch',
  };
}

// ---- Pipeline: sequential, base ref shifts to previous workspace HEAD ----

async function executePipeline(req: WorkflowRequest, workflowId: string): Promise<WorkflowResult> {
  const workspaceIds: string[] = [];
  const runs: WorkflowResult['runs'] = [];
  const results: RuntimeLaunchResult[] = [];
  let currentBase = req.baseRef || 'HEAD';

  for (let i = 0; i < req.steps.length; i++) {
    const step = req.steps[i];
    const stepResult = await launchStep(req, step, currentBase, workflowId, i);
    if (!stepResult.launchResult.success) {
      results.push(stepResult.launchResult);
      return {
        workflowId,
        pattern: 'pipeline',
        workspaceIds,
        runs,
        results,
        state: 'failed',
        reason: `pipeline step ${i} failed: ${stepResult.launchResult.error}`,
      };
    }
    if (stepResult.workspaceId) {
      workspaceIds.push(stepResult.workspaceId);
      runs.push({ workspaceId: stepResult.workspaceId, runId: stepResult.runId!, runtimeId: step.runtimeId, scope: step.scope });
      results.push(stepResult.launchResult);
      // Shift the base ref to this workspace's branch so the next step builds on it.
      currentBase = `recoder/${stepResult.workspaceId}`;
    }
  }

  return { workflowId, pattern: 'pipeline', workspaceIds, runs, results, state: 'running' };
}

// ---- Competitive: race N agents, all start on the same base ----

async function executeCompetitive(req: WorkflowRequest, workflowId: string): Promise<WorkflowResult> {
  const baseRef = req.baseRef || 'HEAD';
  const launchPromises = req.steps.map((step, i) => launchStep(req, step, baseRef, workflowId, i));
  const stepResults = await Promise.all(launchPromises);

  const workspaceIds = stepResults.filter((r) => r.workspaceId).map((r) => r.workspaceId!);
  const runs = stepResults.filter((r) => r.workspaceId).map((r, i) => ({
    workspaceId: r.workspaceId!,
    runId: r.runId!,
    runtimeId: req.steps[i].runtimeId,
    scope: req.steps[i].scope ?? `competitor-${i}`,
  }));
  const results = stepResults.map((r) => r.launchResult);
  const anySuccess = results.some((r) => r.success);

  logger.info({ workflowId, workspaceIds: workspaceIds.length }, 'competitive workflow launched — first to finish wins');

  return {
    workflowId,
    pattern: 'competitive',
    workspaceIds,
    runs,
    results,
    state: anySuccess ? 'running' : 'failed',
    reason: anySuccess ? undefined : 'all competitors failed to launch',
  };
}

// ---- Shared step launcher ----

interface StepResult {
  workspaceId?: string;
  runId?: string;
  launchResult: RuntimeLaunchResult;
}

async function launchStep(
  req: WorkflowRequest,
  step: WorkflowStep,
  baseRef: string,
  workflowId: string,
  index: number,
): Promise<StepResult> {
  const workspaceId = `ws_${randomUUID()}`;
  const runId = `run_${workspaceId}`;
  const now = new Date().toISOString();
  const branch = `recoder/${workspaceId}`;

  // Enrich the prompt with knowledge.
  let prompt = step.prompt;
  try {
    const enriched = await enrichPrompt({
      prompt: step.prompt,
      taskId: req.taskId,
      repoPath: req.repoPath,
      userId: req.createdBy,
    });
    prompt = enriched.prompt;
  } catch (err) {
    logger.warn({ taskId: req.taskId, err }, 'prompt enrichment failed; using raw prompt');
  }

  // Persist the workspace record FIRST (state of record).
  let workspace: Workspace = {
    workspaceId,
    spaceId: req.spaceId,
    projectId: req.projectId,
    taskId: req.taskId,
    runtimeId: step.runtimeId,
    substrate: 'tmux_worktree',
    branch,
    baseRef,
    state: 'created',
    createdBy: req.createdBy,
    createdAt: now,
    updatedAt: now,
    metadata: { workflowId, stepIndex: index, scope: step.scope },
  };
  workspace = await repository().upsertWorkspace(workspace);

  // Transition to setting_up.
  workspace = await repository().upsertWorkspace(transitionWorkspace(workspace, 'setting_up'));

  // Launch the runtime.
  const launchResult = await launchRuntime({
    workspaceId,
    taskId: req.taskId,
    runId,
    spaceId: req.spaceId,
    projectId: req.projectId,
    runtimeId: step.runtimeId,
    prompt,
    model: step.model,
    extraArgs: step.extraArgs,
    repoPath: req.repoPath,
    branch,
    baseRef,
    env: req.env,
    substrate: 'tmux_worktree',
    createdBy: req.createdBy,
  });

  if (!launchResult.success) {
    workspace = await repository().upsertWorkspace(
      transitionWorkspace(workspace, 'failed', { metadata: { error: launchResult.error } }),
    );
    logger.error({ workspaceId, error: launchResult.error }, 'workflow step launch failed');
    return { launchResult };
  }

  // Persist the run + transition to running.
  const run: TaskRun = {
    runId,
    taskId: req.taskId,
    spaceId: req.spaceId,
    state: 'running',
    startedAt: now,
    updatedAt: now,
    metadata: { workspaceId, runtimeId: step.runtimeId, workflowId, stepIndex: index, scope: step.scope },
  };
  await repository().upsertRun(run);

  workspace = await repository().upsertWorkspace(
    transitionWorkspace({ ...workspace, worktreePath: launchResult.worktreePath, sessionName: launchResult.sessionName, runId }, 'running'),
  );

  logger.info({ workspaceId, runId, runtimeId: step.runtimeId, workflowId, index }, 'workflow step launched');

  return { workspaceId, runId, launchResult };
}
