/**
 * The conductor `recoder_workspace_wait` MCP tool — the agent-invokable
 * SYNCHRONOUS wait-until-settled primitive (herdr's `agent wait --until blocked`,
 * absorb #3) exposed beside the read/write conductor tools.
 *
 * An agent calls this to BLOCK until a workspace needs it (settled into a prompt,
 * a review, an approval, or an error), instead of polling `conductor_get_workspace`
 * in a hot loop. The heavy lifting lives in the pure {@link WaitService}; this tool
 * is the thin, governed binding:
 *
 *  - IDENTITY (SECURITY): the acting identity is the HOST-AUTHORIZED caller (2nd
 *    handler param), never a free-form `args.userId`. A non-privileged caller may
 *    only wait on a workspace it OWNS; an unowned named workspace is refused (403),
 *    not disclosed — mirroring `conductor_get_workspace` so this read primitive
 *    never becomes a cross-tenant attention oracle. An `admin`/`internal` caller
 *    may wait across tenants.
 *  - TRUTHFULNESS: the outcome flows straight back from the service — a timeout is
 *    `{ settled:false, reason:'timeout', lastState }`, a superseding run is
 *    `{ settled:false, reason:'run-superseded' }`; never a fabricated settle.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { Workspace } from '@recoder/agent-os';
import type {
  McpToolCaller,
  McpToolRegistration,
} from '../../../shared/module-base.js';
import type { AttentionState } from '../types.js';
import type {
  WaitIdentity,
  WaitOutcome,
  WaitRequest,
} from '../wait/wait.service.js';

/**
 * The narrow module seam this tool binds to: ownership resolution (`getWorkspace`)
 * plus the already-composed wait entrypoint. Kept minimal so the tool composes
 * against a contract, not the whole conductor.
 */
export interface ConductorWaitSurface {
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  waitForWorkspaceSettle(request: WaitRequest): Promise<WaitOutcome>;
}

/** The default wait budget (ms) when the caller does not pass one. */
export const DEFAULT_WAIT_TIMEOUT_MS = 120_000;
/** The hard ceiling on a single wait so a caller cannot pin a request forever. */
export const MAX_WAIT_TIMEOUT_MS = 600_000;

/** The attention states a caller may name in a custom settle set. */
const SETTLE_STATES: readonly AttentionState[] = [
  'agent_idle_prompt',
  'review_ready',
  'awaiting_approval',
  'error',
  'working',
  'unknown',
];

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Coerce raw MCP args to a record without trusting the shape. */
function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Does the caller carry an elevated scope that may read across tenants? */
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

/** Does the authorized caller own the workspace (by `createdBy` or matching org tenant)? */
function callerOwnsWorkspace(
  caller: McpToolCaller,
  workspace: Workspace
): boolean {
  const authUserId = str(caller.userId);
  if (authUserId && workspace.createdBy === authUserId) return true;
  const orgId = str(caller.orgId);
  return Boolean(orgId && workspace.tenant?.orgId === orgId);
}

/** Clamp a caller-supplied timeout into `(0, MAX]`, defaulting when absent/invalid. */
function resolveTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_WAIT_TIMEOUT_MS;
  }
  return Math.min(Math.floor(raw), MAX_WAIT_TIMEOUT_MS);
}

/** Parse an optional custom settle set (only valid attention states, deduped). */
function parseSettleSet(raw: unknown): readonly AttentionState[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const set = new Set<AttentionState>();
  for (const entry of raw) {
    const value = str(entry);
    if (value && (SETTLE_STATES as readonly string[]).includes(value)) {
      set.add(value as AttentionState);
    }
  }
  return set.size > 0 ? [...set] : undefined;
}

/** Parse an optional run-identity pin (`runId`/`runtimeId`) — only present fields. */
function parseIdentity(
  body: Record<string, unknown>
): WaitIdentity | undefined {
  const runId = str(body.runId);
  const runtimeId = str(body.runtimeId);
  if (!runId && !runtimeId) return undefined;
  return {
    ...(runId ? { runId } : {}),
    ...(runtimeId ? { runtimeId } : {}),
  };
}

/**
 * Build the `recoder_workspace_wait` MCP tool bound to the conductor wait surface.
 * Kept SEPARATE from the read/write tool builders so its single registration is
 * explicit at the composer.
 */
export function buildConductorWaitTools(
  surface: ConductorWaitSurface
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_workspace_wait',
      description:
        'Block until a conductor workspace SETTLES (needs you): it enters agent_idle_prompt, review_ready, awaiting_approval, or error — instead of polling. Returns { settled:true, state } on settle, or a truthful { settled:false, reason:"timeout"|"run-superseded", lastState }. Scoped to workspaces the caller owns (admin/internal wait across tenants). Args: workspaceId (required), timeoutMs (default 120000, max 600000), optional settleSet, optional runId/runtimeId to pin the run (a superseding run resolves run-superseded, never a stale settle).',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const body = asObject(raw);
        const workspaceId = str(body.workspaceId);
        if (!workspaceId) return { error: 'workspaceId is required' };

        // Ownership FIRST — never disclose (even a wait blocking) on another
        // tenant's workspace. Unknown ⇒ truthful miss; unowned ⇒ 403 (no oracle).
        const workspace = await surface.getWorkspace(workspaceId);
        if (!workspace) return { workspace: null };
        if (
          !isPrivileged(authorized) &&
          !callerOwnsWorkspace(authorized, workspace)
        ) {
          throw createError(
            ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
            'conductor: caller may only wait on workspaces it owns'
          );
        }

        const identity = parseIdentity(body);
        const settleSet = parseSettleSet(body.settleSet);
        const request: WaitRequest = {
          workspaceId,
          timeoutMs: resolveTimeoutMs(body.timeoutMs),
          ...(settleSet ? { settleSet } : {}),
          ...(identity ? { identity } : {}),
          ...(typeof body.sinceSeq === 'number' &&
          Number.isInteger(body.sinceSeq) &&
          body.sinceSeq >= 0
            ? { sinceSeq: body.sinceSeq }
            : {}),
        };
        return surface.waitForWorkspaceSettle(request);
      },
    },
  ];
}
