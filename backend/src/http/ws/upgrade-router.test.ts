/**
 * Upgrade router — auth + dispatch unit tests over a REAL http server.
 *
 * Proves the WS upgrade credential ladder: an RFC 6750-style `?access_token=`
 * query is honored when no Authorization header is present (browser WebSocket
 * cannot set headers), an Authorization header WINS over the query token, an
 * unauthenticated upgrade is rejected 401 (never silently subscribed), and the
 * longest-prefix dispatch routes `/api/conductor/workspaces/:id/stream` to the
 * backend registered at the `/api/conductor/workspaces` prefix.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createUpgradeRouter, type UpgradeRouter } from './upgrade-router.js';
import type { WsBackend } from '../../domains/edge/ports/ws-backend.port.js';
import type { Logger } from '../../shared/logger.js';

function makeLogger(): Logger {
  const log = {
    info() {},
    warn() {},
    error() {},
    debug() {},
    child: () => log,
  };
  return log as unknown as Logger;
}

/** A verifier that accepts exactly `Bearer good-token` and records credentials. */
function makeVerifier() {
  const seen: Array<{ authorizationHeader: string | null }> = [];
  return {
    seen,
    verifier: {
      async verify(credential: { authorizationHeader?: string | null }) {
        seen.push({ authorizationHeader: credential.authorizationHeader ?? null });
        if (credential.authorizationHeader === 'Bearer good-token') {
          return { kind: 'user', userId: 'user_ws' };
        }
        return null;
      },
    },
  };
}

const CONFIG = {
  cors: { origins: [] as string[], allowCredentials: false },
  ws: { heartbeatMs: 30_000, idleTimeoutMs: 60_000, maxFramesPerWindow: 100, frameWindowMs: 1000 },
} as never;

let server: Server;
let router: UpgradeRouter;
let port: number;

function streamBackend(attached: string[]): WsBackend {
  return {
    path: '/api/conductor/workspaces',
    authScope: 'session',
    onConnection(socket, ctx) {
      attached.push(ctx.path);
      socket.send(JSON.stringify({ eventId: 'hello', type: 'log', taskId: 't' }));
    },
  };
}

async function connect(path: string, headers?: Record<string, string>): Promise<{
  ws: WebSocket;
  outcome: 'open' | { code: number };
}> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
  const outcome = await new Promise<'open' | { code: number }>((resolve) => {
    ws.on('open', () => resolve('open'));
    ws.on('unexpected-response', (_req, res) => resolve({ code: res.statusCode ?? 0 }));
    ws.on('error', () => resolve({ code: 0 }));
  });
  return { ws, outcome };
}

let verifierSeen: Array<{ authorizationHeader: string | null }>;
let attachedPaths: string[];

beforeEach(async () => {
  server = createServer((_req, res) => res.end('ok'));
  const { verifier, seen } = makeVerifier();
  verifierSeen = seen;
  attachedPaths = [];
  router = createUpgradeRouter({
    server,
    verifier: verifier as never,
    config: CONFIG,
    logger: makeLogger(),
    backends: [streamBackend(attachedPaths)],
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = (server.address() as { port: number }).port;
});

afterEach(async () => {
  await router.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('upgrade auth', () => {
  it('honors ?access_token= when no Authorization header is present', async () => {
    const { ws, outcome } = await connect(
      '/api/conductor/workspaces/ws_1/stream?access_token=good-token',
    );
    expect(outcome).toBe('open');
    expect(verifierSeen[0]?.authorizationHeader).toBe('Bearer good-token');
    expect(attachedPaths).toEqual(['/api/conductor/workspaces/ws_1/stream']);
    ws.close();
  });

  it('the Authorization header wins over the query token', async () => {
    const { ws, outcome } = await connect(
      '/api/conductor/workspaces/ws_1/stream?access_token=ignored',
      { authorization: 'Bearer good-token' },
    );
    expect(outcome).toBe('open');
    expect(verifierSeen[0]?.authorizationHeader).toBe('Bearer good-token');
    ws.close();
  });

  it('rejects an unauthenticated upgrade with 401', async () => {
    const { outcome } = await connect('/api/conductor/workspaces/ws_1/stream');
    expect(outcome).toEqual({ code: 401 });
    expect(attachedPaths).toEqual([]);
  });

  it('rejects an unknown path with 404 before auth', async () => {
    const { outcome } = await connect('/nope?access_token=good-token');
    expect(outcome).toEqual({ code: 404 });
  });
});
