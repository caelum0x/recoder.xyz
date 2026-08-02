/**
 * `GET /inference/usage` — the cost/token strip read. Proves:
 *   - unscoped: user-global reads (no scope passed to the ledger, none echoed),
 *   - `?workspaceId=` / `&taskId=`: the scope reaches BOTH ledger reads and is
 *     echoed in the envelope so the strip can label what its numbers describe,
 *   - the scope is always bound to the AUTHENTICATED caller (userId comes from
 *     the principal, never from the query),
 *   - malformed scope values (empty / overlong) → truthful 400, no ledger read.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express, { type RequestHandler } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildInferenceRouter, type InferenceRoutesDeps } from './inference.routes.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { UsageLedgerRepository } from '../ports/usage-ledger.port.js';

function request(base: string, path: string): Promise<{ status: number; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, json: () => (text ? JSON.parse(text) : null) });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const testPrincipal = { userId: 'tester', isAnonymous: false, scopes: [], kind: 'session' } as unknown as Principal;
const passAuth: RequestHandler = (req, _res, next) => {
  req.principal = testPrincipal;
  next();
};
const fakeMiddleware = { authenticate: passAuth, authenticateMutating: passAuth } as unknown as AuthMiddleware;

const ZERO_TOTALS = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costMicroUsd: 0, calls: 0 };

let openServer: http.Server | null = null;
afterEach(() => new Promise<void>((r) => (openServer ? openServer.close(() => r()) : r())));

function fakeLedger(): { ledger: UsageLedgerRepository; recentForUser: ReturnType<typeof vi.fn>; totalsForUser: ReturnType<typeof vi.fn> } {
  const recentForUser = vi.fn(async () => []);
  const totalsForUser = vi.fn(async () => ZERO_TOTALS);
  const ledger = { recentForUser, totalsForUser, append: vi.fn(), ownsInference: vi.fn(), isDurable: () => true } as unknown as UsageLedgerRepository;
  return { ledger, recentForUser, totalsForUser };
}

async function serve(ledger: UsageLedgerRepository): Promise<string> {
  const deps = {
    gateway: {},
    routing: {},
    catalog: {},
    ledger,
    providerKeys: {},
    keyCache: { invalidate: vi.fn() },
    resolver: {},
    getGate: () => undefined,
    mw: fakeMiddleware,
  } as unknown as InferenceRoutesDeps;
  const app = express();
  app.use(express.json());
  app.use(buildInferenceRouter(deps));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      openServer = server;
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

describe('GET /inference/usage', () => {
  it('reads user-global usage when unscoped (no scope passed, none echoed)', async () => {
    const { ledger, recentForUser, totalsForUser } = fakeLedger();
    const base = await serve(ledger);

    const res = await request(base, '/inference/usage');

    expect(res.status).toBe(200);
    expect(recentForUser).toHaveBeenCalledWith('tester', 50, undefined);
    expect(totalsForUser).toHaveBeenCalledWith('tester', undefined, undefined);
    const body = res.json() as { data: { scope?: unknown } };
    expect(body.data.scope).toBeUndefined();
  });

  it('passes ?workspaceId + ?taskId to both ledger reads and echoes the scope', async () => {
    const { ledger, recentForUser, totalsForUser } = fakeLedger();
    const base = await serve(ledger);

    const res = await request(base, '/inference/usage?workspaceId=ws-1&taskId=task-1');

    expect(res.status).toBe(200);
    const scope = { workspaceId: 'ws-1', taskId: 'task-1' };
    expect(recentForUser).toHaveBeenCalledWith('tester', 50, scope);
    expect(totalsForUser).toHaveBeenCalledWith('tester', undefined, scope);
    const body = res.json() as { data: { scope?: unknown } };
    expect(body.data.scope).toEqual(scope);
  });

  it('scopes by workspace alone when only workspaceId is given', async () => {
    const { ledger, recentForUser } = fakeLedger();
    const base = await serve(ledger);

    await request(base, '/inference/usage?workspaceId=ws-only');

    expect(recentForUser).toHaveBeenCalledWith('tester', 50, { workspaceId: 'ws-only' });
  });

  it('rejects a malformed scope with a truthful 400 (no ledger read)', async () => {
    const { ledger, recentForUser } = fakeLedger();
    const base = await serve(ledger);

    const res = await request(base, `/inference/usage?workspaceId=${'x'.repeat(300)}`);

    expect(res.status).toBe(400);
    expect(recentForUser).not.toHaveBeenCalled();
  });
});
