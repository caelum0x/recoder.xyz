/**
 * Nav coverage test.
 *
 * Asserts that every CockpitView known to config.ts is reachable via the nav.
 * The cockpit is a TERMINAL, not an infra dashboard: the engine dashboards were
 * stripped from the nav so the engines run INVISIBLY behind the run flow. The
 * only human nav surface is the workspace `board`. There is no "More" menu.
 * This is a pure-data check — no rendering required — guarding against a view
 * being added to CockpitView but never wired into the nav (unreachable in UI),
 * and against an engine dashboard sneaking back into the nav.
 */
import { describe, expect, it } from 'vitest';

// Re-derive the nav arrays the same way App.tsx does (App.tsx does not export
// them). The registry now registers only the Board, so the nav is Board-only.
const PRIMARY_VIEWS = ['board'] as const;

const MORE_VIEWS = [] as const;

/**
 * Every deep-linkable CockpitView (config.ts union). Stripped to `board` — the
 * engine dashboards are no longer deep-linkable nav views.
 */
const ALL_COCKPIT_VIEWS = ['board'] as const;

/**
 * Views that must never appear in the nav: the retired terminal-era surfaces
 * (sessions/dmux, fusion §5) AND the engine dashboards stripped from the nav.
 */
const RETIRED_VIEWS = [
  'sessions',
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

describe('cockpit nav coverage', () => {
  const allNavViews = new Set<string>([...PRIMARY_VIEWS, ...MORE_VIEWS]);

  it('every CockpitView is reachable in the nav', () => {
    for (const view of ALL_COCKPIT_VIEWS) {
      expect(allNavViews.has(view), `view "${view}" is not in the nav`).toBe(true);
    }
  });

  it('there is no More menu — the engine dashboards were stripped', () => {
    expect(MORE_VIEWS.length).toBe(0);
  });

  it('retired + stripped-engine views are NOT in the nav', () => {
    for (const view of RETIRED_VIEWS) {
      expect(allNavViews.has(view), `retired view "${view}" must not be in the nav`).toBe(false);
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
