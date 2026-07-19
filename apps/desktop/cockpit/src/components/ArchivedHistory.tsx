/**
 * ArchivedHistory — the board's "Archived" history view. Renders the archived
 * workspaces (most-recent-first) fetched from GET /workspaces/archived. Read-only
 * by construction: it lists closed/merged/cancelled/archived work so the operator
 * can find and re-open a past run without cluttering the live board.
 *
 * Truthful + degrade-safe: an empty history shows a plain "No archived workspaces"
 * line (never fabricated rows); a fetch error surfaces the real message. Data
 * flows in as props — the parent owns the poll, keeping this deterministically
 * testable. Preact-native.
 */
import { workspaceGoal } from '../lib/workspace-goal';
import { workspaceCodename } from '../lib/workspace-codename';
import { stateLabel, stateTone } from '../lib/workspace-state';
import type { Workspace } from '../types';

interface ArchivedHistoryProps {
  workspaces: Workspace[];
  loading: boolean;
  error: Error | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function archivedTime(w: Workspace): string {
  const iso = w.archivedAt ?? w.updatedAt;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  return new Date(then).toLocaleString();
}

/** Most-recent-first by archivedAt (falling back to updatedAt). Pure, immutable. */
function sortByRecency(workspaces: readonly Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => {
    const at = a.archivedAt ?? a.updatedAt;
    const bt = b.archivedAt ?? b.updatedAt;
    return bt.localeCompare(at);
  });
}

export function ArchivedHistory({
  workspaces,
  loading,
  error,
  selectedId,
  onSelect,
}: ArchivedHistoryProps) {
  const rows = sortByRecency(workspaces);

  return (
    <div class="archived-history">
      <div class="archived-history-head">
        <span class="archived-history-title">Archived</span>
        <span class="archived-history-count">{rows.length}</span>
      </div>

      {error && (
        <div class="archived-history-error">Couldn't load archived history: {error.message}</div>
      )}

      {!error && loading && rows.length === 0 && (
        <div class="archived-history-empty">Loading archived history…</div>
      )}

      {!error && !loading && rows.length === 0 && (
        <div class="archived-history-empty">No archived workspaces.</div>
      )}

      {rows.length > 0 && (
        <div class="archived-history-rows">
          {rows.map((w) => {
            const goal = workspaceGoal(w);
            const codename = workspaceCodename(w.workspaceId);
            return (
              <button
                class={`archived-row${selectedId === w.workspaceId ? ' archived-row-selected' : ''}`}
                key={w.workspaceId}
                onClick={() => onSelect(w.workspaceId)}
                title={w.branch}
              >
                <div class="archived-row-main">
                  <span class="archived-row-goal">{goal}</span>
                  {goal !== codename && <span class="archived-row-codename">{codename}</span>}
                </div>
                <div class="archived-row-meta">
                  <span class={`badge tone-${stateTone(w.state)}`}>{stateLabel(w.state)}</span>
                  <span class="archived-row-repo">{w.projectId}</span>
                  <span class="archived-row-agent">{w.runtimeId}</span>
                  <span class="archived-row-time">{archivedTime(w)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
