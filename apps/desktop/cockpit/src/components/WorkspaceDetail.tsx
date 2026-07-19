/**
 * WorkspaceDetail — the right-hand detail panel for a selected workspace.
 *
 * Conductor-style layout: a green "PR #NN · Ready to merge" header with a Merge
 * button (shown only when the backend state truly allows merging), the
 * "Changes / Diff / Run / Chat" tabs over a per-file change list (path + "+N" +
 * status icon), the full reviewable diff, and the calm chat surface. The REAL
 * terminal is no longer embedded here (wave-desktop fusion §5): the
 * "Open in terminal" action asks the wave host to open the workspace's tmux
 * session as a terminal block instead.
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
import { ApprovalActions } from './ApprovalActions';
import { CheckpointsPanel } from './CheckpointsPanel';
import { DiffView } from './DiffView';
import { FileTree } from './FileTree';
import { RunPanel } from './RunPanel';
import { ConversationView } from './ConversationView';
import { OpenInTerminalButton } from './OpenInTerminalButton';
import { PrStatusChip } from './PrStatusChip';
import {
  deliveryGateFromError,
  deliveryGateReason,
} from '../lib/conductor-health-state';
import type { DeliveryGateDetail } from '../types';
import { diffFileList, type DiffFile } from '../lib/diff-files';
import { workspaceGoal } from '../lib/workspace-goal';
import { workspaceCodename } from '../lib/workspace-codename';
import type { WorkspaceDiff } from '../types';
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
        This action was NOT performed. An approving Approval record (at the required tier) must
        exist before the conductor will deliver — create one and try again.
      </p>
    </div>
  );
}

/**
 * The narrow, cockpit-side view of the PALPlan annotation the workspace create
 * path persists onto `metadata.palPlan` (backend pal-plan.ts). Provenance
 * DISPLAY only — it never drives an action or gate (D1: risk is advisory).
 */
export type PalPlanMeta = {
  runtimeId?: string;
  substrate?: string;
  reviewerRuntimeId?: string | null;
  risk?: string;
  browserVerification?: boolean;
  skills?: string[];
  mcpTools?: string[];
  generatedAt?: string;
};

/**
 * Boundary-narrow `metadata.palPlan` into PalPlanMeta. The metadata record is
 * untrusted (backend-persisted JSON) — every field is typeof-checked and string
 * arrays are filtered, so a malformed annotation degrades to `null` (rendered as
 * the truthful "not recorded" line) instead of crashing the detail panel.
 */
export function palPlanFromMetadata(
  metadata: Record<string, unknown> | undefined,
): PalPlanMeta | null {
  const raw = metadata?.palPlan;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  const strings = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
  return {
    runtimeId: str(rec.runtimeId),
    substrate: str(rec.substrate),
    reviewerRuntimeId: rec.reviewerRuntimeId === null ? null : str(rec.reviewerRuntimeId),
    risk: str(rec.risk),
    browserVerification:
      typeof rec.browserVerification === 'boolean' ? rec.browserVerification : undefined,
    skills: strings(rec.skills),
    mcpTools: strings(rec.mcpTools),
    generatedAt: str(rec.generatedAt),
  };
}

/**
 * Compact inline PAL plan provenance — the persisted `metadata.palPlan`
 * annotation (recommended runtime team, substrate, D1 advisory risk tier)
 * shown in the detail header area. Reuses the InlineGateVerdict visual
 * language (labeled meta grid) but is purely descriptive: it never gates
 * or drives any action. `plan === null` renders the truthful missing line.
 */
function PlanProvenance({ plan }: { plan: PalPlanMeta | null }) {
  if (!plan) {
    return <p class="detail-plan-missing detail-gate-reason">PAL plan: not recorded</p>;
  }
  const team =
    plan.runtimeId && plan.reviewerRuntimeId
      ? `${plan.runtimeId} → ${plan.reviewerRuntimeId}`
      : plan.runtimeId;
  return (
    <div class="detail-plan detail-sub" title={plan.generatedAt ? `Plan generated ${plan.generatedAt}` : undefined}>
      <span class="meta-k">Plan</span>
      {team && <span class="meta-v">{team}</span>}
      {plan.substrate && (
        <>
          <span>·</span>
          <span class="meta-v">{plan.substrate}</span>
        </>
      )}
      {plan.risk && (
        <>
          <span>·</span>
          {/* Raw tier string, badge tone mapped for glanceability only. */}
          <span class={`badge tone-${plan.risk === 'high' ? 'bad' : plan.risk === 'medium' ? 'warn' : 'neutral'}`}>
            risk: {plan.risk}
          </span>
        </>
      )}
      {plan.browserVerification !== undefined && (
        <>
          <span>·</span>
          <span>browser verification: {plan.browserVerification ? 'yes' : 'no'}</span>
        </>
      )}
      {(plan.skills || plan.mcpTools) && (
        <>
          <span>·</span>
          <span>
            skills: {plan.skills?.length ?? 0} · tools: {plan.mcpTools?.length ?? 0}
          </span>
        </>
      )}
    </div>
  );
}

type Tab = 'files' | 'output' | 'diff' | 'run' | 'chat';

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
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

  // The full worktree file tree (All files tab) — fetched only when that tab is
  // open. Polls a touch slower than the diff; the file set changes less often.
  const wantsTree = tab === 'files';
  const tree = usePoll(
    () => (wantsTree ? api.tree(workspace.workspaceId) : Promise.resolve(null)),
    live ? 5000 : 30_000,
    [workspace.workspaceId, wantsTree],
  );

  const prMeta = (workspace.metadata?.pr as { url?: string } | undefined) || undefined;
  // Persisted PALPlan provenance (create-path annotation) — display only.
  const palPlan = palPlanFromMetadata(workspace.metadata);
  const pr = prNumber(prMeta?.url);
  const readyToMerge = canMerge(workspace.state);
  // The live PR/checks chip is meaningful once a PR exists (recorded on the
  // workspace) or the workspace is in a review/merge/merged state — i.e. after
  // an Open PR / Merge. We only mount the poller then, so we never probe `gh`
  // for a workspace that could not possibly have a PR yet.
  const showPrStatus =
    Boolean(prMeta?.url) ||
    workspace.state === 'awaiting_review' ||
    workspace.state === 'merging' ||
    workspace.state === 'merged';

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
            {/* Friendly codename as the stable handle; the raw id + git branch
                live in the tooltip so the UI never shows a bare ws_<uuid>. */}
            <span title={`${workspace.workspaceId} · ${workspace.branch}`}>
              {workspaceCodename(workspace.workspaceId)}
            </span>
            <span>·</span>
            <span>{workspace.runtimeId}</span>
            <span>·</span>
            <span>{workspace.substrate}</span>
          </div>
          {/* PAL plan provenance — the annotation persisted at create time
              (INTEGRATION-PLAN §a.4 step 4). Descriptive only; when absent or
              malformed the truthful "not recorded" line is shown, never hidden. */}
          <PlanProvenance plan={palPlan} />
        </div>
        <button class="icon-btn" onClick={onClose} aria-label="Close detail">×</button>
      </div>

      <div class="detail-actions">
        <button class="btn btn-sm" disabled={!canOpenPr(workspace.state) || busy !== null} onClick={openPr}>
          {busy === 'pr' ? 'Opening…' : 'Open PR'}
        </button>
        {/* Merge lives in the ready-to-merge banner above (same canMerge gate) —
            not duplicated here. When not mergeable there is nothing to show. */}
        <button class="btn btn-sm btn-danger" disabled={!canArchive(workspace.state) || busy !== null} onClick={archive}>
          {busy === 'archive' ? 'Archiving…' : 'Archive'}
        </button>
      </div>

      {/* Inline approve/reject for the awaiting_approval state: the REAL pending
          Approval records for this workspace's task, decided via the existing
          approvals API. Only rendered when the backend state genuinely is
          awaiting_approval — never speculatively. */}
      {workspace.state === 'awaiting_approval' && (
        <ApprovalActions workspace={workspace} onChanged={onChanged} />
      )}

      {workspace.state !== 'archived' && (
        <CheckpointsPanel workspace={workspace} onChanged={onChanged} />
      )}

      {/* Live PR + checks status (GET /workspaces/:id/pr-status via gh). Mounted
          only once a PR could exist (after Open PR / Merge) so we never probe gh
          speculatively. Degrade-truthful: unavailable / no-PR is stated, never
          faked. Presentation only — the Merge button stays state-gated above. */}
      {showPrStatus && <PrStatusChip workspace={workspace} />}
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
        <button
          class={tab === 'files' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('files')}
          title="Every file in this workspace's worktree"
        >
          All files
        </button>
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
          class={tab === 'run' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('run')}
          title="Run this workspace's app (its dev server) and watch it live"
        >
          Run
        </button>
        <button
          class={tab === 'chat' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('chat')}
          title="A calm chat view over this workspace's live session"
        >
          Chat
        </button>
        {/* The REAL terminal lives in the wave host now (fusion §5): this asks
            the shell to open the workspace tmux session as a terminal block.
            Disabled with a truthful hint outside the desktop app. */}
        <OpenInTerminalButton workspace={workspace} />
      </div>

      <div class="detail-body">
        {tab === 'files' ? (
          /* All files = the full worktree tree, with changed files marked. */
          <FileTree
            files={tree.data?.files || []}
            changed={tree.data?.changed}
            truncated={tree.data?.truncated}
            loading={tree.loading && !tree.data}
          />
        ) : tab === 'output' ? (
          /* Changes = the clean changed-files tree (like the reference). The
             agent's talk lives in the center conversation and the raw terminal
             behind the Terminal tab — this panel is no longer a duplicate log. */
          <div class="detail-changes">
            <FileList diff={diff.data} loading={diff.loading} error={diff.error} />
          </div>
        ) : tab === 'diff' ? (
          <DiffView diff={diff.data} error={diff.error} loading={diff.loading} />
        ) : tab === 'run' ? (
          <RunPanel workspace={workspace} />
        ) : (
          // Chat: the calm conversation skin over this workspace's real RunEvent
          // stream (one engine, no second source of truth). The full terminal is
          // no longer embedded — the "Open in terminal" action above hands the
          // session to the wave host instead.
          <ConversationView workspace={workspace} />
        )}
      </div>
    </aside>
  );
}
