/**
 * `agent-os-engine` — the read-only MCP introspection surface for the control
 * plane (domain doc §6, NEW). Exposes the state-of-record to the interop-gated
 * MCP host so agents can inspect (never mutate) tasks / runs / the summary.
 * Mutations stay on the governed HTTP + run-event seams; these tools are pure
 * reads, mirroring the governance engine's introspection-only posture.
 *
 * TENANT SCOPING (SECURITY): the state-of-record is tenant-owned, so every read
 * is bound to the host-authorized {@link McpToolCaller} — NEVER served whole.
 * The MCP call already passed `authorize→risk→policy→audit` at the host boundary,
 * but the gate admits a *read*; it does not scope WHICH tenant's rows come back.
 * Without binding here, an authenticated tenant A calling `agent_os_list_tasks`
 * (or `agent_os_summary` / `agent_os_list_runs`) would receive every other
 * space's TaskSpec + TaskRun — a cross-tenant disclosure of the whole
 * control-plane. So these handlers resolve the caller's accessible spaces from
 * `caller.userId`/`orgId` (spaces they OWN) and filter the snapshot / task /
 * run lists to those spaces, mirroring the billing/cloud/identity binding:
 *   - Absent a caller ⇒ `AUTH_REQUIRED` (never guess an identity).
 *   - A non-privileged caller sees ONLY its own spaces; an args `spaceId`
 *     selector for a space it does not own ⇒ `AUTHZ_PROJECT_ACCESS_DENIED`.
 *   - An `admin`/`internal` caller may read across spaces (optionally narrowed
 *     to one `spaceId`) — a service acting on behalf of the whole control plane.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';
import type { Space } from '@recoder/agent-os';

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Does the caller carry an elevated scope that may read across spaces? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/** Does the authorized caller own (or belong to the org that owns) the space? */
function callerOwnsSpace(caller: McpToolCaller, space: Space): boolean {
  const authUserId = str(caller.userId);
  if (authUserId && space.ownerId === authUserId) return true;
  const orgId = str(caller.orgId);
  return Boolean(orgId && space.ownerId === orgId);
}

/**
 * The set of space ids a read may return. `null` ⇒ ALL spaces (an admin/internal
 * caller with no `spaceId` narrowing); otherwise the concrete, allowed id set.
 */
type SpaceScope = { readonly ids: ReadonlySet<string> | null };

/**
 * Resolve the space scope for a read tool from the host-authorized `caller`,
 * NEVER from free-form args. Non-privileged ⇒ the caller's OWN spaces; a foreign
 * `args.spaceId` selector is refused (403). Absent a caller ⇒ `AUTH_REQUIRED`.
 */
function resolveSpaceScope(spaces: readonly Space[], raw: unknown, caller: McpToolCaller | undefined): SpaceScope {
  if (!caller || !str(caller.userId)) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'agent-os: no authorized caller identity');
  }
  const privileged = isPrivileged(caller);
  const owned = new Set(spaces.filter((space) => callerOwnsSpace(caller, space)).map((space) => space.spaceId));
  const requested = str((raw as { spaceId?: unknown } | null | undefined)?.spaceId);

  if (requested) {
    if (!privileged && !owned.has(requested)) {
      throw createError(
        ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
        'agent-os: caller may only read spaces it owns',
      );
    }
    return { ids: new Set([requested]) };
  }
  return { ids: privileged ? null : owned };
}

/** Keep only rows whose `spaceId` is in scope (`ids === null` ⇒ all rows). */
function inScope<T extends { readonly spaceId: string }>(rows: readonly T[], scope: SpaceScope): T[] {
  if (scope.ids === null) return [...rows];
  const ids = scope.ids;
  return rows.filter((row) => ids.has(row.spaceId));
}

export function buildAgentOsMcpTools(repository: AgentOsRepositoryPort): readonly McpToolRegistration[] {
  return [
    {
      name: 'agent_os_summary',
      description: 'Read the agent-os state-of-record snapshot, scoped to the caller\'s spaces (read-only).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const snapshot = await repository.snapshot();
        const scope = resolveSpaceScope(snapshot.spaces, raw, caller);
        return {
          ...snapshot,
          spaces: inScope(snapshot.spaces, scope),
          tasks: inScope(snapshot.tasks, scope),
          runs: inScope(snapshot.runs, scope),
          githubDeliveryLinks: inScope(snapshot.githubDeliveryLinks, scope),
        };
      },
    },
    {
      name: 'agent_os_list_tasks',
      description: 'List control-plane task specs the caller\'s spaces own (read-only).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const spaces = await repository.listSpaces();
        const scope = resolveSpaceScope(spaces, raw, caller);
        return inScope(await repository.listTasks(), scope);
      },
    },
    {
      name: 'agent_os_list_runs',
      description: 'List task runs the caller\'s spaces own with their current state (read-only).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const spaces = await repository.listSpaces();
        const scope = resolveSpaceScope(spaces, raw, caller);
        return inScope(await repository.listRuns(), scope);
      },
    },
  ];
}
