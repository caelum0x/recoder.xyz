/**
 * WorkspaceDetail — the right-hand detail panel for a selected workspace.
 *
 * Conductor-style layout: a green "PR #NN · Ready to merge" header with a Merge
 * button (shown only when the backend state truly allows merging), the
 * "Changes / Diff / Terminal" tabs over a per-file change list (path + "+N" +
 * status icon), the full reviewable diff, and the live Terminal panel.
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
import { diffFileList, type DiffFile } from '../lib/diff-files';
import type { ConductorSession, WorkspaceDiff } from '../types';
import {
  canArchive,
  canMerge,
  canOpenPr,
  canViewDiff,
  isLive,
  statePill,
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

/** Extract the PR number from a GitHub PR url like `…/pull/42`, if present. */
function prNumber(url: string | undefined): string | null {
  if (!url) return null;
  const m = /\/pull\/(\d+)/.exec(url);
  return m ? m[1] : null;
}

/** The Conductor file-list row: path + "+N" + a status icon. */
function FileRow({ file }: { file: DiffFile }) {
  return (
    <div class="detail-file" title={file.path}>
      <span class={`detail-file-icon detail-file-${file.status}`} aria-hidden="true">
        {file.status === 'added' ? 'A' : 'M'}
      </span>
      <span class="detail-file-path">{file.path}</span>
      {file.changes !== null && <span class="detail-file-changes ws-diffstat-add">+{file.changes}</span>}
    </div>
  );
}

function FileList({
  diff,
  loading,
  error,
}: {
  diff: WorkspaceDiff | null;
  loading: boolean;
  error: Error | null;
}) {
  if (loading && !diff) return <div class="log-empty">Loading changes…</div>;
  if (error) return <div class="log-error">Changes unavailable: {error.message}</div>;
  const files = diffFileList(diff);
  if (files.length === 0) {
    return <div class="log-empty">No changed files yet — this updates once the agent produces work.</div>;
  }
  return (
    <div class="detail-files">
      {files.map((f) => (
        <FileRow key={f.path} file={f} />
      ))}
    </div>
  );
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
  // The file list (Changes tab) and the full patch (Diff tab) share the same
  // GET /diff payload — fetch it whenever the backend has reviewable work and
  // we're on a tab that shows it, so the Changes tab can render the file list.
  const wantsDiff = (tab === 'diff' || tab === 'output') && canViewDiff(workspace.state);
  const diff = usePoll(
    () => (wantsDiff ? api.diff(workspace.workspaceId) : Promise.resolve(null)),
    live ? 4000 : 30_000,
    [workspace.workspaceId, wantsDiff],
  );

  const prMeta = (workspace.metadata?.pr as { url?: string } | undefined) || undefined;
  const pr = prNumber(prMeta?.url);
  const readyToMerge = canMerge(workspace.state);
  const session = workspaceSession(workspace);
  // Resolve the real tmux binary the conductor reports (GET /health → tmuxBin),
  // so the right-pane Terminal's local-pty `tmux attach` uses the same pinned /
  // absolute binary the Sessions view does — not a bare `tmux` that may miss a
  // pinned build. Optional + degrade-safe: when health is unavailable or omits
  // it, SessionTerminal falls back to `tmux`.
  const health = usePoll(() => api.health(), 15_000);
  const tmuxBin = health.data?.tmuxBin;

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
      {/* Green PR / merge banner — shown only when the backend state genuinely
          allows merging (canMerge), so we never imply a mergeable PR falsely. */}
      {readyToMerge && (
        <div class="detail-pr-banner">
          <span class="detail-pr-banner-main">
            <span class="detail-pr-check" aria-hidden="true">✓</span>
            {pr ? `PR #${pr}` : 'PR'} · Ready to merge
          </span>
          <button class="btn btn-primary btn-sm" disabled={busy !== null} onClick={merge}>
            {busy === 'merge' ? 'Merging…' : 'Merge'}
          </button>
        </div>
      )}

      <div class="detail-header">
        <div>
          <div class="detail-title-row">
            <span class={`ws-row-pill pill-${stateTone(workspace.state)}`}>{statePill(workspace.state)}</span>
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
        <button class={tab === 'output' ? 'tab tab-active' : 'tab'} onClick={() => setTab('output')}>Changes</button>
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
          <div class="detail-changes">
            <FileList diff={diff.data} loading={diff.loading} error={diff.error} />
            <div class="detail-output-log">
              <div class="detail-output-label">Run · Output</div>
              <EventLog events={events.data} error={events.error} loading={events.loading} />
            </div>
          </div>
        ) : tab === 'diff' ? (
          <DiffView diff={diff.data} error={diff.error} loading={diff.loading} />
        ) : session ? (
          <div class="detail-terminal">
            <div class="detail-terminal-head">
              <span class="detail-terminal-tab detail-terminal-tab-active">Run</span>
              <span class="detail-terminal-tab">Terminal</span>
              <span class="detail-terminal-branch" title={workspace.branch}>{workspace.branch}</span>
            </div>
            <SessionTerminal session={session} tmuxBin={tmuxBin} />
          </div>
        ) : (
          <div class="log-empty">No tmux session attached to this workspace.</div>
        )}
      </div>
    </aside>
  );
}
