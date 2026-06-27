/**
 * WorkspaceDetail — the right-hand detail panel for a selected workspace.
 *
 * Wires the live RunEvent log (GET /events, ~2s), the reviewable diff
 * (GET /diff, on demand), and the state-gated review actions:
 *   PR      → POST /workspaces/:id/pr
 *   Merge   → POST /workspaces/:id/merge
 *   Archive → POST /workspaces/:id/archive
 *
 * Every action button is enabled only when the backend state machine allows it
 * (workspace-state helpers). Errors from the backend are shown, never hidden.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { EventLog } from './EventLog';
import { DiffView } from './DiffView';
import { SessionTerminal } from './SessionTerminal';
import type { ConductorSession } from '../types';
import {
  canArchive,
  canMerge,
  canOpenPr,
  canViewDiff,
  isLive,
  stateLabel,
  stateTone,
} from '../lib/workspace-state';
import type { Workspace } from '../types';

interface WorkspaceDetailProps {
  workspace: Workspace;
  onClose: () => void;
  onChanged: () => void;
}

type Tab = 'output' | 'diff' | 'terminal';

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/**
 * Project the workspace onto the ConductorSession shape the SessionTerminal
 * drives. The conductor names workspace tmux sessions `recoder-<workspaceId>`
 * and exposes the live name via workspace.sessionName; the terminal attaches to
 * that real tmux session (local pty) or polls /sessions/:id/output (HTTP).
 */
function workspaceSession(workspace: Workspace): ConductorSession | null {
  if (!workspace.sessionName) return null;
  return {
    sessionId: workspace.workspaceId,
    tmuxName: workspace.sessionName,
    worktreePath: workspace.worktreePath || '',
    branch: workspace.branch,
    repoPath: workspace.worktreePath || '',
    command: '',
    createdAt: workspace.createdAt,
  };
}

export function WorkspaceDetail({ workspace, onClose, onChanged }: WorkspaceDetailProps) {
  const [tab, setTab] = useState<Tab>('output');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const live = isLive(workspace.state);
  const events = usePoll(
    () => api.listEvents(workspace.workspaceId),
    live ? 2000 : 15_000,
    [workspace.workspaceId],
  );
  const diffShown = tab === 'diff' && canViewDiff(workspace.state);
  const diff = usePoll(
    () => (diffShown ? api.diff(workspace.workspaceId) : Promise.resolve(null)),
    live ? 4000 : 30_000,
    [workspace.workspaceId, diffShown],
  );

  const prMeta = (workspace.metadata?.pr as { url?: string } | undefined) || undefined;
  const session = workspaceSession(workspace);

  async function runAction(name: string, fn: () => Promise<unknown>, note?: string) {
    setActionError(null);
    setActionNote(null);
    setBusy(name);
    try {
      await fn();
      if (note) setActionNote(note);
      onChanged();
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  function openPr() {
    const title = `Conductor: ${workspace.branch}`;
    void runAction('pr', () => api.openPr(workspace.workspaceId, { title }), 'PR opened.');
  }

  function merge() {
    void runAction('merge', () => api.merge(workspace.workspaceId, { strategy: 'squash' }), 'Merged.');
  }

  function archive() {
    void runAction('archive', () => api.archive(workspace.workspaceId), 'Archived.');
  }

  return (
    <aside class="detail-panel">
      <div class="detail-header">
        <div>
          <div class="detail-title-row">
            <span class={`badge tone-${stateTone(workspace.state)}`}>{stateLabel(workspace.state)}</span>
            <h2 class="detail-branch">{workspace.branch}</h2>
          </div>
          <div class="detail-sub">
            <span>{workspace.runtimeId}</span>
            <span>·</span>
            <span>{workspace.substrate}</span>
            <span>·</span>
            <span title={workspace.workspaceId}>{workspace.workspaceId.slice(0, 14)}…</span>
          </div>
        </div>
        <button class="icon-btn" onClick={onClose} aria-label="Close detail">×</button>
      </div>

      <div class="detail-meta">
        <div><span class="meta-k">Task</span><span class="meta-v">{workspace.taskId}</span></div>
        <div><span class="meta-k">Base</span><span class="meta-v">{workspace.baseRef || '—'}</span></div>
        <div><span class="meta-k">Worktree</span><span class="meta-v" title={workspace.worktreePath}>{workspace.worktreePath || '—'}</span></div>
        <div><span class="meta-k">Session</span><span class="meta-v">{workspace.sessionName || '—'}</span></div>
      </div>

      <div class="detail-actions">
        <button class="btn btn-sm" disabled={!canOpenPr(workspace.state) || busy !== null} onClick={openPr}>
          {busy === 'pr' ? 'Opening…' : 'Open PR'}
        </button>
        <button class="btn btn-sm" disabled={!canMerge(workspace.state) || busy !== null} onClick={merge}>
          {busy === 'merge' ? 'Merging…' : 'Merge'}
        </button>
        <button class="btn btn-sm btn-danger" disabled={!canArchive(workspace.state) || busy !== null} onClick={archive}>
          {busy === 'archive' ? 'Archiving…' : 'Archive'}
        </button>
      </div>

      {prMeta?.url && (
        <a class="pr-link" href={prMeta.url} target="_blank" rel="noreferrer">PR: {prMeta.url}</a>
      )}
      {actionNote && <p class="action-note">{actionNote}</p>}
      {actionError && <p class="action-error">{actionError}</p>}

      <div class="detail-tabs">
        <button class={tab === 'output' ? 'tab tab-active' : 'tab'} onClick={() => setTab('output')}>Output</button>
        <button
          class={tab === 'diff' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('diff')}
          disabled={!canViewDiff(workspace.state)}
          title={canViewDiff(workspace.state) ? 'Diff' : 'Diff available once the agent has produced work'}
        >
          Diff
        </button>
        <button
          class={tab === 'terminal' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('terminal')}
          disabled={!session}
          title={session ? 'Live terminal for this workspace tmux session' : 'No tmux session attached to this workspace yet'}
        >
          Terminal
        </button>
      </div>

      <div class="detail-body">
        {tab === 'output' ? (
          <EventLog events={events.data} error={events.error} loading={events.loading} />
        ) : tab === 'diff' ? (
          <DiffView diff={diff.data} error={diff.error} loading={diff.loading} />
        ) : session ? (
          <SessionTerminal session={session} />
        ) : (
          <div class="log-empty">No tmux session attached to this workspace.</div>
        )}
      </div>
    </aside>
  );
}
