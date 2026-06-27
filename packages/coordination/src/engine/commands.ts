/**
 * Command ADT + zod schemas — the validated write-side boundary of the engine
 * (design §4.6 / §9: every command is zod-parsed; invalid input fails fast with
 * `INVALID_COMMAND` and never reaches the engine core).
 *
 * Commands are intentionally narrow value objects (a projection of the
 * dispatch/lock/handoff requests) so the public API does not leak internal
 * port-shaped types. The command-bus parses an `unknown` input against these
 * schemas before handing a typed command to the engine.
 */

import { z } from 'zod';

const lockKind = z.enum(['exclusive', 'shared']);

const orchestrationPattern = z.enum(['direct', 'fan_out', 'pipeline', 'competitive']);

const handoffIntent = z.enum(['handoff', 'delegate', 'review', 'merge']);

// ── AcquireLock ───────────────────────────────────────────────────────────────
export const acquireLockCommandSchema = z.object({
  kind: z.literal('AcquireLock'),
  spaceId: z.string().min(1),
  repo: z.string().min(1).optional(),
  pathGlob: z.string().min(1),
  ownerAgentId: z.string().min(1),
  taskId: z.string().min(1),
  lockKind: lockKind.default('exclusive'),
  ttlMs: z.number().int().positive().optional(),
});
export type AcquireLockCommand = z.infer<typeof acquireLockCommandSchema>;

// ── ReleaseLock ───────────────────────────────────────────────────────────────
export const releaseLockCommandSchema = z.object({
  kind: z.literal('ReleaseLock'),
  lockId: z.string().min(1),
  ownerAgentId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  fenceToken: z.number().int().nonnegative().optional(),
});
export type ReleaseLockCommand = z.infer<typeof releaseLockCommandSchema>;

// ── RenewLock ─────────────────────────────────────────────────────────────────
export const renewLockCommandSchema = z.object({
  kind: z.literal('RenewLock'),
  lockId: z.string().min(1),
  ownerAgentId: z.string().min(1),
  taskId: z.string().min(1),
  fenceToken: z.number().int().nonnegative(),
  ttlMs: z.number().int().positive().optional(),
});
export type RenewLockCommand = z.infer<typeof renewLockCommandSchema>;

// ── DispatchTask ──────────────────────────────────────────────────────────────
const routableTaskSchema = z.object({
  taskId: z.string().min(1),
  spaceId: z.string().min(1),
  intent: z.string().min(1),
  targetPaths: z.array(z.string()),
  forbiddenPaths: z.array(z.string()),
  branchPolicy: z.string().optional(),
  requiredCapabilityIds: z.array(z.string()).optional(),
  preferredCapabilityIds: z.array(z.string()).optional(),
  preferredPlatform: z.string().optional(),
  metadata: z
    .object({
      requiresNetwork: z.boolean().optional(),
      requiresShell: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
});

const routableSpaceSchema = z.object({
  spaceId: z.string().min(1),
  forbiddenPaths: z.array(z.string()),
});

export const dispatchTaskCommandSchema = z.object({
  kind: z.literal('DispatchTask'),
  task: routableTaskSchema,
  space: routableSpaceSchema.optional(),
  requestedAssigneeAgentId: z.string().min(1).optional(),
  pattern: orchestrationPattern.optional(),
});
export type DispatchTaskCommand = z.infer<typeof dispatchTaskCommandSchema>;

// ── InitiateHandoff ───────────────────────────────────────────────────────────
export const initiateHandoffCommandSchema = z.object({
  kind: z.literal('InitiateHandoff'),
  intent: handoffIntent,
  fromAgentId: z.string().min(1),
  targetAgentId: z.string().min(1),
  prompt: z.string().min(1),
  spaceId: z.string().min(1).optional(),
  channelId: z.string().min(1).optional(),
  sourceTaskId: z.string().min(1).optional(),
  contextSourceTaskId: z.string().min(1).optional(),
  contextTargetTaskId: z.string().min(1).optional(),
});
export type InitiateHandoffCommand = z.infer<typeof initiateHandoffCommandSchema>;

// ── Reconcile ─────────────────────────────────────────────────────────────────
export const reconcileCommandSchema = z.object({
  kind: z.literal('Reconcile'),
  spaceIds: z.array(z.string().min(1)).optional(),
});
export type ReconcileCommand = z.infer<typeof reconcileCommandSchema>;

// ── Union ─────────────────────────────────────────────────────────────────────
export const commandSchema = z.discriminatedUnion('kind', [
  acquireLockCommandSchema,
  releaseLockCommandSchema,
  renewLockCommandSchema,
  dispatchTaskCommandSchema,
  initiateHandoffCommandSchema,
  reconcileCommandSchema,
]);

export type CoordinationCommand = z.infer<typeof commandSchema>;
export type CommandKind = CoordinationCommand['kind'];
