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
 * IDENTITY (SECURITY, non-negotiable): the acting identity is NEVER taken from a
 * free-form tool arg. The MCP host edge OVERWRITES `args.userId` with the resolved,
 * authenticated `principal.userId` before the host ever runs the handler (a caller
 * that claims a DIFFERENT tenant is rejected 403 unless it holds an admin/internal
 * scope). So `args.userId` here is the real authenticated tenant, and the tool acts
 * as that NORMAL authenticated caller — it never mints a `kind:'internal'` principal
 * (the service/runtime authority the governance gate trusts) from caller input.
 * This is what stops any logged-in caller from steering/stopping another tenant's
 * live agent session by naming an arbitrary `actorId`.
 *
 * Handlers stay thin, fail fast on bad input (`{ ok:false, error }`), and degrade
 * truthfully (a not-found / non-live workspace is a real `ok:false`, never faked).
 */
import type { WorkspaceState, Workspace } from '@recoder/agent-os';
import type { McpToolRegistration } from '../../../shared/module-base.js';
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

/**
 * Synthesize the principal a write tool acts + audits under, from the
 * edge-bound authenticated tenant id. SECURITY: `userId` is NOT a free-form
 * caller value — the MCP host edge already overwrote it with the resolved
 * `principal.userId` (a cross-tenant claim was rejected upstream). The kind is a
 * NORMAL authenticated caller (`apikey`), NEVER `internal` — the governance gate
 * must evaluate this identity on its own merits, not admit it as trusted runtime.
 */
function callerPrincipal(userId: string): Principal {
  return { userId, scopes: ['read', 'write'], kind: 'apikey', isAnonymous: false, raw: null };
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
      handler: async (raw: unknown) => {
        const body = asObject(raw);
        const userId = reqString(body, 'userId');
        const workspaceId = reqString(body, 'workspaceId');
        const keys = typeof body.keys === 'string' ? body.keys : null;
        if (!userId) return inputError('authenticated userId is required');
        if (!workspaceId) return inputError('workspaceId is required');
        if (keys == null || keys.trim().length === 0) return inputError('keys is required');
        const input: SteerInput = {
          workspaceId,
          keys,
          ...(typeof body.submit === 'boolean' ? { submit: body.submit } : {}),
        };
        const result = await surface.steerWorkspace(input, callerPrincipal(userId));
        return toResponse(result);
      },
    },
    {
      name: 'conductor_stop',
      description:
        'Gracefully STOP a running conductor workspace: kill the live session (worktree preserved for review) and transition it to cancelled. Governed: a blocked verdict refuses. A substrate-kill fault leaves the state UNCHANGED (ok:false), never a fake stop.',
      handler: async (raw: unknown) => {
        const body = asObject(raw);
        const userId = reqString(body, 'userId');
        const workspaceId = reqString(body, 'workspaceId');
        if (!userId) return inputError('authenticated userId is required');
        if (!workspaceId) return inputError('workspaceId is required');
        const result = await surface.stopWorkspace(workspaceId, callerPrincipal(userId));
        return toResponse(result);
      },
    },
    {
      name: 'conductor_advance',
      description:
        `Advance a conductor workspace one lifecycle step in the review→merge flow (allowed targets: ${ADVANCE_TARGET_STATES.join(', ')}). Governed + PURE: an illegal from→to step (or a delivery/archive/merge target) is a truthful refusal, never a forced write.`,
      handler: async (raw: unknown) => {
        const body = asObject(raw);
        const userId = reqString(body, 'userId');
        const workspaceId = reqString(body, 'workspaceId');
        const to = reqString(body, 'to') as WorkspaceState | null;
        if (!userId) return inputError('authenticated userId is required');
        if (!workspaceId) return inputError('workspaceId is required');
        if (!to) return inputError('to (target state) is required');
        if (!ADVANCE_TARGET_STATES.includes(to)) {
          return inputError(`to must be one of: ${ADVANCE_TARGET_STATES.join(', ')}`);
        }
        const result = await surface.advanceWorkspaceState(workspaceId, to, callerPrincipal(userId));
        return toResponse(result);
      },
    },
  ];
}
