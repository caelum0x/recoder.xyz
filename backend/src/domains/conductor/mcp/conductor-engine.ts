/**
 * Conductor MCP tools (skeleton per the in-proc engine-wiring checklist).
 * Registered as the `conductor` server into the interop-gated MCP host by the
 * engines domain (Phase 6): the engine must be added to `IN_PROC_SERVERS`
 * (interop-host) + `ENGINE_SERVERS` (inproc-engines) and this builder called in
 * `buildInProcEngineRouter`, else the tools 404 (see the wiring report).
 *
 * Every call passes the `authorize→risk→policy→audit` interop chain + governance
 * gate at the host boundary, so these handlers stay thin, READ-ONLY, and truthful
 * over the module surface. The write-bearing operations (create / steer /
 * reconcile) are governed mutations exposed through the `/api/conductor` edges +
 * the module's gate; this engine owns the read-only introspection surface and
 * degrades safely (never fabricates a workspace or a live session).
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { ConductorModule } from '../index.js';

interface GetWorkspaceInput {
  readonly workspaceId?: string;
}
interface FindingsInput {
  readonly workspaceId?: string;
}

export function buildConductorMcpTools(module: ConductorModule): readonly McpToolRegistration[] {
  return [
    {
      name: 'conductor_list_workspaces',
      description: 'List conductor workspace records (state of record for parallel agent runs).',
      handler: async () => {
        const workspaces = await module.listWorkspaces();
        return {
          count: workspaces.length,
          workspaces: workspaces.map((w) => ({
            workspaceId: w.workspaceId,
            state: w.state,
            substrate: w.substrate,
            runtimeId: w.runtimeId,
            branch: w.branch,
            projectId: w.projectId,
            taskId: w.taskId,
          })),
        };
      },
    },
    {
      name: 'conductor_get_workspace',
      description: 'Fetch one conductor workspace by id (null when it does not exist).',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as GetWorkspaceInput;
        if (!input.workspaceId) return { error: 'workspaceId is required' };
        const workspace = await module.getWorkspace(input.workspaceId);
        return { workspace: workspace ?? null };
      },
    },
    {
      name: 'conductor_substrates',
      description: 'Truthful per-substrate availability (tmux_worktree/daytona/in_process/ssh).',
      handler: () => ({ substrates: module.substrates() }),
    },
    {
      name: 'conductor_reconcile_findings',
      description: 'List reconcile findings (orphan sessions/worktrees, crashed runs) for review.',
      handler: async (raw: unknown) => {
        const input = (raw ?? {}) as FindingsInput;
        const findings = await module.listReconcileFindings(input.workspaceId);
        return { count: findings.length, findings };
      },
    },
  ];
}
