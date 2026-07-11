/**
 * App — the cockpit shell. Polls GET /workspaces (~2s) for the board, owns
 * selection + the new-workspace modal, and renders the health strip. When the
 * backend is unreachable it shows a truthful "backend unreachable" banner and
 * never fabricates workspaces.
 *
 * Navigation is driven by the panel registry (src/panels/registry.ts). Each
 * non-board panel is lazy-loaded on first activation via registry entry `load()`.
 * The board view retains its special 3-pane layout — it is registered in the
 * registry for metadata/health purposes but rendered inline here.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { api, BackendUnreachableError, UnauthorizedError } from './lib/api';
import { usePoll } from './lib/usePoll';
import { useWorkspaceWaits } from './lib/useWorkspaceWaits';
import {
  readConfig,
  configWasInjected,
  readInitialView,
  hasDesktopSignOut,
  runDesktopSignOut,
  runDesktopRefresh,
  COCKPIT_NAVIGATE_EVENT,
  type CockpitView,
} from './lib/config';
import {
  planLabel,
  isCapabilityGated,
  capabilityUnlockLabel,
  parallelAgentUsageLabel,
} from './lib/plan-state';
// Board-view and sessions-view components remain eagerly imported — they are
// always needed at startup (board is the default view) or receive shell-level
// props (sessions needs tmuxBin from the health poll).
import { Board } from './components/Board';
import { HealthStrip } from './components/HealthStrip';
import { NewWorkspaceForm } from './components/NewWorkspaceForm';
import { WorkspaceDetail } from './components/WorkspaceDetail';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { WorkspaceCenter } from './components/WorkspaceCenter';
import { SessionsPanel } from './components/SessionsPanel';
import { SignIn } from './components/SignIn';
// Panel components eagerly imported for registration into the panel cache.
// These allow PanelLoader to render instantly (no async import step) for all
// panels that are already bundled at startup. When a panel is split into its
// own async chunk, remove its import here and the load() in the registry will
// take over transparently — no other code needs to change.
import { DmuxPanel } from './components/DmuxPanel';
import { ConnectorsPanel } from './components/ConnectorsPanel';
import { PolicyPanel } from './components/PolicyPanel';
import { MemoryCandidatesPanel } from './components/MemoryCandidatesPanel';
import { SubstratesPanel } from './components/SubstratesPanel';
import { LiveEventsView } from './components/LiveEventsView';
import { GovernancePanel } from './components/GovernancePanel';
import { BrainStatsPanel } from './components/BrainStatsPanel';
// Registry drives the nav and lazy-loads all non-board panels.
import {
  PANEL_REGISTRY,
  PRIMARY_PANEL_IDS,
  MORE_PANEL_IDS,
  getPanelById,
  type PanelComponent,
} from './panels/registry';

const WORKSPACE_POLL_MS = 2000;
const HEALTH_POLL_MS = 15_000;

/**
 * Derive the nav label for a given view id from the registry.
 * Falls back to the id itself when not found (should not happen in practice).
 */
function viewLabel(id: string): string {
  return getPanelById(id)?.title ?? id;
}

/**
 * Cache of panel components keyed by panel id.
 *
 * This lives outside the component so a given component is resolved at most
 * once per cockpit session, regardless of how many times the user switches views.
 *
 * Pre-seeded with every panel component that is eagerly bundled with App.tsx
 * so that PanelLoader renders them instantly (no async import step). When a
 * panel is split into its own async chunk, remove its entry here and the
 * registry's load() will populate the cache on first activation.
 */
const panelCache = new Map<string, PanelComponent>([
  ['dmux', DmuxPanel as unknown as PanelComponent],
  ['connectors', ConnectorsPanel as unknown as PanelComponent],
  ['policy', PolicyPanel as unknown as PanelComponent],
  ['memory', MemoryCandidatesPanel as unknown as PanelComponent],
  ['substrates', SubstratesPanel as unknown as PanelComponent],
  ['events', LiveEventsView as unknown as PanelComponent],
  ['governance', GovernancePanel as unknown as PanelComponent],
  ['brain', BrainStatsPanel as unknown as PanelComponent],
]);

/**
 * PanelLoader — renders a panel by id using the registry's load() function.
 *
 * On first render it triggers the dynamic import, stores the resolved component
 * in the module-level cache, and renders a loading fallback until ready. On
 * subsequent renders the cached component is used immediately (no re-import).
 * This is a simple dynamic-import-with-state pattern that matches what the
 * codebase already uses — no Preact lazy() or Suspense required.
 */
function PanelLoader({ panelId }: { panelId: string }) {
  const [Component, setComponent] = useState<PanelComponent | null>(
    () => panelCache.get(panelId) ?? null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (panelCache.has(panelId)) {
      setComponent(panelCache.get(panelId) as PanelComponent);
      return;
    }
    const entry = getPanelById(panelId);
    if (!entry) {
      setLoadError(`Unknown panel: ${panelId}`);
      return;
    }
    let cancelled = false;
    entry
      .load()
      .then((C: PanelComponent) => {
        if (cancelled) return;
        panelCache.set(panelId, C);
        setComponent(C);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [panelId]);

  if (loadError) {
    return (
      <div class="banner banner-error">
        <strong>Panel failed to load:</strong> {loadError}
      </div>
    );
  }
  if (!Component) {
    return <div class="board-loading">Loading…</div>;
  }
  // Cast to satisfy Preact's JSX — the registry contract guarantees it renders
  // without required props (all existing panels take no external props).
  const C = Component as ComponentType<object>;
  return <C />;
}

// Derive PRIMARY_VIEWS and MORE_VIEWS from the registry so the nav is
// automatically up-to-date whenever entries are added. These are typed as
// readonly string[] (not CockpitView[]) because new panels may be added before
// a CockpitView union update — the nav still works.
const PRIMARY_VIEWS: readonly string[] = PRIMARY_PANEL_IDS;
const MORE_VIEWS: readonly string[] = MORE_PANEL_IDS;

// Build the set of all registered view ids for the navigate-event guard.
const ALL_VIEW_IDS: ReadonlySet<string> = new Set(PANEL_REGISTRY.map((p) => p.id));

export function App() {
  const config = readConfig();
  // Whether the current plan gates the remote substrate (Pro+). Drives a subtle,
  // non-nagging hint near the create control — never a hard block (the server
  // still enforces the real entitlement). Defaults to gated when plan is absent.
  const remoteSubstrateGated = isCapabilityGated(config.identity?.plan, 'remote_substrate');
  // Open on the deep-linked view when a launcher/menu requested one (e.g. the
  // desktop "Open dmux Console" item), otherwise default to the board.
  const [view, setView] = useState<CockpitView>(() => readInitialView() || 'board');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // True once we have observed a working authenticated session this run. Used to
  // frame a later 401 as "your session expired" rather than a cold sign-in.
  const [wasAuthed, setWasAuthed] = useState(false);
  // Silent-refresh bookkeeping: we attempt ONE transparent device-token refresh
  // the first time we hit a 401, before surfacing the SignIn panel.
  const [refreshAttempted, setRefreshAttempted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // When the user picks an advanced view, jump to it and close the More menu.
  function goTo(target: CockpitView) {
    setView(target);
    setMoreOpen(false);
  }

  const board = usePoll(() => api.listWorkspaces(), WORKSPACE_POLL_MS);
  const health = usePoll(() => api.health(), HEALTH_POLL_MS);
  const tmuxBin = health.data?.tmuxBin;
  const workspaces = board.data || [];
  // Which running agents are blocked on operator input (needs_input), so the
  // Board can badge "needs you" the same way the recoder-herd terminal does.
  const waits = useWorkspaceWaits(workspaces);
  // Agents actively holding a run slot (provisioning / running / merging) — drives
  // a calm live "N agents" indicator. PRODUCT DECISION (docs/PLAN-MODEL.md · PRD
  // FR-2): local desktop agents are UNLIMITED on every tier (your Mac, your keys),
  // so this is a status count, never a cap and never a block.
  const activeAgents = workspaces.filter(
    (w) => w.state === 'setting_up' || w.state === 'running' || w.state === 'merging',
  ).length;

  const selected = useMemo(
    () => workspaces.find((w) => w.workspaceId === selectedId) || null,
    [workspaces, selectedId],
  );

  // Let the desktop shell switch the cockpit view live (without a reload) when a
  // menu/launcher action fires — e.g. "Open dmux Console" dispatches this event
  // with detail.view = 'dmux'. This is how the dmux surface is reachable from a
  // single menu click even when the cockpit is already open.
  // The guard now uses ALL_VIEW_IDS from the registry so new panels are
  // automatically navigable without touching this handler.
  useEffect(() => {
    function onNavigate(e: Event) {
      const detail = (e as CustomEvent<{ view?: string }>).detail;
      const target = detail?.view;
      if (typeof target === 'string' && ALL_VIEW_IDS.has(target)) {
        setView(target as CockpitView);
        setMoreOpen(false);
      }
    }
    if (typeof window === 'undefined') return;
    window.addEventListener(COCKPIT_NAVIGATE_EVENT, onNavigate as EventListener);
    return () => window.removeEventListener(COCKPIT_NAVIGATE_EVENT, onNavigate as EventListener);
  }, []);

  const unreachable = board.error instanceof BackendUnreachableError;
  // The backend is reachable but rejected us as unauthenticated (401/403).
  // Show the real sign-in panel, distinct from "backend unreachable".
  const unauthenticated = board.error instanceof UnauthorizedError;

  // Track that we have a working authenticated session so a later 401 reads as
  // "session expired" instead of a first-time sign-in.
  useEffect(() => {
    if (board.data && !board.error) setWasAuthed(true);
  }, [board.data, board.error]);

  // On the FIRST 401 this run, attempt one transparent device-token refresh
  // (stored refresh token → fresh access token) before showing SignIn. On
  // success we re-poll silently; on failure we fall through to the SignIn panel.
  // Never fabricates a session — runDesktopRefresh returns not-ok on any failure.
  useEffect(() => {
    if (!unauthenticated || refreshAttempted || refreshing) return;
    let cancelled = false;
    setRefreshing(true);
    runDesktopRefresh()
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.token) {
          board.refresh();
          health.refresh();
        }
      })
      .finally(() => {
        if (cancelled) return;
        setRefreshAttempted(true);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unauthenticated, refreshAttempted, refreshing]);

  // The SignIn panel shows only after a refresh attempt has resolved (so a
  // recoverable session refreshes silently with no UI flash).
  const showSignIn = unauthenticated && refreshAttempted && !refreshing;

  function onAuthenticated() {
    // Re-resolve config picks up the fresh token; force every poll to refetch.
    setRefreshAttempted(false);
    board.refresh();
    health.refresh();
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      // Best-effort clear of the stored token + in-memory session; always returns
      // the cockpit to a signed-out state (the next poll 401s into SignIn).
      await runDesktopSignOut();
      setWasAuthed(false);
      setRefreshAttempted(true); // don't auto-refresh right after an explicit sign-out
      board.refresh();
      health.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  async function reconcile() {
    setReconciling(true);
    try {
      await api.reconcile();
      board.refresh();
    } catch {
      // surfaced via board.error on next poll; reconcile is best-effort
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div class="cockpit">
      <header class="topbar">
        {/* macOS window chrome — non-interactive traffic lights anchor the
            frameless Electron window and match the reference desktop UI. */}
        <div class="window-chrome" aria-hidden="true">
          <span class="traffic-light traffic-close" />
          <span class="traffic-light traffic-min" />
          <span class="traffic-light traffic-max" />
        </div>
        <div class="brand">
          <img class="brand-mark" src="./logo.png" alt="Recoder" width={18} height={18} />
          <span class="brand-name">Cockpit</span>
          <span class="brand-sub">{config.backendUrl}</span>
        </div>
        <nav class="view-tabs">
          {/* Primary tabs driven by the panel registry. */}
          {PRIMARY_VIEWS.map((v) => (
            <button
              key={v}
              class={view === v ? 'view-tab view-tab-active' : 'view-tab'}
              onClick={() => goTo(v as CockpitView)}
            >
              {viewLabel(v)}
            </button>
          ))}
          {/* Everything technical lives behind one calm "More" menu so the nav
              stays plain. The view ids never change — only where they live. */}
          <div class="view-more">
            <button
              class={
                MORE_VIEWS.includes(view)
                  ? 'view-tab view-tab-active view-more-trigger'
                  : 'view-tab view-more-trigger'
              }
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              More ▾
            </button>
            {moreOpen && (
              <>
                {/* Click-away backdrop closes the menu without stealing focus. */}
                <div class="view-more-backdrop" onClick={() => setMoreOpen(false)} />
                <div class="view-more-menu" role="menu">
                  {MORE_VIEWS.map((v) => (
                    <button
                      key={v}
                      role="menuitem"
                      class={view === v ? 'view-more-item view-more-item-active' : 'view-more-item'}
                      onClick={() => goTo(v as CockpitView)}
                    >
                      {viewLabel(v)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </nav>
        <div class="topbar-actions">
          <button class="btn btn-ghost btn-sm" onClick={reconcile} disabled={reconciling}>
            {reconciling ? 'Syncing…' : 'Sync'}
          </button>
          {view === 'board' && (
            <button class="btn btn-primary" onClick={() => setShowCreate(true)}>New workspace</button>
          )}
          {/* Subtle, non-nagging capability hint: remote substrate is Pro+. When
              the current plan gates it, show a quiet inline note near the create
              control — not a modal, not a block. Presentation-only; the server
              still enforces the real entitlement. */}
          {view === 'board' && remoteSubstrateGated && (
            <span
              class="plan-hint"
              title={`Remote substrate is available on ${capabilityUnlockLabel('remote_substrate')} and above.`}
            >
              Remote substrate · {capabilityUnlockLabel('remote_substrate')}+
            </span>
          )}
          {/* Calm "N of M agents" indicator vs the plan's parallel limit. At the
              limit it reads a touch stronger and hints an upgrade — but never blocks
              creating a workspace (surfaced only; the server enforces the real cap). */}
          {view === 'board' && (
            <span
              class="plan-hint"
              title="Agents running locally now — local runs are unlimited (BYOK)."
            >
              {parallelAgentUsageLabel(activeAgents, config.identity?.plan)} agents
            </span>
          )}
          {/* Signed-in identity + sign-out. Shown only inside the desktop shell
              (where the sign-out bridge exists) and only once authenticated. The
              identity is calm + muted; when no email/plan was captured we show a
              generic "Signed in" rather than a fabricated address. */}
          {hasDesktopSignOut() && !unauthenticated && wasAuthed && (
            <div class="account">
              <span class="account-id" title={config.identity?.email || 'Signed in'}>
                {config.identity?.email || 'Signed in'}
                {/* Always show the resolved plan tier as a calm, muted badge.
                    Defaults to "Free" when identity carries no plan — never
                    inflates to a paid tier the server did not grant. */}
                <span class="account-plan" title="Your Recoder plan">
                  {planLabel(config.identity?.plan)}
                </span>
              </span>
              <button
                class="btn btn-ghost btn-sm"
                onClick={handleSignOut}
                disabled={signingOut}
                title="Sign out of Recoder"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      </header>

      <HealthStrip />

      {showSignIn && (
        <SignIn
          backendUrl={config.backendUrl}
          reason={board.error?.message}
          expired={wasAuthed}
          onAuthenticated={onAuthenticated}
        />
      )}

      {view === 'board' && unreachable && (
        <div class="banner banner-error">
          <strong>Backend unreachable.</strong> Can't reach the backend at {config.backendUrl}.
          {!configWasInjected() && ' (No shell config injected — using default localhost:3100.)'}
        </div>
      )}
      {view === 'board' && board.error && !unreachable && !unauthenticated && (
        <div class="banner banner-warn">
          <strong>Workspace list error:</strong> {board.error.message}
        </div>
      )}

      {view === 'board' ? (
        <main class="main main-3pane">
          {/* LEFT: workspaces grouped by repo, truthful state + diff stat. */}
          <WorkspaceSidebar
            workspaces={workspaces}
            selectedId={selectedId}
            loading={board.loading && !board.data}
            onSelect={setSelectedId}
            onNewWorkspace={() => setShowCreate(true)}
          />

          {/* CENTER: when a workspace is selected, its live agent stream +
              "What changed" summary + steer input sit on top; the lifecycle
              board (grouped by state) is always present below so the operator
              keeps the at-a-glance pipeline view. */}
          <section class={`center-pane ${selected ? 'center-pane-thread' : ''}`}>
            {selected && <WorkspaceCenter workspace={selected} />}
            {board.loading && !board.data ? (
              <div class="board-loading">Loading workspaces…</div>
            ) : workspaces.length === 0 && !board.error ? (
              !selected && (
                <div class="board-empty">
                  <p>No workspaces yet.</p>
                  <button class="btn btn-primary" onClick={() => setShowCreate(true)}>Create your first workspace</button>
                </div>
              )
            ) : (
              /* The at-a-glance lifecycle board. When a workspace is selected the
                 agent thread takes the spotlight above and the board collapses to
                 a compact strip (the tests still read its cards). */
              <div class={`board-area ${selected ? 'board-area-compact' : ''}`}>
                <Board workspaces={workspaces} selectedId={selectedId} onSelect={setSelectedId} waits={waits} />
              </div>
            )}
          </section>

          {/* RIGHT: file diffs + terminal + PR/merge status for the selection. */}
          {selected && (
            <WorkspaceDetail
              workspace={selected}
              onClose={() => setSelectedId(null)}
              onChanged={() => board.refresh()}
            />
          )}
        </main>
      ) : view === 'sessions' ? (
        /* sessions is rendered inline because it receives the shell-level
           tmuxBin hint from the health poll. All other panels are lazy-loaded
           via PanelLoader which reads their component from the registry. */
        <main class="main">
          <SessionsPanel tmuxBin={tmuxBin} />
        </main>
      ) : (
        /* All remaining panels are lazy-loaded on first activation. The registry
           drives which component is rendered — no ternary chain needed. */
        <main class="main">
          <PanelLoader panelId={view} />
        </main>
      )}

      {showCreate && (
        <NewWorkspaceForm onCreated={() => board.refresh()} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
