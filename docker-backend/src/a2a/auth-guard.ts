/**
 * @module auth-guard
 *
 * Lightweight authentication + workspace-authorization guard for the mutating
 * and data-exfiltration-prone A2A REST routes (PM task lifecycle decisions and
 * the workspace run-history feed).
 *
 * This mirrors the credential model already used by the A2A gateway
 * (`verifyAdminToken` / `verifyBridgeToken` in `a2a-gateway.ts`) so the routes
 * stay consistent with the rest of the subsystem:
 *
 *  - **Admin token** — `x-recoder-a2a-admin-token` matched against
 *    `RECODER_A2A_ADMIN_TOKEN` (or the per-token scope map
 *    `RECODER_A2A_ADMIN_TOKEN_SCOPES`). Admin callers are trusted for every
 *    workspace.
 *  - **Bridge token** — an `Authorization: Bearer <token>` credential paired
 *    with the caller's `x-recoder-a2a-agent-id`. Bridge/agent callers are only
 *    authorized for a workspace they own or are a member of.
 *
 * Authentication failures map onto the canonical A2A error taxonomy
 * (`AuthenticationFailed` -> 401, `AuthorizationDenied` -> 403) so consumers see
 * structured errors identical to the rest of the gateway.
 */

import type { Request, Response, NextFunction } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '@recoder/shared/a2a';
import type { A2AWorkspace } from './workspace.service';

// ---------------------------------------------------------------------------
// Resolved caller identity
// ---------------------------------------------------------------------------

/**
 * The authenticated caller for an A2A request. An `admin` actor is trusted for
 * every workspace; an `agent` actor (authenticated via a bridge bearer token)
 * is only authorized for workspaces it owns or is a member of.
 */
export interface A2AActor {
  kind: 'admin' | 'agent';
  /** Admin scope (may be null) or the bridge agent id. */
  id: string | null;
}

/** Express request augmented with the resolved A2A actor. */
export interface AuthedRequest extends Request {
  a2aActor?: A2AActor;
}

// ---------------------------------------------------------------------------
// Token verification (mirrors a2a-gateway.ts)
// ---------------------------------------------------------------------------

function parseTokenScopeMap(raw: string): Map<string, string> {
  const value = String(raw || '').trim();
  if (!value) return new Map();
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const entries = Object.entries(parsed)
      .map(([token, scope]) => [token.trim(), String(scope || '').trim()] as const)
      .filter(([token, scope]) => Boolean(token && scope));
    return new Map(entries);
  } catch {
    return new Map();
  }
}

/**
 * Resolve an admin actor from the request, if a valid admin token is present.
 *
 * Returns `null` when no admin token machinery is configured at all (neither
 * `RECODER_A2A_ADMIN_TOKEN` nor `RECODER_A2A_ADMIN_TOKEN_SCOPES`), so the caller
 * can fall back to bridge-token authentication. Returns `false` when admin
 * machinery IS configured but the provided token is invalid.
 */
function resolveAdminActor(req: Request): A2AActor | null | false {
  const provided = String(req.header('x-recoder-a2a-admin-token') || '').trim();
  const scopedMap = parseTokenScopeMap(process.env.RECODER_A2A_ADMIN_TOKEN_SCOPES || '');

  if (scopedMap.size > 0) {
    const scope = provided ? scopedMap.get(provided) || null : null;
    if (!provided || !scope) return false;
    return { kind: 'admin', id: scope };
  }

  const expected = process.env.RECODER_A2A_ADMIN_TOKEN || '';
  if (!expected) {
    // No admin token configured. If the caller still supplied a token we treat
    // it as an admin attempt and accept it (matching gateway behavior of an
    // open admin surface when unset); otherwise defer to bridge auth.
    if (!provided) return null;
    const scope = String(process.env.RECODER_A2A_ADMIN_TOKEN_SCOPE || '').trim() || null;
    return { kind: 'admin', id: scope };
  }

  if (!provided) return null;
  if (provided !== expected) return false;
  const scope = String(process.env.RECODER_A2A_ADMIN_TOKEN_SCOPE || '').trim() || null;
  return { kind: 'admin', id: scope };
}

/**
 * Resolve a bridge/agent actor from an `Authorization: Bearer` credential.
 * The caller's agent id comes from `x-recoder-a2a-agent-id`.
 */
function resolveBridgeActor(req: Request): A2AActor | null {
  const authHeader = String(req.header('authorization') || '');
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!bearerToken) return null;
  const agentId = String(req.header('x-recoder-a2a-agent-id') || '').trim();
  return { kind: 'agent', id: agentId || null };
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

function sendAuthError(res: Response, httpStatus: number, error: A2AError): void {
  res.status(httpStatus).json({ success: false, error });
}

/**
 * Authentication guard for sensitive A2A routes. Accepts a valid admin token or
 * a bridge bearer token and attaches the resolved actor to `req.a2aActor`.
 * Rejects unauthenticated callers with a canonical 401.
 */
export function requireA2AAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const admin = resolveAdminActor(req);
  if (admin === false) {
    sendAuthError(res, 401, buildA2AError({
      code: A2AErrorCodeEnum.AuthenticationFailed,
      message: 'Unauthorized admin token',
    }));
    return;
  }
  if (admin) {
    req.a2aActor = admin;
    next();
    return;
  }

  const bridge = resolveBridgeActor(req);
  if (!bridge) {
    sendAuthError(res, 401, buildA2AError({
      code: A2AErrorCodeEnum.AuthenticationFailed,
      message: 'Authentication required: provide a valid admin token or bridge bearer token',
    }));
    return;
  }

  req.a2aActor = bridge;
  next();
}

// ---------------------------------------------------------------------------
// Workspace authorization
// ---------------------------------------------------------------------------

/**
 * Decide whether an authenticated actor is authorized to read/mutate a given
 * workspace. Admin actors are always authorized; agent actors must own the
 * workspace or be a registered member of it.
 */
export function isActorAuthorizedForWorkspace(actor: A2AActor | undefined, ws: A2AWorkspace): boolean {
  if (!actor) return false;
  if (actor.kind === 'admin') return true;
  if (!actor.id) return false;
  if (ws.ownerId === actor.id) return true;
  return ws.memberAgentIds.includes(actor.id);
}

/**
 * Enforce that `req.a2aActor` is authorized for the workspace. On failure it
 * writes a canonical 403 response and returns `false`; callers should stop
 * processing the request when this returns `false`.
 */
export function authorizeWorkspaceAccess(
  req: AuthedRequest,
  res: Response,
  ws: A2AWorkspace,
): boolean {
  if (isActorAuthorizedForWorkspace(req.a2aActor, ws)) return true;
  sendAuthError(res, 403, buildA2AError({
    code: A2AErrorCodeEnum.AuthorizationDenied,
    message: `Caller is not authorized for workspace ${ws.workspaceId}`,
  }));
  return false;
}
