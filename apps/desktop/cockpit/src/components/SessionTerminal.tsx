/**
 * SessionTerminal — drive ONE interactive tmux agent session.
 *
 * The terminal renders over the conductor HTTP path, which works reliably in
 * both the Electron renderer and a plain browser:
 *  - GET  /sessions/:id/output  — captured tmux pane content (polled live)
 *  - POST /sessions/:id/keys    — keystrokes sent to the live pane (tmux send-keys)
 *
 * A previous build tried to `tmux attach` through a local node-pty bridge, but
 * the renderer has no controlling TTY, so tmux aborts with
 * "open terminal failed: not a terminal". That path is intentionally gone: the
 * HTTP surface drives the SAME live tmux session truthfully, with no fake TTY.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { workspaceCodename } from '../lib/workspace-codename';
import type { ConductorSession } from '../types';

interface SessionTerminalProps {
  session: ConductorSession;
  /** Kept for API compatibility with callers; unused on the HTTP path. */
  tmuxBin?: string;
}

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/**
 * HTTP terminal: poll the live tmux pane output and send keys via the conductor
 * REST API. This is the single, reliable terminal path — no local-pty attach,
 * so no "not a terminal" failure can occur.
 */
function HttpTerminal({ session }: { session: ConductorSession }) {
  const screenRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const output = usePoll(() => api.sessionOutput(session.sessionId, 400), 2000, [session.sessionId]);

  useEffect(() => {
    const el = screenRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output.data]);

  async function send(keys: string) {
    if (!keys) return;
    setSendError(null);
    setBusy(true);
    try {
      // The backend sendKeys() appends `Enter` to every send-keys call, so a typed
      // line is executed and a control sequence (e.g. C-c) is followed by Enter.
      await api.sessionKeys(session.sessionId, keys);
      output.refresh();
    } catch (err) {
      setSendError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: Event) {
    e.preventDefault();
    const line = input;
    if (!line) return;
    setInput('');
    void send(line);
  }

  return (
    <div class="terminal-shell">
      <div class="terminal-mode">
        <span class="pill" title={session.tmuxName}>
          <span class="pill-dot" /> {workspaceCodename(session.sessionId)}
        </span>
        <span class="terminal-status">
          {output.loading && !output.data ? 'loading' : output.error ? 'error' : 'live'}
        </span>
      </div>
      <div class="terminal-screen terminal-screen-ro" ref={screenRef}>
        {output.error ? (
          <span class="log-error">Output unavailable: {output.error.message}</span>
        ) : output.data?.output ? (
          <pre class="terminal-buffer">{output.data.output}</pre>
        ) : (
          <span class="log-empty">Waiting for output…</span>
        )}
      </div>
      <form class="terminal-input-row" onSubmit={submit}>
        <input
          class="terminal-input"
          value={input}
          placeholder="Type a command and press Enter…"
          disabled={busy}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
        />
        <button class="btn btn-sm" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
        <button class="btn btn-sm" type="button" disabled={busy} onClick={() => void send('C-c')} title="Send Ctrl+C (interrupt)">^C</button>
      </form>
      {sendError && <p class="action-error">{sendError}</p>}
    </div>
  );
}

export function SessionTerminal({ session }: SessionTerminalProps) {
  // Always use the HTTP path: it reliably mirrors the live tmux pane and accepts
  // typing in both Electron and the browser. The old local-pty `tmux attach`
  // path is gone because the renderer has no TTY ("not a terminal").
  return <HttpTerminal session={session} />;
}
