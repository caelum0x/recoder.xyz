/**
 * WorkspaceSidebar — the Conductor-style LEFT pane.
 *
 * Renders the live workspace list grouped by repo (groupWorkspacesByRepo over
 * the real GET /workspaces payload). Each row shows a TRUTHFUL state badge
 * (running / setting up / ready / awaiting review / merge-conflict …) and a
 * +N/-N diff stat parsed only from the backend's delivery summary. A
 * "+ New workspace" affordance sits in the header.
 *
 * No mock rows: an empty backend yields an explicit empty state, and a
 * lock-collision failure is surfaced distinctly (the moat working).
 */
import { groupWorkspacesByRepo } from '../lib/workspace-groups';
import { lockConflict, stateLabel, stateTone } from '../lib/workspace-state';
import { workspaceDiffStat } from '../lib/workspace-diffstat';
import type { Workspace } from '../types';

interface WorkspaceSidebarProps {
  workspaces: Workspace[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNewWorkspace: () => void;
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
  selected,
  onSelect,
}: {
  workspace: Workspace;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const collision = lockConflict(workspace);
  return (
    <button
      class={`ws-row ${selected ? 'ws-row-active' : ''} ${collision ? 'ws-row-collision' : ''}`}
      onClick={() => onSelect(workspace.workspaceId)}
      title={workspace.branch}
    >
      <span class="ws-row-main">
        <span class="ws-row-branch">{workspace.branch}</span>
        <DiffStat workspace={workspace} />
      </span>
      <span class="ws-row-meta">
        <span class={`badge tone-${stateTone(workspace.state)}`}>
          {collision ? 'merge-conflict' : stateLabel(workspace.state)}
        </span>
        <span class="ws-row-runtime">{workspace.runtimeId}</span>
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
}: WorkspaceSidebarProps) {
  const groups = groupWorkspacesByRepo(workspaces);

  return (
    <aside class="ws-sidebar">
      <div class="ws-sidebar-head">
        <span class="ws-sidebar-title">Workspaces</span>
        <button class="ws-new-btn" onClick={onNewWorkspace} title="Create a new workspace">
          + New workspace
        </button>
      </div>

      <div class="ws-sidebar-body">
        {loading && workspaces.length === 0 ? (
          <div class="ws-sidebar-empty">Loading workspaces…</div>
        ) : groups.length === 0 ? (
          <div class="ws-sidebar-empty">
            <p>No workspaces yet.</p>
            <button class="btn btn-primary btn-sm" onClick={onNewWorkspace}>
              Create your first workspace
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <div class="ws-group" key={group.projectId}>
              <div class="ws-group-head">
                <span class="ws-group-label" title={group.projectId}>{group.label}</span>
                <span class="ws-group-count">{group.workspaces.length}</span>
              </div>
              <div class="ws-group-rows">
                {group.workspaces.map((ws) => (
                  <WorkspaceRow
                    key={ws.workspaceId}
                    workspace={ws}
                    selected={ws.workspaceId === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
