/**
 * ApprovalActions — inline approve/reject for a workspace that is
 * `awaiting_approval` (GAP-AUDIT Wave 10: the card was display-only; the
 * approvals resolve API existed but nothing in the cockpit called it).
 *
 * Renders the REAL pending Approval records for the workspace's task
 * (GET /api/agent-os/approvals?taskId=…&status=pending, polled) with an
 * Approve / Reject action per record, wired to the existing
 * POST /api/agent-os/approvals/:id/decide edge. Truthfulness rules:
 *
 *  - Optimistic but honest: a click marks the row busy immediately; a backend
 *    failure reverts to actionable buttons with the REAL error message — no
 *    fake success, ever.
 *  - Deciding an approval does NOT advance the workspace by itself: the
 *    governance gate clears on the next retry of the blocked action
 *    (approval-clearance seam). The success note says exactly that.
 *  - No pending record means there is genuinely nothing to decide — shown as
 *    an explicit empty state, never hidden and never fabricated.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import type { ApprovalDecision, ApprovalRecord, Workspace } from '../types';

interface ApprovalActionsProps {
  workspace: Workspace;
  /** Notify the parent that control-plane state may have changed (refetch). */
  onChanged: () => void;
}

/**
 * Per-record decision progress. `done` keeps the decided record so the outcome
 * stays visible after the pending poll no longer returns it.
 */
type RowOutcome =
  | { kind: 'busy'; decision: ApprovalDecision }
  | { kind: 'done'; decision: ApprovalDecision; record: ApprovalRecord }
  | { kind: 'error'; decision: ApprovalDecision; message: string };

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/** Badge tone for a risk tier (glanceability only — the raw tier is shown). */
function tierTone(tier: ApprovalRecord['riskTier']): string {
  if (tier === 'critical' || tier === 'high') return 'bad';
  if (tier === 'medium') return 'warn';
  return 'neutral';
}

function DecidedNote({ outcome }: { outcome: RowOutcome & { kind: 'done' } }) {
  const { record, decision } = outcome;
  return (
    <div class="approval-row approval-row-decided">
      <span class={`badge tone-${decision === 'approved' ? 'good' : 'bad'}`}>{decision}</span>
      <span class="approval-row-action">{record.action}</span>
      <span class="approval-decided-note">
        {decision === 'approved'
          ? 'Approved — retry the blocked action (Open PR / Merge) to deliver.'
          : 'Rejected — the action stays blocked.'}
      </span>
    </div>
  );
}

function PendingRow({
  record,
  outcome,
  onDecide,
}: {
  record: ApprovalRecord;
  outcome: RowOutcome | undefined;
  onDecide: (record: ApprovalRecord, decision: ApprovalDecision) => void;
}) {
  const busy = outcome?.kind === 'busy';
  return (
    <div class="approval-row">
      <div class="approval-row-main">
        <span class={`badge tone-${tierTone(record.riskTier)}`}>{record.riskTier}</span>
        <span class="approval-row-action" title={`approval ${record.id}`}>{record.action}</span>
        <span class="approval-row-by">requested by {record.requestedBy}</span>
      </div>
      {record.reason && <p class="approval-row-reason">{record.reason}</p>}
      <div class="approval-row-actions">
        <button
          class="btn btn-sm btn-primary"
          disabled={busy}
          onClick={() => onDecide(record, 'approved')}
        >
          {busy && outcome?.decision === 'approved' ? 'Approving…' : 'Approve'}
        </button>
        <button
          class="btn btn-sm btn-danger"
          disabled={busy}
          onClick={() => onDecide(record, 'denied')}
        >
          {busy && outcome?.decision === 'denied' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
      {outcome?.kind === 'error' && (
        <p class="approval-row-error">
          Couldn't {outcome.decision === 'approved' ? 'approve' : 'reject'} — {outcome.message}
        </p>
      )}
    </div>
  );
}

export function ApprovalActions({ workspace, onChanged }: ApprovalActionsProps) {
  const [outcomes, setOutcomes] = useState<Record<string, RowOutcome>>({});
  const pending = usePoll(
    () => api.listApprovals({ taskId: workspace.taskId, status: 'pending' }),
    5000,
    [workspace.taskId],
  );

  async function decide(record: ApprovalRecord, decision: ApprovalDecision): Promise<void> {
    // Optimistic busy state the instant the operator clicks; a failure reverts
    // to the buttons with the real backend error — never a fake success.
    setOutcomes((prev) => ({ ...prev, [record.id]: { kind: 'busy', decision } }));
    try {
      await api.decideApproval(record.id, { decision });
      setOutcomes((prev) => ({ ...prev, [record.id]: { kind: 'done', decision, record } }));
      pending.refresh();
      onChanged();
    } catch (err) {
      setOutcomes((prev) => ({
        ...prev,
        [record.id]: { kind: 'error', decision, message: describeError(err) },
      }));
    }
  }

  const records = pending.data ?? [];
  const liveRows = records.filter((r) => outcomes[r.id]?.kind !== 'done');
  const decidedRows = Object.values(outcomes).filter(
    (o): o is RowOutcome & { kind: 'done' } => o.kind === 'done',
  );
  const empty = !pending.loading && !pending.error && liveRows.length === 0 && decidedRows.length === 0;

  return (
    <div class="approval-actions">
      <div class="approval-actions-head">
        <span class="badge tone-warn">awaiting approval</span>
        <span class="approval-actions-title">This workspace is waiting on your decision</span>
      </div>
      {pending.loading && records.length === 0 && !pending.error && (
        <p class="approval-actions-note">Loading pending approvals…</p>
      )}
      {pending.error && (
        <p class="approval-actions-error">
          Pending approvals unavailable — {describeError(pending.error)}
        </p>
      )}
      {decidedRows.map((o) => (
        <DecidedNote key={o.record.id} outcome={o} />
      ))}
      {liveRows.map((r) => (
        <PendingRow key={r.id} record={r} outcome={outcomes[r.id]} onDecide={(rec, d) => void decide(rec, d)} />
      ))}
      {empty && (
        <p class="approval-actions-note">
          No pending approval record for this task yet — the agent has not requested one.
        </p>
      )}
    </div>
  );
}
