/**
 * App — the cockpit shell. Polls GET /workspaces (~2s) for the board, owns
 * selection + the new-workspace modal, and renders the health strip. When the
 * backend is unreachable it shows a truthful "backend unreachable" banner and
 * never fabricates workspaces.
 */
import { useMemo, useState } from 'preact/hooks';
import { api, BackendUnreachableError, UnauthorizedError } from './lib/api';
import { usePoll } from './lib/usePoll';
import { readConfig, configWasInjected } from './lib/config';
import { Board } from './components/Board';
import { HealthStrip } from './components/HealthStrip';
import { NewWorkspaceForm } from './components/NewWorkspaceForm';
import { WorkspaceDetail } from './components/WorkspaceDetail';
import { SessionsPanel } from './components/SessionsPanel';
import { ConnectorsPanel } from './components/ConnectorsPanel';
import { SignIn } from './components/SignIn';

const WORKSPACE_POLL_MS = 2000;
const HEALTH_POLL_MS = 15_000;

type View = 'board' | 'sessions' | 'connectors';

export function App() {
  const config = readConfig();
  const [view, setView] = useState<View>('board');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const board = usePoll(() => api.listWorkspaces(), WORKSPACE_POLL_MS);
  const health = usePoll(() => api.health(), HEALTH_POLL_MS);
  const tmuxBin = health.data?.tmuxBin;
  const workspaces = board.data || [];

  const selected = useMemo(
    () => workspaces.find((w) => w.workspaceId === selectedId) || null,
    [workspaces, selectedId],
  );

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
        <div class="brand">
          <span class="brand-mark" />
          <span class="brand-name">Recoder Cockpit</span>
          <span class="brand-sub">{config.backendUrl}</span>
        </div>
        <nav class="view-tabs">
          <button class={view === 'board' ? 'view-tab view-tab-active' : 'view-tab'} onClick={() => setView('board')}>Board</button>
          <button class={view === 'sessions' ? 'view-tab view-tab-active' : 'view-tab'} onClick={() => setView('sessions')}>Sessions</button>
          <button class={view === 'connectors' ? 'view-tab view-tab-active' : 'view-tab'} onClick={() => setView('connectors')}>Connectors</button>
        </nav>
        <div class="topbar-actions">
          <button class="btn btn-ghost btn-sm" onClick={reconcile} disabled={reconciling}>
            {reconciling ? 'Reconciling…' : 'Reconcile'}
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
          <strong>Backend unreachable.</strong> Cannot reach the Recoder backend at {config.backendUrl}.
          {!configWasInjected() && ' (No shell config injected — using default localhost:3100.)'}
          {' '}Showing no workspaces until the connection is restored.
        </div>
      )}
      {view === 'board' && board.error && !unreachable && !unauthenticated && (
        <div class="banner banner-warn">
          <strong>Workspace list error:</strong> {board.error.message}
        </div>
      )}

      {view === 'board' ? (
        <main class="main">
          <section class={`board-area ${selected ? 'with-detail' : ''}`}>
            {board.loading && !board.data ? (
              <div class="board-loading">Loading workspaces…</div>
            ) : workspaces.length === 0 && !board.error ? (
              <div class="board-empty">
                <p>No workspaces yet.</p>
                <button class="btn btn-primary" onClick={() => setShowCreate(true)}>Create your first workspace</button>
              </div>
            ) : (
              <Board workspaces={workspaces} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </section>

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
      ) : (
        <main class="main">
          <ConnectorsPanel />
        </main>
      )}

      {showCreate && (
        <NewWorkspaceForm onCreated={() => board.refresh()} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
