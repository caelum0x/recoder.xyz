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
import {
  SyncHub,
  createSyncBackend,
  createWorkspaceStreamBackend,
  readWorkspaceId,
} from './live-events.js';

/** WS close code for a client that omitted the required `workspaceId`. */
const WS_POLICY_VIOLATION = 1008;

export interface TerminalStreamDeps {
  readonly logger: Logger;
  /**
   * Steer a live agent (send-keys). Injected by the composer, which routes it
   * through the governance gate + the substrate. Absent ⇒ steering is refused
   * truthfully rather than faked.
   */
  readonly steer?: (input: SteerInput, ctx: WsConnectionCtx) => Promise<void>;
}

export class TerminalStreamService implements TerminalStreamPort {
  private readonly hub = new SyncHub();
  /** Full-RunEvent fan-out for `/workspaces/:id/stream` (the conductor-ui client). */
  private readonly streamHub = new SyncHub();
  private readonly logger: Logger;
  private readonly steerFn: TerminalStreamDeps['steer'];

  constructor(deps: TerminalStreamDeps) {
    this.logger = deps.logger;
    this.steerFn = deps.steer;
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
    return this.hub.subscriberCount() + this.streamHub.subscriberCount();
  }

  /** The `/terminal` control-mode backend: live output + inbound steer keys. */
  private buildTerminalBackend(): WsBackend {
    const hub = this.hub;
    const logger = this.logger;
    const steerFn = this.steerFn;
    return {
      path: '/terminal',
      authScope: 'session',
      onConnection(socket: WebSocket, ctx: WsConnectionCtx): void {
        const workspaceId = readWorkspaceId(ctx);
        if (!workspaceId) {
          logger.warn({ requestId: ctx.requestId }, '/terminal upgrade missing workspaceId');
          socket.close(WS_POLICY_VIOLATION, 'workspaceId query param required');
          return;
        }
        const unsubscribe = hub.subscribe(workspaceId, socket);
        logger.info({ workspaceId, requestId: ctx.requestId }, '/terminal client attached');

        socket.on('message', (raw) => {
          const keys = decodeSteer(raw);
          if (keys === null) return;
          if (!steerFn) {
            if (socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify({ kind: 'error', text: 'steering unavailable' }));
            }
            return;
          }
          void steerFn({ workspaceId, keys, submit: true }, ctx).catch((err) => {
            logger.error({ err, workspaceId }, '/terminal steer failed');
            if (socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify({ kind: 'error', text: 'steer failed' }));
            }
          });
        });
        socket.on('close', unsubscribe);
        socket.on('error', unsubscribe);
      },
    };
  }
}

/** Decode an inbound `/terminal` frame into steer keys (JSON `{keys}` or raw text). */
function decodeSteer(raw: unknown): string | null {
  const text = frameToString(raw);
  if (text === null || text.length === 0) return null;
  try {
    const parsed = JSON.parse(text) as { keys?: unknown };
    if (typeof parsed.keys === 'string') return parsed.keys;
  } catch {
    // Not JSON — treat the raw frame as literal keystrokes.
  }
  return text;
}

/** Normalize a `ws` message payload (string | Buffer | ArrayBuffer | Buffer[]) to text. */
function frameToString(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (raw instanceof Buffer) return raw.toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw as Buffer[]).toString('utf8');
  return null;
}
