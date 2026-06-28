/**
 * GovernancePanel — surfaces the conductor delivery-gate verdict for a workspace.
 *
 * There is NO dedicated governance-audit route exposed today. Instead this panel
 * consumes what the conductor PR/merge path already carries: a customer-visible
 * delivery (PR / merge) is approval-gated, and when no approval exists the
 * backend returns a 409 whose body is
 *   { success:false, error:<reason>, data:{ state:'awaiting_approval', action, approvalId?, transitioned? } }
 * (docker-backend/src/conductor/conductor.routes.ts → DeliveryApprovalRequiredError).
 *
 * The operator triggers a real delivery attempt; this renders the genuine
 * awaiting_approval verdict (tier/action + reason + whether the workspace was
 * transitioned) from that real response. On success (an approval already
 * existed) it truthfully reports the delivery went through — it never fakes an
 * approval state. Errors that are not the gate (unreachable, auth, other 4xx/5xx)
 * are shown as their real condition.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import {
  deliveryGateFromError,
  deliveryGateReason,
} from '../lib/conductor-health-state';
import { canMerge, canOpenPr, stateLabel, stateTone } from '../lib/workspace-state';
import type { DeliveryGateDetail, Workspace } from '../types';

const WORKSPACES_POLL_MS = 5000;

type Attempt =
  | { kind: 'idle' }
  | { kind: 'busy'; action: 'pr' | 'merge' }
  | { kind: 'gated'; action: 'pr' | 'merge'; detail: DeliveryGateDetail; reason: string }
  | { kind: 'delivered'; action: 'pr' | 'merge'; note: string }
  | { kind: 'error'; action: 'pr' | 'merge'; message: string };

function describeNonGateError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

function GateVerdict({ action, detail, reason }: { action: 'pr' | 'merge'; detail: DeliveryGateDetail; reason: string }) {
  return (
    <div class="gate-verdict">
      <div class="gate-verdict-head">
        <span class="badge tone-warn">{detail.state.replace(/_/g, ' ')}</span>
        <span class="gate-verdict-action">{action.toUpperCase()} blocked by delivery gate</span>
      </div>
      <dl class="gate-verdict-grid">
        <div>
          <dt class="meta-k">Tier / action</dt>
          <dd class="meta-v">{detail.action}</dd>
        </div>
        <div>
          <dt class="meta-k">Approval record</dt>
          <dd class="meta-v">{detail.approvalId || 'none found (no approving Approval)'}</dd>
        </div>
        <div>
          <dt class="meta-k">Workspace transitioned</dt>
          <dd class="meta-v">{detail.transitioned ? 'yes → awaiting_approval' : 'no (illegal transition from current state)'}</dd>
        </div>
        <div class="gate-verdict-reason-cell">
          <dt class="meta-k">Reason</dt>
          <dd class="meta-v gate-verdict-reason">{reason}</dd>
        </div>
      </dl>
      <p class="gate-verdict-note">
        This delivery was NOT performed. An approving Approval record (at the required risk tier) must
        exist before the conductor will push the branch / merge the PR.
      </p>
    </div>
  );
}

export function GovernancePanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt>({ kind: 'idle' });

  const board = usePoll(() => api.listWorkspaces(), WORKSPACES_POLL_MS);
  const workspaces = board.data || [];
  const selected: Workspace | null =
    workspaces.find((w) => w.workspaceId === selectedId) || null;

  function select(id: string) {
    setSelectedId(id);
    setAttempt({ kind: 'idle' });
  }

  async function attemptDelivery(action: 'pr' | 'merge') {
    if (!selected) return;
    setAttempt({ kind: 'busy', action });
    try {
      if (action === 'pr') {
        await api.openPr(selected.workspaceId, { title: `Conductor: ${selected.branch}` });
        setAttempt({ kind: 'delivered', action, note: 'PR opened (an approving Approval already existed).' });
      } else {
        await api.merge(selected.workspaceId, { strategy: 'squash' });
        setAttempt({ kind: 'delivered', action, note: 'Merged (an approving Approval already existed).' });
      }
      board.refresh();
    } catch (err) {
      const gate = deliveryGateFromError(err);
      if (gate) {
        setAttempt({ kind: 'gated', action, detail: gate, reason: deliveryGateReason(err) });
        board.refresh();
      } else {
        setAttempt({ kind: 'error', action, message: describeNonGateError(err) });
      }
    }
  }

  const busy = attempt.kind === 'busy';

  return (
    <div class="governance-panel">
      <div class="panel-head">
        <h2 class="panel-title">Governance &amp; Approval</h2>
        <div class="panel-head-actions">
          <span class="panel-head-note">delivery gate via POST /workspaces/:id/{'{pr|merge}'}</span>
          <button class="btn btn-ghost btn-sm" onClick={() => board.refresh()} disabled={board.loading}>
            {board.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {board.error ? (
        <div class="banner banner-warn">
          <strong>Workspace list unavailable:</strong> {board.error.message}
        </div>
      ) : null}

      <div class="governance-body">
        <aside class="governance-list">
          {board.loading && !board.data ? (
            <div class="panel-empty">Loading workspaces…</div>
          ) : workspaces.length === 0 ? (
            <div class="panel-empty">
              <p>No workspaces.</p>
              <p class="panel-empty-sub">Create a workspace, then attempt a delivery to see the approval gate.</p>
            </div>
          ) : (
            workspaces.map((w) => (
              <button
                key={w.workspaceId}
                class={`governance-item ${w.workspaceId === selectedId ? 'governance-item-active' : ''}`}
                onClick={() => select(w.workspaceId)}
                title={w.workspaceId}
              >
                <span class="governance-item-branch">{w.branch}</span>
                <span class={`badge tone-${stateTone(w.state)}`}>{stateLabel(w.state)}</span>
              </button>
            ))
          )}
        </aside>

        <section class="governance-detail">
          {selected ? (
            <>
              <div class="governance-detail-head">
                <span class={`badge tone-${stateTone(selected.state)}`}>{stateLabel(selected.state)}</span>
                <span class="governance-detail-branch">{selected.branch}</span>
                <span class="governance-detail-meta">{selected.taskId}</span>
              </div>

              <div class="governance-actions">
                <button
                  class="btn btn-sm"
                  disabled={busy || !canOpenPr(selected.state)}
                  onClick={() => void attemptDelivery('pr')}
                  title={canOpenPr(selected.state) ? 'Attempt to open a PR (approval-gated)' : 'PR not legal from this state'}
                >
                  {attempt.kind === 'busy' && attempt.action === 'pr' ? 'Attempting…' : 'Attempt PR'}
                </button>
                <button
                  class="btn btn-sm"
                  disabled={busy || !canMerge(selected.state)}
                  onClick={() => void attemptDelivery('merge')}
                  title={canMerge(selected.state) ? 'Attempt to merge (approval-gated)' : 'Merge only legal from awaiting_review'}
                >
                  {attempt.kind === 'busy' && attempt.action === 'merge' ? 'Attempting…' : 'Attempt Merge'}
                </button>
              </div>

              {attempt.kind === 'gated' && (
                <GateVerdict action={attempt.action} detail={attempt.detail} reason={attempt.reason} />
              )}
              {attempt.kind === 'delivered' && (
                <div class="banner banner-good">
                  <strong>Delivered:</strong> {attempt.note}
                </div>
              )}
              {attempt.kind === 'error' && (
                <div class="banner banner-warn">
                  <strong>{attempt.action.toUpperCase()} failed:</strong> {attempt.message}
                </div>
              )}
              {attempt.kind === 'idle' && (
                <p class="governance-hint">
                  Attempt a delivery to evaluate the approval gate. If no approving Approval exists, the
                  conductor returns an <code>awaiting_approval</code> verdict (the real 409 below) and does
                  not perform the action.
                </p>
              )}
            </>
          ) : (
            <div class="log-empty">Select a workspace to evaluate its delivery gate.</div>
          )}
        </section>
      </div>
    </div>
  );
}
