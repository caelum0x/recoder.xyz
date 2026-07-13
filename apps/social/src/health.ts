/**
 * Status HTTP listener — zero-dependency node:http server that serves the
 * runtime's truthful state. It starts BEFORE the channels so "no channels
 * configured" is an observable, honest answer rather than a dead port.
 *
 * Routes (all GET, JSON envelope { success, data | error }):
 *   /health              — liveness (the process is up and serving)
 *   /status              — full truthful runtime status
 *   /api/social/status   — same payload, API-prefixed alias
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { RuntimeEnv, SocialStatus } from './runtime.js';

export interface StatusServerOptions {
  readonly host: string;
  readonly port: number;
  readonly getStatus: () => SocialStatus;
  readonly env?: RuntimeEnv;
}

export interface StatusServer {
  readonly server: Server;
  /** The actual bound port (resolves port 0 to the ephemeral assignment). */
  readonly port: number;
  close(): Promise<void>;
}

const startedAt = Date.now();

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function handle(req: IncomingMessage, res: ServerResponse, getStatus: () => SocialStatus): void {
  if (req.method !== 'GET') {
    sendJson(res, 405, { success: false, error: 'method not allowed' });
    return;
  }
  const path = (req.url ?? '/').split('?')[0];
  try {
    if (path === '/health') {
      sendJson(res, 200, {
        success: true,
        data: { service: 'recoder-social', status: 'ok', uptimeSec: Math.floor((Date.now() - startedAt) / 1000) },
      });
      return;
    }
    if (path === '/' || path === '/status' || path === '/api/social/status') {
      sendJson(res, 200, { success: true, data: getStatus() });
      return;
    }
    sendJson(res, 404, { success: false, error: 'not found' });
  } catch (err) {
    sendJson(res, 500, { success: false, error: err instanceof Error ? err.message : 'status failed' });
  }
}

/** Start the status server. Rejects (with a clear message) if the port is taken. */
export function startStatusServer(options: StatusServerOptions): Promise<StatusServer> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => handle(req, res, options.getStatus));
    server.once('error', (err) => reject(new Error(`status server failed to bind ${options.host}:${options.port}: ${err.message}`)));
    server.listen(options.port, options.host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      options.env?.log(`social: status listening on http://${options.host}:${port}`);
      resolve({
        server,
        port,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}
