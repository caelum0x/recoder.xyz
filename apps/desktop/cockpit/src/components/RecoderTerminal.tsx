/**
 * RecoderTerminal — a REAL embedded terminal, the heart of the Recoder Terminal
 * vision (docs/architecture/RECODER-TERMINAL-VISION.md).
 *
 * It is NOT a chat reskin and NOT a text-mirror: it renders a genuine xterm.js
 * terminal (the same engine Wave / VS Code / cmux are built on) bound to a real
 * PTY in the Electron main process via the preload `recoderDesktop` bridge
 * (terminal:spawn/write/resize/kill + terminal:data/exit). The PTY can run the
 * real interactive CLI (`claude`, `codex`, `pi`) or attach to the agent's tmux
 * session — the native experience users love, embedded and orchestrated.
 *
 * The xterm wiring (Terminal + FitAddon + onData) follows Wave Terminal's
 * `frontend/app/view/term/termwrap.ts` pattern — reused, not reinvented.
 *
 * Degrade-safe: outside Electron (plain browser, no `recoderDesktop`) it renders
 * a truthful notice instead of a fake terminal.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

/** The preload bridge shape we use (a subset of window.recoderDesktop). */
interface DesktopTerminalBridge {
  spawnTerminal: (options: {
    command?: string;
    args?: string[];
    cwd?: string;
    cols?: number;
    rows?: number;
    env?: Record<string, string>;
  }) => Promise<{ id: string; success: boolean }>;
  terminalWrite: (id: string, data: string) => Promise<boolean>;
  terminalResize: (id: string, cols: number, rows: number) => Promise<boolean>;
  terminalKill: (id: string) => Promise<boolean>;
  onTerminalData: (cb: (payload: { id: string; data: string }) => void) => () => void;
  onTerminalExit: (cb: (payload: { id: string; exitCode: number }) => void) => () => void;
}

function getBridge(): DesktopTerminalBridge | null {
  const w = window as unknown as { recoderDesktop?: DesktopTerminalBridge };
  return w.recoderDesktop && typeof w.recoderDesktop.spawnTerminal === 'function'
    ? w.recoderDesktop
    : null;
}

export interface RecoderTerminalProps {
  /** The command to run in the PTY. Omit for a plain login shell. */
  command?: string;
  /** Arguments for the command (e.g. ['attach', '-t', '<session>'] for tmux). */
  args?: string[];
  /** Working directory for the PTY (e.g. the workspace worktree). */
  cwd?: string;
  /** Extra env for the PTY (e.g. pinning the vendored tmux bin). */
  env?: Record<string, string>;
}

/**
 * The Recoder terminal theme — muted, Cursor-style, low-vibrance so a real
 * terminal feels calm and non-scary (the "play psychological" principle).
 */
const RECODER_TERM_THEME = {
  background: '#181818',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#181818',
  selectionBackground: '#33415555',
  black: '#1e1e1e',
  brightBlack: '#5a5a5a',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#d4d4d4',
  brightWhite: '#ffffff',
};

export function RecoderTerminal({ command, args, cwd, env }: RecoderTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [exited, setExited] = useState<number | null>(null);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) {
      setUnsupported(true);
      return;
    }
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 12.5,
      lineHeight: 1.2,
      theme: RECODER_TERM_THEME,
      allowProposedApi: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try {
      fit.fit();
    } catch {
      /* host not laid out yet — a later resize will fit */
    }

    let ptyId: string | null = null;
    let disposed = false;
    let offData: (() => void) | undefined;
    let offExit: (() => void) | undefined;

    // PTY output → terminal (filtered to THIS pty id).
    offData = bridge.onTerminalData(({ id, data }) => {
      if (id === ptyId) term.write(data);
    });
    offExit = bridge.onTerminalExit(({ id, exitCode }) => {
      if (id === ptyId && !disposed) setExited(exitCode);
    });

    // Terminal input → PTY.
    const inputSub = term.onData((data) => {
      if (ptyId) void bridge.terminalWrite(ptyId, data);
    });

    // Spawn the PTY with the current terminal geometry.
    void bridge
      .spawnTerminal({
        command,
        args,
        cwd,
        env,
        cols: term.cols,
        rows: term.rows,
      })
      .then((res) => {
        if (disposed) {
          if (res?.id) void bridge.terminalKill(res.id);
          return;
        }
        ptyId = res?.id ?? null;
      })
      .catch(() => setUnsupported(true));

    // Keep the PTY sized to the rendered terminal.
    const resize = () => {
      try {
        fit.fit();
      } catch {
        return;
      }
      if (ptyId) void bridge.terminalResize(ptyId, term.cols, term.rows);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    return () => {
      disposed = true;
      ro.disconnect();
      inputSub.dispose();
      offData?.();
      offExit?.();
      if (ptyId) void bridge.terminalKill(ptyId);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command, JSON.stringify(args), cwd]);

  if (unsupported) {
    return (
      <div class="rterm-unsupported">
        The live terminal runs in the Recoder desktop app. Open this workspace in
        Recoder Desktop to use the embedded terminal.
      </div>
    );
  }

  return (
    <div class="rterm">
      <div class="rterm-host" ref={hostRef} />
      {exited !== null && (
        <div class="rterm-exited">Session ended{exited ? ` (code ${exited})` : ''}.</div>
      )}
    </div>
  );
}
