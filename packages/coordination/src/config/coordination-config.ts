/**
 * CoordinationConfig — the typed config the engine reads. All values are
 * overridable via env (validated in `env.ts`), with defaults in `defaults.ts`.
 * Secrets (NATS creds, DB URL) live in `transport`/adapter config read from env
 * only — never hardcoded.
 */

import {
  DEFAULT_CLAIM_RECOVERY_WINDOW_MS,
  DEFAULT_DISPATCH_LEASE_MS,
  DEFAULT_DISPATCH_MAX_CONCURRENCY,
  DEFAULT_EVENT_MAX_RECORDS,
  DEFAULT_EVENT_RETENTION_TTL_MS,
  DEFAULT_HANDOFF_DEDUP_TTL_MS,
  DEFAULT_HANDOFF_MAX_DEPTH,
  DEFAULT_LOCK_RENEW_WINDOW_MS,
  DEFAULT_LOCK_TTL_MS,
  DEFAULT_PRESENCE_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_RECONCILE_INTERVAL_MS,
} from './defaults';
import { DEFAULT_FEATURE_FLAGS, type CoordinationFeatureFlags } from './feature-flags';

export type CoordinationConfig = {
  lock: {
    defaultTtlMs: number;
    renewWindowMs: number;
  };
  claim: {
    recoveryWindowMs: number;
  };
  dispatch: {
    /** Claim lease length (ms); a dispatched agent's claim is live this long. */
    leaseMs: number;
    /** Per-space parallel-slot cap (multica `max_concurrent_tasks` analog). */
    maxConcurrency: number;
  };
  presence: {
    heartbeatTimeoutMs: number;
  };
  handoff: {
    maxDepth: number;
    dedupTtlMs: number;
  };
  event: {
    retentionTtlMs: number;
    maxRecords: number;
  };
  reconcile: {
    intervalMs: number;
  };
  transport: {
    /** From `process.env.NATS_URL`; undefined → in-proc bus only. */
    natsUrl?: string;
  };
  flags: CoordinationFeatureFlags;
};

/** Config with all defaults applied (env layer overrides these in `env.ts`). */
export const DEFAULT_COORDINATION_CONFIG: CoordinationConfig = {
  lock: {
    defaultTtlMs: DEFAULT_LOCK_TTL_MS,
    renewWindowMs: DEFAULT_LOCK_RENEW_WINDOW_MS,
  },
  claim: {
    recoveryWindowMs: DEFAULT_CLAIM_RECOVERY_WINDOW_MS,
  },
  dispatch: {
    leaseMs: DEFAULT_DISPATCH_LEASE_MS,
    maxConcurrency: DEFAULT_DISPATCH_MAX_CONCURRENCY,
  },
  presence: {
    heartbeatTimeoutMs: DEFAULT_PRESENCE_HEARTBEAT_TIMEOUT_MS,
  },
  handoff: {
    maxDepth: DEFAULT_HANDOFF_MAX_DEPTH,
    dedupTtlMs: DEFAULT_HANDOFF_DEDUP_TTL_MS,
  },
  event: {
    retentionTtlMs: DEFAULT_EVENT_RETENTION_TTL_MS,
    maxRecords: DEFAULT_EVENT_MAX_RECORDS,
  },
  reconcile: {
    intervalMs: DEFAULT_RECONCILE_INTERVAL_MS,
  },
  transport: {
    natsUrl: undefined,
  },
  flags: { ...DEFAULT_FEATURE_FLAGS },
};
