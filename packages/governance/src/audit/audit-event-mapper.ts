import { createRecoderCloudEvent, type RecoderCloudEvent, type RecoderAgentEventType } from '@recoder/agent-events';
import type { AuditEntry, AuditAction, AuditInput, AuditOutcome } from '../domain/audit-entry';

/**
 * audit-event-mapper — bidirectional mapping between an AuditEntry and a Recoder
 * CloudEvent so audit records can flow through the agent-events outbox and be
 * subscribed to as a live stream.
 *
 * The mapping is lossless for the chain-critical fields: the CloudEvent `data`
 * carries the full sealed entry (seq/hash/prevHash included) so a subscriber can
 * independently re-verify the chain link.
 */

const AUDIT_EVENT_SOURCE = 'recoder://governance/audit' as const;

/**
 * AuditAction -> the closest existing RecoderAgentEventType. The audit chain is
 * richer than the event taxonomy, so the precise AuditAction is preserved inside
 * `data.entry.action`; the CloudEvent `type` is only a coarse routing hint.
 */
function eventTypeForAction(action: AuditAction): RecoderAgentEventType {
  switch (action) {
    case 'approval.requested':
      return 'recoder.approval.requested';
    case 'approval.resolved':
      // resolution direction lives in the outcome; default to approved-class
      return 'recoder.approval.approved';
    case 'work_signal.observed':
      return 'recoder.work_signal.opened';
    default:
      // Decisions, enforcement, routing, etc. ride the generic run-log channel.
      return 'recoder.run.log.appended';
  }
}

export function auditEntryToCloudEvent(entry: AuditEntry): RecoderCloudEvent<{ entry: AuditEntry }> {
  return createRecoderCloudEvent<{ entry: AuditEntry }>({
    id: `audit_${entry.seq}_${entry.hash.slice(0, 12)}`,
    type: eventTypeForAction(entry.action),
    source: AUDIT_EVENT_SOURCE,
    subject: entry.runId ?? entry.actor,
    time: entry.timestamp,
    data: { entry },
  });
}

/**
 * Extract an AuditInput from a CloudEvent that wraps an entry. Returns null when
 * the event does not carry a governance audit entry (deny-biased: never invent
 * an entry from a malformed event).
 */
export function cloudEventToAuditInput(
  event: RecoderCloudEvent<{ entry?: Partial<AuditEntry> }>,
): AuditInput | null {
  const entry = event.data?.entry;
  if (!entry || typeof entry.actor !== 'string' || typeof entry.action !== 'string') {
    return null;
  }
  return {
    timestamp: entry.timestamp ?? event.time,
    actor: entry.actor,
    action: entry.action as AuditAction,
    detail: entry.detail ?? '',
    outcome: (entry.outcome ?? 'info') as AuditOutcome,
    runId: entry.runId,
    metadata: entry.metadata,
  };
}
