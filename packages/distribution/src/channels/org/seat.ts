import { z } from 'zod';

/**
 * The lifecycle of a seat assignment. A seat is `active` once assigned and
 * `revoked` once an admin removes it. A revoked seat is retained (not deleted)
 * so the audit trail survives — re-assigning a revoked member mints a new
 * active record.
 */
export type SeatStatus = 'active' | 'revoked';

export const SeatStatusSchema = z.enum(['active', 'revoked']);

/**
 * A seat: a binding of one recoder.xyz user into an organization. Possessing an
 * active seat is what projects the org's plan/entitlements onto a member. The
 * seat is the org-scoped grant; revoking it removes the member's org access at
 * the next entitlement resolution (deny by default).
 */
export interface Seat {
  readonly seatId: string;
  readonly orgId: string;
  /** The recoder.xyz user occupying the seat. */
  readonly userId: string;
  readonly status: SeatStatus;
  /** The admin (recoder.xyz user) who assigned the seat. */
  readonly assignedBy: string;
  readonly assignedAt: string;
  readonly revokedAt?: string;
  readonly revokedBy?: string;
}

export const SeatSchema: z.ZodType<Seat> = z.object({
  seatId: z.string().min(1),
  orgId: z.string().min(1),
  userId: z.string().min(1),
  status: SeatStatusSchema,
  assignedBy: z.string().min(1),
  assignedAt: z.string().min(1),
  revokedAt: z.string().optional(),
  revokedBy: z.string().optional(),
});

/** True when the seat currently grants org access. */
export function isSeatActive(seat: Seat): boolean {
  return seat.status === 'active';
}
