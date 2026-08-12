/**
 * The conductor `recoder_status_board` MCP tool — the agent/desktop-invokable read of the
 * LIVE native STATUS BOARD (LOOM-ROADMAP.md build-now #5). It returns ONE truthful
 * {@link StatusBoardSnapshot} for the caller's panes: a kanban of ALL the caller's live Loom
 * panes from ONE `session.snapshot`, bucketed into COLUMNS keyed by AttentionState, with the
 * pane count per column and a `degraded` flag + reason whenever the snapshot source is not
 * readable — so a caller never reads a dead board as a fresh "all clear". The heavy lifting
 * lives in the pure {@link StatusBoardService}; this tool is the thin, GOVERNED binding,
 * mirroring the conductor cockpit / needs-you tools:
 *
 *  - IDENTITY (SECURITY): the acting identity is the HOST-AUTHORIZED caller (2nd handler
 *    param), NEVER a free-form `args.userId`. Absent a caller ⇒ `AUTH_REQUIRED`. A
 *    non-privileged caller may only read its OWN panes; naming another `userId` is a 403
 *    (no cross-tenant board oracle). An `admin`/`internal` caller may read another subject
 *    or a cross-tenant task group.
 *  - TRUTHFULNESS: the snapshot flows straight back from the service — a dead snapshot
 *    carries `degraded:true` + a reason with empty columns, never a fabricated board; the
 *    snapshot source unwired ⇒ `SERVICE_UNAVAILABLE` (the composer throws), never a faked
 *    empty board. `'unknown'`-status panes sit in the `unknown` column (shown, truthful),
 *    never miscounted as settled/ready.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type {
  McpToolCaller,
  McpToolRegistration,
} from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import type {
  StatusBoardScope,
  StatusBoardSnapshot,
} from '../attention/status-board.service.js';

/**
 * The narrow module seam this tool binds to: the owner-scoped status-board read. The
 * composer enforces ownership + throws `SERVICE_UNAVAILABLE` when the snapshot source is
 * unwired.
 */
export interface StatusBoardSurface {
  statusBoardSnapshot(
    scope: StatusBoardScope,
    principal: Principal
  ): Promise<StatusBoardSnapshot>;
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
 * Build the governed `recoder_status_board` MCP tool bound to the status-board surface. Kept
 * SEPARATE from the other tool builders so its single registration is explicit at the composer.
 */
export function buildConductorStatusBoardTools(
  surface: StatusBoardSurface
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_status_board',
      description:
        "Read the LIVE native status board for the caller's panes: ONE truthful snapshot of ALL the caller's live Loom panes from one session.snapshot, bucketed into COLUMNS keyed by attention state — { columns: { awaiting_approval[], agent_idle_prompt[], review_ready[], working[], error[], unknown[] } of { workspaceId, agentKind, taskGroup?, nativeStatus (RAW Loom status string: idle/working/blocked/done/unknown) }, totals (count per column), total, degraded, reason }. Args: taskGroup (optional — narrow to one parallel-run group), userId (optional — admin/internal only). Owner-scoped: a non-privileged caller reads only its OWN panes; naming another userId is refused (403). Truthful: 'unknown'-status panes sit in the unknown column (never miscounted as settled/ready); a dead snapshot returns degraded:true + a reason with empty columns (never a fabricated board); the snapshot source unwired ⇒ SERVICE_UNAVAILABLE.",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const body = asObject(raw);
        const authUserId = str(authorized.userId)!;

        // OWNER SCOPE: a non-privileged caller is pinned to its own subject; a named
        // `userId` that differs is a 403 (never a cross-tenant board oracle). An
        // admin/internal caller may read another subject.
        const requestedUser = str(body.userId);
        let owner = authUserId;
        if (requestedUser && requestedUser !== authUserId) {
          if (!isPrivileged(authorized)) {
            throw createError(
              ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
              'conductor: caller may only read its own status board'
            );
          }
          owner = requestedUser;
        }

        const taskGroup = str(body.taskGroup);
        const scope: StatusBoardScope = {
          owner,
          ...(taskGroup ? { taskGroup } : {}),
        };
        // The composer applies the ownership filter + throws SERVICE_UNAVAILABLE when the
        // snapshot source is not wired — a truthful refusal, never a faked empty board.
        return surface.statusBoardSnapshot(scope, principalOf(authorized));
      },
    },
  ];
}
