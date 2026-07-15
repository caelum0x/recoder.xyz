/**
 * `WsBackend` — THE WebSocket seam. The edge owns the single
 * `server.on('upgrade')` dispatcher (conflict #6): it performs the origin check,
 * resolves the caller on upgrade (session cookie/bearer or `INTERNAL_SERVICE_KEY`
 * per `authScope`), applies the WS rate limit, then hands the already-authorized
 * socket to the registered backend for its `path`. Stream backends
 * (`/terminal` → substrate pty, `/sync` → RunEvent bus, and future domains)
 * implement this and are registered with the upgrade router — they never touch
 * the raw HTTP upgrade, auth, or rate limit themselves.
 *
 * FROZEN CONTRACT — Phase 4 seam. `onConnection` is invoked ONLY after the edge
 * has authorized the upgrade, so `ctx.principal` is always a resolved identity.
 */
import type { WebSocket } from 'ws';
import type { Logger } from '../../../shared/logger.js';
import type { Principal } from '../../identity/types.js';

/** How the upgrade router authorizes a connection before dispatching it. */
export type WsAuthScope = 'session' | 'internal';

/**
 * The per-connection context the edge resolves at upgrade and hands to the
 * backend. Everything untrusted (origin, query) has already been checked; the
 * `principal` is the resolved identity the backend scopes its stream to.
 */
export interface WsConnectionCtx {
  /** The resolved caller — never `null` (an unauthenticated upgrade is closed). */
  readonly principal: Principal;
  /** Correlation id threaded from the upgrade request into the socket's logs. */
  readonly requestId: string;
  /** The matched upgrade path (e.g. `/terminal`). */
  readonly path: string;
  /** Parsed query string of the upgrade URL. */
  readonly query: Readonly<Record<string, string | readonly string[] | undefined>>;
  /** The validated `Origin` header, when present. */
  readonly origin?: string;
  /** Child logger bound to `{ domain:'edge', ws:path, requestId }`. */
  readonly logger: Logger;
}

/**
 * The contract a WS stream backend implements. The upgrade router matches an
 * inbound upgrade to the backend whose `path` equals the request path, enforces
 * `authScope`, then calls `onConnection` with the live socket + resolved context.
 */
export interface WsBackend {
  /** The exact upgrade path this backend serves (e.g. `/terminal` | `/sync`). */
  readonly path: string;
  /** The credential class the edge requires before dispatching to this backend. */
  readonly authScope: WsAuthScope;
  /** Handle an authorized connection. May be async; rejections close the socket. */
  onConnection(socket: WebSocket, ctx: WsConnectionCtx): void | Promise<void>;
}
