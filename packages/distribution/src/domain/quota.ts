import { z } from 'zod';

/**
 * The kinds of metered usage distribution gates. Mirrors the usage feed the
 * Polar meter/event services aggregate.
 */
export type UsageKind = 'cli_request' | 'agent_run' | 'publish' | 'preview' | 'download';

export const UsageKindSchema = z.enum([
  'cli_request',
  'agent_run',
  'publish',
  'preview',
  'download',
]);

/**
 * A usage quota counter. Mirrors `RecoderUser.quota`
 * (requests_remaining / requests_limit / reset_date) so the CLI and the billing
 * engine agree on remaining headroom.
 */
export interface Quota {
  readonly subjectId: string;
  readonly kind: UsageKind;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string;
}

export const QuotaSchema: z.ZodType<Quota> = z.object({
  subjectId: z.string().min(1),
  kind: UsageKindSchema,
  limit: z.number().int().nonnegative(),
  remaining: z.number().int(),
  resetAt: z.string().min(1),
});

/**
 * True when there is at least `cost` headroom left. An unlimited quota is
 * encoded as `limit === 0` (no metering), which always has headroom.
 */
export function quotaHasHeadroom(q: Quota, cost = 1): boolean {
  if (q.limit === 0) return true;
  return q.remaining >= cost;
}

/** Return a new Quota with `cost` consumed (immutable; clamped at zero). */
export function consumeQuota(q: Quota, cost = 1): Quota {
  if (q.limit === 0) return q;
  return { ...q, remaining: Math.max(0, q.remaining - cost) };
}
