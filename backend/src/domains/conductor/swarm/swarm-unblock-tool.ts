/**
 * The conductor `recoder_swarm_unblock` MCP tool -- the agent/desktop-invokable
 * swarm auto-unblock verb (LOOM-ROADMAP.md section 1 build-now #3). When a fanned
 * Loom pane goes native-Blocked, this resolves the blocking question from
 * Recoder-only sources (cross-runtime memory + a sibling that already decided) and,
 * by DEFAULT, ESCALATES it through the approval gate. The heavy lifting lives in the
 * pure {@link SwarmUnblockService}; this tool is the thin, GOVERNED binding, mirroring
 * {@link buildConductorWaitTools}:
 *
 *  - IDENTITY (SECURITY): the acting identity is the HOST-AUTHORIZED caller (2nd
 *    handler param), never a free-form `args.userId`. A non-privileged caller may
 *    only unblock a workspace it OWNS; an unowned named workspace is refused (403),
 *    not disclosed -- so this never becomes a cross-tenant attention/answer oracle.
 *    An `admin`/`internal` caller may act across tenants.
 *  - ESCALATE BY DEFAULT: `autoAnswer` defaults to `false`, so the tool escalates
 *    unless the caller EXPLICITLY opts into auto-answer AND the service's gates pass.
 *  - TRUTHFULNESS: the {@link SwarmUnblockResult} flows straight back -- an escalation
 *    carries the real `requestId`; an auto-answer only ever returns when the service
 *    actually delivered it (never a fabricated answer).
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type { Workspace } from '@recoder/agent-os';
import type {
  McpToolCaller,
  McpToolRegistration,
} from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import type {
  ResolveBlockedInput,
  SwarmUnblockResult,
} from './swarm-unblock.service.js';

/**
 * The narrow module seam this tool binds to: ownership resolution (`getWorkspace`)
 * plus the already-composed swarm-unblock entrypoint. Kept minimal so the tool
 * composes against a contract, not the whole conductor.
 */
export interface ConductorSwarmUnblockSurface {
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  resolveSwarmUnblock(input: ResolveBlockedInput): Promise<SwarmUnblockResult>;
}

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Coerce raw MCP args to a record without trusting the shape. */
function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Does the caller carry an elevated scope that may act across tenants? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/** Require an authorized caller identity -- absent => `AUTH_REQUIRED` (never guess a tenant). */
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

/** Build the gate principal from the host-authorized caller (never a forged scope). */
function principalOf(caller: McpToolCaller): Principal {
  return {
    userId: str(caller.userId)!,
    ...(caller.orgId ? { orgId: caller.orgId } : {}),
    scopes: caller.scopes ?? ['read', 'write'],
    kind: 'apikey',
    isAnonymous: false,
    raw: null,
  };
}

/** Read the optional confidence floor for an auto-answer (0..1), or `undefined`. */
function parseMinConfidence(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return Math.min(raw, 1);
}

/**
 * Build the governed `recoder_swarm_unblock` MCP tool bound to the swarm-unblock
 * surface. Kept SEPARATE from the other tool builders so its single registration is
 * explicit at the composer.
 */
export function buildConductorSwarmUnblockTools(
  surface: ConductorSwarmUnblockSurface
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_swarm_unblock',
      description:
        'Resolve a BLOCKED fan-out (Loom) pane: read the blocking question, gather candidate answers from Recoder memory + a sibling pane that already passed the same decision, and -- by DEFAULT -- ESCALATE via the approval gate (returns { action:"escalated", requestId }). An auto-answer only fires when autoAnswer:true AND a high-confidence, low-risk, evidenced answer passes the policy gate (returns { action:"answered", answer, source }); every injected answer is recorded as an evidenced memory candidate. Args: workspaceId (required), taskGroup (optional, enables the sibling source), autoAnswer (optional, default false), minConfidence (optional). Scoped to workspaces the caller owns (admin/internal act across tenants). Truthful: no candidate or a deny/needs_approval verdict escalates -- never a fabricated answer.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const body = asObject(raw);
        const workspaceId = str(body.workspaceId);
        if (!workspaceId) return { error: 'workspaceId is required' };

        // Ownership FIRST -- never disclose (even an unblock attempt) on another
        // tenant's workspace. Unknown => truthful miss; unowned => 403 (no oracle).
        const workspace = await surface.getWorkspace(workspaceId);
        if (!workspace) return { workspace: null };
        if (
          !isPrivileged(authorized) &&
          !callerOwnsWorkspace(authorized, workspace)
        ) {
          throw createError(
            ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
            'conductor: caller may only unblock workspaces it owns'
          );
        }

        const taskGroup = str(body.taskGroup);
        const minConfidence = parseMinConfidence(body.minConfidence);
        const input: ResolveBlockedInput = {
          workspaceId,
          ...(taskGroup ? { taskGroup } : {}),
          policy: {
            // ESCALATE BY DEFAULT: auto-answer is opt-in and still gated downstream.
            autoAnswer: body.autoAnswer === true,
            ...(minConfidence !== undefined ? { minConfidence } : {}),
          },
          actor: principalOf(authorized),
        };
        return surface.resolveSwarmUnblock(input);
      },
    },
  ];
}
