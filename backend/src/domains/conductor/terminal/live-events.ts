/**
 * `/sync` — the per-workspace RunEvent fan-out WsBackend + the subscription hub
 * both terminal paths share.
 *
 * Conflict #6: the EDGE owns the single `server.on('upgrade')` dispatcher, the
 * origin check, the on-upgrade auth, and the WS rate limit. This backend is
 * handed an ALREADY-AUTHORIZED socket (`ctx.principal` is resolved) and does one
 * thing: subscribe it to its workspace's live event stream (state changes, log
 * deltas, attention updates) and clean up on close. It never touches the raw
 * upgrade.
 *
 * The workspace is read from the `?workspaceId=` query the edge parsed; a missing
 * id closes the socket truthfully (never a silent no-op subscription).
 */
import type { WebSocket } from 'ws';
import type { WsBackend, WsConnectionCtx } from '../../edge/ports/ws-backend.port.js';
import type { WorkspaceSyncEvent } from '../ports/index.js';

/** WS close code for a client that omitted the required `workspaceId`. */
const WS_POLICY_VIOLATION = 1008;

/**
 * `SyncHub` — the workspace→sockets subscription registry both `/sync` and
 * `/terminal` publish through. Instance-scoped (never a process global) so the
 * composer, tests, and future backends each own their wiring.
 */
export class SyncHub {
  private readonly subscribers = new Map<string, Set<WebSocket>>();

  /** Subscribe a socket to a workspace's live stream; returns an unsubscribe fn. */
  subscribe(workspaceId: string, socket: WebSocket): () => void {
    let set = this.subscribers.get(workspaceId);
    if (!set) {
      set = new Set<WebSocket>();
      this.subscribers.set(workspaceId, set);
    }
    set.add(socket);
    return () => {
      const current = this.subscribers.get(workspaceId);
      if (!current) return;
      current.delete(socket);
      if (current.size === 0) this.subscribers.delete(workspaceId);
    };
  }

  /** Fan an event out to every OPEN socket subscribed to its workspace. */
  publish(event: WorkspaceSyncEvent): void {
    const set = this.subscribers.get(event.workspaceId);
    if (!set || set.size === 0) return;
    const frame = JSON.stringify(event);
    for (const socket of set) {
      if (socket.readyState === socket.OPEN) socket.send(frame);
    }
  }

  /** Count of live subscribers (truthful terminal health / metrics). */
  subscriberCount(): number {
    let total = 0;
    for (const set of this.subscribers.values()) total += set.size;
    return total;
  }
}

/** Read the required `workspaceId` from the parsed upgrade query, or undefined. */
export function readWorkspaceId(ctx: WsConnectionCtx): string | undefined {
  const raw = ctx.query.workspaceId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Build the `/sync` WsBackend over the shared hub. */
export function createSyncBackend(hub: SyncHub): WsBackend {
  return {
    path: '/sync',
    authScope: 'session',
    onConnection(socket: WebSocket, ctx: WsConnectionCtx): void {
      const workspaceId = readWorkspaceId(ctx);
      if (!workspaceId) {
        ctx.logger.warn({ requestId: ctx.requestId }, '/sync upgrade missing workspaceId');
        socket.close(WS_POLICY_VIOLATION, 'workspaceId query param required');
        return;
      }
      const unsubscribe = hub.subscribe(workspaceId, socket);
      ctx.logger.info({ workspaceId, requestId: ctx.requestId }, '/sync client attached');
      socket.on('close', unsubscribe);
      socket.on('error', unsubscribe);
    },
  };
}
