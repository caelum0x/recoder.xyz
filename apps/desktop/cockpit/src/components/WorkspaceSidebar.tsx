/**
 * WorkspaceSidebar — the Conductor-style LEFT pane.
 *
 * Renders the live workspace list grouped by repo (groupWorkspacesByRepo over
 * the real GET /workspaces payload). Each row carries a colored status dot, the
 * branch name, a "+N -N" diff badge (parsed only from the backend's delivery
 * summary), and a truthful state pill (Running / Ready to review / Merge
 * conflicts / Merged …). Each repo group ends with a "New workspace" affordance
 * and the rail is footed by "Add repository", matching the reference desktop UI.
 *
 * No mock rows: an empty backend yields an explicit empty state, and a
 * lock-collision failure is surfaced distinctly (the moat working) — its pill
 * reads "Merge conflicts".
 */
import { groupWorkspacesByRepo } from '../lib/workspace-groups';
import { lockConflict, statePill, stateTone } from '../lib/workspace-state';
import { workspaceDiffStat } from '../lib/workspace-diffstat';
import { workspaceGoal } from '../lib/workspace-goal';
import type { Workspace } from '../types';

interface WorkspaceSidebarProps {
  workspaces: Workspace[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNewWorkspace: () => void;
  /** workspaceId → prompt a running agent is blocked on (needs_input). */
  waits?: Record<string, string>;
  /** Collapsed to a thin rail (the workspace list is hidden). */
  collapsed?: boolean;
  /** Toggle the collapsed state (shown as a chevron in the header/rail). */
  onToggleCollapse?: () => void;
}

function DiffStat({ workspace }: { workspace: Workspace }) {
  const stat = workspaceDiffStat(workspace);
  if (!stat) return null;
  return (
    <span class="ws-diffstat" title={`${stat.changedFiles} file(s) changed`}>
      {stat.additions !== null && <span class="ws-diffstat-add">+{stat.additions}</span>}
      {stat.deletions !== null && <span class="ws-diffstat-del">-{stat.deletions}</span>}
    </span>
  );
}

function WorkspaceRow({
  workspace,
  ordinal,
  selected,
  onSelect,
  waitPrompt,
}: {
  workspace: Workspace;
  ordinal?: number;
  selected: boolean;
  onSelect: (id: string) => void;
  waitPrompt?: string;
}) {
  const collision = lockConflict(workspace);
  const tone = waitPrompt ? 'warn' : collision ? 'warn' : stateTone(workspace.state);
  const pill = waitPrompt ? 'Needs you' : statePill(workspace.state, Boolean(collision));
  return (
    <button
      class={`ws-row ${selected ? 'ws-row-active' : ''} ${collision ? 'ws-row-collision' : ''} ${waitPrompt ? 'ws-row-needs-input' : ''}`}
      onClick={() => onSelect(workspace.workspaceId)}
      title={waitPrompt ? `${waitPrompt} — ${workspaceGoal(workspace)}` : `${workspaceGoal(workspace)} (${workspace.branch})`}
    >
      <span class={`ws-row-dot dot-${tone}`} aria-hidden="true" />
      <span class="ws-row-body">
        <span class="ws-row-main">
          <span class="ws-row-branch">
            {ordinal != null && <span class="ws-row-ordinal">{ordinal}.</span>}
            {workspaceGoal(workspace)}
          </span>
          <DiffStat workspace={workspace} />
        </span>
        <span class="ws-row-meta">
          <span class={`ws-row-pill pill-${tone}`}>{pill}</span>
          <span class="ws-row-runtime">{workspace.runtimeId}</span>
        </span>
      </span>
    </button>
  );
}

export function WorkspaceSidebar({
  workspaces,
  selectedId,
  loading,
  onSelect,
  onNewWorkspace,
  waits,
  collapsed,
  onToggleCollapse,
}: WorkspaceSidebarProps) {
  const groups = groupWorkspacesByRepo(workspaces);

  // Collapsed: a thin rail with a single chevron to reopen — keeps the center
  // conversation full-width (terminal-plain) without losing the way back.
  if (collapsed) {
    return (
      <aside class="ws-sidebar ws-sidebar-collapsed">
        <button
          class="ws-sidebar-toggle"
          onClick={onToggleCollapse}
          title="Show workspaces"
          aria-label="Show workspaces"
        >
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside class="ws-sidebar">
      <div class="ws-sidebar-head">
        <span class="ws-sidebar-home">
          <span class="ws-sidebar-home-icon" aria-hidden="true" />
          Home
        </span>
        {onToggleCollapse && (
          <button
            class="ws-sidebar-toggle"
            onClick={onToggleCollapse}
            title="Hide workspaces"
            aria-label="Hide workspaces"
          >
            ‹
          </button>
        )}
      </div>

      <div class="ws-sidebar-body">
        {loading && workspaces.length === 0 ? (
          <div class="ws-sidebar-empty">Loading workspaces…</div>
        ) : groups.length === 0 ? (
          <div class="ws-sidebar-empty">
            {/* Informational only — the single create CTA lives in the center
                pane's empty state (App.tsx); duplicating the button reads as
                two different actions. "Add repository" in the footer stays. */}
            <p>No workspaces yet.</p>
          </div>
        ) : (
          <>
            <div class="ws-projects-head">Projects</div>
            {groups.map((group) => (
            <div class="ws-group" key={group.projectId}>
              <div class="ws-group-head" title={group.projectId}>
                <span class="ws-group-label">{group.label}</span>
              </div>
              <div class="ws-group-rows">
                {group.workspaces.map((ws, i) => (
                  <WorkspaceRow
                    key={ws.workspaceId}
                    workspace={ws}
                    ordinal={i + 1}
                    selected={ws.workspaceId === selectedId}
                    onSelect={onSelect}
                    waitPrompt={waits?.[ws.workspaceId]}
                  />
                ))}
                <button class="ws-new-row" onClick={onNewWorkspace}>
                  <span class="ws-new-row-plus" aria-hidden="true">+</span>
                  New workspace
                </button>
              </div>
            </div>
            ))}
          </>
        )}
      </div>

      <div class="ws-sidebar-foot">
        <button class="ws-add-repo" onClick={onNewWorkspace} title="Add a repository">
          <span class="ws-add-repo-plus" aria-hidden="true">+</span>
          Add repository
        </button>
      </div>
    </aside>
  );
}
