/**
 * workspace-facets — derive the distinct filter-chip options (repos, agents,
 * states) from the CURRENTLY-LOADED workspace list. The board's filter chips
 * offer only values that actually exist on the board, so a user never picks a
 * repo/agent/state that would match nothing. Pure + preact-safe (no hooks): a
 * component calls `workspaceFacets(list)` in render.
 *
 * Truthfulness: options are drawn ONLY from real records — never a hardcoded or
 * fabricated set. An empty board yields empty option lists.
 */
import type { Workspace, WorkspaceState } from '../types';

export interface WorkspaceFacets {
  /** Distinct repo identities (projectId), sorted, present on the board. */
  readonly repos: string[];
  /** Distinct agent runtime ids (e.g. `claude`, `codex`), sorted. */
  readonly agents: string[];
  /** Distinct workspace states present on the board, in canonical order. */
  readonly states: WorkspaceState[];
}

/** Canonical lifecycle order so the state chip lists states predictably. */
const STATE_ORDER: readonly WorkspaceState[] = [
  'created',
  'setting_up',
  'ready',
  'running',
  'awaiting_approval',
  'awaiting_review',
  'changes_requested',
  'merging',
  'merged',
  'failed',
  'cancelled',
  'archived',
];

function distinctSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((v) => v && v.trim().length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function workspaceFacets(workspaces: readonly Workspace[]): WorkspaceFacets {
  const repos = distinctSorted(workspaces.map((w) => w.projectId));
  const agents = distinctSorted(workspaces.map((w) => w.runtimeId));
  const present = new Set(workspaces.map((w) => w.state));
  const states = STATE_ORDER.filter((s) => present.has(s));
  return { repos, agents, states };
}
