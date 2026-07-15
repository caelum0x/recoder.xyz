/**
 * RBAC evaluation contract.
 *
 * {@link PermissionEvaluator} is the seam any domain doing authorization
 * (agent-os approvals, billing, governance, org management) consumes. The
 * `rbac.service.ts` implements it by expanding a membership `Role` into a
 * permission set (`owner ⊃ admin ⊃ member ⊃ viewer`), applying per-membership
 * overrides, consulting `@recoder/agent-policy` for deterministic decisions, and
 * enforcing org isolation (`WHERE org_id = principal.orgId`).
 *
 * FROZEN CONTRACT — the shape downstream domains call `can(...)` against. The
 * concrete `RbacService` is written by the RBAC feature agent.
 */
import type { Permission, PermissionEffect, Role } from '../types.js';
import type { Principal } from '../types.js';

/** The resource an authorization decision is scoped to (all fields optional). */
export interface AuthzResource {
  /** Org the resource lives in; checked against `principal.orgId` for isolation. */
  readonly orgId?: string;
  /** Team scope, when finer than org. */
  readonly teamId?: string;
  /** Owning user, for owner-or-admin checks. */
  readonly ownerUserId?: string;
  /** Free-form resource kind (e.g. `'run'`, `'key'`, `'org'`). */
  readonly kind?: string;
  /** Resource id, for audit. */
  readonly id?: string;
}

/** A single allow/deny authorization decision, with a reason for audit. */
export interface AuthzDecision {
  readonly allowed: boolean;
  /** Why — surfaced in audit + error envelopes (never leaks secrets). */
  readonly reason: string;
  /** The effective permission that drove the decision, when applicable. */
  readonly permission?: Permission;
}

/**
 * The authorization seam. `can()` returns the boolean decision; `decide()`
 * returns the same with a reason for audit. Implementations MUST fail closed
 * (deny) on any internal error rather than throwing an allow.
 */
export interface PermissionEvaluator {
  /** True when `principal` may perform `action` on `resource`. */
  can(principal: Principal, action: Permission, resource?: AuthzResource): Promise<boolean>;
  /** Same as {@link can} but returns the reasoned decision for audit. */
  decide(principal: Principal, action: Permission, resource?: AuthzResource): Promise<AuthzDecision>;
  /** Expand a role into its full (deduped) permission set. Pure. */
  permissionsForRole(role: Role): readonly Permission[];
}

/** A per-membership permission grant/deny that overrides the role default. */
export interface PermissionOverride {
  readonly id: string;
  readonly membershipId: string;
  readonly permission: Permission;
  readonly effect: PermissionEffect;
}

/** Persistence contract for `org_permission_override` (consumed by RbacService). */
export interface PermissionOverrideStore {
  listForMembership(membershipId: string): Promise<readonly PermissionOverride[]>;
}
