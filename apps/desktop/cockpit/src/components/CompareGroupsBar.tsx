/**
 * CompareGroupsBar — the board's entry point into multi-agent compare (F3).
 *
 * Derives parallel-run groups (≥2 siblings sharing a taskGroup) straight from
 * the workspace list the board already polls (no extra fetch), and renders one
 * calm "Compare N agents" chip per group. Clicking a chip opens the side-by-side
 * ComparePanel for that group. Renders NOTHING when there are no parallel runs —
 * a solo board never shows a compare affordance it can't back with real data.
 */
import { parallelRunGroups, type ParallelRunGroup } from '../lib/compare-groups';
import type { Workspace } from '../types';

interface CompareGroupsBarProps {
  workspaces: Workspace[];
  /** Open the compare panel for a detected group. */
  onCompare: (group: ParallelRunGroup) => void;
}

export function CompareGroupsBar({ workspaces, onCompare }: CompareGroupsBarProps) {
  const groups = parallelRunGroups(workspaces);
  if (groups.length === 0) return null;

  return (
    <div class="compare-bar" role="region" aria-label="Parallel agent runs">
      <span class="compare-bar-label">Parallel runs</span>
      {groups.map((group) => (
        <button
          key={group.taskGroup}
          class="compare-bar-chip"
          title={`${group.goal} — ${group.agents.join(', ')}`}
          onClick={() => onCompare(group)}
        >
          <span class="compare-bar-chip-count">Compare {group.count} agents</span>
          <span class="compare-bar-chip-goal">{group.goal}</span>
        </button>
      ))}
    </div>
  );
}
