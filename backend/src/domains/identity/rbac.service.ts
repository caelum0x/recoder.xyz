/**
 * `RbacService` — implements the frozen {@link PermissionEvaluator} seam.
 *
 * Authorization is deterministic and self-contained (no external policy engine
 * required): a membership's {@link Role} expands to a permission set
 * (`owner ⊃ admin ⊃ member ⊃ viewer`), per-membership overrides are applied
 * (a `deny` override always wins), and org isolation is enforced by resolving the
 * caller's *active* membership in the target org before any grant.
 *
 * Invariants:
 *  - `internal` principals and any principal carrying the `admin` scope are
 *    super-users (service-to-service + platform admins bypass org RBAC).
 *  - A caller with no active membership in the target org is denied (cross-org
 *    isolation): `find(orgB, userFromOrgA) → null → deny`.
 *  - FAIL CLOSED: any internal/storage fault denies rather than throwing an allow
 *    (ARCHITECTURE §10: never fake success; a fault is a truthful deny).
 */
import type { Logger } from '../../shared/logger.js';
import type { AuthzDecision, AuthzResource, PermissionEvaluator, PermissionOverrideStore } from './ports/rbac.port.js';
import type { MembershipStore } from './ports/org.port.js';
import type { Permission, Principal, Role } from './types.js';

/**
 * The base permission each role adds on top of the weaker role below it. The
 * effective set for a role is the union of its own grants plus every weaker
 * role's grants (`owner` therefore holds everything). Permissions are
 * `resource:action` strings; domains may check their own permission strings via
 * per-membership overrides without editing this table.
 */
const ROLE_OWN_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  viewer: ['org:read', 'team:read', 'member:read', 'run:read', 'key:read'],
  member: ['run:create', 'run:cancel', 'key:mint', 'key:revoke'],
  admin: ['org:manage', 'team:create', 'team:delete', 'member:invite', 'member:remove', 'member:setRole'],
  owner: ['org:delete', 'org:transfer', 'billing:manage'],
};

/** Weakest → strongest. A role inherits every permission from roles before it. */
const ROLE_ORDER: readonly Role[] = ['viewer', 'member', 'admin', 'owner'];

/** Precompute the full (inherited + deduped) permission set for each role. */
const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = (() => {
  const out: Record<Role, Permission[]> = { viewer: [], member: [], admin: [], owner: [] };
  const cumulative = new Set<Permission>();
  for (const role of ROLE_ORDER) {
    for (const perm of ROLE_OWN_PERMISSIONS[role]) cumulative.add(perm);
    out[role] = [...cumulative];
  }
  return out;
})();

/** Exported for downstream domains + tests that need the static role→perm map. */
export { ROLE_PERMISSIONS };

export interface RbacServiceDeps {
  readonly memberships: MembershipStore;
  readonly overrides: PermissionOverrideStore;
  readonly logger: Logger;
}

export class RbacService implements PermissionEvaluator {
  private readonly memberships: MembershipStore;
  private readonly overrides: PermissionOverrideStore;
  private readonly log: Logger;

  constructor(deps: RbacServiceDeps) {
    this.memberships = deps.memberships;
    this.overrides = deps.overrides;
    this.log = deps.logger;
  }

  /** Expand a role into its full (deduped) permission set. Pure. */
  permissionsForRole(role: Role): readonly Permission[] {
    return ROLE_PERMISSIONS[role] ?? [];
  }

  async can(principal: Principal, action: Permission, resource?: AuthzResource): Promise<boolean> {
    return (await this.decide(principal, action, resource)).allowed;
  }

  async decide(principal: Principal, action: Permission, resource?: AuthzResource): Promise<AuthzDecision> {
    try {
      // Anonymous never authorizes.
      if (principal.isAnonymous) {
        return { allowed: false, reason: 'anonymous principal' };
      }

      // Super-users: service-to-service + platform admins bypass org RBAC.
      if (principal.kind === 'internal' || principal.scopes.includes('admin')) {
        return { allowed: true, reason: `super-user (${principal.kind})` };
      }

      // Resolve the org this decision is scoped to.
      const orgId = resource?.orgId ?? principal.orgId;
      if (!orgId) {
        return { allowed: false, reason: 'no org scope for permission check' };
      }

      // Org isolation: the caller must have a membership in THIS org.
      const membership = await this.memberships.find(orgId, principal.userId);
      if (!membership) {
        return { allowed: false, reason: `no membership in org ${orgId}` };
      }
      if (membership.status !== 'active') {
        return { allowed: false, reason: `membership ${membership.status} (not active) in org ${orgId}` };
      }

      // Per-membership overrides: a deny wins outright; an allow grants beyond role.
      const overrides = await this.overrides.listForMembership(membership.id);
      for (const ov of overrides) {
        if (ov.permission === action && ov.effect === 'deny') {
          return { allowed: false, reason: `override denies ${action}`, permission: action };
        }
      }
      const allowOverride = overrides.some((ov) => ov.permission === action && ov.effect === 'allow');
      if (allowOverride) {
        return { allowed: true, reason: `override allows ${action}`, permission: action };
      }

      // Role expansion.
      const perms = this.permissionsForRole(membership.role);
      if (perms.includes(action)) {
        return { allowed: true, reason: `role ${membership.role} grants ${action}`, permission: action };
      }
      return { allowed: false, reason: `role ${membership.role} lacks ${action}` };
    } catch (err) {
      // Fail closed — an infra fault denies, never opens.
      this.log.error(
        { err: err instanceof Error ? err.message : String(err), action, userId: principal.userId },
        'rbac decide faulted — failing closed',
      );
      return { allowed: false, reason: 'authorization evaluation error' };
    }
  }
}

/** Build the RBAC evaluator from its two stores. */
export function createRbacService(deps: RbacServiceDeps): RbacService {
  return new RbacService(deps);
}
