import type { Organization } from './organization';
import type { Seat } from './seat';

/**
 * Persistence ports for orgs + seats. The in-memory implementations below are
 * the reference; a host wires a durable repository (recoder.xyz-owned) behind
 * the same interfaces. Distribution reads/writes seat state here but never
 * becomes the identity authority — it mirrors recoder.xyz org membership.
 */
export interface OrgStore {
  get(orgId: string): Organization | undefined;
  put(org: Organization): void;
}

export interface SeatStore {
  /** Persist (insert or replace) a seat by id. */
  put(seat: Seat): void;
  get(seatId: string): Seat | undefined;
  /** All seats for an org (active + revoked), for audit + counting. */
  listByOrg(orgId: string): readonly Seat[];
  /** The current ACTIVE seat for a user in an org, if any. */
  findActive(orgId: string, userId: string): Seat | undefined;
}

export function createInMemoryOrgStore(): OrgStore {
  const orgs = new Map<string, Organization>();
  return {
    get: (orgId) => orgs.get(orgId),
    put: (org) => void orgs.set(org.orgId, org),
  };
}

export function createInMemorySeatStore(): SeatStore {
  const seats = new Map<string, Seat>();
  return {
    put(seat) {
      seats.set(seat.seatId, seat);
    },
    get(seatId) {
      return seats.get(seatId);
    },
    listByOrg(orgId) {
      return [...seats.values()].filter((s) => s.orgId === orgId);
    },
    findActive(orgId, userId) {
      return [...seats.values()].find(
        (s) => s.orgId === orgId && s.userId === userId && s.status === 'active',
      );
    },
  };
}
