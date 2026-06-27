/**
 * check: orphan_handoff — a non-terminal handoff whose target agent is missing
 * from presence, or present but offline. The receiving agent will never pick it
 * up, so the handed-off work is lost.
 *
 * Disposition: ESCALATE (signal `handoff_stuck`). UNSAFE to auto-heal: we cannot
 * silently pick a new target; a human/agent must re-route or fail it.
 * (Per design §4.5: "handoff with no target / dead target → signal".)
 *
 * Pure: `(CoordinationSnapshot) => CoherenceFinding[]`.
 */

import type { CoherenceFinding, HandoffStatus } from '../../domain';
import { presenceByAgent, type CoordinationSnapshot } from '../snapshot';

const TERMINAL_HANDOFF_STATUSES: readonly HandoffStatus[] = [
  'completed',
  'rejected',
  'failed',
];

export function checkOrphanHandoff(snapshot: CoordinationSnapshot): CoherenceFinding[] {
  const presence = presenceByAgent(snapshot);
  const findings: CoherenceFinding[] = [];

  for (const handoff of snapshot.handoffs) {
    if ((TERMINAL_HANDOFF_STATUSES as readonly string[]).includes(handoff.status)) {
      continue;
    }

    const target = handoff.toAgentId ? presence.get(handoff.toAgentId) : undefined;
    const missing = !handoff.toAgentId || target === undefined;
    const offline = target !== undefined && target.status === 'offline';
    if (!missing && !offline) {
      continue;
    }

    findings.push({
      driftKind: 'orphan_handoff',
      disposition: 'escalate',
      severity: 'high',
      taskId: handoff.targetTaskId ?? handoff.sourceTaskId,
      spaceId: handoff.spaceId,
      handoffId: handoff.handoffId,
      agentId: handoff.toAgentId,
      evidence: missing
        ? `Handoff ${handoff.handoffId} (status=${handoff.status}) targets agent ${handoff.toAgentId || '<none>'} which is not present. The work is unclaimed.`
        : `Handoff ${handoff.handoffId} (status=${handoff.status}) targets offline agent ${handoff.toAgentId}. It will not be picked up.`,
      detectedAt: snapshot.at,
    });
  }

  return findings;
}
