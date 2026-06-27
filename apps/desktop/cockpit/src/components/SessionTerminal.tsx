/**
 * SessionTerminal — drive ONE interactive tmux agent session.
 *
 * Two real backends, no mock data:
 *  - Electron node-pty bridge (window.recoderDesktop.spawnTerminal/...): a real
 *    local terminal. We `tmux attach` to the conductor session so the operator
 *    types straight into the live agent pane and sees its output streamed over IPC.
 *  - HTTP fallback (truthful): poll GET /sessions/:id/output and send keystrokes
 *    via POST /sessions/:id/keys. Used when the cockpit runs in a plain browser.
 *
 * Which path is active is shown explicitly so the operator is never misled.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import {
  getDesktopBridge,
  spawnedTerminalId,
  type RecoderDesktopBridge,
} from '../lib/desktop';
import type { ConductorSession } from '../types';

interface SessionTerminalProps {
  session: ConductorSession;
  tmuxBin?: string;
}

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) return `Backend error (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

/** Local-pty terminal: real tmux attach over the Electron node-pty bridge. */
function LocalTerminal({
  bridge,
  session,
  tmuxBin,
}: {
  bridge: RecoderDesktopBridge;
  session: ConductorSession;
  tmuxBin?: string;
}) {
  const screenRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const [buffer, setBuffer] = useState('');
  const [status, setStatus] = useState<'starting' | 'attached' | 'exited' | 'error'>('starting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let offData: (() => void) | null = null;
    let offExit: (() => void) | null = null;

    async function attach() {
      try {
        const tmux = tmuxBin || 'tmux';
        // Attach the operator's local pty directly to the live conductor tmux session.
        const result = await bridge.spawnTerminal({
          shell: '/bin/sh',
          cwd: session.worktreePath || session.repoPath,
          cols: 120,
          rows: 32,
          env: {},
        });
        if (disposed) return;
        const id = spawnedTerminalId(result);
        idRef.current = id;

        offData = bridge.onTerminalData((msg) => {
          if (msg.id !== id) return;
          setBuffer((prev) => (prev + msg.data).slice(-200_000));
        });
        offExit = bridge.onTerminalExit((msg) => {
          if (msg.id !== id) return;
          setStatus('exited');
        });

        // Run the tmux attach inside the freshly spawned shell pty.
        const cmd = `exec ${tmux} attach -t ${session.tmuxName}\n`;
        await bridge.terminalWrite(id, cmd);
        if (!disposed) setStatus('attached');
      } catch (err) {
        if (!disposed) {
          setError(describeError(err));
          setStatus('error');
        }
      }
    }

    void attach();

    return () => {
      disposed = true;
      offData?.();
      offExit?.();
      const id = idRef.current;
      if (id) {
        // Detach by killing our local pty (does NOT kill the tmux session itself).
        void bridge.terminalKill(id).catch(() => undefined);
      }
    };
  }, [bridge, session.tmuxName, session.worktreePath, session.repoPath, tmuxBin]);

  useEffect(() => {
    const el = screenRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [buffer]);

  function onKeyDown(e: KeyboardEvent) {
    const id = idRef.current;
    if (!id) return;
    let data: string | null = null;
    if (e.key === 'Enter') data = '\r';
    else if (e.key === 'Backspace') data = '\x7f';
    else if (e.key === 'Tab') data = '\t';
    else if (e.key === 'Escape') data = '\x1b';
    else if (e.key === 'ArrowUp') data = '\x1b[A';
    else if (e.key === 'ArrowDown') data = '\x1b[B';
    else if (e.key === 'ArrowRight') data = '\x1b[C';
    else if (e.key === 'ArrowLeft') data = '\x1b[D';
    else if (e.ctrlKey && e.key.length === 1) {
      const code = e.key.toUpperCase().charCodeAt(0) - 64;
      if (code >= 0 && code < 32) data = String.fromCharCode(code);
    } else if (e.key.length === 1) data = e.key;

    if (data !== null) {
      e.preventDefault();
      void bridge.terminalWrite(id, data).catch(() => undefined);
    }
  }

  return (
    <div class="terminal-shell">
      <div class="terminal-mode">
        <span class={`pill ${status === 'attached' ? 'pill-good' : status === 'error' ? 'pill-bad' : ''}`}>
          <span class="pill-dot" /> local pty · tmux attach {session.tmuxName}
        </span>
        <span class="terminal-status">{status}</span>
      </div>
      {error && <p class="action-error">{error}</p>}
      <div
        class="terminal-screen"
        ref={screenRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        role="textbox"
        aria-label="Live terminal — click and type to drive the agent"
      >
        {buffer ? <pre class="terminal-buffer">{buffer}</pre> : <span class="log-empty">Attaching…</span>}
      </div>
      <p class="terminal-hint">Click the screen and type to drive the agent. Ctrl+C, arrows, Tab and Enter are forwarded.</p>
    </div>
  );
}

/** HTTP fallback terminal: poll output + send keys via the conductor REST API. */
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
        <span class="pill">
          <span class="pill-dot" /> http · /sessions/{session.sessionId.slice(0, 10)}…/output
        </span>
        <span class="terminal-status">{output.loading && !output.data ? 'loading' : output.error ? 'error' : 'polling'}</span>
      </div>
      <div class="terminal-screen terminal-screen-ro" ref={screenRef}>
        {output.error ? (
          <span class="log-error">Output unavailable: {output.error.message}</span>
        ) : output.data?.output ? (
          <pre class="terminal-buffer">{output.data.output}</pre>
        ) : (
          <span class="log-empty">No pane output yet.</span>
        )}
      </div>
      <form class="terminal-input-row" onSubmit={submit}>
        <input
          class="terminal-input"
          value={input}
          placeholder="Type a command and press Enter (sent via /sessions/:id/keys)…"
          disabled={busy}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
        />
        <button class="btn btn-sm" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
        <button class="btn btn-sm" type="button" disabled={busy} onClick={() => void send('C-c')} title="Send Ctrl+C">^C</button>
      </form>
      {sendError && <p class="action-error">{sendError}</p>}
      <p class="terminal-hint">
        No local terminal bridge — driving the live tmux session over HTTP via <code>tmux send-keys</code> (Enter is appended server-side).
      </p>
    </div>
  );
}

export function SessionTerminal({ session, tmuxBin }: SessionTerminalProps) {
  const bridge = getDesktopBridge();
  if (bridge) return <LocalTerminal bridge={bridge} session={session} tmuxBin={tmuxBin} />;
  return <HttpTerminal session={session} />;
}
