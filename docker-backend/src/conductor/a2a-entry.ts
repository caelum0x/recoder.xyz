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
import { isConductorRuntimeId } from './runtime-commands.js';

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
