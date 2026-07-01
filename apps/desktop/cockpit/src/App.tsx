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
  atParallelAgentLimit,
} from './lib/plan-state';
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
  // Agents actively holding a run slot (provisioning / running / merging) — drives
  // a calm "N of M agents" indicator vs the plan's parallel limit. Presentation-only:
  // it NEVER blocks creating a workspace (the server enforces the real cap).
  const activeAgents = workspaces.filter(
    (w) => w.state === 'setting_up' || w.state === 'running' || w.state === 'merging',
  ).length;
  const agentsAtLimit = atParallelAgentLimit(activeAgents, config.identity?.plan);

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
              class={agentsAtLimit ? 'plan-hint plan-hint-live' : 'plan-hint'}
              title={
                agentsAtLimit
                  ? planLabel(config.identity?.plan) === 'Free'
                    ? 'Running your plan limit — upgrade to run more agents at once.'
                    : "You're at your plan's parallel-agent limit."
                  : 'Agents running now vs your plan limit'
              }
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
