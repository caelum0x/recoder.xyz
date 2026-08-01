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
import { RunEventRing } from './run-event-ring.js';

/** WS close code for a client that omitted the required `workspaceId`. */
const WS_POLICY_VIOLATION = 1008;

/**
 * Additively stamp the ring's monotonic numeric id onto an outgoing frame as
 * `seq`, so a reconnecting client can read the cursor to resume from (`?since=`).
 * Every original field is kept byte-intact — consumers key off their known fields
 * and ignore `seq`. A non-object payload is returned unchanged (nothing to stamp).
 */
function stampSeq(payload: unknown, seq: number): unknown {
  if (payload === null || typeof payload !== 'object') return payload;
  return { ...(payload as Record<string, unknown>), seq };
}

/** Optional wiring for {@link SyncHub}. */
export interface SyncHubOptions {
  /**
   * Frames retained per workspace for the resume (`?since=`) path. `0` or omitted
   * keeps the hub history-less — the pre-DT-7.3 behavior — so existing callers and
   * clients that never pass `since` are byte-for-byte unaffected.
   */
  readonly historyLimit?: number;
}

/**
 * `SyncHub` — the workspace→sockets subscription registry both `/sync` and
 * `/terminal` publish through. Instance-scoped (never a process global) so the
 * composer, tests, and future backends each own their wiring.
 *
 * When constructed with a positive `historyLimit`, every fanned frame is also
 * stamped with a monotonic per-workspace id and retained in a bounded
 * {@link RunEventRing}, so a reconnecting client can {@link replaySince} the
 * frames it missed and then continue live. That numeric id also rides the wire
 * as an additive `seq` field (DT-7.3a) — every original field stays byte-intact,
 * so field-reading consumers are unaffected while a client gains the cursor it
 * needs to resume. A hub built WITHOUT a history limit assigns no id and its live
 * wire stays byte-for-byte bare — exactly as before.
 */
export class SyncHub {
  private readonly subscribers = new Map<string, Set<WebSocket>>();
  /** Bounded replay buffer, present only when a `historyLimit` was configured. */
  private readonly ring?: RunEventRing;

  constructor(options: SyncHubOptions = {}) {
    const limit = options.historyLimit ?? 0;
    this.ring = limit > 0 ? new RunEventRing(limit) : undefined;
  }

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
    this.publishRaw(event.workspaceId, event);
  }

  /** Fan an arbitrary JSON payload out to a workspace's subscribers. */
  publishRaw(workspaceId: string, payload: unknown): void {
    // Stamp + retain for the resume path BEFORE fan-out (no-op when history-less).
    // Retaining even with zero live subscribers lets a client that reconnects
    // during a quiet window still replay what it missed.
    const seq = this.ring?.append(workspaceId, payload);
    const set = this.subscribers.get(workspaceId);
    if (!set || set.size === 0) return;
    // History-less hubs assign no id, so the live wire stays byte-for-byte bare.
    const frame = JSON.stringify(seq === undefined ? payload : stampSeq(payload, seq));
    for (const socket of set) {
      if (socket.readyState === socket.OPEN) socket.send(frame);
    }
  }

  /** Whether this hub retains history for the `?since=` replay path. */
  historyEnabled(): boolean {
    return this.ring !== undefined;
  }

  /** The latest monotonic frame id stamped for a workspace (0 if none / history-less). */
  lastEventId(workspaceId: string): number {
    return this.ring?.lastEventId(workspaceId) ?? 0;
  }

  /**
   * Replay the retained frames strictly newer than `sinceId` to a single socket,
   * oldest-first, in the SAME wire shape the live stream uses (each frame carries
   * its additive `seq`) — then the caller subscribes the socket for the live
   * continuation. Returns the latest id
   * known for the workspace so the caller can log/track the resume cursor. A no-op
   * (returns 0) when the hub is history-less or the socket is not OPEN.
   *
   * Callers MUST invoke this synchronously immediately before {@link subscribe}:
   * publishing is single-threaded and synchronous, so replay-then-subscribe with
   * no `await` in between delivers every buffered frame up to the current latest
   * and every subsequent frame live, with no gap and no duplicate.
   */
  replaySince(workspaceId: string, socket: WebSocket, sinceId: number): number {
    if (!this.ring) return 0;
    if (socket.readyState !== socket.OPEN) return this.ring.lastEventId(workspaceId);
    for (const entry of this.ring.since(workspaceId, sinceId)) {
      if (socket.readyState !== socket.OPEN) break;
      socket.send(JSON.stringify(stampSeq(entry.payload, entry.eventId)));
    }
    return this.ring.lastEventId(workspaceId);
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

/**
 * Read the optional resume cursor from `?since=<eventId>`. Returns the parsed
 * non-negative integer id, or `undefined` when absent or malformed — an absent /
 * invalid cursor means "no replay", so a client that never passes `since` (or
 * passes garbage) gets exactly the pre-DT-7.3 live-only behavior.
 */
export function readSince(ctx: WsConnectionCtx): number | undefined {
  const raw = ctx.query.since;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

/**
 * Build the run-screen live-stream WsBackend the shared `@recoder/conductor-ui`
 * client connects to: `/api/conductor/workspaces/:id/stream`. Registered under
 * the `/api/conductor/workspaces` PREFIX (the upgrade router dispatches by
 * longest prefix); only the exact `/:id/stream` suffix is accepted — any other
 * subpath upgrade is closed truthfully. Frames are FULL RunEvents (bare JSON),
 * exactly what the client's `parseRunEvent` consumes — unlike `/sync`, which
 * carries the narrowed WorkspaceSyncEvent shape.
 */
export function createWorkspaceStreamBackend(runHub: SyncHub): WsBackend {
  return {
    path: '/api/conductor/workspaces',
    authScope: 'session',
    onConnection(socket: WebSocket, ctx: WsConnectionCtx): void {
      const match = /^\/api\/conductor\/workspaces\/([^/]+)\/stream$/.exec(ctx.path);
      const workspaceId = match ? decodeURIComponent(match[1]) : undefined;
      if (!workspaceId) {
        ctx.logger.warn({ path: ctx.path, requestId: ctx.requestId }, 'stream upgrade path not a workspace stream');
        socket.close(WS_POLICY_VIOLATION, 'expected /workspaces/:id/stream');
        return;
      }
      // Resume: replay missed frames FIRST (synchronous), then subscribe live so
      // the continuation has no gap and no duplicate. Absent `since` ⇒ live-only.
      const since = readSince(ctx);
      if (since !== undefined) {
        const cursor = runHub.replaySince(workspaceId, socket, since);
        ctx.logger.info({ workspaceId, since, cursor, requestId: ctx.requestId }, 'workspace stream client resumed');
      }
      const unsubscribe = runHub.subscribe(workspaceId, socket);
      ctx.logger.info({ workspaceId, requestId: ctx.requestId }, 'workspace stream client attached');
      socket.on('close', unsubscribe);
      socket.on('error', unsubscribe);
    },
  };
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
      // Resume: replay missed frames FIRST (synchronous), then subscribe live.
      const since = readSince(ctx);
      if (since !== undefined) {
        const cursor = hub.replaySince(workspaceId, socket, since);
        ctx.logger.info({ workspaceId, since, cursor, requestId: ctx.requestId }, '/sync client resumed');
      }
      const unsubscribe = hub.subscribe(workspaceId, socket);
      ctx.logger.info({ workspaceId, requestId: ctx.requestId }, '/sync client attached');
      socket.on('close', unsubscribe);
      socket.on('error', unsubscribe);
    },
  };
}
