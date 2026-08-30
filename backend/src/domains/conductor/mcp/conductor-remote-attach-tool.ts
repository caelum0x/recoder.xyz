/**
 * The conductor GOVERNED REMOTE ATTACH MCP tools (LOOM Bigger Bet C, backend half):
 * `recoder_remote_attach` / `recoder_remote_snapshot` / `recoder_remote_steer`. They
 * let an AUTHENTICATED, POLICY-GATED remote/mobile client MONITOR and (opt-in) STEER
 * the caller's OWN live agents — the governed version of what Loom's ecosystem did
 * ungoverned. The heavy lifting lives in the pure {@link RemoteAttachService}; these
 * tools are the thin, GOVERNED bindings, mirroring the conductor status-board / swarm
 * tools EXACTLY:
 *
 *  - IDENTITY (SECURITY): the acting identity is the HOST-AUTHORIZED caller (2nd
 *    handler param), NEVER a free-form `args.userId`. Absent a caller ⇒ `AUTH_REQUIRED`.
 *    A remote-attach session is ALWAYS the caller's OWN — no tool ever honours an
 *    args-named subject, so there is no cross-tenant attach/steer oracle. The service
 *    binds the session to this identity and RE-VERIFIES it (plus ownership) on every
 *    call; the session id is only a scope limiter.
 *  - TRUTHFULNESS: the service result flows straight back — a refusal carries the real
 *    reason; a `needs_approval` steer returns the real approval id and is NOT executed;
 *    the seams unwired ⇒ `SERVICE_UNAVAILABLE` (the composer throws), never a faked
 *    session/snapshot/delivery.
 */
import { createError, ErrorCode } from '../../../shared/errors.js';
import type {
  McpToolCaller,
  McpToolRegistration,
} from '../../../shared/module-base.js';
import type { Principal } from '../../identity/types.js';
import type { StatusBoardSnapshot } from '../attention/status-board.service.js';
import type {
  RemoteAttachCapability,
  RemoteAttachScope,
  RemoteAttachSession,
  RemoteSteerResult,
} from '../remote-attach/remote-attach.types.js';

/**
 * The narrow module seam these tools bind to: mint / monitor / steer, each already
 * governed by the composer (identity + ownership re-verified in the service; the
 * seams unwired ⇒ `SERVICE_UNAVAILABLE`).
 */
export interface RemoteAttachSurface {
  remoteAttach(input: {
    readonly principal: Principal;
    readonly scope: RemoteAttachScope;
    readonly capabilities: readonly RemoteAttachCapability[];
  }): Promise<RemoteAttachSession>;
  remoteSnapshot(input: {
    readonly sessionId: string;
    readonly principal: Principal;
  }): Promise<StatusBoardSnapshot>;
  remoteSteer(input: {
    readonly sessionId: string;
    readonly principal: Principal;
    readonly workspaceId: string;
    readonly input: string;
  }): Promise<RemoteSteerResult>;
}

/** Trim to a non-empty string, or `undefined`. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Coerce raw MCP args to a record without trusting the shape. */
function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
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

/** The two known capabilities — an args set is validated against these, deduped. */
const KNOWN_CAPABILITIES: readonly RemoteAttachCapability[] = ['monitor', 'steer'];

/** Parse the opt-in capabilities from raw args (known-only, deduped, stable order). */
function parseCapabilities(raw: unknown): readonly RemoteAttachCapability[] {
  if (!Array.isArray(raw)) return ['monitor'];
  const seen = new Set<RemoteAttachCapability>();
  for (const entry of raw) {
    if (
      typeof entry === 'string' &&
      (KNOWN_CAPABILITIES as readonly string[]).includes(entry)
    ) {
      seen.add(entry as RemoteAttachCapability);
    }
  }
  if (seen.size === 0) seen.add('monitor');
  return KNOWN_CAPABILITIES.filter(capability => seen.has(capability));
}

/** Parse the mint scope from raw args (explicit workspace ids and/or a taskGroup). */
function parseScope(body: Record<string, unknown>): RemoteAttachScope {
  const workspaceIds = Array.isArray(body.workspaceIds)
    ? body.workspaceIds.filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0
      ).map(id => id.trim())
    : [];
  const taskGroup = str(body.taskGroup);
  return {
    ...(workspaceIds.length > 0 ? { workspaceIds } : {}),
    ...(taskGroup ? { taskGroup } : {}),
  };
}

/**
 * Build the three governed remote-attach MCP tools bound to the surface. Kept SEPARATE
 * from the other tool builders so their registration is explicit at the composer.
 */
export function buildConductorRemoteAttachTools(
  surface: RemoteAttachSurface
): readonly McpToolRegistration[] {
  return [
    {
      name: 'recoder_remote_attach',
      description:
        "Mint a SHORT-LIVED, owner-scoped remote-attach session over the caller's OWN live agents, for an authenticated remote/mobile client to monitor (and opt-in steer). Args: workspaceIds (string[] — the workspaces to cover), taskGroup (optional — a shared parallel-run group), capabilities (optional string[] of 'monitor'|'steer'; defaults to ['monitor']; 'steer' is opt-in). Returns { sessionId, principalId, scope, capabilities, issuedAt, expiresAt, durable } where durable truthfully says whether the session survives a backend restart. Owner-scoped: the session is ALWAYS the caller's own — ownership of every workspace in scope is verified at mint (a non-owned/unknown workspace is refused 403); identity is the HOST caller (never an arg). Re-verified on every later use; the session id is only a scope limiter, never the sole authority.",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const body = asObject(raw);
        return surface.remoteAttach({
          principal: principalOf(authorized),
          scope: parseScope(body),
          capabilities: parseCapabilities(body.capabilities),
        });
      },
    },
    {
      name: 'recoder_remote_snapshot',
      description:
        "Read a LIVE owner-scoped status snapshot for a remote-attach session: the caller's OWN panes in the session scope, bucketed into attention columns (same shape as recoder_status_board). Args: sessionId (required). Owner-scoped + defense-in-depth: identity is the HOST caller (never an arg); the session must belong to the caller (wrong-principal ⇒ 403), must not be expired (⇒ 403), and ownership is RE-VERIFIED per workspace (a workspace whose ownership changed after mint is dropped). The snapshot is filtered to the session's minted scope — a session can never widen its view. Seams unwired ⇒ SERVICE_UNAVAILABLE.",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const body = asObject(raw);
        const sessionId = str(body.sessionId);
        if (!sessionId) {
          throw createError(
            ErrorCode.VALIDATION_ERROR,
            'conductor: sessionId is required'
          );
        }
        return surface.remoteSnapshot({
          sessionId,
          principal: principalOf(authorized),
        });
      },
    },
    {
      name: 'recoder_remote_steer',
      description:
        "Deliver a steer input into ONE live pane of a remote-attach session — POLICY-GATED + AUDITED. Args: sessionId (required), workspaceId (required — must be inside the session scope), input (required — the text to send). Returns { status:'delivered', workspaceId, auditId } on an allow, { status:'needs_approval', requestId } on a needs_approval verdict (NOT executed), or { status:'refused', reason } on a deny. Owner-scoped + defense-in-depth: identity is the HOST caller (never an arg); the session must belong to the caller (403), must not be expired (403), must carry the 'steer' capability (no escalation — a monitor-only session is refused 403), the workspace must be IN the session scope (403), and live ownership is RE-VERIFIED (403 if changed). evaluatePolicy runs FIRST, ALWAYS — a steer never fires without a genuine allow. Delivery transport unwired ⇒ SERVICE_UNAVAILABLE (never a faked delivery).",
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const authorized = requireCaller(caller);
        const body = asObject(raw);
        const sessionId = str(body.sessionId);
        if (!sessionId) {
          throw createError(
            ErrorCode.VALIDATION_ERROR,
            'conductor: sessionId is required'
          );
        }
        const workspaceId = str(body.workspaceId);
        if (!workspaceId) {
          throw createError(
            ErrorCode.VALIDATION_ERROR,
            'conductor: workspaceId is required'
          );
        }
        const input = typeof body.input === 'string' ? body.input : '';
        if (input.trim().length === 0) {
          throw createError(
            ErrorCode.VALIDATION_ERROR,
            'conductor: a non-empty steer input is required'
          );
        }
        return surface.remoteSteer({
          sessionId,
          principal: principalOf(authorized),
          workspaceId,
          input,
        });
      },
    },
  ];
}
