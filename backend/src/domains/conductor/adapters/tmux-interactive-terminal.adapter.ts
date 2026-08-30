/**
 * Interactive terminal renderer for conductor-owned tmux workspaces.
 *
 * Output is a bounded, full-screen capture from the exact session Conductor
 * launched. Input deliberately does not live here: `/terminal` routes every
 * keystroke through the governed steer transport. This adapter therefore owns
 * presentation and viewport state only, matching Loom's observe-mode contract.
 */
import { execFileSafe, type LoggerPort } from '@recoder/substrate';
import type {
  InteractiveTerminalAttachInput,
  InteractiveTerminalEvent,
  InteractiveTerminalPort,
  InteractiveTerminalSession,
} from '../ports/interactive-terminal.port.js';
import type { ConductorConfig } from '../config.js';
import type { ExecFn } from './tmux-substrate.adapter.js';

const CAPTURE_LINES = 500;
const POLL_MS = 140;
const MAX_SCROLL_OFFSET = 4_500;
const TMUX_TARGET = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/;

const NOOP_LOGGER: LoggerPort = {
  info() {},
  warn() {},
  error() {},
};

export interface CreateTmuxInteractiveTerminalDeps {
  readonly config: Pick<ConductorConfig, 'tmuxBin'>;
  readonly logger?: LoggerPort;
  readonly exec?: ExecFn;
  readonly pollMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class TmuxInteractiveTerminalSession implements InteractiveTerminalSession {
  private closed = false;
  private cols: number;
  private rows: number;
  private scrollOffset = 0;
  private seq = 0;

  constructor(
    private readonly paneId: string,
    cols: number,
    rows: number,
    private readonly tmuxBin: string,
    private readonly exec: ExecFn,
    private readonly pollMs: number,
    private readonly logger: LoggerPort
  ) {
    this.cols = cols;
    this.rows = rows;
  }

  resize(cols: number, rows: number): void {
    if (this.closed || cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    // A renderer is a real tmux client from the operator's point of view, so its
    // viewport drives the window size even though no second PTY is created.
    void this.exec(this.tmuxBin, [
      'resize-window',
      '-t',
      this.paneId,
      '-x',
      String(cols),
      '-y',
      String(rows),
    ]).catch(err => {
      this.logger.warn('tmux interactive resize failed', { paneId: this.paneId, err });
    });
  }

  scroll(direction: 'up' | 'down', lines: number): void {
    if (this.closed) return;
    const delta = Math.max(1, Math.min(lines, CAPTURE_LINES));
    this.scrollOffset = direction === 'up'
      ? Math.min(MAX_SCROLL_OFFSET, this.scrollOffset + delta)
      : Math.max(0, this.scrollOffset - delta);
  }

  close(): void {
    this.closed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<InteractiveTerminalEvent> {
    let previous = '';
    while (!this.closed) {
      const start = -(CAPTURE_LINES + this.scrollOffset);
      const args = [
        'capture-pane',
        '-p',
        '-e',
        '-J',
        '-t',
        this.paneId,
        '-S',
        String(start),
        ...(this.scrollOffset > 0 ? ['-E', String(-this.scrollOffset)] : []),
      ];
      try {
        const { stdout } = await this.exec(this.tmuxBin, args);
        // capture-pane returns a screen snapshot, not an incremental PTY stream.
        // Clear + home makes `full:true` truthful and prevents duplicate output.
        const screen = `\x1b[2J\x1b[H${stdout}`;
        if (screen !== previous) {
          previous = screen;
          yield {
            type: 'terminal.frame',
            seq: ++this.seq,
            encoding: 'ansi',
            width: this.cols,
            height: this.rows,
            full: true,
            bytes: Buffer.from(screen, 'utf8').toString('base64'),
          };
        }
      } catch (err) {
        if (!this.closed) {
          this.logger.warn('tmux interactive capture ended', { paneId: this.paneId, err });
          yield { type: 'terminal.closed', reason: 'tmux session ended' };
        }
        return;
      }
      await delay(this.pollMs);
    }
  }
}

/** Build the tmux half of the shared Recoder `/terminal` renderer. */
export function createTmuxInteractiveTerminal(
  deps: CreateTmuxInteractiveTerminalDeps
): InteractiveTerminalPort {
  const exec: ExecFn = deps.exec ?? execFileSafe;
  const logger = deps.logger ?? NOOP_LOGGER;
  const tmuxBin = deps.config.tmuxBin ?? 'tmux';
  const pollMs = Math.max(50, deps.pollMs ?? POLL_MS);

  return {
    async attach(input: InteractiveTerminalAttachInput): Promise<InteractiveTerminalSession> {
      if (input.substrate !== 'tmux_worktree') {
        throw new Error(`tmux terminal cannot render substrate ${input.substrate}`);
      }
      if (!TMUX_TARGET.test(input.paneId)) {
        throw new Error('invalid tmux terminal target');
      }
      await exec(tmuxBin, ['has-session', '-t', input.paneId]);
      return new TmuxInteractiveTerminalSession(
        input.paneId,
        input.cols,
        input.rows,
        tmuxBin,
        exec,
        pollMs,
        logger
      );
    },
  };
}
