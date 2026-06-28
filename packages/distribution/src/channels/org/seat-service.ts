import { randomUUID } from 'node:crypto';
import type { Result } from '../../result';
import { ok, err } from '../../result';
import { DistributionError } from '../../errors/index';
import type { Entitlement, Subject } from '../../domain/entitlement';
import type { BillingPort } from '../../ports/billing-port';
import { hasSeatHeadroom, type Organization } from './organization';
import type { Seat } from './seat';
import type { OrgStore, SeatStore } from './org-store';

/**
 * Org seat management. Real, deny-by-default seat assignment with a hard limit
 * per plan:
 *
 *  - `assignSeat`   — bind a user into an org, refusing once `seatLimit` active
 *                     seats are reached (fail safe: never silently over-assign).
 *  - `revokeSeat`   — remove a user's seat (audit-retained) so a later
 *                     org-scoped entitlement resolution denies them.
 *  - `listSeats`    — enumerate active/all seats for the org.
 *  - `orgEntitlements` — resolve the ORG subject's Polar grants, but ONLY for a
 *                     user who holds an active seat; a seatless user gets `[]`
 *                     (deny), so org entitlements never leak to a revoked member.
 *
 * Seat counting is authoritative against the store (number of ACTIVE seats),
 * not a cached integer, so concurrent assigns can't race past the cap when the
 * store is a transactional repository.
 */
export interface SeatService {
  assignSeat(input: {
    orgId: string;
    userId: string;
    assignedBy: string;
    now?: () => Date;
    seatId?: () => string;
  }): Promise<Result<Seat, DistributionError>>;

  revokeSeat(input: {
    orgId: string;
    userId: string;
    revokedBy: string;
    now?: () => Date;
  }): Promise<Result<Seat, DistributionError>>;

  listSeats(orgId: string, opts?: { includeRevoked?: boolean }): readonly Seat[];

  /** Count of currently-active seats (authoritative against the store). */
  activeSeatCount(orgId: string): number;

  /**
   * Org-scoped entitlements for a member. Returns the org subject's grants ONLY
   * when the user holds an active seat; otherwise `[]` (deny).
   */
  orgEntitlements(input: { orgId: string; userId: string }): Promise<Entitlement[]>;
}

export interface SeatServiceDeps {
  readonly orgs: OrgStore;
  readonly seats: SeatStore;
  /** Used for org-scoped entitlement resolution (the org is the subject). */
  readonly billing: BillingPort;
}

function requireOrg(deps: SeatServiceDeps, orgId: string): Organization | DistributionError {
  const org = deps.orgs.get(orgId);
  if (!org) {
    return new DistributionError('invalid_input', `unknown org '${orgId}'`, { orgId });
  }
  return org;
}

export function createSeatService(deps: SeatServiceDeps): SeatService {
  function activeSeats(orgId: string): readonly Seat[] {
    return deps.seats.listByOrg(orgId).filter((s) => s.status === 'active');
  }

  return {
    async assignSeat(input) {
      const org = requireOrg(deps, input.orgId);
      if (org instanceof DistributionError) return err(org);

      // Idempotent: a user who already holds an active seat returns it as-is.
      const existing = deps.seats.findActive(input.orgId, input.userId);
      if (existing) return ok(existing);

      const used = activeSeats(input.orgId).length;
      if (!hasSeatHeadroom(org.seatLimit, used, 1)) {
        return err(
          new DistributionError(
            'entitlement_denied',
            `seat limit reached for org '${input.orgId}': ${used}/${org.seatLimit} seats used`,
            { orgId: input.orgId, seatLimit: org.seatLimit, used },
          ),
        );
      }

      const now = (input.now ?? (() => new Date()))();
      const seat: Seat = {
        seatId: (input.seatId ?? (() => `seat_${randomUUID()}`))(),
        orgId: input.orgId,
        userId: input.userId,
        status: 'active',
        assignedBy: input.assignedBy,
        assignedAt: now.toISOString(),
      };
      deps.seats.put(seat);
      return ok(seat);
    },

    async revokeSeat(input) {
      const org = requireOrg(deps, input.orgId);
      if (org instanceof DistributionError) return err(org);

      const seat = deps.seats.findActive(input.orgId, input.userId);
      if (!seat) {
        return err(
          new DistributionError(
            'invalid_input',
            `no active seat for user '${input.userId}' in org '${input.orgId}'`,
            { orgId: input.orgId, userId: input.userId },
          ),
        );
      }
      const now = (input.now ?? (() => new Date()))();
      const revoked: Seat = {
        ...seat,
        status: 'revoked',
        revokedAt: now.toISOString(),
        revokedBy: input.revokedBy,
      };
      deps.seats.put(revoked);
      return ok(revoked);
    },

    listSeats(orgId, opts) {
      const all = deps.seats.listByOrg(orgId);
      return opts?.includeRevoked ? all : all.filter((s) => s.status === 'active');
    },

    activeSeatCount(orgId) {
      return activeSeats(orgId).length;
    },

    async orgEntitlements(input) {
      // Deny-by-default: a user without an ACTIVE seat gets no org grants.
      const seat = deps.seats.findActive(input.orgId, input.userId);
      if (!seat) return [];
      const subject: Subject = { subjectId: input.orgId, kind: 'org' };
      try {
        const grants = await deps.billing.resolveEntitlements(subject);
        return grants.filter((g) => g.granted);
      } catch {
        // Fail safe: resolution error denies (no grants).
        return [];
      }
    },
  };
}
