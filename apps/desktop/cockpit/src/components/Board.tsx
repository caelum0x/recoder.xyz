/**
 * Board — the conductor.build-style columned board. Renders live workspace cards
 * grouped into lifecycle columns. Data comes only from GET /workspaces (polled
 * ~2s by the parent). No mock cards: an empty backend yields empty columns.
 */
import { BOARD_COLUMNS, lockConflict, stateLabel, stateTone } from '../lib/workspace-state';
import { workspaceGoal } from '../lib/workspace-goal';
import { workspaceCodename } from '../lib/workspace-codename';
import type { Workspace } from '../types';

interface BoardProps {
  workspaces: Workspace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** workspaceId → the prompt a running agent is blocked on (needs_input). */
  waits?: Record<string, string>;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function Board({ workspaces, selectedId, onSelect, waits }: BoardProps) {
  return (
    <div class="board">
      {BOARD_COLUMNS.map((col) => {
        const cards = workspaces.filter((w) => col.states.includes(w.state));
        return (
          <div class="board-col" key={col.id}>
            <div class="board-col-header">
              <span class="board-col-title">{col.title}</span>
              <span class="board-col-count">{cards.length}</span>
            </div>
            <div class="board-col-cards">
              {cards.length === 0 ? (
                <div class="board-col-empty">—</div>
              ) : (
                cards.map((w) => {
                  // A failed workspace whose failure is a prevented write-lock
                  // collision is rendered distinctly so the operator can see the
                  // moat working: the launch was refused, not silently lost.
                  const collision = lockConflict(w);
                  const waitPrompt = waits?.[w.workspaceId];
                  return (
                    <button
                      class={`card ${selectedId === w.workspaceId ? 'card-selected' : ''} ${collision ? 'card-collision' : ''} ${waitPrompt ? 'card-needs-input' : ''}`}
                      key={w.workspaceId}
                      onClick={() => onSelect(w.workspaceId)}
                    >
                      <div class="card-top">
                        <span class={`badge tone-${stateTone(w.state)}`}>{stateLabel(w.state)}</span>
                        {waitPrompt && (
                          <span class="badge badge-needs-input" title={waitPrompt}>
                            ⏳ needs you
                          </span>
                        )}
                        {collision && (
                          <span class="badge badge-lock" title={collision.message}>
                            🔒 collision
                          </span>
                        )}
                        <span class="card-runtime">{w.runtimeId}</span>
                      </div>
                      <div class="card-goal" title={workspaceGoal(w)}>{workspaceGoal(w)}</div>
                      {/* Secondary codename handle — only when the primary label is
                          a real goal (otherwise it already IS the codename). Raw
                          branch stays in the tooltip, never on screen. */}
                      {workspaceGoal(w) !== workspaceCodename(w.workspaceId) && (
                        <div class="card-branch" title={w.branch}>{workspaceCodename(w.workspaceId)}</div>
                      )}
                      {waitPrompt && (
                        <div class="card-needs-input-msg" title={waitPrompt}>{waitPrompt}</div>
                      )}
                      {collision && (
                        <div class="card-collision-msg" title={collision.message}>
                          {collision.message}
                        </div>
                      )}
                      <div class="card-foot">
                        <span class="card-substrate">{w.substrate}</span>
                        <span class="card-time">{timeAgo(w.updatedAt)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
