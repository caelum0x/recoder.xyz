/**
 * Edge HTTP lifecycle — the narrow bind/drain helpers the edge composer uses to
 * bring its server up and take it down gracefully. This is the HTTP-server-level
 * counterpart to `bootstrap/lifecycle.ts` (the process-wide stop-hook orchestrator):
 * bootstrap registers `edge.stop()` as one of its ordered hooks, and `edge.stop()`
 * calls {@link drainServer} here.
 *
 * `listenServer` resolves only once the socket is actually bound (rejecting on
 * `EADDRINUSE`/permission errors instead of hanging). `drainServer` stops
 * accepting new connections and waits for in-flight requests to finish, bounded by
 * a hard `drainMs` cap so a wedged keep-alive connection can never block shutdown
 * forever — on timeout it forcibly destroys lingering sockets.
 */
import type { Server } from 'node:http';
import type { Socket } from 'node:net';

/** Where to bind: host + port from `AppConfig.server`. */
export interface ListenTarget {
  readonly host: string;
  readonly port: number;
}

/** Is the server currently accepting connections? */
export function isListening(server: Server): boolean {
  return server.listening;
}

/**
 * Bind the server, resolving once it is listening. A bind error (`EADDRINUSE`,
 * `EACCES`, …) rejects the promise rather than silently leaving it pending.
 * Idempotent: a server already listening resolves immediately.
 */
export function listenServer(server: Server, target: ListenTarget): Promise<void> {
  if (server.listening) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(target.port, target.host);
  });
}

/**
 * Gracefully drain: stop accepting new connections and wait for in-flight
 * requests, bounded by `drainMs`. On timeout, forcibly destroy lingering sockets
 * so shutdown always completes. Idempotent + degrade-safe — a non-listening server
 * resolves immediately.
 */
export function drainServer(server: Server, drainMs: number): Promise<void> {
  if (!server.listening) return Promise.resolve();

  const open = new Set<Socket>();
  const track = (socket: Socket): void => {
    open.add(socket);
    socket.once('close', () => open.delete(socket));
  };
  server.on('connection', track);

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      server.off('connection', track);
      resolve();
    };

    const timer = setTimeout(() => {
      for (const socket of open) socket.destroy();
      finish();
    }, Math.max(0, drainMs));
    // Never let the drain timer keep the event loop alive on its own.
    if (typeof timer.unref === 'function') timer.unref();

    server.close(() => {
      clearTimeout(timer);
      finish();
    });
  });
}
