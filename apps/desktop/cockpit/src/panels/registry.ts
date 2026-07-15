/**
 * Panel registry — the single source of truth for cockpit surfaces.
 *
 * Every panel that can appear in the cockpit nav is declared here as a
 * PanelEntry. The entries drive:
 *   - the nav (which tabs/items are rendered, in what order)
 *   - lazy loading (each panel is imported on first render, never upfront)
 *   - health integration (optional `healthKey` maps to a key in the
 *     /health/full response shape so callers can show per-panel readiness)
 *
 * MIGRATION NOTE: existing panel components (PolicyPanel, MemoryCandidatesPanel,
 * GovernancePanel, SubstratesPanel, ConnectorsPanel, BrainStatsPanel, EventLog,
 * WorkspaceCenter, Board) are registered here exactly as-is — their
 * implementations are NOT changed. The registry is purely additive.
 * RETIRED (wave-desktop fusion §5): the 'sessions' (SessionsPanel) and 'dmux'
 * (DmuxPanel) terminal-era surfaces — the wave terminal now owns interactive
 * terminals; the cockpit keeps the HTTP output/chat views only.
 *
 * HEALTH KEYS: the conductor /health/full route returns a ConductorHealth object
 * with top-level keys like `substrate`, `runtimes`, `resources`. These
 * are the valid `healthKey` values. Panels without a direct health key are left
 * as null — the useHealth hook treats null as always-available so it never
 * blocks a panel from loading.
 *
 * HOW TO ADD A NEW PANEL:
 *   1. Create the component in src/components/MyPanel.tsx.
 *   2. Add a PanelEntry here with a new id, title, capability, and load().
 *   3. Add the id to CockpitView in src/lib/config.ts.
 *   4. The nav in App.tsx will pick it up automatically.
 */
import type { ComponentType } from 'preact';

/** The type of component a panel entry resolves to. */
export type PanelComponent = ComponentType<Record<string, never>>;

/**
 * A single panel registration.
 *
 * - `id`:         stable identifier, matches a CockpitView string — never changes
 *                 (deep links, persisted state, and the navigate event depend on it)
 * - `title`:      the user-facing label shown in the nav
 * - `capability`: plain-English name of the backend capability this panel surfaces
 * - `healthKey`:  optional key into /health/full (ConductorHealth) for per-panel
 *                 readiness. null = always-available (no backend key to check)
 * - `load`:       dynamic import returning the named component — enables lazy loading
 *                 so panels that are never opened cost nothing at startup
 * - `primary`:    when true, the panel appears in the top-level nav; when false it
 *                 is tucked into the "More" menu. Mirrors the PRIMARY_VIEWS split in App.
 */
export interface PanelEntry {
  readonly id: string;
  readonly title: string;
  readonly capability: string;
  readonly healthKey: string | null;
  readonly load: () => Promise<PanelComponent>;
  readonly primary: boolean;
}

/**
 * The ordered panel registry.
 *
 * Ordering is intentional: primary panels come first in declaration order, and
 * within each group the ordering matches the original VIEW_LABELS / MORE_VIEWS
 * declaration in App.tsx so that nav reordering only requires a reorder here.
 *
 * The `board` panel is included for completeness but App.tsx retains its special
 * 3-pane rendering logic — the registry entry lets the health hook and future
 * tooling query it like any other panel.
 */
export const PANEL_REGISTRY: readonly PanelEntry[] = [
  // The cockpit is a TERMINAL, not an infra dashboard: the only human nav
  // surface is the workspace Board (parallel agent runs). The polyglot engines
  // (memory, retrieval, governance, gateway, MCP, networking, squads, brain,
  // openfang…) are BACKEND power the AGENTS use — they run INVISIBLY behind the
  // run flow and are deliberately NOT surfaced as nav tabs. Their component
  // files still exist (reversible); they are simply not registered here.
  {
    id: 'board',
    title: 'Board',
    capability: 'workspace-board',
    healthKey: 'substrate',
    primary: true,
    load: async () => {
      const m = await import('../components/Board');
      return m.Board as unknown as PanelComponent;
    },
  },
];

/** Look up a panel entry by its stable id. Returns undefined when not found. */
export function getPanelById(id: string): PanelEntry | undefined {
  return PANEL_REGISTRY.find((p) => p.id === id);
}

/** All primary (top-level nav) panel ids, in registry order. */
export const PRIMARY_PANEL_IDS: readonly string[] = PANEL_REGISTRY.filter((p) => p.primary).map(
  (p) => p.id,
);

/** All secondary (More menu) panel ids, in registry order. */
export const MORE_PANEL_IDS: readonly string[] = PANEL_REGISTRY.filter((p) => !p.primary).map(
  (p) => p.id,
);
