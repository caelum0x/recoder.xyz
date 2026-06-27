/**
 * DmuxPanel — the dmux operator-console status grid.
 *
 * Renders entirely from GET /dmux (availability + the conductor tmux sessions
 * dmux can observe on the shared tmux server). POST /dmux/launch starts the dmux
 * TUI for a repo and surfaces the truthful attach hint (dmux needs a real TTY, so
 * the backend spawns it detached and tells the operator how to attach).
 *
 * No mock data: when dmux is not installed the panel says so, with the backend's
 * own reason string.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { readConfig } from '../lib/config';
import type { DmuxLaunchResult } from '../types';

const POLL_MS = 5000;

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

export function DmuxPanel() {
  const status = usePoll(() => api.dmux(), POLL_MS);
  const [repoPath, setRepoPath] = useState(readConfig().defaults?.repoPath || '');
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<DmuxLaunchResult | null>(null);

  async function launch(e: Event) {
    e.preventDefault();
    if (!repoPath) return;
    setLaunching(true);
    setLaunchError(null);
    setLaunched(null);
    try {
      setLaunched(await api.dmuxLaunch({ repoPath }));
    } catch (err) {
      setLaunchError(describeError(err));
    } finally {
      setLaunching(false);
    }
  }

  const data = status.data;

  return (
    <div class="dmux-panel">
      <div class="dmux-head">
        <span class="panel-title">dmux console</span>
        {status.error ? (
          <span class="pill pill-bad"><span class="pill-dot" /> unavailable</span>
        ) : data ? (
          <span class={`pill ${data.available ? 'pill-good' : 'pill-bad'}`} title={data.reason || data.bin}>
            <span class="pill-dot" /> {data.available ? 'available' : 'not installed'}
          </span>
        ) : (
          <span class="health-loading">loading…</span>
        )}
      </div>

      {status.error && <p class="action-error">{status.error.message}</p>}

      {data && !data.available && data.reason && <p class="form-warn">{data.reason}</p>}

      {data && (
        <div class="dmux-meta">
          <div><span class="meta-k">bin</span><span class="meta-v" title={data.bin}>{data.vendored ? 'vendored' : 'system'} · {data.bin}</span></div>
          <div><span class="meta-k">tmux</span><span class="meta-v">{data.tmuxPinned ? 'pinned' : 'system'} · {data.tmuxBin}</span></div>
        </div>
      )}

      <div class="dmux-grid">
        <span class="dmux-grid-label">Visible tmux sessions</span>
        {!data ? (
          <span class="health-loading">…</span>
        ) : data.visibleSessions.length === 0 ? (
          <span class="log-empty">No conductor tmux sessions on the server.</span>
        ) : (
          <ul class="dmux-session-list">
            {data.visibleSessions.map((s) => (
              <li class="dmux-session" key={s}><span class="pill-dot" /> {s}</li>
            ))}
          </ul>
        )}
      </div>

      <form class="dmux-launch" onSubmit={launch}>
        <input
          class="terminal-input"
          value={repoPath}
          placeholder="Absolute repo path to open in dmux…"
          onInput={(e) => setRepoPath((e.target as HTMLInputElement).value)}
        />
        <button class="btn btn-sm" type="submit" disabled={launching || !repoPath || (!!data && !data.available)}>
          {launching ? 'Launching…' : 'Launch dmux'}
        </button>
      </form>
      {launchError && <p class="action-error">{launchError}</p>}
      {launched && (
        <div class="dmux-launched">
          <p class="action-note">dmux launched (pid {launched.pid}).</p>
          <code class="dmux-attach">{launched.attachHint}</code>
        </div>
      )}
    </div>
  );
}
