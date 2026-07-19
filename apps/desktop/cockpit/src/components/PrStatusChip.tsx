/**
 * PrStatusChip — the inline pull-request + checks status chip shown in the
 * workspace detail after a PR is opened / a merge is under way.
 *
 * Renders the REAL `gh` status (GET /workspaces/:id/pr-status, polled) as one
 * calm chip: "PR #NN · <state> · checks <rollup>" with a worst-wins tone.
 * Degrade-truthful throughout — it NEVER fabricates a PR or a green check:
 *
 *  - available && hasPr  → the projected PR number, state, draft flag, and a
 *    checks rollup (passing / failing / pending, with p/f counts).
 *  - available && !hasPr → a quiet "No PR yet for this branch" (a truthful
 *    absence, not an error).
 *  - !available          → a muted "PR status unavailable — <reason>" (gh could
 *    not be consulted: no gh / no worktree / a gh auth-or-network error). Never
 *    shown as a green/failing check.
 *
 * Presentation only — it drives no action and no gate; the merge button stays
 * governed by the backend state machine in WorkspaceDetail.
 */
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { isLive } from '../lib/workspace-state';
import type { PrCheckSummary, PrStatusView, Workspace } from '../types';

interface PrStatusChipProps {
  workspace: Workspace;
}

/** Poll faster while the workspace is live (checks are moving), slower once done. */
const LIVE_POLL_MS = 8000;
const IDLE_POLL_MS = 30_000;

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/** The worst-wins tone for a checks rollup (calm palette; never alarmist). */
function rollupTone(rollup: PrCheckSummary['rollup']): string {
  switch (rollup) {
    case 'passing':
      return 'good';
    case 'failing':
      return 'bad';
    case 'pending':
      return 'progress';
    default:
      return 'neutral';
  }
}

/** Short, truthful checks copy: "checks passing (3)", "checks failing (1/4)", … */
function checksLabel(checks: PrCheckSummary): string {
  if (checks.rollup === 'none' || checks.total === 0) return 'no checks';
  if (checks.rollup === 'passing') return `checks passing (${checks.passed})`;
  if (checks.rollup === 'failing') return `checks failing (${checks.failed}/${checks.total})`;
  return `checks pending (${checks.pending}/${checks.total})`;
}

/** The tone for the PR's own state (merged=good, closed=neutral, open=active). */
function stateTone(state: PrStatusView['state']): string {
  if (state === 'merged') return 'good';
  if (state === 'closed') return 'neutral';
  return 'active';
}

export function PrStatusChip({ workspace }: PrStatusChipProps) {
  const live = isLive(workspace.state);
  const poll = usePoll(
    () => api.prStatus(workspace.workspaceId),
    live ? LIVE_POLL_MS : IDLE_POLL_MS,
    [workspace.workspaceId, live],
  );

  // First load, nothing yet — stay quiet rather than flash a misleading state.
  if (poll.loading && !poll.data && !poll.error) {
    return <div class="pr-status-chip pr-status-checking">Checking PR status…</div>;
  }

  // A transport/route failure is surfaced truthfully, not swallowed. (The
  // backend degrades gh-absence to a 200 `available:false`, so reaching here
  // means the edge itself failed — worth showing.)
  if (poll.error) {
    return (
      <div class="pr-status-chip pr-status-unavailable" title={describeError(poll.error)}>
        PR status unavailable — {describeError(poll.error)}
      </div>
    );
  }

  const status = poll.data;
  if (!status) return null;

  if (!status.available) {
    return (
      <div class="pr-status-chip pr-status-unavailable" title={status.reason}>
        PR status unavailable{status.reason ? ` — ${status.reason}` : ''}
      </div>
    );
  }

  if (!status.hasPr) {
    return <div class="pr-status-chip pr-status-none">No PR yet for this branch</div>;
  }

  const checks = status.checks;
  return (
    <div class="pr-status-chip pr-status-has">
      <span class={`badge tone-${stateTone(status.state)}`}>
        {status.number ? `PR #${status.number}` : 'PR'}
        {status.draft ? ' · draft' : ''}
        {status.state && status.state !== 'open' ? ` · ${status.state}` : ''}
      </span>
      {checks && (
        <span class={`badge tone-${rollupTone(checks.rollup)}`} title={`${checks.passed} passed · ${checks.failed} failed · ${checks.pending} pending`}>
          {checksLabel(checks)}
        </span>
      )}
      {status.mergeable === 'conflicting' && (
        <span class="badge tone-warn" title="GitHub reports this branch has conflicts with the base.">
          conflicts
        </span>
      )}
      {status.url && (
        <a class="pr-status-link" href={status.url} target="_blank" rel="noreferrer">
          view
        </a>
      )}
    </div>
  );
}
