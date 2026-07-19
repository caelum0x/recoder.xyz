/**
 * useBoardQuery — the board's DEBOUNCED, server-authoritative search/filter feed.
 *
 * When the operator has an active filter (search text or a repo/agent/state
 * chip), this polls `GET /workspaces?q=&repo=&agent=&state=&archived=` (the real
 * conductor query edge) and returns the narrowed list. When no filter is active
 * it fetches NOTHING (resolves `null`) so the always-on unfiltered board poll
 * stays the single source and we never issue a redundant identical request.
 *
 * Debounce: the filters are serialized to a STABLE string key and debounced, so
 * a keystroke does not fire a request per character — the query lands once the
 * operator pauses. The parent still filters the already-loaded list client-side
 * for instant feedback while this authoritative result is in flight.
 */
import { useMemo } from 'preact/hooks';
import { api } from './api';
import { usePoll, type PollState } from './usePoll';
import { useDebounce } from './useDebounce';
import { hasActiveFilters, type WorkspaceFilters } from './workspace-filter';
import type { Workspace } from '../types';

export const BOARD_QUERY_DEBOUNCE_MS = 250;

/** Stable serialization of the narrowing filters (drops empty/undefined fields). */
function filterKey(filters: WorkspaceFilters): string {
  return JSON.stringify({
    q: filters.q?.trim() || undefined,
    repo: filters.repo?.trim() || undefined,
    agent: filters.agent?.trim() || undefined,
    state: filters.state,
    archived: filters.archived,
  });
}

export function useBoardQuery(
  filters: WorkspaceFilters,
  intervalMs: number,
): PollState<Workspace[] | null> {
  const key = filterKey(filters);
  const debouncedKey = useDebounce(key, BOARD_QUERY_DEBOUNCE_MS);
  const debounced = useMemo(() => JSON.parse(debouncedKey) as WorkspaceFilters, [debouncedKey]);
  const active = hasActiveFilters(debounced);

  return usePoll<Workspace[] | null>(
    () =>
      hasActiveFilters(debounced)
        ? api.queryWorkspaces({
            q: debounced.q,
            repo: debounced.repo,
            agent: debounced.agent,
            state: debounced.state,
            archived: debounced.archived,
          })
        : Promise.resolve(null),
    intervalMs,
    [debouncedKey, active],
  );
}
