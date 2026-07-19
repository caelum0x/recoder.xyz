/**
 * CheckpointsPanel — the workspace's git-snapshot surface in the detail panel.
 *
 * Renders the REAL checkpoint records (GET /workspaces/:id/checkpoints, polled)
 * with a "Checkpoint now" action and, per record, Restore and Branch actions —
 * wired to the governed backend edges:
 *   Create  → POST /workspaces/:id/checkpoints
 *   Restore → POST /workspaces/:id/checkpoints/:cid/restore
 *   Branch  → POST /workspaces/:id/checkpoints/:cid/branch  (creates a NEW workspace)
 *
 * Truthfulness rules (mirrors ApprovalActions):
 *  - Optimistic but honest: a click marks the row busy immediately; a backend
 *    failure reverts to actionable buttons with the REAL error message.
 *  - Restore is destructive of current uncommitted work; the backend takes an
 *    automatic safety snapshot, and the success note surfaces its ref so the
 *    prior state stays recoverable — never a silent overwrite.
 *  - An empty list is an explicit truthful state, never hidden or fabricated.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import type { Checkpoint, Workspace } from '../types';

interface CheckpointsPanelProps {
  workspace: Workspace;
  /** Notify the parent that control-plane state may have changed (refetch). */
  onChanged: () => void;
}

type RowOutcome =
  | { kind: 'busy'; op: 'restore' | 'branch' }
  | { kind: 'restored'; safetyRef?: string }
  | { kind: 'branched'; workspaceId: string }
  | { kind: 'error'; op: 'restore' | 'branch'; message: string };

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

function shortSha(sha: string): string {
  return sha.slice(0, 8);
}

export function CheckpointsPanel({ workspace, onChanged }: CheckpointsPanelProps) {
  const [outcomes, setOutcomes] = useState<Record<string, RowOutcome>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const poll = usePoll(
    () => api.listCheckpoints(workspace.workspaceId),
    5000,
    [workspace.workspaceId],
  );

  async function create(): Promise<void> {
    setCreating(true);
    setCreateError(null);
    try {
      await api.createCheckpoint(workspace.workspaceId, {});
      poll.refresh();
      onChanged();
    } catch (err) {
      setCreateError(describeError(err));
    } finally {
      setCreating(false);
    }
  }

  async function restore(cp: Checkpoint): Promise<void> {
    setOutcomes((prev) => ({ ...prev, [cp.checkpointId]: { kind: 'busy', op: 'restore' } }));
    try {
      const result = await api.restoreCheckpoint(workspace.workspaceId, cp.checkpointId);
      setOutcomes((prev) => ({
        ...prev,
        [cp.checkpointId]: { kind: 'restored', ...(result.safetyRef ? { safetyRef: result.safetyRef } : {}) },
      }));
      onChanged();
    } catch (err) {
      setOutcomes((prev) => ({
        ...prev,
        [cp.checkpointId]: { kind: 'error', op: 'restore', message: describeError(err) },
      }));
    }
  }

  async function branch(cp: Checkpoint): Promise<void> {
    setOutcomes((prev) => ({ ...prev, [cp.checkpointId]: { kind: 'busy', op: 'branch' } }));
    try {
      const result = await api.branchCheckpoint(workspace.workspaceId, cp.checkpointId, {});
      setOutcomes((prev) => ({
        ...prev,
        [cp.checkpointId]: { kind: 'branched', workspaceId: result.workspace.workspaceId },
      }));
      onChanged();
    } catch (err) {
      setOutcomes((prev) => ({
        ...prev,
        [cp.checkpointId]: { kind: 'error', op: 'branch', message: describeError(err) },
      }));
    }
  }

  const checkpoints = poll.data ?? [];
  const empty = !poll.loading && !poll.error && checkpoints.length === 0;

  return (
    <div class="checkpoints-panel">
      <div class="checkpoints-head">
        <span class="checkpoints-title">Checkpoints</span>
        <button class="btn btn-sm btn-primary" disabled={creating} onClick={() => void create()}>
          {creating ? 'Capturing…' : 'Checkpoint now'}
        </button>
      </div>
      {createError && <p class="checkpoints-error">Couldn't checkpoint — {createError}</p>}
      {poll.loading && checkpoints.length === 0 && !poll.error && (
        <p class="checkpoints-note">Loading checkpoints…</p>
      )}
      {poll.error && (
        <p class="checkpoints-error">Checkpoints unavailable — {describeError(poll.error)}</p>
      )}
      {empty && (
        <p class="checkpoints-note">
          No checkpoints yet — capture one to snapshot this workspace's git state.
        </p>
      )}
      {checkpoints.map((cp) => {
        const outcome = outcomes[cp.checkpointId];
        const busy = outcome?.kind === 'busy';
        return (
          <div class="checkpoint-row" key={cp.checkpointId}>
            <div class="checkpoint-row-main">
              <span class={`badge tone-${cp.dirty ? 'warn' : 'neutral'}`}>{cp.kind}</span>
              <span class="checkpoint-row-label">{cp.label || shortSha(cp.snapshotSha)}</span>
              <span class="checkpoint-row-meta">{cp.createdAt}</span>
            </div>
            {cp.description && <p class="checkpoint-row-desc">{cp.description}</p>}
            <div class="checkpoint-row-actions">
              <button
                class="btn btn-sm"
                disabled={busy}
                onClick={() => void restore(cp)}
              >
                {busy && outcome?.op === 'restore' ? 'Restoring…' : 'Restore'}
              </button>
              <button
                class="btn btn-sm"
                disabled={busy}
                onClick={() => void branch(cp)}
              >
                {busy && outcome?.op === 'branch' ? 'Branching…' : 'Branch'}
              </button>
            </div>
            {outcome?.kind === 'restored' && (
              <p class="checkpoint-row-note">
                Restored.{' '}
                {outcome.safetyRef
                  ? `Prior state saved at ${outcome.safetyRef} (recoverable).`
                  : 'No safety snapshot was written.'}
              </p>
            )}
            {outcome?.kind === 'branched' && (
              <p class="checkpoint-row-note">
                Branched a new workspace ({shortSha(outcome.workspaceId)}) from this checkpoint.
              </p>
            )}
            {outcome?.kind === 'error' && (
              <p class="checkpoint-row-error">
                Couldn't {outcome.op} — {outcome.message}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
