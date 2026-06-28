import { z } from 'zod';
import { PlanSchema, type Plan } from '../../domain/subscription-plan';

/**
 * An enterprise Organization — the org-scoped subject billing/entitlements
 * resolve against. Distribution does NOT own org identity (recoder.xyz is the
 * authority); this is the TS mirror the seat/entitlement gates read. An org's
 * `plan` is its authoritative plan (mirrors a Polar subscription on the org
 * customer), and `seatLimit` is the number of seats that plan grants.
 */
export interface Organization {
  readonly orgId: string;
  /** The recoder.xyz user who owns/admins the org (billing contact). */
  readonly ownerUserId: string;
  readonly name: string;
  readonly plan: Plan;
  /**
   * Seats this org's plan grants. `0` means "unmetered seats" (no seat cap),
   * mirroring the quota convention where `0` is unlimited.
   */
  readonly seatLimit: number;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const OrganizationSchema: z.ZodType<Organization> = z.object({
  orgId: z.string().min(1),
  ownerUserId: z.string().min(1),
  name: z.string().min(1),
  plan: PlanSchema,
  seatLimit: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * The seat-count each plan grants by default. Enterprise is generous but still
 * finite by default (a real cap, billed per-seat above it); pro is a small team
 * cap; free is single-seat. The authoritative cap is the org's `seatLimit`
 * (which a Polar seat-benefit can raise) — this is the deny-by-default floor.
 */
export const PLAN_DEFAULT_SEAT_LIMIT: Record<Plan, number> = {
  free: 1,
  pro: 5,
  enterprise: 50,
};

/** Resolve the default seat limit for a plan. */
export function defaultSeatLimit(plan: Plan): number {
  return PLAN_DEFAULT_SEAT_LIMIT[plan];
}

/** True when an org with `limit` seats and `used` assigned has room for `count` more. */
export function hasSeatHeadroom(limit: number, used: number, count = 1): boolean {
  if (limit === 0) return true; // 0 === unmetered
  return used + count <= limit;
}
