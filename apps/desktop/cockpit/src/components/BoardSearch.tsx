/**
 * BoardSearch — the board's search bar + filter chips + Archived toggle.
 *
 * A single calm control row above the board: a debounced free-text search, three
 * compact filter chips (repo / agent / state) whose options come only from real
 * board records, a truthful "N of M" count when a filter narrows, a Clear
 * affordance, and an Archived toggle that swaps the live board for the archived
 * history view.
 *
 * Presentational + controlled: the parent owns the {@link WorkspaceFilters} and
 * the archived-view flag. The ONLY local state is the search input's text, which
 * is debounced here so the parent's `q` (and therefore the `GET /workspaces?q=`
 * it drives) updates once the operator pauses — not per keystroke. Preact-native.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { useDebounce } from '../lib/useDebounce';
import { hasActiveFilters, type WorkspaceFilters } from '../lib/workspace-filter';
import { stateLabel } from '../lib/workspace-state';
import type { WorkspaceState } from '../types';

export const SEARCH_DEBOUNCE_MS = 250;

interface BoardSearchProps {
  filters: WorkspaceFilters;
  onFiltersChange: (filters: WorkspaceFilters) => void;
  /** Distinct repo options present on the board (from workspaceFacets). */
  repos: string[];
  /** Distinct agent runtime options present on the board. */
  agents: string[];
  /** Distinct states present on the board. */
  states: WorkspaceState[];
  /** Whether the Archived history view is currently shown. */
  archivedActive: boolean;
  onToggleArchived: () => void;
  /** How many workspaces match the active filter (for a truthful "N of M"). */
  resultCount?: number;
  /** Total workspaces loaded (denominator of "N of M"). */
  totalCount?: number;
}

export function BoardSearch({
  filters,
  onFiltersChange,
  repos,
  agents,
  states,
  archivedActive,
  onToggleArchived,
  resultCount,
  totalCount,
}: BoardSearchProps) {
  const [text, setText] = useState(filters.q ?? '');
  const debounced = useDebounce(text, SEARCH_DEBOUNCE_MS);

  // Emit the debounced search text into the parent filters without thrashing:
  // read the current filters/callback through refs so this effect depends only
  // on the settled search value, and skip the emit when nothing actually changed.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const onChangeRef = useRef(onFiltersChange);
  onChangeRef.current = onFiltersChange;
  useEffect(() => {
    const q = debounced.trim();
    const current = (filtersRef.current.q ?? '').trim();
    if (q === current) return;
    onChangeRef.current({ ...filtersRef.current, q: q || undefined });
  }, [debounced]);

  function patch(next: Partial<WorkspaceFilters>): void {
    onFiltersChange({ ...filters, ...next });
  }

  function clearAll(): void {
    setText('');
    onFiltersChange({});
  }

  const active = hasActiveFilters(filters);
  const showCount =
    active &&
    typeof resultCount === 'number' &&
    typeof totalCount === 'number' &&
    resultCount !== totalCount;

  return (
    <div class="board-search" role="search">
      <input
        class="board-search-input"
        type="search"
        placeholder="Search workspaces…"
        aria-label="Search workspaces"
        value={text}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
      />

      <select
        class="board-chip"
        aria-label="Filter by repo"
        value={filters.repo ?? ''}
        onChange={(e) =>
          patch({ repo: (e.target as HTMLSelectElement).value || undefined })
        }
      >
        <option value="">All repos</option>
        {repos.map((repo) => (
          <option key={repo} value={repo}>
            {repo}
          </option>
        ))}
      </select>

      <select
        class="board-chip"
        aria-label="Filter by agent"
        value={filters.agent ?? ''}
        onChange={(e) =>
          patch({ agent: (e.target as HTMLSelectElement).value || undefined })
        }
      >
        <option value="">All agents</option>
        {agents.map((agent) => (
          <option key={agent} value={agent}>
            {agent}
          </option>
        ))}
      </select>

      <select
        class="board-chip"
        aria-label="Filter by state"
        value={filters.state ?? ''}
        onChange={(e) => {
          const raw = (e.target as HTMLSelectElement).value;
          patch({ state: raw ? (raw as WorkspaceState) : undefined });
        }}
      >
        <option value="">All states</option>
        {states.map((state) => (
          <option key={state} value={state}>
            {stateLabel(state)}
          </option>
        ))}
      </select>

      {showCount && (
        <span class="board-search-count" aria-live="polite">
          {resultCount} of {totalCount}
        </span>
      )}

      {active && (
        <button class="btn btn-ghost btn-sm board-search-clear" onClick={clearAll}>
          Clear
        </button>
      )}

      <button
        class={`btn btn-sm board-archived-toggle${archivedActive ? ' board-archived-toggle-on' : ''}`}
        aria-pressed={archivedActive}
        onClick={onToggleArchived}
        title="Browse archived workspaces"
      >
        Archived
      </button>
    </div>
  );
}
