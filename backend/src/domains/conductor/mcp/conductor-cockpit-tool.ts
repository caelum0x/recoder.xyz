/**
 * The conductor `recoder_converge_cockpit` MCP tool — the agent/desktop-invokable
 * LIVE convergence cockpit read (LOOM-ROADMAP.md §1 build-now #1). It makes
 * `recoder_converge_fanout` OBSERVABLE: for a shared `taskGroup` it returns ONE
 * truthful {@link CockpitSnapshot} — per-pane settle/native status folded with the
 * shipped read-only convergence probe ("K/N settled · C contested · A auto-mergeable
 * · P need a pick") plus the N-up column view. The heavy lifting lives in the pure
 * {@link ConvergeCockpitService}; this tool is the thin, governed binding, mirroring
 * {@link buildConductorWaitTools}:
 *
 *  - IDENTITY (SECURITY): the acting identity is the HOST-AUTHORIZED caller (2nd
 *    handler param), never a free-form `args.userId`. A group is keyed on a shared
 *    taskGroup (not a single workspace id), so the module narrows the read to the
 *    siblings the caller OWNS (recoder-kybr); a group the caller owns no sibling of
 *    resolves a truthful MISS (`{ snapshot:null }`), byte-identical to an unknown
 *    group — never a cross-tenant convergence oracle. An `admin`/`internal` caller
 *    reads across tenants.
 *  - TRUTHFULNESS: the snapshot flows straight back from the service — a degraded
 *    probe carries truthful zeros + a `reason`, never fabricated numbers.
 */
import type {
  McpToolCaller,
  McpToolRegistration,
} from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import type { CockpitSnapshot } from '../cockpit/converge-cockpit.service.js';

/**
 * The narrow module seam this tool binds to: the group-scoped, ownership-narrowed
 * cockpit read. A group with no accessible sibling resolves `null` (a truthful miss).
 */
export interface ConvergeCockpitSurface {
  convergeCockpit(
    taskGroup: string,
    principal: Principal
  ): Promise<CockpitSnapshot | null>;
}

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Coerce raw MCP args to a record without trusting the shape. */
function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Does the caller carry an elevated scope that may act as an arbitrary subject? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/**
 * Resolve the gate principal the read runs under, bound to the HOST-AUTHORIZED
 * caller — NOT a free-form `args.userId`. A non-privileged caller may only act as
 * its OWN subject; only `admin`/`internal` may name another. Mirrors the conductor
 * write/fanout tools exactly.
 */
function resolveCaller(
  body: Record<string, unknown>,
  caller: McpToolCaller | undefined
): Principal | { readonly error: string } {
  const authUserId = str(caller?.userId);
  if (!caller || !authUserId) {
    return { error: 'an authenticated caller identity is required' };
  }
  const requested = str(body.userId);
  let userId = authUserId;
  if (requested && requested !== authUserId) {
    if (!isPrivileged(caller)) {
      return { error: 'caller may only act as its own userId' };
    }
    userId = requested;
  }
  return {
    userId,
    ...(caller.orgId ? { orgId: caller.orgId } : {}),
    scopes: caller.scopes ?? ['read'],
    kind: 'apikey',
    isAnonymous: false,
    raw: null,
  };
}

function isError(r: unknown): r is { readonly error: string } {
  return typeof r === 'object' && r !== null && 'error' in r;
}

/**
 * Build the governed `recoder_converge_cockpit` MCP tool bound to the cockpit
 * surface. Kept SEPARATE from the other tool builders so its single registration is
 * explicit at the composer.
 */
export function buildConductorCockpitTools(
  surface: ConvergeCockpitSurface
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_converge_cockpit',
      description:
        "Read the LIVE convergence cockpit for a fan-out taskGroup: one truthful snapshot folding each pane's settle/native status with the read-only convergence probe — { agents[], settledCount/totalCount, contested[], autoMergeableCount, needsPickCount, cleanCount, fileVersions[] (N-up columns), convergeReady, summaryLine }. Args: taskGroup (required). Scoped to groups the caller owns a sibling of (admin/internal read across tenants); an unknown/unowned group resolves { snapshot:null }. Truthful: a degraded probe returns zeros + a reason, never fabricated numbers.",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const body = asObject(raw);
        const principal = resolveCaller(body, caller);
        if (isError(principal)) return principal;

        const taskGroup = str(body.taskGroup);
        if (!taskGroup) return { error: 'taskGroup is required' };

        // Ownership narrowing lives in the module read (recoder-kybr): a group with
        // no accessible sibling resolves null — a truthful miss, no cross-tenant oracle.
        const snapshot = await surface.convergeCockpit(taskGroup, principal);
        return { snapshot };
      },
    },
  ];
}
