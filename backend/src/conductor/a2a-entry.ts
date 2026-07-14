/**
 * Conductor A2A entry — let an external A2A agent launch a Conductor workspace.
 *
 * The A2A standard server's executor calls this first: if the inbound message
 * carries a Conductor data part (a `data` part with `conductor: true` + a repo and
 * runtime), we provision a real workspace via workspace-service and report the
 * workspace/run ids back over A2A. Otherwise we return false and the caller falls
 * back to its default task handling — no duplication of the A2A plumbing.
 *
 * See docs/CONDUCTOR-ARCHITECTURE.md (step 6 — A2A entry).
 */
import { createLogger } from '../logger';
import { createWorkspace } from './workspace-service.js';
import { isConductorRuntimeId, type ConductorRuntimeId } from './runtime-commands.js';
import {
  executeWorkflow,
  type WorkflowPattern,
  type WorkflowRequest,
  type WorkflowResult,
  type WorkflowStep,
} from './workflow-runner.js';

const logger = createLogger('conductor:a2a');

interface ConductorRequest {
  projectId: string;
  repoPath: string;
  runtimeId: string;
  prompt: string;
  spaceId?: string;
  taskId?: string;
  branch?: string;
  baseRef?: string;
  model?: string;
  library?: string;
}

/** Extract a Conductor request from an A2A message's parts, if present + valid. */
function extractConductorRequest(context: any): ConductorRequest | null {
  const parts: any[] = context?.userMessage?.parts ?? [];
  const dataPart = parts.find((p) => (p?.type === 'data' || p?.kind === 'data') && p?.data?.conductor);
  if (!dataPart) return null;

  const d = dataPart.data as Record<string, unknown>;
  const text = parts.find((p) => p?.type === 'text' || p?.kind === 'text')?.text;
  const projectId = typeof d.projectId === 'string' ? d.projectId : undefined;
  const repoPath = typeof d.repoPath === 'string' ? d.repoPath : undefined;
  const runtimeId = typeof d.runtimeId === 'string' ? d.runtimeId : undefined;
  const prompt = typeof d.prompt === 'string' ? d.prompt : typeof text === 'string' ? text : undefined;

  if (!projectId || !repoPath || !runtimeId || !prompt) return null;
  if (!isConductorRuntimeId(runtimeId)) return null;

  return {
    projectId,
    repoPath,
    runtimeId,
    prompt,
    spaceId: typeof d.spaceId === 'string' ? d.spaceId : undefined,
    taskId: typeof d.taskId === 'string' ? d.taskId : undefined,
    branch: typeof d.branch === 'string' ? d.branch : undefined,
    baseRef: typeof d.baseRef === 'string' ? d.baseRef : undefined,
    model: typeof d.model === 'string' ? d.model : undefined,
    library: typeof d.library === 'string' ? d.library : undefined,
  };
}

/**
 * Handle an inbound A2A task as a Conductor workspace launch. Returns true if it
 * was a Conductor request (and was handled), false to fall through to the default.
 */
export async function tryConductorFromA2A(context: any): Promise<boolean> {
  const req = extractConductorRequest(context);
  if (!req) return false;

  const requester = context?.userMessage?.metadata?.requesterAgentId ?? 'a2a-external';
  const taskId = req.taskId ?? context?.task?.id ?? `a2a-${Date.now()}`;

  try {
    const workspace = await createWorkspace({
      spaceId: req.spaceId ?? 'default',
      projectId: req.projectId,
      taskId,
      repoPath: req.repoPath,
      runtimeId: req.runtimeId,
      prompt: req.prompt,
      model: req.model,
      library: req.library,
      branch: req.branch,
      baseRef: req.baseRef,
      createdBy: `a2a:${requester}`,
    });
    logger.info({ workspaceId: workspace.workspaceId, runtimeId: req.runtimeId }, 'A2A launched conductor workspace');
    context.complete?.([
      { type: 'text', text: `Conductor workspace ${workspace.workspaceId} (${workspace.state}) on ${req.runtimeId}.` },
      { type: 'data', data: { workspaceId: workspace.workspaceId, runId: workspace.runId, state: workspace.state } },
    ]);
    return true;
  } catch (err) {
    logger.error({ err }, 'A2A conductor launch failed');
    context.fail?.(err instanceof Error ? err.message : 'conductor launch failed');
    return true; // it WAS a conductor request; we handled (failed) it
  }
}

// ---------------------------------------------------------------------------
// Programmatic ingress — typed entry points for external agents / A2A servers.
// ---------------------------------------------------------------------------

export interface InboundAgentTask {
  prompt: string;
  runtimeId: string;
  repoPath: string;
  spaceId: string;
  projectId: string;
  taskId: string;
  createdBy: string;
  model?: string;
  library?: string;
  branch?: string;
  baseRef?: string;
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface InboundAgentTaskResult {
  workspaceId: string;
  runId: string;
  sessionName: string;
}

export interface InboundWorkflowTask {
  steps: WorkflowStep[];
  pattern: WorkflowPattern;
  spaceId: string;
  projectId: string;
  taskId: string;
  repoPath: string;
  createdBy: string;
  baseRef?: string;
  env?: Record<string, string>;
  limits?: WorkflowRequest['limits'];
  metadata?: Record<string, unknown>;
}

const WORKFLOW_PATTERNS: readonly WorkflowPattern[] = ['direct', 'fan_out', 'pipeline', 'competitive'];

function assertRequiredField(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`missing required field: ${field}`);
  }
}

/**
 * Typed programmatic entry for a single inbound code task. Validates all fields,
 * provisions a workspace, and returns the workspace/run/session binding.
 * Throws on validation failure or if the workspace doesn't reach 'running'.
 */
export async function handleInboundAgentTask(task: InboundAgentTask): Promise<InboundAgentTaskResult> {
  assertRequiredField(task.prompt, 'prompt');
  assertRequiredField(task.runtimeId, 'runtimeId');
  assertRequiredField(task.repoPath, 'repoPath');
  assertRequiredField(task.spaceId, 'spaceId');
  assertRequiredField(task.projectId, 'projectId');
  assertRequiredField(task.taskId, 'taskId');
  assertRequiredField(task.createdBy, 'createdBy');

  if (!isConductorRuntimeId(task.runtimeId)) {
    throw new Error(`unsupported runtimeId: ${task.runtimeId}`);
  }
  const runtimeId = task.runtimeId as ConductorRuntimeId;

  logger.info({ taskId: task.taskId, runtimeId, createdBy: task.createdBy }, 'inbound agent task received');

  const workspace = await createWorkspace({
    spaceId: task.spaceId,
    projectId: task.projectId,
    taskId: task.taskId,
    repoPath: task.repoPath,
    runtimeId,
    prompt: task.prompt,
    model: task.model,
    library: task.library,
    branch: task.branch,
    baseRef: task.baseRef,
    env: task.env,
    createdBy: task.createdBy,
    metadata: { source: 'a2a-inbound', ...(task.metadata ?? {}) },
  });

  if (workspace.state !== 'running') {
    const reason = (workspace.metadata?.error as string) ?? `state: ${workspace.state}`;
    throw new Error(`workspace ${workspace.workspaceId} failed to launch: ${reason}`);
  }

  if (!workspace.runId || !workspace.sessionName) {
    throw new Error(`workspace ${workspace.workspaceId} running but missing run/session binding`);
  }

  logger.info({ workspaceId: workspace.workspaceId, runId: workspace.runId }, 'inbound agent task launched');
  return { workspaceId: workspace.workspaceId, runId: workspace.runId, sessionName: workspace.sessionName };
}

/**
 * Typed programmatic entry for a multi-agent workflow. Validates all fields +
 * steps, fans out through executeWorkflow, returns the WorkflowResult truthfully
 * (including 'failed'/'rejected' states with reasons).
 */
export async function handleInboundWorkflow(task: InboundWorkflowTask): Promise<WorkflowResult> {
  assertRequiredField(task.spaceId, 'spaceId');
  assertRequiredField(task.projectId, 'projectId');
  assertRequiredField(task.taskId, 'taskId');
  assertRequiredField(task.repoPath, 'repoPath');
  assertRequiredField(task.createdBy, 'createdBy');

  if (!(WORKFLOW_PATTERNS as readonly string[]).includes(task.pattern)) {
    throw new Error(`unsupported pattern: ${task.pattern}`);
  }
  if (!Array.isArray(task.steps) || task.steps.length === 0) {
    throw new Error('workflow requires at least one step');
  }
  for (let i = 0; i < task.steps.length; i++) {
    if (!task.steps[i]?.prompt || !isConductorRuntimeId(task.steps[i].runtimeId)) {
      throw new Error(`step ${i} has invalid prompt or runtimeId`);
    }
  }

  logger.info({ taskId: task.taskId, pattern: task.pattern, steps: task.steps.length }, 'inbound workflow received');

  const result = await executeWorkflow({
    spaceId: task.spaceId,
    projectId: task.projectId,
    taskId: task.taskId,
    repoPath: task.repoPath,
    createdBy: task.createdBy,
    pattern: task.pattern,
    steps: task.steps,
    baseRef: task.baseRef,
    env: task.env,
    limits: task.limits,
  });

  if (result.state === 'running') {
    logger.info({ workflowId: result.workflowId, workspaceIds: result.workspaceIds }, 'inbound workflow launched');
  } else {
    logger.warn({ workflowId: result.workflowId, state: result.state, reason: result.reason }, 'inbound workflow did not reach running');
  }

  return result;
}
