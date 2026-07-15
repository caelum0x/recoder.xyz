/**
 * The edge WebSocket upgrade router — the SINGLE owner of `server.on('upgrade')`
 * (conflict #6). No domain touches the raw HTTP upgrade, WS auth, or WS rate limit
 * itself: stream backends implement {@link WsBackend} and register here, and this
 * router performs, in order, for every inbound upgrade:
 *
 *   1. path dispatch   — match the request path to a registered backend (longest
 *                        matching prefix wins); no match ⇒ 404 + socket destroy.
 *   2. origin check    — the SAME allowlist the HTTP CORS layer enforces
 *                        (`isOriginAllowed`); a disallowed browser origin ⇒ 403.
 *   3. auth on upgrade — resolve the credential via the Phase-2 {@link SessionVerifier};
 *                        `null` ⇒ 401, a verifier fault ⇒ 503, and an `internal`-scope
 *                        backend additionally requires a `kind: 'internal'` principal.
 *   4. rate limit      — seed the per-connection frame budget; over budget ⇒ 429.
 *   5. dispatch        — `handleUpgrade` the socket and hand it to the backend with
 *                        an already-authorized {@link WsConnectionCtx}. Inbound frames
 *                        are budgeted by the same limiter (close 1013 on breach).
 *
 * A deliberately EMPTY registry is a valid state: the terminal `/terminal` backend
 * is registered by the conductor in Phase 5. This is the seam it plugs into.
 */
import { randomUUID } from 'node:crypto';
import type { Server, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Request } from 'express';
import type { Logger } from '../../shared/logger.js';
import type { SessionVerifier } from '../../domains/identity/ports/session-verifier.port.js';
import { credentialFromRequest } from '../../domains/identity/middleware/authenticate.middleware.js';
import type { EdgeConfig } from '../../domains/edge/config.js';
import type { WsBackend, WsConnectionCtx } from '../../domains/edge/ports/ws-backend.port.js';
import type { WsBackendStatus } from '../../domains/edge/types.js';
import { isOriginAllowed } from '../middleware/cors.js';
import { wsRateLimit, type WsRateLimiter } from '../middleware/rate-limit.js';

export interface UpgradeRouterDeps {
  readonly server: Server;
  /** Phase 2 identity seam — resolves the upgrade credential → Principal. */
  readonly verifier: SessionVerifier;
  /** Edge config slice: CORS origins (origin check) + WS tuning (frame budget). */
  readonly config: EdgeConfig;
  readonly logger: Logger;
  /** Backends registered at construction (more may `register()` later, e.g. Phase 5). */
  readonly backends?: readonly WsBackend[];
}

/** The registry handle the composer holds: register more backends + report health. */
export interface UpgradeRouter {
  /** Register a WS backend for its `path` (idempotent per path; first wins). */
  register(backend: WsBackend): void;
  /** The currently registered backends (registration order). */
  readonly backends: readonly WsBackend[];
  /** Per-backend registration status for edge health. */
  statuses(): readonly WsBackendStatus[];
  /** Detach the upgrade handler and close all live sockets (idempotent). */
  close(): Promise<void>;
}

/** Read a single header value (first when repeated). */
function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
}

const REJECT_REASON: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
};

/** Reject an upgrade before handshake: write a minimal HTTP response + destroy. */
function rejectSocket(socket: Socket, code: number, detail: string): void {
  const status = REJECT_REASON[code] ?? 'Bad Request';
  socket.write(
    `HTTP/1.1 ${code} ${status}\r\n` +
      'Connection: close\r\n' +
      'Content-Length: 0\r\n' +
      `x-ws-reject: ${detail}\r\n` +
      '\r\n',
  );
  socket.destroy();
}

/** Build the upgrade router and attach the single `server.on('upgrade')` handler. */
export function createUpgradeRouter(deps: UpgradeRouterDeps): UpgradeRouter {
  const wss = new WebSocketServer({ noServer: true });
  const limiter: WsRateLimiter = wsRateLimit(deps.config.ws);
  const registered: WsBackend[] = [];
  const byPath = new Map<string, WsBackend>();
  const duplicates: WsBackendStatus[] = [];

  const register = (backend: WsBackend): void => {
    if (byPath.has(backend.path)) {
      duplicates.push({ path: backend.path, status: 'down', reason: 'duplicate path — ignored (first registration wins)' });
      deps.logger.warn({ path: backend.path }, 'ws backend duplicate path ignored');
      return;
    }
    byPath.set(backend.path, backend);
    registered.push(backend);
  };

  for (const backend of deps.backends ?? []) register(backend);

  /** Longest-prefix path dispatch (exact match preferred). */
  const match = (pathname: string): WsBackend | undefined => {
    const exact = byPath.get(pathname);
    if (exact) return exact;
    let best: WsBackend | undefined;
    let bestLen = -1;
    for (const [p, backend] of byPath) {
      const prefix = p.endsWith('/') ? p : `${p}/`;
      if (pathname.startsWith(prefix) && p.length > bestLen) {
        best = backend;
        bestLen = p.length;
      }
    }
    return best;
  };

  /** Budget inbound frames on a live socket + release the window on close. */
  const bindFrameBudget = (ws: WebSocket, connectionKey: string): void => {
    ws.on('message', () => {
      if (!limiter.allow(connectionKey)) {
        ws.close(1013, 'rate limited');
      }
    });
    ws.once('close', () => limiter.release(connectionKey));
  };

  const handleUpgrade = async (req: IncomingMessage, socket: Socket, head: Buffer): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;

    const backend = match(pathname);
    if (!backend) {
      rejectSocket(socket, 404, 'no ws backend');
      return;
    }

    // 2. Origin check — identical policy to the HTTP CORS layer.
    const origin = header(req, 'origin');
    if (origin && !isOriginAllowed(origin, deps.config.cors.origins)) {
      rejectSocket(socket, 403, 'origin not allowed');
      return;
    }

    // 3. Auth on upgrade — resolve via the Phase-2 verifier (single credential seam).
    const requestId = header(req, 'x-request-id') ?? randomUUID();
    let principal;
    try {
      principal = await deps.verifier.verify(credentialFromRequest(req as unknown as Request));
    } catch (err) {
      deps.logger.error(
        { err: err instanceof Error ? err.message : String(err), path: pathname, requestId },
        'ws upgrade verifier faulted — rejecting 503',
      );
      rejectSocket(socket, 503, 'auth service unavailable');
      return;
    }
    if (!principal) {
      rejectSocket(socket, 401, 'unauthenticated');
      return;
    }
    if (backend.authScope === 'internal' && principal.kind !== 'internal') {
      rejectSocket(socket, 403, 'internal scope required');
      return;
    }

    // 4. Per-connection frame-budget seed.
    const connectionKey = `${principal.userId}:${pathname}`;
    if (!limiter.allow(connectionKey)) {
      rejectSocket(socket, 429, 'rate limited');
      return;
    }

    // 5. Handshake + dispatch to the already-authorized backend.
    wss.handleUpgrade(req, socket, head, (ws) => {
      const ctx: WsConnectionCtx = {
        principal,
        requestId,
        path: pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        ...(origin ? { origin } : {}),
        logger: deps.logger.child({ ws: pathname, requestId }),
      };
      bindFrameBudget(ws, connectionKey);
      Promise.resolve(backend.onConnection(ws, ctx)).catch((err: unknown) => {
        deps.logger.error(
          { err: err instanceof Error ? err.message : String(err), path: pathname, requestId },
          'ws backend onConnection rejected — closing socket',
        );
        limiter.release(connectionKey);
        ws.close(1011, 'backend error');
      });
    });
  };

  const onUpgrade = (req: IncomingMessage, socket: Socket, head: Buffer): void => {
    void handleUpgrade(req, socket, head).catch((err: unknown) => {
      deps.logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'ws upgrade handler threw — destroying socket',
      );
      socket.destroy();
    });
  };

  deps.server.on('upgrade', onUpgrade);

  const statuses = (): readonly WsBackendStatus[] => [
    ...registered.map((b): WsBackendStatus => ({ path: b.path, status: 'up' })),
    ...duplicates,
  ];

  const close = (): Promise<void> =>
    new Promise<void>((resolve) => {
      deps.server.off('upgrade', onUpgrade);
      wss.close(() => resolve());
    });

  return {
    register,
    get backends(): readonly WsBackend[] {
      return registered;
    },
    statuses,
    close,
  };
}
