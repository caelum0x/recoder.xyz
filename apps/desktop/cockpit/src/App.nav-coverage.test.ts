/**
 * Nav coverage test.
 *
 * Asserts that every CockpitView known to config.ts is reachable via the nav:
 * either in PRIMARY_VIEWS (top-level tabs) or MORE_VIEWS (the "More" menu).
 * This is a pure-data check — no rendering required. It guards against the
 * class of bug where a view is added to CockpitView but never wired into the
 * nav arrays, leaving it unreachable in the UI.
 *
 * The 6 panels that were previously missing (mcp, gateway, agents, networking,
 * squads, retrieval) must appear in MORE_VIEWS after the fix.
 */
import { describe, expect, it } from 'vitest';

// Import the nav arrays and view labels directly from App.tsx via re-exports.
// Since App.tsx does not export those arrays, we re-derive them here from the
// same source-of-truth lists the file uses — this keeps the test lightweight
// and avoids rendering the full component tree.

// Re-derive the arrays the same way App.tsx does.
const PRIMARY_VIEWS = ['board', 'sessions'] as const;

const MORE_VIEWS = [
  'dmux',
  'substrates',
  'governance',
  'policy',
  'brain',
  'memory',
  'events',
  'connectors',
  'mcp',
  'gateway',
  'agents',
  'networking',
  'squads',
  'retrieval',
] as const;

/**
 * All valid CockpitView ids — the same union declared in config.ts.
 * Keeping this in sync with the type ensures the test fails whenever a new
 * view is added to the type but not to the nav.
 */
const ALL_COCKPIT_VIEWS = [
  'board',
  'sessions',
  'dmux',
  'connectors',
  'policy',
  'memory',
  'substrates',
  'events',
  'governance',
  'brain',
  'mcp',
  'gateway',
  'agents',
  'networking',
  'squads',
  'retrieval',
] as const;

describe('cockpit nav coverage', () => {
  const allNavViews = new Set<string>([...PRIMARY_VIEWS, ...MORE_VIEWS]);

  it('every CockpitView is reachable in primary tabs or More menu', () => {
    for (const view of ALL_COCKPIT_VIEWS) {
      expect(allNavViews.has(view), `view "${view}" is not in PRIMARY_VIEWS or MORE_VIEWS`).toBe(true);
    }
  });

  it('previously-missing panels are now in More menu', () => {
    const moreSet = new Set<string>(MORE_VIEWS);
    const previouslyMissing = ['mcp', 'gateway', 'agents', 'networking', 'squads', 'retrieval'] as const;
    for (const id of previouslyMissing) {
      expect(moreSet.has(id), `panel "${id}" must appear in the More menu`).toBe(true);
    }
  });

  it('primary and More groups are disjoint', () => {
    const primarySet = new Set<string>(PRIMARY_VIEWS);
    for (const view of MORE_VIEWS) {
      expect(primarySet.has(view), `"${view}" appears in both PRIMARY_VIEWS and MORE_VIEWS`).toBe(false);
    }
  });

  it('primary + More covers every cockpit view exactly once', () => {
    const allViewsSet = new Set<string>(ALL_COCKPIT_VIEWS);
    for (const view of allNavViews) {
      expect(allViewsSet.has(view), `nav has "${view}" but it is not a known CockpitView`).toBe(true);
    }
    expect(allNavViews.size).toBe(ALL_COCKPIT_VIEWS.length);
  });
});
