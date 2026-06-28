import { createHash } from 'node:crypto';
import { z } from 'zod';
import { UsageKindSchema, type UsageKind } from '../../domain/quota';

/**
 * A single metered usage event for a usage-priced enterprise add-on.
 *
 * IMPORTANT (product rule): this meters ADD-ON usage (seats, build minutes,
 * signed-build runs, custom-domain provisions), NOT model-token resale. The
 * `kind` reuses the distribution `UsageKind` vocabulary so the CLI, the meter
 * feed, and Polar agree on names.
 *
 * `idempotencyKey` makes an emit safe to retry: the same key is never
 * double-counted by the aggregator or the Polar ingestion. When the caller does
 * not supply one, `deriveIdempotencyKey` computes a deterministic key from the
 * event's identity fields so accidental duplicate emits collapse.
 */
export interface UsageEvent {
  readonly subjectId: string;
  readonly subjectKind: 'user' | 'org';
  readonly kind: UsageKind;
  /** Always a positive integer count of units consumed. */
  readonly quantity: number;
  readonly timestamp: string;
  readonly idempotencyKey: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const UsageEventSchema: z.ZodType<UsageEvent> = z.object({
  subjectId: z.string().min(1),
  subjectKind: z.enum(['user', 'org']),
  kind: UsageKindSchema,
  quantity: z.number().int().positive(),
  timestamp: z.string().min(1),
  idempotencyKey: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Deterministically derive an idempotency key from an event's identity so two
 * emits describing the same unit of work collapse to one. Includes the
 * timestamp truncated to the second (so genuinely distinct events at different
 * times stay distinct).
 */
export function deriveIdempotencyKey(input: {
  subjectId: string;
  kind: UsageKind;
  quantity: number;
  timestamp: string;
  nonce?: string;
}): string {
  const second = input.timestamp.slice(0, 19); // YYYY-MM-DDTHH:MM:SS
  const basis = `${input.subjectId}|${input.kind}|${input.quantity}|${second}|${input.nonce ?? ''}`;
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}
