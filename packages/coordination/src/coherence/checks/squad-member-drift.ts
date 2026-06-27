/**
 * check: squad_member_drift — the squad believes a member is busy on a task, but
 * the member holds no live claim (and no live run). The squad will starve itself
 * of capacity by never re-assigning a member it wrongly thinks is busy.
 *
 * MERGED from multica `squad_no_action.go` / `squad.go` (leader/no-action squad
 * assignment) + the A2A squad model: squad membership liveness is reconciled
 * against actual claim/run state. Drift here is the squad's belief diverging
 * from the coordination source of truth (claims).
 *
 * Disposition: ESCALATE (reason `duplicate_claim` via escalation map — the squad
 * is "double-booking" a member). We escalate so the squad leader reconciles the
 * member back to idle rather than the engine silently flipping squad state.
 *
 * Pure: `(CoordinationSnapshot) => CoherenceFinding[]`.
 */

import type { CoherenceFinding, TaskClaim } from '../../domain';
import { liveRunsByTask, type CoordinationSnapshot } from '../snapshot';

function liveClaimAgents(snapshot: CoordinationSnapshot): Set<string> {
  const agents = new Set<string>();
  for (const claim of snapshot.claims) {
    if (claim.status === 'claimed' || claim.status === 'recovering') {
      agents.add(claim.agentId);
    }
  }
  return agents;
}

function claimByAgentAndTask(snapshot: CoordinationSnapshot): Map<string, TaskClaim> {
  const byKey = new Map<string, TaskClaim>();
  for (const claim of snapshot.claims) {
    if (claim.status === 'claimed' || claim.status === 'recovering') {
      byKey.set(`${claim.agentId}::${claim.taskId}`, claim);
    }
  }
  return byKey;
}

export function checkSquadMemberDrift(snapshot: CoordinationSnapshot): CoherenceFinding[] {
  const busyAgents = liveClaimAgents(snapshot);
  const claimByKey = claimByAgentAndTask(snapshot);
  const liveRuns = liveRunsByTask(snapshot);
  const findings: CoherenceFinding[] = [];

  for (const member of snapshot.squadMembers) {
    if (!member.believedBusy) {
      continue; // squad thinks member is idle — no drift
    }

    // If the member holds ANY live claim, the belief is justified.
    if (busyAgents.has(member.memberId)) {
      // If the squad pins a specific task, verify the member actually claims it.
      if (member.believedTaskId) {
        const hasMatchingClaim = claimByKey.has(`${member.memberId}::${member.believedTaskId}`);
        const hasRunForTask = (liveRuns.get(member.believedTaskId) ?? []).some(
          (run) => run.agentId === member.memberId,
        );
        if (hasMatchingClaim || hasRunForTask) {
          continue; // belief matches reality
        }
        // Member is busy elsewhere, not on the believed task — still drift.
      } else {
        continue; // no specific task pinned and the member is genuinely busy
      }
    }

    findings.push({
      driftKind: 'squad_member_drift',
      disposition: 'escalate',
      severity: 'low',
      taskId: member.believedTaskId,
      squadId: member.squadId,
      agentId: member.memberId,
      evidence: `Squad ${member.squadId} believes member ${member.memberId} is busy${
        member.believedTaskId ? ` on task ${member.believedTaskId}` : ''
      }, but the member holds no matching live claim. Reconcile the member to idle.`,
      detectedAt: snapshot.at,
    });
  }

  return findings;
}
