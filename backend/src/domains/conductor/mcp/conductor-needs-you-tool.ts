/**
 * The conductor `recoder_needs_you` MCP tool — the agent/desktop-invokable read of the
 * LIVE Needs-You queue (LOOM-ROADMAP.md build-now #4). It returns ONE truthful
 * {@link NeedsYouSnapshot} for the caller's panes: the ranked actionable entries
 * (awaiting_approval highest), the count needing the human, and a `degraded` flag +
 * reason whenever the push stream is not live — so a caller never reads a disconnected
 * empty queue as "nothing needs you". The heavy lifting lives in the pure
 * {@link NeedsYouQueueService}; this tool is the thin, GOVERNED binding, mirroring the
 * conductor cockpit/fanout tools:
 *
 *  - IDENTITY (SECURITY): the acting identity is the HOST-AUTHORIZED caller (2nd handler
 *    param), NEVER a free-form `args.userId`. Absent a caller ⇒ `AUTH_REQUIRED`. A
 *    non-privileged caller may only read its OWN panes; naming another `userId` is a 403
 *    (no cross-tenant queue oracle). An `admin`/`internal` caller may read another
 *    subject or a cross-tenant task group.
 *  - TRUTHFULNESS: the snapshot flows straight back from the service — a degraded stream
 *    carries `degraded:true` + a reason, never a fabricated all-clear; the queue is never
 *    wired ⇒ `SERVICE_UNAVAILABLE` (the composer throws), never a faked empty queue.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type {
  McpToolCaller,
  McpToolRegistration,
} from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import type {
  NeedsYouScope,
  NeedsYouSnapshot,
} from '../attention/needs-you-queue.service.js';

/**
 * The narrow module seam this tool binds to: the owner-scoped Needs-You read. The
 * composer enforces ownership + throws `SERVICE_UNAVAILABLE` when the queue is unwired.
 */
export interface NeedsYouSurface {
  needsYouSnapshot(
    scope: NeedsYouScope,
    principal: Principal
  ): Promise<NeedsYouSnapshot>;
}

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Coerce raw MCP args to a record without trusting the shape. */
function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Does the caller carry an elevated scope that may act across tenants/subjects? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/** Require an authorized caller identity — absent ⇒ `AUTH_REQUIRED` (never guess a tenant). */
function requireCaller(caller: McpToolCaller | undefined): McpToolCaller {
  if (!caller || !str(caller.userId)) {
    throw createError(
      ErrorCode.AUTH_REQUIRED,
      'conductor: no authorized caller identity'
    );
  }
  return caller;
}

/** Build the gate principal from the host-authorized caller (never a forged scope). */
function principalOf(caller: McpToolCaller): Principal {
  return {
    userId: str(caller.userId)!,
    ...(caller.orgId ? { orgId: caller.orgId } : {}),
    scopes: caller.scopes ?? ['read'],
    kind: 'apikey',
    isAnonymous: false,
    raw: null,
  };
}

/**
 * Build the governed `recoder_needs_you` MCP tool bound to the Needs-You surface. Kept
 * SEPARATE from the other tool builders so its single registration is explicit at the composer.
 */
export function buildConductorNeedsYouTools(
  surface: NeedsYouSurface
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_needs_you',
      description:
        "Read the LIVE Needs-You queue for the caller's panes: one truthful snapshot of the panes that NEED THE HUMAN, RANKED most-urgent first (awaiting_approval > review_ready > working > agent_idle_prompt), plus { entries[{workspaceId, agentKind, state, rank, nativeStatus, needsYou, seen}], count (panes needing you), total, degraded, reason }. Args: taskGroup (optional — narrow to one parallel-run group), userId (optional — admin/internal only). Owner-scoped: a non-privileged caller reads only its OWN panes; naming another userId is refused (403). Truthful: 'unknown'/no-signal panes are NOT counted as actionable; a disconnected stream returns degraded:true + a reason (never a fabricated all-clear); the queue unwired ⇒ SERVICE_UNAVAILABLE.",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const body = asObject(raw);
        const authUserId = str(authorized.userId)!;

        // OWNER SCOPE: a non-privileged caller is pinned to its own subject; a named
        // `userId` that differs is a 403 (never a cross-tenant queue oracle). An
        // admin/internal caller may read another subject.
        const requestedUser = str(body.userId);
        let owner = authUserId;
        if (requestedUser && requestedUser !== authUserId) {
          if (!isPrivileged(authorized)) {
            throw createError(
              ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
              'conductor: caller may only read its own Needs-You queue'
            );
          }
          owner = requestedUser;
        }

        const taskGroup = str(body.taskGroup);
        const scope: NeedsYouScope = {
          owner,
          ...(taskGroup ? { taskGroup } : {}),
        };
        // The composer applies the ownership filter + throws SERVICE_UNAVAILABLE when
        // the push stream is not wired — a truthful refusal, never a faked empty queue.
        return surface.needsYouSnapshot(scope, principalOf(authorized));
      },
    },
  ];
}
