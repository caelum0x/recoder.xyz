/**
 * `heartbeat-slo` — records liveness heartbeats and computes a TRUTHFUL liveness
 * verdict from the most-recent sample against the configured staleness window
 * (`heartbeatStaleMs`). It is how a registered agent's `status` becomes `up` /
 * `degraded` / `down` — never a fabricated `up`.
 *
 * Verdict ladder (all derived from real samples + the clock):
 *   - never seen                       ⇒ `unknown`
 *   - last sample `ok:false`           ⇒ `down`  (the agent itself reported failure)
 *   - last sample older than window    ⇒ `down`  (stale — no proof of life)
 *   - last sample older than ½ window  ⇒ `degraded`
 *   - otherwise                        ⇒ `up`
 *
 * `reconcile` writes the derived verdict back through the registry so reads reflect
 * reality; it degrades safely (a repo fault leaves the stored status untouched).
 */
import type { AgentRegistryRepo } from '../ports/agent-registry.repo.js';
import type { AgentStatus, HeartbeatSample } from '../types.js';

/** A computed liveness verdict for an agent. */
export interface LivenessVerdict {
  readonly agentId: string;
  readonly status: AgentStatus;
  /** Ms since the last heartbeat; `undefined` when never seen. */
  readonly ageMs?: number;
  readonly reason: string;
}

export interface HeartbeatSloDeps {
  readonly registry: AgentRegistryRepo;
  /** Ms without a heartbeat before an agent is `down` (from InteropWireConfig). */
  readonly staleMs: number;
  /** Injected clock (tests). */
  readonly now?: () => number;
}

export interface HeartbeatSloService {
  /** Record a heartbeat sample (server stamps `seenAt` when omitted). */
  record(
    sample: Omit<HeartbeatSample, 'seenAt'> & { seenAt?: string }
  ): Promise<void>;
  /** Compute the current liveness verdict for an owner-scoped agent. */
  liveness(agentId: string, userId: string): Promise<LivenessVerdict>;
  /** Compute + persist the derived status back onto the agent row (owner-scoped). */
  reconcile(agentId: string, userId: string): Promise<LivenessVerdict>;
}

/** Build the heartbeat-SLO service over the frozen registry repo. */
export function createHeartbeatSloService(
  deps: HeartbeatSloDeps
): HeartbeatSloService {
  const now = deps.now ?? (() => Date.now());
  const staleMs = deps.staleMs;

  function verdictFrom(
    agentId: string,
    sample: HeartbeatSample | null
  ): LivenessVerdict {
    if (!sample) {
      return {
        agentId,
        status: 'unknown',
        reason: 'No heartbeat recorded yet.',
      };
    }
    if (!sample.ok) {
      const ageMs = ageOf(sample, now());
      return {
        agentId,
        status: 'down',
        ageMs,
        reason: 'Last heartbeat reported failure.',
      };
    }
    const ageMs = ageOf(sample, now());
    if (ageMs > staleMs) {
      return {
        agentId,
        status: 'down',
        ageMs,
        reason: `Last heartbeat is stale (${ageMs}ms > ${staleMs}ms).`,
      };
    }
    if (ageMs > staleMs / 2) {
      return {
        agentId,
        status: 'degraded',
        ageMs,
        reason: `Heartbeat aging (${ageMs}ms > half window).`,
      };
    }
    return {
      agentId,
      status: 'up',
      ageMs,
      reason: 'Recent healthy heartbeat.',
    };
  }

  return {
    async record(
      sample: Omit<HeartbeatSample, 'seenAt'> & { seenAt?: string }
    ): Promise<void> {
      await deps.registry.recordHeartbeat({
        agentId: sample.agentId,
        userId: sample.userId,
        seenAt: sample.seenAt ?? new Date(now()).toISOString(),
        latencyMs: sample.latencyMs,
        ok: sample.ok,
      });
    },

    async liveness(agentId: string, userId: string): Promise<LivenessVerdict> {
      const sample = await safe(() =>
        deps.registry.lastHeartbeat(agentId, userId)
      );
      return verdictFrom(agentId, sample ?? null);
    },

    async reconcile(agentId: string, userId: string): Promise<LivenessVerdict> {
      const sample = await safe(() =>
        deps.registry.lastHeartbeat(agentId, userId)
      );
      const verdict = verdictFrom(agentId, sample ?? null);
      // Persist the derived status; a fault leaves the stored value untouched.
      await safe(() =>
        deps.registry.setStatus(agentId, userId, verdict.status)
      );
      return verdict;
    },
  };
}

function ageOf(sample: HeartbeatSample, nowMs: number): number {
  const seen = Date.parse(sample.seenAt);
  if (Number.isNaN(seen)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs - seen);
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
