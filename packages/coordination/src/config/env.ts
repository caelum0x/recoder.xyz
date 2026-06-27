/**
 * Env loading + validation via zod (boundary validation, fail-fast per repo
 * security rules). Reads optional overrides; missing values fall back to
 * defaults. Secrets are read from env only — never hardcoded. A malformed env
 * value (e.g. a non-numeric TTL) fails fast with a clear message.
 */

import { z } from 'zod';
import { DEFAULT_COORDINATION_CONFIG, type CoordinationConfig } from './coordination-config';

/** A positive-integer env value, parsed from string. */
const positiveIntFromEnv = z
  .string()
  .regex(/^\d+$/, 'must be a non-negative integer')
  .transform((value) => Number.parseInt(value, 10))
  .pipe(z.number().int().nonnegative());

const boolFromEnv = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(['true', 'false', '1', '0']))
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  COORDINATION_LOCK_TTL_MS: positiveIntFromEnv.optional(),
  COORDINATION_LOCK_RENEW_WINDOW_MS: positiveIntFromEnv.optional(),
  COORDINATION_CLAIM_RECOVERY_WINDOW_MS: positiveIntFromEnv.optional(),
  COORDINATION_DISPATCH_LEASE_MS: positiveIntFromEnv.optional(),
  COORDINATION_DISPATCH_MAX_CONCURRENCY: positiveIntFromEnv.optional(),
  COORDINATION_PRESENCE_HEARTBEAT_TIMEOUT_MS: positiveIntFromEnv.optional(),
  COORDINATION_HANDOFF_MAX_DEPTH: positiveIntFromEnv.optional(),
  COORDINATION_HANDOFF_DEDUP_TTL_MS: positiveIntFromEnv.optional(),
  COORDINATION_EVENT_RETENTION_TTL_MS: positiveIntFromEnv.optional(),
  COORDINATION_EVENT_MAX_RECORDS: positiveIntFromEnv.optional(),
  COORDINATION_RECONCILE_INTERVAL_MS: positiveIntFromEnv.optional(),
  COORDINATION_AUTO_HEAL: boolFromEnv.optional(),
  COORDINATION_DISPATCH_DRY_RUN: boolFromEnv.optional(),
  COORDINATION_HANDOFF_APPROVAL_GATE: boolFromEnv.optional(),
  NATS_URL: z.string().min(1).optional(),
});

export type CoordinationEnv = z.infer<typeof envSchema>;

function pick<T>(override: T | undefined, fallback: T): T {
  return override === undefined ? fallback : override;
}

/**
 * Load + validate config from env (or a provided record, for tests). Throws a
 * descriptive error on malformed env (fail-fast).
 */
export function loadCoordinationConfig(
  source: NodeJS.ProcessEnv = process.env,
): CoordinationConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid coordination config env: ${detail}`);
  }

  const env = parsed.data;
  const base = DEFAULT_COORDINATION_CONFIG;

  return {
    lock: {
      defaultTtlMs: pick(env.COORDINATION_LOCK_TTL_MS, base.lock.defaultTtlMs),
      renewWindowMs: pick(env.COORDINATION_LOCK_RENEW_WINDOW_MS, base.lock.renewWindowMs),
    },
    claim: {
      recoveryWindowMs: pick(
        env.COORDINATION_CLAIM_RECOVERY_WINDOW_MS,
        base.claim.recoveryWindowMs,
      ),
    },
    dispatch: {
      leaseMs: pick(env.COORDINATION_DISPATCH_LEASE_MS, base.dispatch.leaseMs),
      maxConcurrency: pick(
        env.COORDINATION_DISPATCH_MAX_CONCURRENCY,
        base.dispatch.maxConcurrency,
      ),
    },
    presence: {
      heartbeatTimeoutMs: pick(
        env.COORDINATION_PRESENCE_HEARTBEAT_TIMEOUT_MS,
        base.presence.heartbeatTimeoutMs,
      ),
    },
    handoff: {
      maxDepth: pick(env.COORDINATION_HANDOFF_MAX_DEPTH, base.handoff.maxDepth),
      dedupTtlMs: pick(env.COORDINATION_HANDOFF_DEDUP_TTL_MS, base.handoff.dedupTtlMs),
    },
    event: {
      retentionTtlMs: pick(env.COORDINATION_EVENT_RETENTION_TTL_MS, base.event.retentionTtlMs),
      maxRecords: pick(env.COORDINATION_EVENT_MAX_RECORDS, base.event.maxRecords),
    },
    reconcile: {
      intervalMs: pick(env.COORDINATION_RECONCILE_INTERVAL_MS, base.reconcile.intervalMs),
    },
    transport: {
      natsUrl: pick(env.NATS_URL, base.transport.natsUrl),
    },
    flags: {
      autoHeal: pick(env.COORDINATION_AUTO_HEAL, base.flags.autoHeal),
      dispatchDryRun: pick(env.COORDINATION_DISPATCH_DRY_RUN, base.flags.dispatchDryRun),
      handoffApprovalGate: pick(
        env.COORDINATION_HANDOFF_APPROVAL_GATE,
        base.flags.handoffApprovalGate,
      ),
    },
  };
}
