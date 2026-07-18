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
 *
 * TENANT SCOPING (SECURITY): a conductor `Workspace` is tenant-owned — it carries
 * `createdBy` (the owner userId) and an optional `tenant.orgId`. The MCP host gate
 * admits the *read* at its boundary; it does NOT scope WHICH tenant's workspaces
 * come back. Without binding here, an authenticated tenant A calling
 * `conductor_list_workspaces` (or `conductor_get_workspace` /
 * `conductor_reconcile_findings`) would receive every other tenant's workspace
 * records (branch, projectId, taskId, runtime) and orphan session/worktree
 * findings — a cross-tenant disclosure of the whole parallel-run fabric. So these
 * handlers resolve the caller from the host-authorized {@link McpToolCaller} (2nd
 * handler param) and filter to the workspaces it OWNS, mirroring the
 * agent-os/billing/cloud/identity read-binding:
 *   - Absent a caller ⇒ `AUTH_REQUIRED` (these tools are edge-exposed via the
 *     interop MCP host; never guess an identity).
 *   - A non-privileged caller sees ONLY workspaces it owns; an args-named
 *     workspace it does not own ⇒ `AUTHZ_PROJECT_ACCESS_DENIED` (403).
 *   - An `admin`/`internal` caller may read across tenants — a service acting on
 *     behalf of the whole control plane.
 * `conductor_substrates` stays open: it exposes only global per-substrate engine
 * availability (no tenant-scoped rows), so it carries no subject to bind.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { Workspace } from '@recoder/agent-os';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { ConductorModule } from '../index.js';

interface GetWorkspaceInput {
  readonly workspaceId?: string;
}
interface FindingsInput {
  readonly workspaceId?: string;
}

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Does the caller carry an elevated scope that may read across tenants? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/**
 * Require an authorized caller identity (these tools are edge-exposed through the
 * interop MCP host). Absent ⇒ `AUTH_REQUIRED` — never guess a tenant.
 */
function requireCaller(caller: McpToolCaller | undefined): McpToolCaller {
  if (!caller || !str(caller.userId)) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'conductor: no authorized caller identity');
  }
  return caller;
}

/**
 * Does the authorized caller own the workspace? A workspace is owned by its
 * `createdBy` userId, or by the caller's org when the workspace's tenant matches.
 * NEVER trusts a free-form arg — ownership is decided against the host-authorized
 * caller only.
 */
function callerOwnsWorkspace(caller: McpToolCaller, workspace: Workspace): boolean {
  const authUserId = str(caller.userId);
  if (authUserId && workspace.createdBy === authUserId) return true;
  const orgId = str(caller.orgId);
  return Boolean(orgId && workspace.tenant?.orgId === orgId);
}

export function buildConductorMcpTools(module: ConductorModule): readonly McpToolRegistration[] {
  return [
    {
      name: 'conductor_list_workspaces',
      description:
        'List conductor workspace records the caller owns (state of record for parallel agent runs). Scoped to the authorized caller; admin/internal reads across tenants.',
      handler: async (_raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const workspaces = await module.listWorkspaces();
        const visible = isPrivileged(authorized)
          ? workspaces
          : workspaces.filter((w) => callerOwnsWorkspace(authorized, w));
        return {
          count: visible.length,
          workspaces: visible.map((w) => ({
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
      description:
        'Fetch one conductor workspace the caller owns by id (null when it does not exist). A workspace owned by another tenant is refused (403), not disclosed.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const input = (raw ?? {}) as GetWorkspaceInput;
        const workspaceId = str(input.workspaceId);
        if (!workspaceId) return { error: 'workspaceId is required' };
        const workspace = await module.getWorkspace(workspaceId);
        if (!workspace) return { workspace: null };
        if (!isPrivileged(authorized) && !callerOwnsWorkspace(authorized, workspace)) {
          throw createError(
            ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
            'conductor: caller may only read workspaces it owns',
          );
        }
        return { workspace };
      },
    },
    {
      name: 'conductor_substrates',
      description: 'Truthful per-substrate availability (tmux_worktree/daytona/in_process/ssh).',
      handler: () => ({ substrates: module.substrates() }),
    },
    {
      name: 'conductor_reconcile_findings',
      description:
        'List reconcile findings (orphan sessions/worktrees, crashed runs) for the caller\'s workspaces. Scoped to the authorized caller; admin/internal reads across tenants (including unowned orphans).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const input = (raw ?? {}) as FindingsInput;
        const requested = str(input.workspaceId);

        if (isPrivileged(authorized)) {
          const findings = await module.listReconcileFindings(requested);
          return { count: findings.length, findings };
        }

        // Non-privileged: only findings tied to workspaces the caller owns. Orphan
        // findings (no workspaceId, or a workspace the caller does not own) are
        // operator-level infra data and stay hidden.
        const owned = new Set(
          (await module.listWorkspaces())
            .filter((w) => callerOwnsWorkspace(authorized, w))
            .map((w) => w.workspaceId),
        );
        if (requested) {
          if (!owned.has(requested)) {
            throw createError(
              ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
              'conductor: caller may only read findings for workspaces it owns',
            );
          }
          const findings = await module.listReconcileFindings(requested);
          return { count: findings.length, findings };
        }
        const all = await module.listReconcileFindings();
        const findings = all.filter((f) => f.workspaceId != null && owned.has(f.workspaceId));
        return { count: findings.length, findings };
      },
    },
  ];
}
