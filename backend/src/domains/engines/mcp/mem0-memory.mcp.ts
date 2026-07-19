/**
 * Mem0 memory-insight MCP tools — the gated agent-facing surface for the DEEPER
 * mem0 engine capabilities (filtered recall, a relations graph, aggregate stats)
 * that the base `memory_*` fusion tools do not cover. Every call passes the
 * interop `authorize → risk → policy → audit` chain at the MCP host boundary, so
 * these handlers stay thin and truthful over the mem0 adapter seam.
 *
 *  - `mem0.recall`    — READ: filtered recall by scope (user/agent/run), a time
 *    window, and metadata, with an optional semantic query. Tenant-scoped.
 *  - `mem0.relations` — READ: an entity co-occurrence graph derived from the
 *    stored memories. Tenant-scoped (a non-privileged caller sees only its own).
 *  - `mem0.stats`     — READ: aggregate memory stats. Tenant-scoped; only an
 *    `admin`/`internal` caller may request the GLOBAL (unscoped) view.
 *
 * TENANT IDENTITY (SECURITY): `userId` is the tenant every handler acts for, and
 * it MUST be the authenticated caller — never free-form model output. The subject
 * is BOUND to the host-authorized {@link McpToolCaller} threaded to every handler
 * (the host registrar derives it via `callerFromInput`), NOT to the spoofable
 * `args.userId`. A NON-privileged caller may only act on its OWN subject: an
 * args-supplied `userId` that differs is rejected (403), and the aggregate reads
 * (`relations` / `stats`) are FORCED to the caller's own scope so an off-edge
 * `host.call` that forwards `args` unchanged can never yield cross-tenant totals
 * or a cross-tenant graph. Only an `admin`/`internal` caller may target an
 * arbitrary `userId` or the global view. Absent a caller these edge-exposed tools
 * refuse (`AUTH_REQUIRED`) rather than guessing an identity — the cross-tenant
 * class stays closed.
 *
 * DEGRADE-SAFE: every handler delegates to `deps.invoke`, which returns a typed
 * `{ ok:false, reason }` when the mem0 sidecar/QDRANT is down. The tool surfaces
 * that truthfully as `{ available:false, reason }` — it never throws the seam and
 * never fabricates a memory, edge, or count.
 */
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { InvokeResult } from '../types.js';

/** The `mem0` in-proc MCP server id (distinct from the `mem0` ENGINE descriptor). */
export const MEM0_MEMORY_MCP_SERVER_ID = 'mem0';

/** The deep-insight ops the tools drive on the mem0 adapter seam. */
export type Mem0InsightOp = 'recall' | 'relations' | 'stats';

/** The seam the tools bind to — one `invoke` over the mem0 adapter's insight ops. */
export interface Mem0MemoryMcpDeps {
  invoke(op: Mem0InsightOp, input: Record<string, unknown>): Promise<InvokeResult<unknown>>;
}

interface RecallInput {
  readonly userId?: string;
  readonly agentId?: string;
  readonly runId?: string;
  readonly query?: string;
  readonly createdAfter?: string;
  readonly createdBefore?: string;
  readonly metadata?: Record<string, unknown>;
  readonly limit?: number;
}

interface RelationsInput {
  readonly userId?: string;
  readonly focus?: string;
  readonly entityType?: string;
  readonly limit?: number;
}

interface StatsInput {
  readonly userId?: string;
}

/** Does the caller carry an elevated scope that may act on an arbitrary subject? */
function isPrivileged(caller: McpToolCaller | undefined): boolean {
  const scopes = caller?.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/** The authenticated caller's own subject, or a refusal for an absent identity. */
function requireCaller(caller: McpToolCaller | undefined): string {
  const userId = caller?.userId?.trim();
  if (!caller || !userId) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'mem0: no authorized caller identity');
  }
  return userId;
}

/**
 * Resolve the tenant `userId` a handler acts for, BOUND to the host-authorized
 * caller — never to the spoofable `args.userId`. A non-privileged caller may only
 * act on its OWN subject (an args-supplied mismatch is a 403); with no args the
 * caller's own id is used. Only `admin`/`internal` may target an arbitrary id.
 */
function resolveOwnSubject(requested: string | undefined, caller: McpToolCaller | undefined): string {
  const authUserId = requireCaller(caller);
  const asked = requested?.trim();
  if (!asked) return authUserId;
  if (isPrivileged(caller)) return asked;
  if (asked !== authUserId) {
    throw createError(ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED, 'mem0: caller may only act on its own subject');
  }
  return asked;
}

/**
 * Resolve the OPTIONAL scope for an aggregate read (`relations` / `stats`). A
 * non-privileged caller is FORCED to its own subject (the global/cross-tenant
 * view stays closed). A privileged caller may pass an explicit `userId` (target a
 * tenant) or omit it (the global view). Returns `undefined` only for the
 * privileged global case.
 */
function resolveScopeSubject(
  requested: string | undefined,
  caller: McpToolCaller | undefined,
): string | undefined {
  const authUserId = requireCaller(caller);
  if (!isPrivileged(caller)) return authUserId;
  const asked = requested?.trim();
  return asked || undefined;
}

/** Present an invoke result truthfully: the value on ok, a degrade object on fail. */
function present(result: InvokeResult<unknown>): unknown {
  if (result.ok) return result.value;
  return { available: false, reason: result.reason, ...(result.code ? { code: result.code } : {}) };
}

/** Build the mem0 memory-insight MCP tool registrations over the adapter seam. */
export function buildMem0MemoryMcpTools(deps: Mem0MemoryMcpDeps): readonly McpToolRegistration[] {
  return [
    {
      name: 'mem0.recall',
      description:
        'Filtered recall of mem0 memories by scope (userId/agentId/runId), an optional created_at ' +
        'window (createdAfter/createdBefore ISO 8601), metadata filters, and an optional semantic query. ' +
        'Read-only and tenant-scoped; returns { available:false, reason } truthfully when the sidecar is down.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as RecallInput;
        const userId = resolveOwnSubject(input.userId, caller);
        const payload: Record<string, unknown> = { userId };
        if (input.agentId?.trim()) payload.agentId = input.agentId.trim();
        if (input.runId?.trim()) payload.runId = input.runId.trim();
        if (input.query?.trim()) payload.query = input.query.trim();
        if (input.createdAfter?.trim()) payload.createdAfter = input.createdAfter.trim();
        if (input.createdBefore?.trim()) payload.createdBefore = input.createdBefore.trim();
        if (input.metadata && typeof input.metadata === 'object') payload.metadata = input.metadata;
        if (typeof input.limit === 'number' && input.limit > 0) payload.limit = Math.trunc(input.limit);
        return present(await deps.invoke('recall', payload));
      },
    },
    {
      name: 'mem0.relations',
      description:
        'Read the entity co-occurrence relations graph over stored mem0 memories (nodes = user/agent/run ' +
        'entities, edges = shared-memory co-occurrence). Tenant-scoped: a non-admin caller sees only its own ' +
        'memories. Optional focus/entityType center a neighborhood. Truthful degrade when the sidecar is down.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as RelationsInput;
        const scopeUserId = resolveScopeSubject(input.userId, caller);
        const payload: Record<string, unknown> = {};
        if (scopeUserId) payload.userId = scopeUserId;
        if (input.focus?.trim()) payload.focus = input.focus.trim();
        if (input.entityType?.trim()) payload.entityType = input.entityType.trim();
        if (typeof input.limit === 'number' && input.limit > 0) payload.limit = Math.trunc(input.limit);
        return present(await deps.invoke('relations', payload));
      },
    },
    {
      name: 'mem0.stats',
      description:
        'Aggregate mem0 memory statistics: totals, per-entity-type counts, distinct entities, and the ' +
        'created_at span. Tenant-scoped by default; only an admin/internal caller may request the global ' +
        '(unscoped) view. Read-only; truthful degrade when the sidecar is down.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const input = (raw ?? {}) as StatsInput;
        const scopeUserId = resolveScopeSubject(input.userId, caller);
        const payload: Record<string, unknown> = {};
        if (scopeUserId) payload.userId = scopeUserId;
        return present(await deps.invoke('stats', payload));
      },
    },
  ];
}

/**
 * The `mem0` server descriptor for the gated registry catalog. The integrator
 * adds this to the host registry + binds the handlers above (mirroring the
 * `enginesMcpServer` self-registration). Tool names MUST match
 * `buildMem0MemoryMcpTools`.
 */
export const mem0MemoryMcpServer = {
  serverId: MEM0_MEMORY_MCP_SERVER_ID,
  kind: 'custom' as const,
  displayName: 'Mem0 memory insights',
  transport: 'custom' as const,
  enabled: true,
  toolNames: ['mem0.recall', 'mem0.relations', 'mem0.stats'],
  metadata: { external: false },
};
