/**
 * Orgs routes — `/api/identity/orgs` + teams / members / invites.
 *
 * Every mutating route is `authenticateMutating` (a real, non-anonymous
 * principal) and — for org-scoped operations — `requirePermission(action)` via
 * the RBAC evaluator, so org isolation + role checks happen before the service
 * runs. Reads use `authenticate`. Bodies are validated fail-fast with the
 * uniform `sendError` envelope; no route ever fakes a 200.
 *
 * Mount: `buildOrgsRouter(...)` returns a router intended to be mounted under
 * `/api/identity` (so paths resolve to `/api/identity/orgs...`).
 */
import { Router, type Request } from 'express';
import { ErrorCode, createError, sendError, sendSuccess, asyncHandler } from '../../../shared/errors.js';
import type { AuthMiddleware } from '../middleware/authenticate.middleware.js';
import type { AuthzResource } from '../ports/rbac.port.js';
import type { OrgService } from '../ports/org.port.js';
import type { Role } from '../types.js';

export interface OrgsRouterDeps {
  readonly orgService: OrgService;
  readonly middleware: AuthMiddleware;
}

const VALID_ROLES: readonly Role[] = ['owner', 'admin', 'member', 'viewer'];

/** Read a required non-empty string from a request body. */
function requireString(body: unknown, field: string): string {
  const value = (body as Record<string, unknown> | undefined)?.[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createError(ErrorCode.MISSING_REQUIRED_FIELD, `"${field}" is required`);
  }
  return value;
}

/** Read an optional role, validating against the known set. */
function optionalRole(body: unknown): Role | undefined {
  const value = (body as Record<string, unknown> | undefined)?.role;
  if (value == null) return undefined;
  if (typeof value !== 'string' || !VALID_ROLES.includes(value as Role)) {
    throw createError(ErrorCode.INVALID_INPUT, `"role" must be one of: ${VALID_ROLES.join(', ')}`);
  }
  return value as Role;
}

/** The resource an org-scoped permission check is bound to (org id from the path). */
const orgResource = (req: Request): AuthzResource => ({ orgId: req.params.id, kind: 'org', id: req.params.id });

/** Build the orgs router (mount under `/api/identity`). */
export function buildOrgsRouter(deps: OrgsRouterDeps): Router {
  const router = Router();
  const { orgService, middleware } = deps;

  // List the caller's orgs (owned or active member).
  router.get(
    '/orgs',
    middleware.authenticate,
    asyncHandler(async (req, res) => {
      const userId = req.principal?.userId;
      if (!userId || req.principal?.isAnonymous) {
        sendError(res, createError(ErrorCode.AUTH_REQUIRED));
        return;
      }
      const orgs = await orgService.listForUser(userId);
      sendSuccess(res, { orgs });
    }),
  );

  // Create an org — any authenticated user; the caller becomes the owner.
  router.post(
    '/orgs',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const ownerUserId = req.principal!.userId;
      const name = requireString(req.body, 'name');
      const slug = requireString(req.body, 'slug');
      const sso = (req.body as Record<string, unknown> | undefined)?.ssoConnection;
      const org = await orgService.createOrg({
        name,
        slug,
        ownerUserId,
        ssoConnection: sso && typeof sso === 'object' ? (sso as Record<string, unknown>) : null,
      });
      sendSuccess(res, { org }, { statusCode: 201 });
    }),
  );

  // List members of an org (org-scoped read).
  router.get(
    '/orgs/:id/members',
    middleware.authenticate,
    middleware.requirePermission('member:read', orgResource),
    asyncHandler(async (req, res) => {
      const members = await orgService.membersOf(req.params.id);
      sendSuccess(res, { members });
    }),
  );

  // Create a team within an org.
  router.post(
    '/orgs/:id/teams',
    middleware.authenticateMutating,
    middleware.requirePermission('team:create', orgResource),
    asyncHandler(async (req, res) => {
      const slug = requireString(req.body, 'slug');
      const name = requireString(req.body, 'name');
      const team = await orgService.addTeam(req.params.id, slug, name);
      sendSuccess(res, { team }, { statusCode: 201 });
    }),
  );

  // Invite a user into an org.
  router.post(
    '/orgs/:id/members',
    middleware.authenticateMutating,
    middleware.requirePermission('member:invite', orgResource),
    asyncHandler(async (req, res) => {
      const userId = requireString(req.body, 'userId');
      const role = optionalRole(req.body);
      const teamId = (req.body as Record<string, unknown> | undefined)?.teamId;
      const membership = await orgService.invite({
        orgId: req.params.id,
        userId,
        invitedBy: req.principal!.userId,
        ...(role ? { role } : {}),
        ...(typeof teamId === 'string' ? { teamId } : {}),
      });
      sendSuccess(res, { membership }, { statusCode: 201 });
    }),
  );

  // Accept an invite — the invited user themselves calls this (auth = the user).
  router.post(
    '/orgs/:id/invites/:membershipId/accept',
    middleware.authenticateMutating,
    asyncHandler(async (req, res) => {
      const accepted = await orgService.acceptInvite(req.params.membershipId);
      if (!accepted) {
        sendError(res, createError(ErrorCode.NOT_FOUND, 'no pending invite for that membership'));
        return;
      }
      sendSuccess(res, { accepted: true });
    }),
  );

  return router;
}
