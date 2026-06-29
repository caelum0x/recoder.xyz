/**
 * App — the cockpit shell. Polls GET /workspaces (~2s) for the board, owns
 * selection + the new-workspace modal, and renders the health strip. When the
 * backend is unreachable it shows a truthful "backend unreachable" banner and
 * never fabricates workspaces.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { api, BackendUnreachableError, UnauthorizedError } from './lib/api';
import { usePoll } from './lib/usePoll';
import {
  readConfig,
  configWasInjected,
  readInitialView,
  COCKPIT_NAVIGATE_EVENT,
  type CockpitView,
} from './lib/config';
import { Board } from './components/Board';
import { HealthStrip } from './components/HealthStrip';
import { NewWorkspaceForm } from './components/NewWorkspaceForm';
import { WorkspaceDetail } from './components/WorkspaceDetail';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { WorkspaceCenter } from './components/WorkspaceCenter';
import { SessionsPanel } from './components/SessionsPanel';
import { DmuxPanel } from './components/DmuxPanel';
import { ConnectorsPanel } from './components/ConnectorsPanel';
import { PolicyPanel } from './components/PolicyPanel';
import { MemoryCandidatesPanel } from './components/MemoryCandidatesPanel';
import { SubstratesPanel } from './components/SubstratesPanel';
import { LiveEventsView } from './components/LiveEventsView';
import { GovernancePanel } from './components/GovernancePanel';
import { BrainStatsPanel } from './components/BrainStatsPanel';
import { SignIn } from './components/SignIn';

const WORKSPACE_POLL_MS = 2000;
const HEALTH_POLL_MS = 15_000;

/**
 * Plain-English labels for each view. The underlying view ids/routes/state
 * values never change — only what the user reads. This keeps deep links, the
 * navigate event, and persisted state stable while the nav speaks plain words.
 */
const VIEW_LABELS: Record<CockpitView, string> = {
  board: 'Board',
  sessions: 'Runs',
  connectors: 'Chat',
  substrates: 'Agents',
  events: 'Activity',
  governance: 'Approvals',
  policy: 'Rules',
  brain: 'Brain',
  memory: 'Memory',
  dmux: 'dmux',
};

/** Views always shown front-and-center in the top nav. */
const PRIMARY_VIEWS: readonly CockpitView[] = ['board', 'sessions'];

/** Advanced/technical views tucked into the "More" menu so they're not in your face. */
const MORE_VIEWS: readonly CockpitView[] = [
  'dmux',
  'substrates',
  'governance',
  'policy',
  'brain',
  'memory',
  'events',
  'connectors',
];

export function App() {
  const config = readConfig();
  // Open on the deep-linked view when a launcher/menu requested one (e.g. the
  // desktop "Open dmux Console" item), otherwise default to the board.
  const [view, setView] = useState<CockpitView>(() => readInitialView() || 'board');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // When the user picks an advanced view, jump to it and close the More menu.
  function goTo(target: CockpitView) {
    setView(target);
    setMoreOpen(false);
  }

  const board = usePoll(() => api.listWorkspaces(), WORKSPACE_POLL_MS);
  const health = usePoll(() => api.health(), HEALTH_POLL_MS);
  const tmuxBin = health.data?.tmuxBin;
  const workspaces = board.data || [];

  const selected = useMemo(
    () => workspaces.find((w) => w.workspaceId === selectedId) || null,
    [workspaces, selectedId],
  );

  // Let the desktop shell switch the cockpit view live (without a reload) when a
  // menu/launcher action fires — e.g. "Open dmux Console" dispatches this event
  // with detail.view = 'dmux'. This is how the dmux surface is reachable from a
  // single menu click even when the cockpit is already open.
  useEffect(() => {
    function onNavigate(e: Event) {
      const detail = (e as CustomEvent<{ view?: string }>).detail;
      const target = detail?.view;
      if (
        target === 'board' ||
        target === 'sessions' ||
        target === 'dmux' ||
        target === 'connectors' ||
        target === 'policy' ||
        target === 'memory' ||
        target === 'substrates' ||
        target === 'events' ||
        target === 'governance' ||
        target === 'brain'
      ) {
        setView(target);
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

  function onAuthenticated() {
    // Re-resolve config picks up the fresh token; force every poll to refetch.
    board.refresh();
    health.refresh();
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
          <span class="brand-mark" />
          <span class="brand-name">Cockpit</span>
          <span class="brand-sub">{config.backendUrl}</span>
        </div>
        <nav class="view-tabs">
          {PRIMARY_VIEWS.map((v) => (
            <button
              key={v}
              class={view === v ? 'view-tab view-tab-active' : 'view-tab'}
              onClick={() => goTo(v)}
            >
              {VIEW_LABELS[v]}
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
                      onClick={() => goTo(v)}
                    >
                      {VIEW_LABELS[v]}
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
        </div>
      </header>

      <HealthStrip />

      {unauthenticated && (
        <SignIn
          backendUrl={config.backendUrl}
          reason={board.error?.message}
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
                <Board workspaces={workspaces} selectedId={selectedId} onSelect={setSelectedId} />
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
        <main class="main">
          <SessionsPanel tmuxBin={tmuxBin} />
        </main>
      ) : view === 'dmux' ? (
        <main class="main">
          <DmuxPanel />
        </main>
      ) : view === 'connectors' ? (
        <main class="main">
          <ConnectorsPanel />
        </main>
      ) : view === 'substrates' ? (
        <main class="main">
          <SubstratesPanel />
        </main>
      ) : view === 'events' ? (
        <main class="main">
          <LiveEventsView />
        </main>
      ) : view === 'governance' ? (
        <main class="main">
          <GovernancePanel />
        </main>
      ) : view === 'brain' ? (
        <main class="main">
          <BrainStatsPanel />
        </main>
      ) : view === 'policy' ? (
        <main class="main">
          <PolicyPanel />
        </main>
      ) : (
        <main class="main">
          <MemoryCandidatesPanel />
        </main>
      )}

      {showCreate && (
        <NewWorkspaceForm onCreated={() => board.refresh()} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
