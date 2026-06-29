import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

/**
 * The documented coding-workspace surface of the Recoder MCP host:
 * `workspace.create` / `workspace.diff` / `workspace.merge`. These are the
 * Agent OS control-plane counterparts of the conductor workspace endpoints
 * (`POST /workspaces`, `GET /workspaces/:id/diff`, `POST /workspaces/:id/merge`).
 *
 * agent-mcp stays runtime-agnostic: it never owns workspace state, never assumes
 * a substrate, worktree layout, or git remote. It operates ONLY over the
 * {@link WorkspaceRepositoryPort} the host (docker-backend) injects, exactly like
 * the tasks and git_nexus servers inject their ports.
 */
export const workspaceMcpServer: McpServerRegistration = {
  serverId: 'recoder.workspace',
  kind: 'workspace',
  displayName: 'Recoder Workspace',
  transport: 'http',
  enabled: true,
  toolNames: ['workspace.create', 'workspace.diff', 'workspace.merge'],
};

/**
 * Create a coding workspace. Mirrors the conductor `createWorkspace` input
 * surface, but owned by this package so core packages do not couple to a runtime.
 */
export type WorkspaceCreateInput = {
  /** Free-form task/prompt the workspace agent should work on. */
  prompt: string;
  /** Owning Agent OS space / project. */
  spaceId?: string;
  /** Logical repo identifier the host resolves to a checkout. */
  repo?: string;
  /** Base git ref to branch the worktree from (defaults host-side). */
  baseRef?: string;
  /** Branch name to use for the worktree (defaults host-side). */
  branch?: string;
  /** Agent id that should run inside the workspace. */
  agentId?: string;
  /** Identity creating the workspace, for audit/ownership. */
  createdBy?: string;
  metadata?: Record<string, unknown>;
};

/** A created/known workspace record. Minimal, runtime-agnostic shape. */
export type WorkspaceRecord = {
  workspaceId: string;
  state: string;
  branch?: string;
  baseRef?: string;
  spaceId?: string;
  repo?: string;
  worktreePath?: string;
};

/** Reviewable diff of a workspace worktree against its base ref. */
export type WorkspaceDiffResult = {
  workspaceId: string;
  baseRef: string;
  branch: string;
  /** `git diff --stat` summary against the base. */
  stat: string;
  /** Full unified patch of tracked changes against the base. */
  patch: string;
  /** Untracked files in the worktree (not yet in the patch). */
  untracked: string[];
  changedFiles: number;
};

export type WorkspaceMergeInput = {
  strategy?: 'squash' | 'merge' | 'rebase';
  deleteBranch?: boolean;
};

export type WorkspaceMergeResult = {
  workspaceId: string;
  branch: string;
  merged: boolean;
};

/**
 * The injected workspace control-plane port. A runtime backend (docker-backend's
 * conductor) implements this over its store of record. Every method must degrade
 * truthfully: a missing workspace yields a real not-found error; an un-approved
 * merge throws an approval error rather than fabricating `merged: true`.
 */
export type WorkspaceRepositoryPort = {
  createWorkspace(input: WorkspaceCreateInput): Promise<WorkspaceRecord>;
  diffWorkspace(workspaceId: string): Promise<WorkspaceDiffResult>;
  mergeWorkspace(workspaceId: string, input: WorkspaceMergeInput): Promise<WorkspaceMergeResult>;
};

/**
 * Register the REAL workspace tool handlers over an injected control-plane port.
 *
 * - `workspace.create` provisions a coding workspace through the host port.
 * - `workspace.diff` returns the reviewable worktree diff against the base ref.
 * - `workspace.merge` is the customer-visible delivery action; it is risk-gated
 *   by {@link estimateMcpToolRisk} and the host MUST enforce approval before the
 *   injected port performs the merge. The handler never fabricates success — it
 *   surfaces whatever truthful result/error the port returns.
 */
export function registerWorkspaceMcpTools(router: McpToolRouter, port: WorkspaceRepositoryPort): void {
  router.register(workspaceMcpServer, 'workspace.create', async (input) => {
    const created = await port.createWorkspace({
      prompt: readRequiredString(input.args.prompt, 'prompt'),
      spaceId: readString(input.args.spaceId) ?? input.task?.spaceId,
      repo: readString(input.args.repo) ?? input.task?.repo,
      baseRef: readString(input.args.baseRef),
      branch: readString(input.args.branch),
      agentId: readString(input.args.agentId) ?? input.actor.agentId,
      createdBy: readString(input.args.createdBy) ?? input.actor.agentId,
      metadata: isRecord(input.args.metadata) ? input.args.metadata : undefined,
    });
    return { content: created, metadata: { workspaceId: created.workspaceId, state: created.state } };
  });

  router.register(workspaceMcpServer, 'workspace.diff', async (input) => {
    const workspaceId = readRequiredString(input.args.workspaceId, 'workspaceId');
    const diff = await port.diffWorkspace(workspaceId);
    return {
      content: diff,
      metadata: { workspaceId: diff.workspaceId, changedFiles: diff.changedFiles },
    };
  });

  router.register(workspaceMcpServer, 'workspace.merge', async (input) => {
    const workspaceId = readRequiredString(input.args.workspaceId, 'workspaceId');
    const result = await port.mergeWorkspace(workspaceId, {
      strategy: readMergeStrategy(input.args.strategy),
      deleteBranch: readBoolean(input.args.deleteBranch),
    });
    return { content: result, metadata: { workspaceId: result.workspaceId, merged: result.merged } };
  });
}

function readMergeStrategy(value: unknown): WorkspaceMergeInput['strategy'] {
  const strategy = readString(value);
  if (strategy === 'squash' || strategy === 'merge' || strategy === 'rebase') {
    return strategy;
  }
  return undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readRequiredString(value: unknown, field: string): string {
  const result = readString(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
