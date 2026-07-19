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
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api, BackendUnreachableError, UnauthorizedError } from './lib/api';
import { usePoll } from './lib/usePoll';
import { useWorkspaceWaits } from './lib/useWorkspaceWaits';
import {
  readConfig,
  configWasInjected,
  readInitialView,
  hasDesktopDeviceLogin,
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
  agentsIndicator,
} from './lib/plan-state';
// The Board (parallel workspace runs) is the cockpit's only nav surface — the
// engine dashboards were stripped so the engines stay invisible behind the run
// flow. All Board-view components are eagerly imported (always needed at startup).
import { Board } from './components/Board';
import { BoardSearch } from './components/BoardSearch';
import { ArchivedHistory } from './components/ArchivedHistory';
import { useBoardQuery } from './lib/useBoardQuery';
import { workspaceFacets } from './lib/workspace-facets';
import { filterWorkspaces, hasActiveFilters, type WorkspaceFilters } from './lib/workspace-filter';
import { CompareGroupsBar } from './components/CompareGroupsBar';
import { ComparePanel } from './components/ComparePanel';
import type { ParallelRunGroup } from './lib/compare-groups';
import type { Workspace } from './types';
import { HealthStrip } from './components/HealthStrip';
import { PermissionCoach } from './components/PermissionCoach';
import { NewWorkspaceForm } from './components/NewWorkspaceForm';
import { RepoSettings } from './components/RepoSettings';
import { WorkspaceDetail } from './components/WorkspaceDetail';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { WorkspaceCenter } from './components/WorkspaceCenter';
import { SignIn } from './components/SignIn';
// Registry drives the nav. It now registers only the Board.
import { PANEL_REGISTRY, PRIMARY_PANEL_IDS, getPanelById } from './panels/registry';

const WORKSPACE_POLL_MS = 2000;
const HEALTH_POLL_MS = 15_000;
const RUNTIMES_POLL_MS = 30_000;
const ARCHIVED_POLL_MS = 8000;

/**
 * Derive the nav label for a given view id from the registry.
 * Falls back to the id itself when not found (should not happen in practice).
 */
function viewLabel(id: string): string {
  return getPanelById(id)?.title ?? id;
}

// The nav is derived from the registry, which now registers only the Board.
// The engine dashboards were stripped — the engines run invisibly behind the
// run flow, so there is no "More" menu and no non-board panel to lazy-load.
const PRIMARY_VIEWS: readonly string[] = PRIMARY_PANEL_IDS;

// The set of all registered view ids for the navigate-event guard (deep links /
// launcher navigate events targeting a stripped view are ignored).
const ALL_VIEW_IDS: ReadonlySet<string> = new Set(PANEL_REGISTRY.map((p) => p.id));

export function App() {
  const config = readConfig();
  // Whether the current plan gates the remote substrate (Pro+). Drives a subtle,
  // non-nagging hint near the create control — never a hard block (the server
  // still enforces the real entitlement). Defaults to gated when plan is absent.
  const remoteSubstrateGated = isCapabilityGated(config.identity?.plan, 'remote_substrate');
  // Open on the deep-linked view when a launcher/menu requested one, otherwise
  // default to the board.
  const [view, setView] = useState<CockpitView>(() => readInitialView() || 'board');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // Settings live behind the avatar (RECODER-PRODUCT-DESIGN §3C) — a tucked-away
  // pane, never a primary tab. Today it hosts per-repo setup scripts.
  const [showSettings, setShowSettings] = useState(false);
  // The parallel-run group whose side-by-side compare is open (F3), or null.
  const [compareGroup, setCompareGroup] = useState<ParallelRunGroup | null>(null);
  // Board search / filter chips (repo/agent/state/q) and the Archived history
  // toggle. The live board narrows to these; the endpoints they drive are real.
  const [filters, setFilters] = useState<WorkspaceFilters>({});
  const [showArchived, setShowArchived] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // True once we have observed a working authenticated session this run. Used to
  // frame a later 401 as "your session expired" rather than a cold sign-in.
  const [wasAuthed, setWasAuthed] = useState(false);
  // Silent-refresh bookkeeping: we attempt ONE transparent device-token refresh
  // the first time we hit a 401, before surfacing the SignIn panel.
  const [refreshAttempted, setRefreshAttempted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Re-entry guard for the silent-refresh effect. A REF (not `refreshing`) so
  // that setting the in-flight flag does not re-run the effect and self-cancel
  // its own pending refresh (which would wedge session-expiry recovery: no
  // SignIn, no banner). See the effect below.
  const refreshInFlight = useRef(false);
  // A sign-in completed this run. Clears the first-run gate even when the auth
  // result carried no display identity (the session is real either way).
  const [signedInThisRun, setSignedInThisRun] = useState(false);

  // Switch the active view (only the Board today; kept for deep-link parity).
  function goTo(target: CockpitView) {
    setView(target);
  }

  const board = usePoll(() => api.listWorkspaces(), WORKSPACE_POLL_MS);
  const health = usePoll(() => api.health(), HEALTH_POLL_MS);
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
  // Detected agent CLIs (claude/codex/…) so the top-bar can say "N agents ready"
  // instead of a bare "0 agents" when none are running yet. Polled slowly — the
  // installed set rarely changes.
  const runtimes = usePoll(() => api.runtimes(), RUNTIMES_POLL_MS);
  const readyRuntimeIds = (runtimes.data || [])
    .filter((r) => r.available)
    .map((r) => r.runtimeId);
  // Whether the backend can forward a GitHub token into agent sessions. Polled
  // slowly (env-scoped, rarely changes). Degrade-safe: on error/absence the chip
  // reads "not connected" rather than fabricating a link.
  const github = usePoll(() => api.githubStatus(), RUNTIMES_POLL_MS);
  const githubConnected = github.data?.connected === true;

  // Board search / filter: the debounced, server-authoritative narrowing feed
  // (GET /workspaces?q=&repo=&agent=&state=). It fetches only when a filter is
  // active; the unfiltered `board` poll above stays the source when it is not.
  const filteredPoll = useBoardQuery(filters, WORKSPACE_POLL_MS);
  const filtersActive = hasActiveFilters(filters);
  // Filter-chip options come only from real board records (never a hardcoded
  // set), so a user never picks a repo/agent/state that would match nothing.
  const facets = useMemo(() => workspaceFacets(workspaces), [workspaces]);
  // The workspaces the board renders: the authoritative server result once it
  // lands, with an INSTANT client-side filter of the already-loaded list while
  // that debounced request is in flight, so typing feels immediate but the
  // endpoint stays the source of truth.
  const boardWorkspaces = !filtersActive
    ? workspaces
    : (filteredPoll.data ?? filterWorkspaces(workspaces, filters));

  // Archived history: fetched only while the Archived view is open (gated
  // fetcher → no request when hidden). Read-only; degrades to an empty list.
  const archived = usePoll<Workspace[] | null>(
    () => (showArchived ? api.listArchivedWorkspaces() : Promise.resolve(null)),
    ARCHIVED_POLL_MS,
    [showArchived],
  );
  const archivedWorkspaces = archived.data ?? [];

  // Resolve the selected workspace from the live board first, then the archived
  // history — so opening an archived run from the history view still renders.
  const selected = useMemo(
    () =>
      workspaces.find((w) => w.workspaceId === selectedId) ||
      archivedWorkspaces.find((w) => w.workspaceId === selectedId) ||
      null,
    [workspaces, archivedWorkspaces, selectedId],
  );

  // Let the desktop shell switch the cockpit view live (without a reload) when a
  // menu/launcher action fires.
  // The guard uses ALL_VIEW_IDS from the registry so new panels are
  // automatically navigable without touching this handler — and retired ids
  // (sessions/dmux) are ignored instead of rendering a dead surface.
  useEffect(() => {
    function onNavigate(e: Event) {
      const detail = (e as CustomEvent<{ view?: string }>).detail;
      const target = detail?.view;
      if (typeof target === 'string' && ALL_VIEW_IDS.has(target)) {
        setView(target as CockpitView);
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
    if (!unauthenticated || refreshAttempted || refreshInFlight.current) return;
    let cancelled = false;
    refreshInFlight.current = true;
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
        refreshInFlight.current = false;
        if (cancelled) return;
        setRefreshAttempted(true);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unauthenticated, refreshAttempted]);

  // FIRST-RUN GATE (zero-config onboarding): inside the desktop shell, signing
  // in to recoder.xyz is the ONE thing we ask of the user — so when the shell
  // has no captured session (no identity injected, none from a prior login this
  // run), the SignIn panel shows PROACTIVELY over the board, not only after a
  // backend 401. Outside the shell (no device-login bridge) there is no gate —
  // the cockpit keeps its truthful reactive behavior.
  const needsFirstRunSignIn = hasDesktopDeviceLogin() && !config.identity && !signedInThisRun;

  // The SignIn panel shows on the first-run gate, or after an unauthenticated
  // poll once the silent refresh attempt has resolved (so a recoverable session
  // refreshes with no UI flash).
  const showSignIn = needsFirstRunSignIn || (unauthenticated && refreshAttempted && !refreshing);

  function onAuthenticated() {
    // Re-resolve config picks up the fresh token; force every poll to refetch.
    setSignedInThisRun(true);
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
      setSignedInThisRun(false);
      setRefreshAttempted(true); // don't auto-refresh right after an explicit sign-out
      board.refresh();
      health.refresh();
    } finally {
      setSigningOut(false);
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
          <img class="brand-mark" src="./logo.png" alt="Recoder" width={28} height={28} />
        </div>
        <nav class="view-tabs">
          {/* Primary tabs driven by the panel registry — the Board is the only
              human nav surface; the engines run invisibly behind the run flow. */}
          {PRIMARY_VIEWS.map((v) => (
            <button
              key={v}
              class={view === v ? 'view-tab view-tab-active' : 'view-tab'}
              onClick={() => goTo(v as CockpitView)}
            >
              {viewLabel(v)}
            </button>
          ))}
        </nav>
        <div class="topbar-actions">
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
          {/* Calm agents indicator: "N of M agents" while running; otherwise
              "N agents ready" (installed CLIs) or a truthful install prompt — so a
              fresh, idle board never reads as "nothing is connected". Surfaced
              only; the server enforces the real parallel cap. */}
          {view === 'board' &&
            (() => {
              const ind = agentsIndicator(activeAgents, readyRuntimeIds, config.identity?.plan);
              return (
                <span class="plan-hint" title={ind.title}>
                  {ind.label}
                </span>
              );
            })()}
          {/* Signed-in identity + sign-out. Shown only inside the desktop shell
              (where the sign-out bridge exists) and only once authenticated. The
              identity is calm + muted; when no email/plan was captured we show a
              generic "Signed in" rather than a fabricated address. */}
          {/* Calm GitHub connection chip: reflects whether the backend can hand
              agents a GitHub token (GH_TOKEN/GITHUB_TOKEN) so they run `gh`
              non-interactively. Only shown once the status has resolved — never
              claims "connected" without a truthful backend signal. Presentation
              only; the backend owns the real token forwarding. */}
          {view === 'board' && github.data && (
            <span
              class={`plan-hint github-chip${githubConnected ? ' github-chip-on' : ''}`}
              title={
                githubConnected
                  ? `GitHub connected — agents can use \`gh\` (via ${
                      github.data.source === 'gh_cli' ? 'your gh login' : github.data.source
                    }).`
                  : 'GitHub not connected — sign in with `gh auth login` or set GH_TOKEN so agents can use `gh`.'
              }
            >
              {/* Zero-config identity: when the backend detected the account
                  (gh login / git config), name it — "GitHub · caelum0x". */}
              GitHub · {githubConnected ? github.data.account?.login || 'connected' : 'not connected'}
            </span>
          )}
          {/* Settings, tucked behind the avatar (never a primary tab). A calm
              gear that opens the repo-setup pane. Shown on the board only. */}
          {view === 'board' && (
            <button
              class="icon-btn settings-btn"
              onClick={() => setShowSettings(true)}
              title="Settings — per-repo setup scripts"
              aria-label="Settings"
            >
              ⚙
            </button>
          )}
          {hasDesktopSignOut() && !unauthenticated && wasAuthed && (
            <div class="account">
              {config.identity?.avatarUrl && (
                <img class="account-avatar" src={config.identity.avatarUrl} alt="" width={20} height={20} />
              )}
              <span
                class="account-id"
                title={config.identity?.name || config.identity?.email || 'Signed in'}
              >
                {config.identity?.name || config.identity?.email || 'Signed in'}
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
          reason={unauthenticated ? board.error?.message : undefined}
          expired={wasAuthed && unauthenticated}
          firstRun={needsFirstRunSignIn && !unauthenticated}
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

      {(
        <main class="main main-3pane">
          {/* LEFT: workspaces grouped by repo, truthful state + diff stat. */}
          <WorkspaceSidebar
            workspaces={workspaces}
            selectedId={selectedId}
            loading={board.loading && !board.data}
            onSelect={setSelectedId}
            onNewWorkspace={() => setShowCreate(true)}
            waits={waits}
            collapsed={leftCollapsed}
            onToggleCollapse={() => setLeftCollapsed((v) => !v)}
            onHome={() => setSelectedId(null)}
          />

          {/* CENTER: a FOCUSED surface. With a workspace selected it is a pure
              conversation (the reference keeps the thread uncluttered — no
              kanban underneath); the lifecycle board is hidden, not stacked
              below. With nothing selected the board is the at-a-glance view. */}
          <section class={`center-pane ${selected ? 'center-pane-thread' : ''}`}>
            {selected && <WorkspaceCenter workspace={selected} />}
            {/* Board search + filter chips + Archived toggle — only when the
                board is the focus (a thread hides the board). */}
            {!selected && (
              <BoardSearch
                filters={filters}
                onFiltersChange={setFilters}
                repos={facets.repos}
                agents={facets.agents}
                states={facets.states}
                archivedActive={showArchived}
                onToggleArchived={() => setShowArchived((v) => !v)}
                resultCount={boardWorkspaces.length}
                totalCount={workspaces.length}
              />
            )}
            {!selected && showArchived ? (
              <ArchivedHistory
                workspaces={archivedWorkspaces}
                loading={archived.loading}
                error={archived.error}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ) : board.loading && !board.data ? (
              !selected && <div class="board-loading">Loading workspaces…</div>
            ) : !filtersActive && workspaces.length === 0 && !board.error ? (
              !selected && (
                <div class="board-empty">
                  <img class="board-empty-logo" src="./logo.png" alt="" width={40} height={40} />
                  <h2 class="board-empty-title">Start your first agent</h2>
                  {readyRuntimeIds.length > 0 ? (
                    <p class="board-empty-sub">
                      {readyRuntimeIds.length} agent{readyRuntimeIds.length === 1 ? '' : 's'} ready
                      on your machine ({readyRuntimeIds.slice(0, 4).join(', ')}
                      {readyRuntimeIds.length > 4 ? '…' : ''}). Pick a folder and it runs in an
                      isolated worktree.
                    </p>
                  ) : (
                    <p class="board-empty-sub">
                      Install a coding agent (like <code>claude</code> or <code>codex</code>), then
                      pick a folder to run it in an isolated worktree.
                    </p>
                  )}
                  <button class="btn btn-primary" onClick={() => setShowCreate(true)}>
                    {readyRuntimeIds.length > 0 ? 'New workspace' : 'Set up a workspace'}
                  </button>
                </div>
              )
            ) : (
              /* Hidden (not stacked) when a conversation is open — the board
                 stays mounted so the pipeline keeps updating, but the center is
                 the thread alone. */
              <div class={`board-area ${selected ? 'board-area-hidden' : ''}`}>
                {/* Multi-agent compare entry point (F3): a calm chip per
                    parallel-run group, opening the side-by-side ComparePanel.
                    Renders nothing when there are no parallel runs. */}
                <CompareGroupsBar workspaces={workspaces} onCompare={setCompareGroup} />
                {filtersActive && boardWorkspaces.length === 0 ? (
                  <div class="board-empty-filtered">No workspaces match your filters.</div>
                ) : (
                  <Board
                    workspaces={boardWorkspaces}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    waits={waits}
                  />
                )}
              </div>
            )}
          </section>

          {/* RIGHT: file diffs + terminal + PR/merge status for the selection. */}
          {selected && (
            <WorkspaceDetail
              // Keyed on the workspace id so switching the selected workspace
              // remounts the panel — resetting per-workspace local state
              // (tab / actionOutcome / busy) instead of bleeding workspace A's
              // gate verdict, error note, or in-flight busy state onto B.
              key={selected.workspaceId}
              workspace={selected}
              onClose={() => setSelectedId(null)}
              onChanged={() => board.refresh()}
            />
          )}
        </main>
      )}

      {showCreate && (
        <NewWorkspaceForm onCreated={() => board.refresh()} onClose={() => setShowCreate(false)} />
      )}

      {showSettings && (
        <RepoSettings workspaces={workspaces} onClose={() => setShowSettings(false)} />
      )}

      {compareGroup && (
        <ComparePanel
          taskGroup={compareGroup.taskGroup}
          goal={compareGroup.goal}
          onClose={() => setCompareGroup(null)}
          onChanged={() => board.refresh()}
        />
      )}

      <PermissionCoach />
    </div>
  );
}
