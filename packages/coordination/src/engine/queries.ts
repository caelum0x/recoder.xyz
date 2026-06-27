/**
 * Query ADT + zod schemas — the validated read-side boundary of the engine.
 * Like commands, every query is zod-parsed before it reaches the engine so
 * invalid input fails fast with `INVALID_COMMAND` (design §4.6 / §9).
 *
 * Queries are side-effect-free reads: active locks for a scope, the dispatchable
 * ready-set for a space, and the current drift report (open coherence findings /
 * signals). They never mutate state.
 */

import { z } from 'zod';

// ── ActiveLocks ───────────────────────────────────────────────────────────────
export const activeLocksQuerySchema = z.object({
  kind: z.literal('ActiveLocks'),
  spaceId: z.string().min(1),
  repo: z.string().min(1).optional(),
});
export type ActiveLocksQuery = z.infer<typeof activeLocksQuerySchema>;

// ── ReadySet ──────────────────────────────────────────────────────────────────
export const readySetQuerySchema = z.object({
  kind: z.literal('ReadySet'),
  spaceId: z.string().min(1),
});
export type ReadySetQuery = z.infer<typeof readySetQuerySchema>;

// ── DriftReport ───────────────────────────────────────────────────────────────
export const driftReportQuerySchema = z.object({
  kind: z.literal('DriftReport'),
  spaceIds: z.array(z.string().min(1)).optional(),
});
export type DriftReportQuery = z.infer<typeof driftReportQuerySchema>;

// ── Union ─────────────────────────────────────────────────────────────────────
export const querySchema = z.discriminatedUnion('kind', [
  activeLocksQuerySchema,
  readySetQuerySchema,
  driftReportQuerySchema,
]);

export type CoordinationQuery = z.infer<typeof querySchema>;
export type QueryKind = CoordinationQuery['kind'];
