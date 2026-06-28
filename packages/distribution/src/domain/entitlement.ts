import { z } from 'zod';
import { PlanSchema } from './subscription-plan';

/**
 * The kind of benefit a Polar grant projects into. Mirrors the Polar benefit
 * strategies we fuse (license_keys, downloadables, feature_flag, meter_credit)
 * plus a plain plan grant.
 */
export type EntitlementKind =
  | 'plan'
  | 'feature_flag'
  | 'license_key'
  | 'downloadable'
  | 'meter_credit'
  | 'seat';

export const EntitlementKindSchema = z.enum([
  'plan',
  'feature_flag',
  'license_key',
  'downloadable',
  'meter_credit',
  'seat',
]);

/**
 * An effective entitlement for a subject. This is the TS mirror of a Polar
 * benefit grant — distribution reads it, it does not own it (the durable grant
 * lives in the fused py/recoder-billing engine).
 */
export interface Entitlement {
  readonly subjectId: string;
  readonly kind: EntitlementKind;
  /** Stable key, e.g. the feature flag slug or the benefit id. */
  readonly key: string;
  readonly plan: z.infer<typeof PlanSchema>;
  /** True only when an active, non-revoked grant backs this entitlement. */
  readonly granted: boolean;
  readonly grantedAt?: string;
  readonly expiresAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const EntitlementSchema: z.ZodType<Entitlement> = z.object({
  subjectId: z.string().min(1),
  kind: EntitlementKindSchema,
  key: z.string().min(1),
  plan: PlanSchema,
  granted: z.boolean(),
  grantedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** A subject (user or org) that entitlements/quota are resolved for. */
export interface Subject {
  readonly subjectId: string;
  readonly kind: 'user' | 'org';
}

export const SubjectSchema: z.ZodType<Subject> = z.object({
  subjectId: z.string().min(1),
  kind: z.enum(['user', 'org']),
});
