/**
 * Workspace ownership guard — the SINGLE authorization seam every workspace-scoped
 * conductor edge shares (routes/conductor.routes, routes/workspaces-query.routes,
 * routes/compare.routes, routes/checkpoint.routes, routes/repo-config.routes).
 *
 * The vuln it closes (recoder-tf68): the conductor HTTP surface authenticated the
 * caller (`authenticate`/`authenticateMutating`) but never checked that the caller
 * OWNS the workspace it names. Any authed user could enumerate + operate (incl. the
 * governed MERGE) another tenant's workspace by guessing an id, and the list edge
 * returned EVERY tenant's records.
 *
 * The contract:
 *  - A `:id`-scoped route is guarded by {@link requireWorkspaceAccess}: it resolves
 *    the workspace and, when the caller cannot access it, responds a 404 that is
 *    BYTE-IDENTICAL to a genuinely-missing workspace — never a 403 (a 403 is an
 *    existence oracle that confirms the id belongs to someone).
 *  - A list edge is narrowed by {@link filterAccessibleWorkspaces} to the caller's
 *    OWN workspaces (never another tenant's).
 *
 * Access is granted when ANY hold (checked in order):
 *  - solo/desktop single-user mode (`soloMode`) — there is exactly ONE local owner,
 *    so ownership enforcement FAILS OPEN; the desktop user is never locked out;
 *  - the caller is a privileged operator (admin/internal) — the operator path other
 *    domains use (`kind==='internal'` or `scopes ⊇ {admin|internal}`);
 *  - the caller CREATED the workspace (`createdBy === principal.userId`);
 *  - the caller shares the workspace's tenant org (tenant scoping where the record
 *    carries an explicit `tenant.orgId` — richer than `createdBy`).
 * The anonymous fallback identity never owns anything.
 */
import type { RequestHandler } from 'express';
import { ErrorCode, createError, sendError } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';

/**
 * The workspace fields the ownership guard reads. A structural subset of both the
 * durable `Workspace` (agent-os) and the `WorkspaceView` read-model, so either can
 * be filtered/guarded without a value import of the domain type.
 */
export interface WorkspaceOwnershipFields {
  readonly createdBy: string;
  readonly tenant?: { readonly orgId?: string };
}

export interface WorkspaceAccessOptions {
  /** Solo/desktop single-user mode: ownership enforcement fails OPEN (one local owner). */
  readonly soloMode: boolean;
}

/** The minimal read seam the guard needs: resolve a workspace by id (null = absent). */
export interface WorkspaceAccessLookup {
  getWorkspace(id: string): Promise<WorkspaceOwnershipFields | null>;
}

/**
 * A privileged operator principal may access any workspace (the operator path).
 * Matches how the other domains check privilege (`kind==='internal'` or an `admin`/
 * `internal` scope) so conductor stays consistent with the rest of the backend.
 */
export function isPrivilegedPrincipal(principal: Principal): boolean {
  return (
    principal.kind === 'internal' ||
    principal.scopes.includes('admin') ||
    principal.scopes.includes('internal')
  );
}

/**
 * The ownership predicate. See the module header for the full contract. Pure +
 * side-effect free so it is reused by both the middleware and the list filter.
 */
export function canAccessWorkspace(
  principal: Principal,
  workspace: WorkspaceOwnershipFields,
  opts: WorkspaceAccessOptions,
): boolean {
  // Solo/desktop: a single local owner — never lock the one local user out.
  if (opts.soloMode) return true;
  // Operator path: admin/internal principals may reach any workspace.
  if (isPrivilegedPrincipal(principal)) return true;
  // The degrade-safe anonymous fallback identity never owns anything.
  if (principal.isAnonymous) return false;
  // The creator always has access.
  if (workspace.createdBy && workspace.createdBy === principal.userId) return true;
  // Tenant scoping where the record carries an explicit org (richer than createdBy):
  // a co-tenant in the SAME org may access. Both sides must carry a non-empty org.
  const tenantOrg = workspace.tenant?.orgId;
  if (tenantOrg && principal.orgId && tenantOrg === principal.orgId) return true;
  return false;
}

/**
 * Narrow a workspace list to those the caller may access. Privileged/solo callers
 * see the full list unchanged; everyone else sees ONLY their own (or same-tenant)
 * records. An empty result is a truthful empty list, never another tenant's rows.
 */
export function filterAccessibleWorkspaces<T extends WorkspaceOwnershipFields>(
  workspaces: readonly T[],
  principal: Principal,
  opts: WorkspaceAccessOptions,
): T[] {
  if (opts.soloMode || isPrivilegedPrincipal(principal)) return [...workspaces];
  return workspaces.filter((w) => canAccessWorkspace(principal, w, opts));
}

/**
 * Express middleware enforcing ownership on any `:id`-scoped workspace route. Runs
 * AFTER the auth middleware (so `req.principal` is resolved) and BEFORE the handler.
 * A missing workspace and an inaccessible one produce the SAME truthful 404 (no
 * existence oracle). A lookup fault degrades to a truthful 503 (never a leak).
 *
 * Routes with no `:id` param are passed through untouched (their access is decided
 * elsewhere — e.g. list edges are filtered, `POST /workspaces` mints a new record).
 */
export function requireWorkspaceAccess(
  lookup: WorkspaceAccessLookup,
  opts: WorkspaceAccessOptions,
): RequestHandler {
  return (req, res, next) => {
    const id = req.params.id;
    if (!id) {
      next();
      return;
    }
    const principal = req.principal;
    if (!principal) {
      // Auth middleware must run first. If it did not, fail CLOSED as not-found
      // rather than leaking the resource.
      sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
      return;
    }
    void Promise.resolve(lookup.getWorkspace(id))
      .then((workspace) => {
        if (!workspace || !canAccessWorkspace(principal, workspace, opts)) {
          sendError(res, createError(ErrorCode.NOT_FOUND, 'workspace not found'));
          return;
        }
        next();
      })
      .catch(() => {
        sendError(
          res,
          createError(ErrorCode.SERVICE_UNAVAILABLE, 'workspace lookup failed'),
        );
      });
  };
}
