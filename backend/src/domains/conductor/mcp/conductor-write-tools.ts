/**
 * Conductor WRITE MCP tools — the governed-mutation surface (`steer` / `stop` /
 * `advance`) exposed as MCP tools alongside the read-only introspection tools in
 * `conductor-engine.ts`.
 *
 * GOVERNANCE (the core posture): the MCP host authorizes the CALL at its boundary
 * (`authorize → risk → policy → audit`), and the conductor module's own write
 * methods ALSO self-gate (`guardConductorWrite → decide`, then `recordAudit`).
 * These tools are the thin binding between them: they act under the AUTHENTICATED
 * caller and delegate to the already-gated module method. Whatever the module's
 * governance verdict is flows straight back: a `deny` / `needs_approval` verdict
 * surfaces as `{ ok:false, gated:true, verdict }` with NO state change — the tool
 * never fakes a mutation the gate blocked.
 *
 * IDENTITY (SECURITY, non-negotiable): the acting identity is derived from the
 * HOST-AUTHORIZED caller (the 2nd handler param `McpToolCaller.userId`), NEVER
 * blindly from a free-form tool arg. The MCP host also overwrites `args.userId`
 * with the resolved principal at the edge, but that binding is the EDGE's — a
 * future off-edge invoker (an in-proc bridge, an A2A relay) could forward
 * `args.userId` unchanged. So these tools self-check: a non-privileged caller may
 * only act as its OWN `userId` (a differing `args.userId` is refused), only an
 * `admin`/`internal` caller may name an arbitrary subject, and absent a caller the
 * tool refuses rather than trusting the arg. The gate principal is built from the
 * edge-bound caller (its real org/scopes) and is NEVER a `kind:'internal'`
 * principal minted from caller input. This is what stops any logged-in caller from
 * steering/stopping another tenant's live agent session by naming a victim id.
 *
 * Handlers stay thin, fail fast on bad input (`{ ok:false, error }`), and degrade
 * truthfully (a not-found / non-live workspace is a real `ok:false`, never faked).
 */
import type { WorkspaceState, Workspace } from '@recoder/agent-os';
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import type { SteerInput } from '../types.js';
import type { ConductorWriteResult } from '../conductor-module.js';
import { ADVANCE_TARGET_STATES } from '../conductor-module.js';

/**
 * The narrow slice of the conductor module these tools bind to — the three
 * already-gated write methods. Kept minimal so the tools compose against a
 * contract (trivially fakeable in tests), not the whole composer.
 */
export interface ConductorWriteSurface {
  steerWorkspace(input: SteerInput, principal: Principal): Promise<ConductorWriteResult<void>>;
  stopWorkspace(workspaceId: string, principal: Principal): Promise<ConductorWriteResult<Workspace>>;
  advanceWorkspaceState(
    workspaceId: string,
    to: WorkspaceState,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>>;
}

/** A fail-fast validation error (bad tool input; no module call). */
interface ToolInputError {
  readonly ok: false;
  readonly error: string;
}

/** The resolved acting tenant of a conductor write: its userId + the gate principal. */
interface ResolvedCaller {
  /** The tenant the write is performed + audited under. */
  readonly userId: string;
  /** The edge-bound principal the module self-gates the write under. */
  readonly principal: Principal;
}

/** Does the caller carry an elevated scope that may act as an arbitrary subject? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/**
 * Resolve the tenant a conductor write acts under, bound to the HOST-AUTHORIZED
 * {@link McpToolCaller} (2nd handler param) — NOT the free-form `args.userId`.
 *
 * SECURITY: a caller-supplied `args.userId` is not an authority source. A
 * non-privileged caller may only act as its OWN subject (a differing `args.userId`
 * is refused), only an `admin`/`internal` caller may name an arbitrary subject, and
 * absent a caller the tool refuses rather than trusting the arg. The gate principal
 * carries the caller's real org/scopes and is NEVER `kind:'internal'` (which would
 * forge the trusted-runtime authority the governance gate admits) minted from input.
 * Returns a {@link ToolInputError} refusal (thin, fail-fast) on any mismatch/absence.
 */
function resolveCaller(
  body: Record<string, unknown>,
  caller: McpToolCaller | undefined,
): ResolvedCaller | ToolInputError {
  const authUserId = caller?.userId?.trim();
  if (!caller || !authUserId) {
    return inputError('an authenticated caller identity is required');
  }
  const requested = reqString(body, 'userId');
  let userId = authUserId;
  if (requested && requested !== authUserId) {
    if (!isPrivileged(caller)) {
      return inputError('caller may only act as its own userId');
    }
    userId = requested;
  }
  const principal: Principal = {
    userId,
    ...(caller.orgId ? { orgId: caller.orgId } : {}),
    scopes: caller.scopes ?? ['read', 'write'],
    kind: 'apikey',
    isAnonymous: false,
    raw: null,
  };
  return { userId, principal };
}

/** Type guard: did {@link resolveCaller} fail (a refusal, not a resolved caller)? */
function isCallerError(r: ResolvedCaller | ToolInputError): r is ToolInputError {
  return (r as ToolInputError).ok === false;
}

/** Coerce raw MCP args to a record without trusting the shape. */
function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** Read a required non-empty string, or `null` (caller returns a ToolInputError). */
function reqString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function inputError(error: string): ToolInputError {
  return { ok: false, error };
}

/** Shape a module write result into the tool's response envelope. */
function toResponse<T>(result: ConductorWriteResult<T>): Record<string, unknown> {
  const gated = result.verdict.effect !== 'allow';
  return {
    ok: result.ok,
    gated,
    verdict: result.verdict,
    ...(result.reason ? { reason: result.reason } : {}),
    ...(result.value !== undefined ? { value: result.value } : {}),
  };
}

/**
 * Build the conductor write tools bound to the module's write surface. Each tool
 * delegates to the module's already-gated method; a blocked verdict is returned as
 * a truthful non-mutating refusal.
 */
export function buildConductorWriteTools(
  surface: ConductorWriteSurface,
): readonly McpToolRegistration[] {
  return [
    {
      name: 'conductor_steer',
      description:
        'Steer a LIVE conductor workspace by injecting keys/text into its interactive agent session (send-keys). Governed: a blocked verdict refuses without delivery. A non-running / handle-less workspace is a truthful ok:false, never faked.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const body = asObject(raw);
        const resolved = resolveCaller(body, caller);
        if (isCallerError(resolved)) return resolved;
        const workspaceId = reqString(body, 'workspaceId');
        const keys = typeof body.keys === 'string' ? body.keys : null;
        if (!workspaceId) return inputError('workspaceId is required');
        if (keys == null || keys.trim().length === 0) return inputError('keys is required');
        const input: SteerInput = {
          workspaceId,
          keys,
          ...(typeof body.submit === 'boolean' ? { submit: body.submit } : {}),
        };
        const result = await surface.steerWorkspace(input, resolved.principal);
        return toResponse(result);
      },
    },
    {
      name: 'conductor_stop',
      description:
        'Gracefully STOP a running conductor workspace: kill the live session (worktree preserved for review) and transition it to cancelled. Governed: a blocked verdict refuses. A substrate-kill fault leaves the state UNCHANGED (ok:false), never a fake stop.',
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const body = asObject(raw);
        const resolved = resolveCaller(body, caller);
        if (isCallerError(resolved)) return resolved;
        const workspaceId = reqString(body, 'workspaceId');
        if (!workspaceId) return inputError('workspaceId is required');
        const result = await surface.stopWorkspace(workspaceId, resolved.principal);
        return toResponse(result);
      },
    },
    {
      name: 'conductor_advance',
      description:
        `Advance a conductor workspace one lifecycle step in the review→merge flow (allowed targets: ${ADVANCE_TARGET_STATES.join(', ')}). Governed + PURE: an illegal from→to step (or a delivery/archive/merge target) is a truthful refusal, never a forced write.`,
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const body = asObject(raw);
        const resolved = resolveCaller(body, caller);
        if (isCallerError(resolved)) return resolved;
        const workspaceId = reqString(body, 'workspaceId');
        const to = reqString(body, 'to') as WorkspaceState | null;
        if (!workspaceId) return inputError('workspaceId is required');
        if (!to) return inputError('to (target state) is required');
        if (!ADVANCE_TARGET_STATES.includes(to)) {
          return inputError(`to must be one of: ${ADVANCE_TARGET_STATES.join(', ')}`);
        }
        const result = await surface.advanceWorkspaceState(workspaceId, to, resolved.principal);
        return toResponse(result);
      },
    },
  ];
}
