/**
 * deployment-engine — the concrete executor behind the `recoder.deploy` MCP
 * server. Lets an AGENT inspect and (behind the risk gate) drive the delivery of
 * its OWN workspace:
 *
 *  - `deploy.status`   — READ-ONLY over the workspace's delivery/preview state.
 *                        Always safe: it reports the conductor-owned workspace
 *                        state + preview URL + delivery summary, never a mutation.
 *  - `deploy.preview`  — publish a preview of the workspace. A `/deploy/`-shaped
 *                        write: the interop risk policy already routes it through
 *                        needs_approval. Degrade-safe here — when NO deploy backend
 *                        is wired for the runtime it returns a truthful
 *                        "no deploy backend configured" rather than faking a deploy.
 *  - `deploy.rollback` — roll a workspace's delivery back. Same gate + same
 *                        degrade-safe contract as `deploy.preview`.
 *
 * The workspace is resolved the SAME way preview-engine does (explicit
 * `workspaceId` wins, else the caller's task → its workspace). The preview URL and
 * delivery summary are OWNED by the conductor (workspace metadata), not invented
 * here. Deps are injected so the wiring is unit-testable without the conductor,
 * a network, or a real deploy provider.
 */
import { deploymentMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolCallInput } from '@recoder/agent-mcp';

/** Minimal workspace shape the engine needs (a subset of the domain Workspace). */
export interface DeploymentWorkspaceLike {
  workspaceId: string;
  taskId?: string;
  state?: string;
  metadata?: Record<string, unknown>;
}

/** Inputs a deploy backend receives for a preview/rollback action. */
export interface DeploymentActionInput {
  workspaceId: string;
  workspace: DeploymentWorkspaceLike;
  args: Record<string, unknown>;
}

/** Result of a deploy backend action (loose — provider-defined, must be truthful). */
export interface DeploymentActionResult {
  status: string;
  url?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * A concrete deploy provider for a workspace. OPTIONAL: when none is wired the
 * mutating tools degrade truthfully instead of fabricating a deployment.
 */
export interface DeploymentBackend {
  preview(input: DeploymentActionInput): Promise<DeploymentActionResult>;
  rollback(input: DeploymentActionInput): Promise<DeploymentActionResult>;
}

/** Injected conductor seams; the deploy backend is intentionally optional. */
export interface DeploymentEngineDeps {
  getWorkspace(id: string): Promise<DeploymentWorkspaceLike | null>;
  listWorkspaces(): Promise<DeploymentWorkspaceLike[]>;
  /** Optional concrete deploy provider. Absent → mutating tools degrade-safe. */
  deployBackend?: DeploymentBackend;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Read a preview URL off workspace metadata (several historical key spellings). */
function previewUrlOf(ws: DeploymentWorkspaceLike | null | undefined): string | undefined {
  const meta = ws?.metadata;
  if (!meta) return undefined;
  for (const value of [meta.previewUrl, meta.preview_url, meta.previewURL]) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
  }
  return undefined;
}

export function registerDeploymentMcpTools(
  router: McpToolRouter,
  deps: DeploymentEngineDeps,
): void {
  /**
   * Resolve the workspace this call is about: an explicit `workspaceId` wins,
   * otherwise the caller's task is matched to its workspace. Throws a truthful
   * error when neither resolves (never guesses).
   */
  async function resolveWorkspace(input: McpToolCallInput): Promise<DeploymentWorkspaceLike> {
    const wid = str(input.args.workspaceId) ?? str(input.args.id);
    if (wid) {
      const ws = await deps.getWorkspace(wid);
      if (!ws) throw new Error(`workspace not found: ${wid}`);
      return ws;
    }
    const tid = str(input.args.taskId) ?? input.task?.taskId;
    if (!tid) throw new Error('workspaceId (or a task context) is required');
    const all = await deps.listWorkspaces();
    // Most recent workspace for the task wins, mirroring control-plane read order.
    const forTask = all.filter((w) => w.taskId === tid);
    if (forTask.length === 0) throw new Error(`no workspace found for task ${tid}`);
    return forTask[forTask.length - 1];
  }

  // READ-ONLY: report the conductor-owned delivery/preview state. Always safe.
  router.register(deploymentMcpServer, 'deploy.status', async (input) => {
    const ws = await resolveWorkspace(input);
    const previewUrl = previewUrlOf(ws) ?? null;
    const delivery = (ws.metadata?.delivery as unknown) ?? null;
    return {
      content: {
        workspaceId: ws.workspaceId,
        state: ws.state ?? null,
        previewUrl,
        delivery,
        deployBackendConfigured: Boolean(deps.deployBackend),
        message: deps.deployBackend
          ? `Workspace ${ws.workspaceId} is ${ws.state ?? 'in an unknown state'}.`
          : 'No deploy backend is configured in this runtime; status reflects the conductor-owned workspace state only.',
      },
    };
  });

  // MUTATING (risk-gated at the interop host): publish a preview of the workspace.
  router.register(deploymentMcpServer, 'deploy.preview', async (input) => {
    const ws = await resolveWorkspace(input);
    if (!deps.deployBackend) {
      return {
        content: {
          workspaceId: ws.workspaceId,
          deployed: false,
          message: 'No deploy backend configured for this workspace — cannot deploy a preview.',
        },
      };
    }
    const result = await deps.deployBackend.preview({ workspaceId: ws.workspaceId, workspace: ws, args: input.args });
    return { content: { workspaceId: ws.workspaceId, deployed: true, ...result } };
  });

  // MUTATING (risk-gated at the interop host): roll a workspace's delivery back.
  router.register(deploymentMcpServer, 'deploy.rollback', async (input) => {
    const ws = await resolveWorkspace(input);
    if (!deps.deployBackend) {
      return {
        content: {
          workspaceId: ws.workspaceId,
          rolledBack: false,
          message: 'No deploy backend configured for this workspace — cannot roll back a deployment.',
        },
      };
    }
    const result = await deps.deployBackend.rollback({ workspaceId: ws.workspaceId, workspace: ws, args: input.args });
    return { content: { workspaceId: ws.workspaceId, rolledBack: true, ...result } };
  });
}
