/**
 * ComparePanel — the multi-agent side-by-side of a parallel-run group (product
 * F3). Reached from a parallel-run group on the board: the SAME task launched
 * across N agents, one isolated worktree each, aggregated here for review.
 *
 * Data comes ONLY from GET /workspaces/compare?taskGroup= (the read-only compare
 * surface, polled while the panel is open). Each sibling is a column showing the
 * agent, its live outcome (durable state + attention), its diff stat, and a
 * "Merge this one" action.
 *
 * Truthfulness rules (mirror WorkspaceDetail / CheckpointsPanel):
 *  - The diff stat is rendered exactly as the backend reports it; when a sibling
 *    has no worktree the backend sends an ABSENT stat with a reason, shown as a
 *    truthful "diff unavailable — <reason>" line, never a fabricated 0/0/0.
 *  - "Merge this one" hits the SAME governed POST /workspaces/:id/merge every
 *    other conductor merge uses. It is enabled only when the backend state
 *    machine allows a merge (canMerge); a 409 delivery-gate rejection surfaces
 *    the awaiting-approval verdict inline instead of faking success.
 *  - An unknown/empty group is a truthful empty view, never an invented row.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import {
  deliveryGateFromError,
  deliveryGateReason,
} from '../lib/conductor-health-state';
import { canMerge, statePill, stateTone } from '../lib/workspace-state';
import { workspaceCodename } from '../lib/workspace-codename';
import { GroupAttachAction } from './GroupAttachAction';
import type { AttentionState, ContestedFile, DiffStat, SiblingCompareEntry } from '../types';

interface ComparePanelProps {
  /** The shared parallel-run group key to aggregate. */
  taskGroup: string;
  /** The shared goal label (siblings run the same task) — header context only. */
  goal?: string;
  onClose: () => void;
  /** Notify the parent that control-plane state may have changed (refetch board). */
  onChanged: () => void;
}

const COMPARE_POLL_MS = 4000;

/** Per-column merge outcome (optimistic but honest — reverts on failure). */
type MergeOutcome =
  | { kind: 'busy' }
  | { kind: 'merged' }
  | { kind: 'gated'; reason: string; approvalId?: string }
  | { kind: 'error'; message: string };

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/** Attention → a calm badge tone. `unknown` is muted (no truthful signal). */
function attentionTone(attention: AttentionState): string {
  switch (attention) {
    case 'error':
      return 'bad';
    case 'awaiting_approval':
    case 'agent_idle_prompt':
      return 'warn';
    case 'review_ready':
      return 'good';
    case 'working':
      return 'active';
    default:
      return 'neutral';
  }
}

function attentionLabel(attention: AttentionState): string {
  return attention.replace(/_/g, ' ');
}

/** The compact "N files · +A · -D" diff stat, or a truthful unavailable line. */
function DiffStatLine({ stat, reason }: { stat?: DiffStat; reason?: string }) {
  if (!stat) {
    return (
      <div class="compare-col-diffstat compare-col-diffstat-absent" title={reason}>
        diff unavailable{reason ? ` — ${reason}` : ''}
      </div>
    );
  }
  return (
    <div class="compare-col-diffstat">
      <span class="compare-diffstat-files">
        {stat.files} file{stat.files === 1 ? '' : 's'}
      </span>
      <span class="ws-diffstat-add">+{stat.additions}</span>
      <span class="ws-diffstat-del">−{stat.deletions}</span>
    </div>
  );
}

/**
 * The contested strip — files 2+ siblings BOTH touched (where parallel agents
 * will collide). Purely projects the server-computed `contested` set: empty or
 * absent ⇒ nothing rendered (terminal-plain calm — no collisions is NOT a green
 * "all clear" banner). Codenames are derived deterministically from the id.
 */
function ContestedStrip({ contested }: { contested: ContestedFile[] }) {
  if (contested.length === 0) return null;
  return (
    <div class="compare-contested">
      {contested.map((c) => (
        <div key={c.path}>
          <span class="compare-contested-path">{c.path}</span>
          {` — ${c.workspaceIds.map(workspaceCodename).join(', ')}`}
        </div>
      ))}
    </div>
  );
}

function SiblingColumn({
  sibling,
  outcome,
  onMerge,
  contestedPaths,
}: {
  sibling: SiblingCompareEntry;
  outcome: MergeOutcome | undefined;
  onMerge: (sibling: SiblingCompareEntry) => void;
  contestedPaths?: string[];
}) {
  const mergeable = canMerge(sibling.state);
  const busy = outcome?.kind === 'busy';
  return (
    <div class="compare-col">
      <div class="compare-col-head">
        <span class="compare-col-agent" title={sibling.runtimeId}>{sibling.agent}</span>
        <span class={`ws-row-pill pill-${stateTone(sibling.state)}`}>{statePill(sibling.state)}</span>
      </div>
      <div class="compare-col-handle" title={`${sibling.workspaceId} · ${sibling.branch}`}>
        {workspaceCodename(sibling.workspaceId)}
      </div>

      {contestedPaths && contestedPaths.length > 0 && (
        <span
          class="compare-col-contested-badge badge tone-warn"
          title={`Also touched by another agent: ${contestedPaths.join(', ')}`}
        >
          {contestedPaths.length} contested
        </span>
      )}

      {sibling.attention && sibling.attention !== 'unknown' && (
        <span
          class={`badge tone-${attentionTone(sibling.attention)} compare-col-attention`}
          title={sibling.attentionReason}
        >
          {attentionLabel(sibling.attention)}
        </span>
      )}

      <DiffStatLine stat={sibling.diffStat} reason={sibling.diffStatReason} />

      <div class="compare-col-actions">
        <button
          class="btn btn-sm btn-primary"
          disabled={!mergeable || busy}
          title={
            mergeable
              ? 'Merge this agent’s worktree'
              : 'Merge is available once this agent’s run is ready to review'
          }
          onClick={() => onMerge(sibling)}
        >
          {busy ? 'Merging…' : 'Merge this one'}
        </button>
      </div>

      {outcome?.kind === 'merged' && <p class="compare-col-note">Merged.</p>}
      {outcome?.kind === 'gated' && (
        <p class="compare-col-gated">
          Awaiting approval — {outcome.reason}
          {outcome.approvalId ? ` (approval ${outcome.approvalId})` : ''}. This merge was NOT
          performed.
        </p>
      )}
      {outcome?.kind === 'error' && (
        <p class="compare-col-error">Couldn’t merge — {outcome.message}</p>
      )}
    </div>
  );
}

export function ComparePanel({ taskGroup, goal, onClose, onChanged }: ComparePanelProps) {
  const [outcomes, setOutcomes] = useState<Record<string, MergeOutcome>>({});
  const poll = usePoll(() => api.compareTaskGroup(taskGroup), COMPARE_POLL_MS, [taskGroup]);

  async function merge(sibling: SiblingCompareEntry): Promise<void> {
    setOutcomes((prev) => ({ ...prev, [sibling.workspaceId]: { kind: 'busy' } }));
    try {
      await api.merge(sibling.workspaceId, { strategy: 'squash' });
      setOutcomes((prev) => ({ ...prev, [sibling.workspaceId]: { kind: 'merged' } }));
      poll.refresh();
      onChanged();
    } catch (err) {
      // A 409 delivery-gate rejection is a truthful awaiting-approval verdict —
      // surface it inline on the column, never as a generic failure.
      const gate = deliveryGateFromError(err);
      if (gate) {
        setOutcomes((prev) => ({
          ...prev,
          [sibling.workspaceId]: {
            kind: 'gated',
            reason: deliveryGateReason(err),
            ...(gate.approvalId ? { approvalId: gate.approvalId } : {}),
          },
        }));
        onChanged();
      } else {
        setOutcomes((prev) => ({
          ...prev,
          [sibling.workspaceId]: { kind: 'error', message: describeError(err) },
        }));
      }
    }
  }

  const compare = poll.data;
  const siblings = compare?.siblings ?? [];
  const contested = compare?.contested ?? [];
  const contestedByWorkspace = new Map<string, string[]>();
  for (const entry of contested) {
    for (const wsId of entry.workspaceIds) {
      const list = contestedByWorkspace.get(wsId);
      if (list) list.push(entry.path);
      else contestedByWorkspace.set(wsId, [entry.path]);
    }
  }
  const empty = !poll.loading && !poll.error && siblings.length === 0;

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="modal compare-modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <div class="compare-title">
            <h2>Compare agents</h2>
            <span class="compare-subtitle" title={goal}>
              {goal ? goal : `group ${taskGroup}`}
              {compare ? ` · ${compare.count} agent${compare.count === 1 ? '' : 's'}` : ''}
            </span>
          </div>
          <GroupAttachAction taskGroup={taskGroup} grid={compare?.grid} onChanged={onChanged} />
          <button class="icon-btn" onClick={onClose} aria-label="Close compare">×</button>
        </div>

        {poll.loading && !compare && <p class="compare-note">Loading siblings…</p>}
        {poll.error && (
          <p class="compare-error">Compare unavailable — {describeError(poll.error)}</p>
        )}
        {empty && (
          <p class="compare-note">
            No siblings in this group — nothing to compare. Launch the same task across multiple
            agents to see them side-by-side.
          </p>
        )}

        <ContestedStrip contested={contested} />

        {siblings.length > 0 && (
          <div class="compare-grid">
            {siblings.map((sibling) => (
              <SiblingColumn
                key={sibling.workspaceId}
                sibling={sibling}
                outcome={outcomes[sibling.workspaceId]}
                onMerge={(s) => void merge(s)}
                contestedPaths={contestedByWorkspace.get(sibling.workspaceId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
