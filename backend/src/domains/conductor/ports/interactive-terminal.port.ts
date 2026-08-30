/** One rendered ANSI frame from an interactive substrate terminal. */
export interface InteractiveTerminalFrame {
  readonly type: 'terminal.frame';
  readonly seq: number;
  readonly encoding: 'ansi';
  readonly width: number;
  readonly height: number;
  readonly full: boolean;
  readonly bytes: string;
}

export interface InteractiveTerminalClosed {
  readonly type: 'terminal.closed';
  readonly reason?: string;
}

export type InteractiveTerminalEvent = InteractiveTerminalFrame | InteractiveTerminalClosed;

/** A live pane renderer. Input remains on the conductor's governed steer path. */
export interface InteractiveTerminalSession extends AsyncIterable<InteractiveTerminalEvent> {
  resize(cols: number, rows: number): void;
  scroll(direction: 'up' | 'down', lines: number): void;
  close(): void;
}

export interface InteractiveTerminalAttachInput {
  readonly paneId: string;
  /** Canonical workspace substrate; lets one terminal edge render every backend. */
  readonly substrate: string;
  readonly cols: number;
  readonly rows: number;
}

export interface InteractiveTerminalPort {
  attach(input: InteractiveTerminalAttachInput): Promise<InteractiveTerminalSession>;
}
