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
 * DmuxPanel, SessionsPanel, WorkspaceCenter, Board) are registered here exactly
 * as-is — their implementations are NOT changed. The registry is purely additive.
 *
 * HEALTH KEYS: the conductor /health/full route returns a ConductorHealth object
 * with top-level keys like `substrate`, `runtimes`, `dmux`, `resources`. These
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
  // ── Primary views ─────────────────────────────────────────────────────────
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
  {
    id: 'sessions',
    title: 'Runs',
    capability: 'tmux-sessions',
    healthKey: 'substrate',
    primary: true,
    load: async () => {
      const m = await import('../components/SessionsPanel');
      return m.SessionsPanel as unknown as PanelComponent;
    },
  },

  // ── More / advanced views ─────────────────────────────────────────────────
  {
    id: 'dmux',
    title: 'dmux',
    capability: 'dmux-operator-console',
    healthKey: 'dmux',
    primary: false,
    load: async () => {
      const m = await import('../components/DmuxPanel');
      return m.DmuxPanel as unknown as PanelComponent;
    },
  },
  {
    id: 'substrates',
    title: 'Agents',
    capability: 'conductor-substrates',
    healthKey: 'substrate',
    primary: false,
    load: async () => {
      const m = await import('../components/SubstratesPanel');
      return m.SubstratesPanel as unknown as PanelComponent;
    },
  },
  {
    id: 'governance',
    title: 'Approvals',
    capability: 'delivery-gate-governance',
    healthKey: null,
    primary: false,
    load: async () => {
      const m = await import('../components/GovernancePanel');
      return m.GovernancePanel as unknown as PanelComponent;
    },
  },
  {
    id: 'policy',
    title: 'Rules',
    capability: 'agent-policy-engine',
    healthKey: null,
    primary: false,
    load: async () => {
      const m = await import('../components/PolicyPanel');
      return m.PolicyPanel as unknown as PanelComponent;
    },
  },
  {
    id: 'brain',
    title: 'Brain',
    capability: 'shared-brain-reuse',
    healthKey: null,
    primary: false,
    load: async () => {
      const m = await import('../components/BrainStatsPanel');
      return m.BrainStatsPanel as unknown as PanelComponent;
    },
  },
  {
    id: 'memory',
    title: 'Memory',
    capability: 'memory-candidate-lifecycle',
    healthKey: null,
    primary: false,
    load: async () => {
      const m = await import('../components/MemoryCandidatesPanel');
      return m.MemoryCandidatesPanel as unknown as PanelComponent;
    },
  },
  {
    id: 'events',
    title: 'Activity',
    capability: 'live-run-events',
    healthKey: null,
    primary: false,
    load: async () => {
      const m = await import('../components/LiveEventsView');
      return m.LiveEventsView as unknown as PanelComponent;
    },
  },
  {
    id: 'connectors',
    title: 'Chat',
    capability: 'chat-channel-connectors',
    healthKey: null,
    primary: false,
    load: async () => {
      const m = await import('../components/ConnectorsPanel');
      return m.ConnectorsPanel as unknown as PanelComponent;
    },
  },
  {
    id: 'mcp',
    title: 'MCP Tools',
    capability: 'mcp-server-registry',
    healthKey: null,
    primary: false,
    load: async () => {
      const m = await import('../components/McpToolsPanel');
      return m.McpToolsPanel as unknown as PanelComponent;
    },
  },
  {
    id: 'gateway',
    title: 'Gateway',
    capability: 'tensorzero-llm-gateway',
    healthKey: null,
    primary: false,
    load: async () => {
      const m = await import('../components/GatewayPanel');
      return m.GatewayPanel as unknown as PanelComponent;
    },
  },
  {
    id: 'agents',
    title: 'Openfang',
    capability: 'openfang-agent-engine',
    healthKey: null,
    primary: false,
    load: async () => {
      const m = await import('../components/AgentsPanel');
      return m.AgentsPanel as unknown as PanelComponent;
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
