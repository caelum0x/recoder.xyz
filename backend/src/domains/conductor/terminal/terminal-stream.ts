/**
 * `TerminalStreamService` — the conductor's {@link TerminalStreamPort} impl and
 * the source of the two WsBackends the edge upgrade-router registers (conflict
 * #6): `/terminal` (control-mode terminal stream + `send-keys` steer) and `/sync`
 * (per-workspace RunEvent fan-out).
 *
 * The service owns the shared {@link SyncHub}; the run-tailer publishes live
 * events into it through {@link publishSync}, and both backends stream from it.
 * `/terminal` additionally accepts inbound frames and forwards them to the
 * injected `steer` handler (the composer routes steering through the governance
 * gate before it touches a live session), so this surface stays free of substrate
 * and policy code.
 *
 * DEGRADE-SAFE: a socket with no `workspaceId` is closed truthfully; a steer with
 * no handler wired replies with a truthful "steering unavailable" frame rather
 * than silently dropping the keystrokes.
 */
import type { WebSocket } from 'ws';
import type { WsBackend, WsConnectionCtx } from '../../edge/ports/ws-backend.port.js';
import type { Logger } from '../../../shared/logger.js';
import type { TerminalStreamPort, WorkspaceSyncEvent } from '../ports/index.js';
import type { SteerInput } from '../types.js';
import type { InteractiveTerminalSession } from '../ports/interactive-terminal.port.js';
import {
  SyncHub,
  createSyncBackend,
  createWorkspaceStreamBackend,
  readWorkspaceId,
} from './live-events.js';

/** WS close code for a client that omitted the required `workspaceId`. */
const WS_POLICY_VIOLATION = 1008;

/**
 * Frames retained per workspace for the `?since=` resume path (DT-7.3). Bounds
 * memory to a recent window; a client offline longer than this replays what is
 * still retained and resumes live (the ring reports a truthful history gap).
 */
const SYNC_HISTORY_LIMIT = 512;

export interface TerminalStreamDeps {
  readonly logger: Logger;
  /**
   * Steer a live agent (send-keys). Injected by the composer, which routes it
   * through the governance gate + the substrate. Absent ⇒ steering is refused
   * truthfully rather than faked.
   */
  readonly steer?: (input: SteerInput, ctx: WsConnectionCtx) => Promise<void>;
  /** Resolve and authorize a workspace before opening its rendered pane. */
  readonly attach?: (
    workspaceId: string,
    cols: number,
    rows: number,
    ctx: WsConnectionCtx
  ) => Promise<InteractiveTerminalSession>;
}

export class TerminalStreamService implements TerminalStreamPort {
  private readonly hub = new SyncHub({ historyLimit: SYNC_HISTORY_LIMIT });
  /** Full-RunEvent fan-out for `/workspaces/:id/stream` (the conductor-ui client). */
  private readonly streamHub = new SyncHub({ historyLimit: SYNC_HISTORY_LIMIT });
  private readonly logger: Logger;
  private readonly steerFn: TerminalStreamDeps['steer'];
  private readonly attachFn: TerminalStreamDeps['attach'];
  private readonly terminalSockets = new Set<WebSocket>();

  constructor(deps: TerminalStreamDeps) {
    this.logger = deps.logger;
    this.steerFn = deps.steer;
    this.attachFn = deps.attach;
  }

  terminalBackends(): readonly WsBackend[] {
    return [
      this.buildTerminalBackend(),
      createSyncBackend(this.hub),
      createWorkspaceStreamBackend(this.streamHub),
    ];
  }

  publishSync(event: WorkspaceSyncEvent): void {
    this.hub.publish(event);
  }

  /** Publish a FULL RunEvent to the workspace's `/stream` subscribers. */
  publishRunEvent(workspaceId: string, event: unknown): void {
    this.streamHub.publishRaw(workspaceId, event);
  }

  /** Live subscriber count across all paths (truthful terminal health). */
  liveConnections(): number {
    return this.terminalSockets.size + this.hub.subscriberCount() + this.streamHub.subscriberCount();
  }

  /** The `/terminal` control-mode backend: live output + inbound steer keys. */
  private buildTerminalBackend(): WsBackend {
    const logger = this.logger;
    const steerFn = this.steerFn;
    const attachFn = this.attachFn;
    const terminalSockets = this.terminalSockets;
    return {
      path: '/terminal',
      authScope: 'session',
      async onConnection(socket: WebSocket, ctx: WsConnectionCtx): Promise<void> {
        const workspaceId = readWorkspaceId(ctx);
        if (!workspaceId) {
          logger.warn({ requestId: ctx.requestId }, '/terminal upgrade missing workspaceId');
          socket.close(WS_POLICY_VIOLATION, 'workspaceId query param required');
          return;
        }
        if (!attachFn) {
          sendTerminalError(socket, 'interactive terminal unavailable');
          socket.close(1011, 'interactive terminal unavailable');
          return;
        }

        let terminal: InteractiveTerminalSession;
        try {
          terminal = await attachFn(
            workspaceId,
            readDimension(ctx, 'cols', 120),
            readDimension(ctx, 'rows', 36),
            ctx
          );
        } catch (err) {
          logger.warn({ err, workspaceId, requestId: ctx.requestId }, '/terminal attach refused');
          sendTerminalError(socket, 'interactive terminal unavailable');
          socket.close(WS_POLICY_VIOLATION, 'interactive terminal unavailable');
          return;
        }

        terminalSockets.add(socket);
        logger.info({ workspaceId, requestId: ctx.requestId }, '/terminal client attached');
        let inputChain = Promise.resolve();

        const cleanup = (): void => {
          terminalSockets.delete(socket);
          terminal.close();
        };

        socket.on('message', (raw) => {
          const command = decodeTerminalCommand(raw);
          if (command == null) return;
          if (command.type === 'resize') {
            terminal.resize(command.cols, command.rows);
            return;
          }
          if (command.type === 'scroll') {
            terminal.scroll(command.direction, command.lines);
            return;
          }
          if (!steerFn) {
            sendTerminalError(socket, 'steering unavailable');
            return;
          }
          inputChain = inputChain
            .then(() => steerFn({ workspaceId, keys: command.data, submit: false }, ctx))
            .catch((err) => {
              logger.error({ err, workspaceId }, '/terminal input failed');
              sendTerminalError(socket, 'terminal input failed');
            });
        });
        socket.on('close', cleanup);
        socket.on('error', cleanup);

        try {
          for await (const event of terminal) {
            if (socket.readyState !== socket.OPEN) break;
            socket.send(JSON.stringify(event));
          }
        } catch (err) {
          logger.error({ err, workspaceId }, '/terminal renderer failed');
          sendTerminalError(socket, 'terminal renderer disconnected');
        } finally {
          cleanup();
          if (socket.readyState === socket.OPEN) socket.close(1000, 'terminal closed');
        }
      },
    };
  }
}

/** Decode an inbound `/terminal` frame into steer keys (JSON `{keys}` or raw text). */
type TerminalCommand =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'scroll'; direction: 'up' | 'down'; lines: number };

function decodeTerminalCommand(raw: unknown): TerminalCommand | null {
  const text = frameToString(raw);
  if (text === null || text.length === 0) return null;
  try {
    const parsed = JSON.parse(text) as {
      type?: unknown;
      data?: unknown;
      keys?: unknown;
      cols?: unknown;
      rows?: unknown;
      direction?: unknown;
      lines?: unknown;
    };
    if (
      parsed.type === 'terminal.resize' &&
      typeof parsed.cols === 'number' &&
      typeof parsed.rows === 'number' &&
      Number.isInteger(parsed.cols) &&
      Number.isInteger(parsed.rows) &&
      parsed.cols > 0 && parsed.rows > 0
    ) {
      return { type: 'resize', cols: parsed.cols, rows: parsed.rows };
    }
    if (
      parsed.type === 'terminal.scroll' &&
      (parsed.direction === 'up' || parsed.direction === 'down') &&
      typeof parsed.lines === 'number' &&
      Number.isInteger(parsed.lines) &&
      parsed.lines > 0
    ) {
      return { type: 'scroll', direction: parsed.direction, lines: parsed.lines };
    }
    if (parsed.type === 'terminal.input' && typeof parsed.data === 'string') {
      return { type: 'input', data: parsed.data };
    }
    if (typeof parsed.keys === 'string') return { type: 'input', data: parsed.keys };
  } catch {
    // Not JSON — treat the raw frame as literal keystrokes.
  }
  return { type: 'input', data: text };
}

function sendTerminalError(socket: WebSocket, message: string): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({ type: 'terminal.error', message }));
  }
}

function readDimension(
  ctx: WsConnectionCtx,
  key: 'cols' | 'rows',
  fallback: number
): number {
  const raw = ctx.query[key];
  const value = typeof raw === 'string' ? Number(raw) : Number.NaN;
  return Number.isInteger(value) && value > 0 && value <= 1000 ? value : fallback;
}

/** Normalize a `ws` message payload (string | Buffer | ArrayBuffer | Buffer[]) to text. */
function frameToString(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (raw instanceof Buffer) return raw.toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw as Buffer[]).toString('utf8');
  return null;
}
