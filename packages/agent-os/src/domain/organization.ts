import { permissionsForRoles, type Permission, type Role } from './rbac';

/** The unified plan tier (spec D5). Retires the divergent free/pro/enterprise set. */
export type PlanTier = 'free' | 'pro' | 'team' | 'enterprise';

export const PlanTierEnum = {
  Free: 'free',
  Pro: 'pro',
  Team: 'team',
  Enterprise: 'enterprise',
} as const satisfies Record<string, PlanTier>;

/**
 * Organization — the canonical tenant/billing entity. `orgId` matches
 * TenantContext.orgId. Timestamps are ISO strings.
 */
export type Organization = {
  orgId: string;
  name: string;
  /** URL-friendly unique identifier. */
  slug: string;
  /** User id of the owner. */
  ownerId: string;
  plan: PlanTier;
  createdAt: string;
  updatedAt: string;
  /** Soft-delete marker. */
  deletedAt?: string;
};

/**
 * Membership — a user's binding to an org with a canonical RBAC role and an
 * optional assigned seat. The role is the ONE role model (packages/agent-os/rbac).
 */
export type Membership = {
  orgId: string;
  userId: string;
  role: Role;
  seatId?: string;
  joinedAt: string;
  invitedBy?: string;
};

export type SeatStatus = 'active' | 'reserved' | 'revoked';

/** Seat — a billable license slot in an org, optionally assigned to a user. */
export type Seat = {
  seatId: string;
  orgId: string;
  userId?: string;
  status: SeatStatus;
  assignedAt?: string;
  revokedAt?: string;
};

/** Permissions a membership grants, derived from its canonical RBAC role. */
export function membershipPermissions(membership: Membership): Set<Permission> {
  return permissionsForRoles([membership.role]);
}

export function isSeatActive(seat: Seat): boolean {
  return seat.status === 'active';
}
