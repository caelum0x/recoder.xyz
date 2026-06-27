/**
 * check: stale_presence — an agent reports `busy`/`online`/`idle` but its
 * heartbeat is older than the timeout, so it is really gone.
 *
 * MERGED from `docker-backend/src/a2a/heartbeat-tracker.service.ts`: the sweep
 * marks an agent offline when `now - lastHeartbeatAt >= timeoutMs`
 * (`HEARTBEAT_TIMEOUT_MS`, default 90s/5min). This check is the pure, snapshot
 * form of that sweep — the impure heal then marks the agent offline via
 * PresenceStorePort, mirroring the tracker emitting `agent:offline`.
 *
 * Disposition: HEAL (mark offline). A dead heartbeat is provably-safe drift:
 * marking offline is idempotent and lets the agent's claims/locks be reclaimed
 * by later checks/ticks. Already-offline agents are skipped (no churn).
 *
 * Pure: `(CoordinationSnapshot) => CoherenceFinding[]`.
 */

import type { CoherenceFinding } from '../../domain';
import { isHeartbeatStale } from '../../domain';
import type { CoordinationSnapshot } from '../snapshot';

export function checkStalePresence(snapshot: CoordinationSnapshot): CoherenceFinding[] {
  const timeoutMs = snapshot.config.heartbeatTimeoutMs;
  const findings: CoherenceFinding[] = [];

  for (const presence of snapshot.presence) {
    if (presence.status === 'offline') {
      continue; // already offline — nothing to reconcile
    }
    if (!isHeartbeatStale(presence, snapshot.at, timeoutMs)) {
      continue; // heartbeat is fresh
    }

    findings.push({
      driftKind: 'stale_presence',
      disposition: 'heal',
      severity: 'medium',
      taskId: presence.currentTaskId,
      agentId: presence.agentId,
      evidence: `Agent ${presence.agentId} reports ${presence.status} but its last heartbeat (${presence.lastSeen}) is older than the ${timeoutMs}ms timeout. Marking offline.`,
      detectedAt: snapshot.at,
    });
  }

  return findings;
}
