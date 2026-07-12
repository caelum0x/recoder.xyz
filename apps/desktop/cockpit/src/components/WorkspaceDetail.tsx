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
import { useEffect, useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { DiffView } from './DiffView';
import { SessionTerminal } from './SessionTerminal';
import { RecoderTerminal } from './RecoderTerminal';
import { ConversationView } from './ConversationView';
import {
  deliveryGateFromError,
  deliveryGateReason,
} from '../lib/conductor-health-state';
import type { DeliveryGateDetail } from '../types';

/** True when running inside the Recoder desktop shell (preload PTY bridge present). */
function hasDesktopTerminal(): boolean {
  const w = window as unknown as { recoderDesktop?: { spawnTerminal?: unknown } };
  return Boolean(w.recoderDesktop && typeof w.recoderDesktop.spawnTerminal === 'function');
}
import { diffFileList, type DiffFile } from '../lib/diff-files';
import { workspaceGoal } from '../lib/workspace-goal';
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

/**
 * The outcome of a PR/merge/archive action in this detail panel.
 * `gated` carries the structured delivery-gate verdict when the backend's
 * 409 approval gate fires — shown inline so the operator sees why their
 * action was blocked right where they triggered it, without having to
 * navigate to the separate Governance panel.
 */
type ActionOutcome =
  | { kind: 'idle' }
  | { kind: 'ok'; note: string }
  | { kind: 'gated'; action: 'pr' | 'merge'; detail: DeliveryGateDetail; reason: string }
  | { kind: 'error'; message: string };

/**
 * Inline gate verdict rendered when a PR/merge is blocked by the conductor's
 * delivery approval gate. Shows the truthful backend 409 data — the gate
 * action tier, the pending approval ID (if any), and whether the workspace
 * was transitioned to awaiting_approval — without fabricating any fields.
 */
function InlineGateVerdict({
  action,
  detail,
  reason,
}: {
  action: 'pr' | 'merge';
  detail: DeliveryGateDetail;
  reason: string;
}) {
  return (
    <div class="detail-gate-verdict">
      <div class="detail-gate-head">
        <span class="badge tone-warn">awaiting approval</span>
        <span class="detail-gate-action">
          {action === 'pr' ? 'Open PR' : 'Merge'} blocked by delivery gate
        </span>
      </div>
      <dl class="detail-gate-grid">
        <div>
          <dt class="meta-k">Action tier</dt>
          <dd class="meta-v">{detail.action}</dd>
        </div>
        <div>
          <dt class="meta-k">Approval record</dt>
          <dd class="meta-v">{detail.approvalId || 'none — an approving Approval is required'}</dd>
        </div>
        {detail.transitioned !== undefined && (
          <div>
            <dt class="meta-k">Workspace transitioned</dt>
            <dd class="meta-v">
              {detail.transitioned ? 'yes → awaiting_approval' : 'no (already in that state)'}
            </dd>
          </div>
        )}
      </dl>
      <p class="detail-gate-reason">{reason}</p>
      <p class="detail-gate-hint">
        This action was NOT performed. Create an approving Approval record (at the required tier)
        and try again — or view the Approvals panel for full governance detail.
      </p>
    </div>
  );
}

type Tab = 'output' | 'diff' | 'terminal';

/**
 * Within the Terminal tab, the SAME conductor session is shown either as a
 * friendly, chat-like conversation ('chat') or the full real xterm terminal
 * ('terminal'). One engine, two skins — never a second source of truth. Defaults
 * to 'chat' for approachability (the "not scary" vision principle); power users
 * flip to the full terminal. Persisted per-workspace in this UI state.
 */
type SurfaceMode = 'chat' | 'terminal';

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
  const [actionOutcome, setActionOutcome] = useState<ActionOutcome>({ kind: 'idle' });
  const [busy, setBusy] = useState<string | null>(null);
  // When the embedded PTY reports it has no real TTY (node-pty missing in this
  // build), fall back to the truthful HTTP /sessions surface instead of a dead
  // terminal. Gated per-workspace so switching workspaces re-evaluates.
  const [ptyUnavailable, setPtyUnavailable] = useState(false);
  // The Terminal-tab surface skin: friendly conversation vs the full real
  // terminal. Defaults to 'chat' so terminal-averse operators land on the calm
  // surface; persisted per-workspace (reset below when the workspace changes).
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('chat');

  // Re-evaluate per workspace: a fresh workspace may have a live tmux session
  // even if a prior one's PTY was unavailable, and each workspace starts on the
  // approachable chat skin rather than inheriting a prior terminal flip.
  useEffect(() => {
    setPtyUnavailable(false);
    setSurfaceMode('chat');
  }, [workspace.workspaceId]);

  const live = isLive(workspace.state);
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

  async function runAction(
    name: string,
    fn: () => Promise<unknown>,
    note: string,
    gatedAction?: 'pr' | 'merge',
  ) {
    setActionOutcome({ kind: 'idle' });
    setBusy(name);
    try {
      await fn();
      setActionOutcome({ kind: 'ok', note });
      onChanged();
    } catch (err) {
      // When a PR/merge is blocked by the delivery gate (409 awaiting_approval),
      // show the structured gate verdict inline — right where the operator
      // triggered the action — so they see exactly what's blocking without
      // having to navigate to the Governance panel.
      const gate = gatedAction ? deliveryGateFromError(err) : null;
      if (gate) {
        setActionOutcome({
          kind: 'gated',
          action: gatedAction as 'pr' | 'merge',
          detail: gate,
          reason: deliveryGateReason(err),
        });
        onChanged(); // refresh workspace state — backend may have transitioned to awaiting_approval
      } else {
        setActionOutcome({ kind: 'error', message: describeError(err) });
      }
    } finally {
      setBusy(null);
    }
  }

  function openPr() {
    const title = `Conductor: ${workspace.branch}`;
    void runAction('pr', () => api.openPr(workspace.workspaceId, { title }), 'PR opened.', 'pr');
  }

  function merge() {
    void runAction(
      'merge',
      () => api.merge(workspace.workspaceId, { strategy: 'squash' }),
      'Merged.',
      'merge',
    );
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
            <h2 class="detail-branch" title={workspaceGoal(workspace)}>{workspaceGoal(workspace)}</h2>
          </div>
          <div class="detail-sub">
            {workspaceGoal(workspace) !== workspace.branch && (
              <>
                <span title={workspace.branch}>{workspace.branch}</span>
                <span>·</span>
              </>
            )}
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
      {actionOutcome.kind === 'ok' && (
        <p class="action-note">{actionOutcome.note}</p>
      )}
      {actionOutcome.kind === 'gated' && (
        <InlineGateVerdict
          action={actionOutcome.action}
          detail={actionOutcome.detail}
          reason={actionOutcome.reason}
        />
      )}
      {actionOutcome.kind === 'error' && (
        <p class="action-error">{actionOutcome.message}</p>
      )}

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
          /* Changes = the clean changed-files tree (like the reference). The
             agent's talk lives in the center conversation and the raw terminal
             behind the Terminal tab — this panel is no longer a duplicate log. */
          <div class="detail-changes">
            <FileList diff={diff.data} loading={diff.loading} error={diff.error} />
          </div>
        ) : tab === 'diff' ? (
          <DiffView diff={diff.data} error={diff.error} loading={diff.loading} />
        ) : session ? (
          <div class="detail-terminal">
            {/* Surface affordance: the friendly conversation is the calm DEFAULT;
                the full real terminal is revealed ON DEMAND behind a single
                gentle "Show terminal" / "Hide terminal" toggle (collapsed by
                default — the "not scary" vision principle). One engine, two skins
                over the SAME tmux session / RunEvents — never a second source of
                truth. Flipping it mounts/unmounts the real xterm so its PTY is
                spawned only when shown and killed when hidden. */}
            <div class="detail-terminal-head">
              <span class="detail-terminal-skin" aria-hidden="true">
                {surfaceMode === 'chat' ? 'Chat' : 'Terminal'}
              </span>
              <span class="detail-terminal-branch" title={workspace.branch}>{workspace.branch}</span>
              <span class="detail-terminal-spacer" />
              <button
                type="button"
                class="detail-terminal-toggle"
                onClick={() => setSurfaceMode((m) => (m === 'chat' ? 'terminal' : 'chat'))}
                aria-pressed={surfaceMode === 'terminal'}
                title={
                  surfaceMode === 'chat'
                    ? 'Reveal the full real terminal for this workspace'
                    : 'Collapse back to the friendly conversation'
                }
              >
                {surfaceMode === 'chat' ? 'Show terminal' : 'Hide terminal'}
              </button>
            </div>
            {surfaceMode === 'chat' ? (
              // Friendly skin: the SAME conductor session shown as a calm, chat-
              // like conversation. Reads the same RunEvent stream the terminal
              // observes — never a second source of truth, never a fake TTY.
              <ConversationView workspace={workspace} />
            ) : hasDesktopTerminal() && !ptyUnavailable ? (
              // Real embedded terminal: attach a PTY (Electron main) to THIS
              // workspace's tmux session via the same pinned tmux binary the
              // conductor drives — the native CLI experience, in Recoder. Mounted
              // ONLY in terminal mode so its cleanup (PTY kill) runs when the
              // operator flips back to Chat — never hidden with a live PTY. If the
              // main process reports no real PTY, onPtyUnavailable flips us to the
              // HTTP /sessions surface so we never show a dead terminal.
              <RecoderTerminal
                command={tmuxBin || 'tmux'}
                args={['attach', '-t', session.tmuxName]}
                cwd={session.worktreePath || undefined}
                env={tmuxBin ? { CONDUCTOR_TMUX_BIN: tmuxBin } : undefined}
                sessionLabel={workspace.branch}
                onPtyUnavailable={() => setPtyUnavailable(true)}
              />
            ) : (
              <SessionTerminal session={session} tmuxBin={tmuxBin} />
            )}
          </div>
        ) : (
          <div class="log-empty">No tmux session attached to this workspace.</div>
        )}
      </div>
    </aside>
  );
}
