/**
 * handoff-reconciler — detect stuck / duplicate / orphan handoffs (PURE).
 *
 * The handoff slice of the shared-state coherence story (design §4.4: "detect
 * stuck/duplicate handoffs → signals"). It takes a snapshot of handoffs + the
 * set of known/live agent ids + `now`, and returns `CoherenceFinding[]`. No IO:
 * the caller (coherence/engine) turns findings into `WorkSignal`s via
 * `signal-builder` and emits them through `SignalSinkPort`.
 *
 * Drift detected here:
 *  - STUCK: a handoff parked in a non-terminal status past `stuckAfterMs`
 *    (mirrors the source's `awaiting-approval` / in-flight states never resolving).
 *  - DUPLICATE: two non-terminal handoffs with the same (from,to,intent,source)
 *    fingerprint — an at-least-once delivery that the dedup ledger missed across
 *    a restart (the original deduped only in-memory via `_localEventIds`).
 *  - ORPHAN: a non-terminal handoff whose target agent is unknown/offline
 *    (mirrors "dead target" — `orphan_handoff` drift kind).
 */

import type { CoherenceFinding, Handoff, HandoffStatus, WorkSignalSeverity } from '../domain';

const TERMINAL_STATUSES: ReadonlySet<HandoffStatus> = new Set<HandoffStatus>([
  'completed',
  'rejected',
  'failed',
]);

/** Default age past which a non-terminal handoff is considered stuck. */
export const DEFAULT_HANDOFF_STUCK_AFTER_MS = 10 * 60_000;

export type HandoffReconcileInput = {
  handoffs: ReadonlyArray<Handoff>;
  /** Agent ids the directory considers live (online or reachable). */
  liveAgentIds: ReadonlySet<string>;
  now: string;
  stuckAfterMs?: number;
};

function isTerminal(status: HandoffStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Stable fingerprint identifying "the same handoff intent" for duplicate detection. */
function duplicateKey(h: Handoff): string {
  return `${h.fromAgentId}->${h.toAgentId}:${h.intent}:${h.sourceTaskId ?? ''}`;
}

function ageMs(handoff: Handoff, now: string): number {
  return Date.parse(now) - Date.parse(handoff.initiatedAt);
}

function finding(
  handoff: Handoff,
  severity: WorkSignalSeverity,
  evidence: string,
  now: string,
): CoherenceFinding {
  return {
    driftKind: 'orphan_handoff',
    disposition: 'escalate',
    severity,
    handoffId: handoff.handoffId,
    ...(handoff.spaceId ? { spaceId: handoff.spaceId } : {}),
    ...(handoff.targetTaskId ? { taskId: handoff.targetTaskId } : {}),
    agentId: handoff.toAgentId,
    evidence,
    detectedAt: now,
  };
}

/**
 * PURE: scan handoffs for stuck / duplicate / orphan drift. Returns findings;
 * never throws. Findings are always `escalate` (handoff drift is never
 * auto-healed — a human/agent decides whether to retry or cancel).
 */
export function reconcileHandoffs(input: HandoffReconcileInput): CoherenceFinding[] {
  const { handoffs, liveAgentIds, now } = input;
  const stuckAfterMs = input.stuckAfterMs ?? DEFAULT_HANDOFF_STUCK_AFTER_MS;
  const findings: CoherenceFinding[] = [];

  const nonTerminal = handoffs.filter((h) => !isTerminal(h.status));

  // ── ORPHAN: non-terminal handoff to an unknown/offline target ──
  for (const h of nonTerminal) {
    if (!liveAgentIds.has(h.toAgentId)) {
      findings.push(
        finding(
          h,
          'high',
          `Handoff ${h.handoffId} targets ${h.toAgentId}, which is not a live agent.`,
          now,
        ),
      );
    }
  }

  // ── STUCK: non-terminal handoff older than the stuck threshold ──
  for (const h of nonTerminal) {
    if (ageMs(h, now) >= stuckAfterMs) {
      findings.push(
        finding(
          h,
          'medium',
          `Handoff ${h.handoffId} has been '${h.status}' for ${ageMs(h, now)}ms (>= ${stuckAfterMs}ms).`,
          now,
        ),
      );
    }
  }

  // ── DUPLICATE: two non-terminal handoffs with the same fingerprint ──
  const byKey = new Map<string, Handoff[]>();
  for (const h of nonTerminal) {
    const key = duplicateKey(h);
    const list = byKey.get(key);
    if (list) list.push(h);
    else byKey.set(key, [h]);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    // Keep the earliest by initiatedAt; flag the rest as duplicates.
    const sorted = [...group].sort(
      (a, b) => Date.parse(a.initiatedAt) - Date.parse(b.initiatedAt),
    );
    for (const dup of sorted.slice(1)) {
      findings.push(
        finding(
          dup,
          'medium',
          `Duplicate handoff ${dup.handoffId} mirrors ${sorted[0].handoffId} (same from/to/intent/source).`,
          now,
        ),
      );
    }
  }

  return findings;
}
