/**
 * SessionsPanel — the interactive tmux sessions surface.
 *
 * Lists live agent sessions from GET /sessions (~3s), lets the operator start a
 * new one (POST /sessions), select one to open a live SessionTerminal (real local
 * pty via Electron, or the HTTP /sessions/:id/output+keys fallback), and kill it
 * (DELETE /sessions/:id).
 *
 * The dmux operator console is its own discoverable surface (the "dmux" view
 * tab and the desktop "Open dmux Console" menu item), so it is not duplicated
 * here.
 *
 * No mock data: everything renders from real fetches; a backend failure surfaces
 * the truthful error rather than fabricating sessions.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { readConfig } from '../lib/config';
import { hasLocalTerminal } from '../lib/desktop';
import { SessionTerminal } from './SessionTerminal';
import { workspaceCodename } from '../lib/workspace-codename';
import type { ConductorSession } from '../types';

const POLL_MS = 3000;

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

interface StartFormProps {
  onStarted: (s: ConductorSession) => void;
  onClose: () => void;
}

function StartSessionForm({ onStarted, onClose }: StartFormProps) {
  const defaults = readConfig().defaults;
  const [sessionId, setSessionId] = useState('');
  const [repoPath, setRepoPath] = useState(defaults?.repoPath || '');
  const [command, setCommand] = useState('');
  const [baseRef, setBaseRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = sessionId.trim() && repoPath.trim() && command.trim();

  async function submit(e: Event) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const session = await api.startSession({
        sessionId: sessionId.trim(),
        repoPath: repoPath.trim(),
        command: command.trim(),
        baseRef: baseRef.trim() || undefined,
      });
      onStarted(session);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="session-start" onSubmit={submit}>
      <div class="field">
        <span>Session id</span>
        <input value={sessionId} onInput={(e) => setSessionId((e.target as HTMLInputElement).value)} placeholder="task-123" />
      </div>
      <div class="field">
        <span>Folder</span>
        <input value={repoPath} onInput={(e) => setRepoPath((e.target as HTMLInputElement).value)} placeholder="/abs/path/to/repo" />
      </div>
      <div class="field">
        <span>Command</span>
        <input value={command} onInput={(e) => setCommand((e.target as HTMLInputElement).value)} placeholder="pi --prompt '…' or claude / codex …" />
      </div>
      <div class="field">
        <span>Base ref (optional)</span>
        <input value={baseRef} onInput={(e) => setBaseRef((e.target as HTMLInputElement).value)} placeholder="HEAD" />
      </div>
      {error && <p class="form-error">{error}</p>}
      <div class="modal-actions">
        <button class="btn btn-sm btn-ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button class="btn btn-sm btn-primary" type="submit" disabled={!valid || busy}>{busy ? 'Starting…' : 'Start session'}</button>
      </div>
    </form>
  );
}

export function SessionsPanel({ tmuxBin }: { tmuxBin?: string }) {
  const sessions = usePoll(() => api.listSessions(), POLL_MS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showStart, setShowStart] = useState(false);
  const [killBusy, setKillBusy] = useState<string | null>(null);
  const [killError, setKillError] = useState<string | null>(null);

  const list = sessions.data || [];
  const selected = list.find((s) => s.sessionId === selectedId) || null;
  const unreachable = sessions.error instanceof BackendUnreachableError;

  async function kill(id: string) {
    setKillBusy(id);
    setKillError(null);
    try {
      await api.killSession(id);
      if (selectedId === id) setSelectedId(null);
      sessions.refresh();
    } catch (err) {
      setKillError(describeError(err));
    } finally {
      setKillBusy(null);
    }
  }

  return (
    <section class="sessions-surface">
      <div class="sessions-toolbar">
        <div class="sessions-title">
          <span class="panel-title">Runs</span>
          <span class={`pill ${hasLocalTerminal() ? 'pill-good' : ''}`} title={hasLocalTerminal() ? 'Electron node-pty terminal available' : 'No local pty — HTTP output fallback'}>
            <span class="pill-dot" /> {hasLocalTerminal() ? 'local terminal' : 'http output'}
          </span>
        </div>
        <button class="btn btn-sm btn-primary" onClick={() => setShowStart((v) => !v)}>
          {showStart ? 'Close' : 'Start session'}
        </button>
      </div>

      {unreachable && (
        <div class="banner banner-error">
          <strong>Can't reach the backend.</strong> Can't show your runs right now.
        </div>
      )}
      {sessions.error && !unreachable && (
        <p class="action-error">Couldn't load runs: {sessions.error.message}</p>
      )}
      {killError && <p class="action-error">{killError}</p>}

      {showStart && (
        <StartSessionForm
          onStarted={(s) => {
            setShowStart(false);
            setSelectedId(s.sessionId);
            sessions.refresh();
          }}
          onClose={() => setShowStart(false)}
        />
      )}

      <div class="sessions-split">
        <div class="sessions-list">
          {sessions.loading && !sessions.data ? (
            <div class="log-empty">Loading sessions…</div>
          ) : list.length === 0 && !sessions.error ? (
            <div class="log-empty">No runs yet.</div>
          ) : (
            list.map((s) => (
              // Row is a clickable container (role=button), NOT a <button>: it
              // holds a nested Kill <button>, and nesting interactive controls
              // inside a <button> is invalid HTML — browsers reparent the inner
              // button out, breaking layout and the stopPropagation handler.
              <div
                class={`session-row ${s.sessionId === selectedId ? 'session-row-active' : ''}`}
                key={s.sessionId}
                role="button"
                tabIndex={0}
                aria-pressed={s.sessionId === selectedId}
                onClick={() => setSelectedId(s.sessionId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(s.sessionId);
                  }
                }}
              >
                <div class="session-row-main">
                  <span class="session-name" title={`${s.sessionId} · ${s.branch}`}>
                    {workspaceCodename(s.sessionId)}
                  </span>
                </div>
                <div class="session-row-sub" title={s.command}>{s.command}</div>
                <button
                  class="btn btn-sm btn-danger session-kill"
                  type="button"
                  disabled={killBusy === s.sessionId}
                  onClick={(e) => {
                    e.stopPropagation();
                    void kill(s.sessionId);
                  }}
                >
                  {killBusy === s.sessionId ? '…' : 'Kill'}
                </button>
              </div>
            ))
          )}
        </div>

        <div class="sessions-detail">
          {selected ? (
            <SessionTerminal session={selected} tmuxBin={tmuxBin} />
          ) : (
            <div class="log-empty">Select a run to watch it.</div>
          )}
        </div>
      </div>
    </section>
  );
}
