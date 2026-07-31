/**
 * Retrieval HTTP edge — security tests for the `/api/agent-os/retrieval/*` surface.
 *
 * Two confirmed defects are pinned here, exercised through the REAL identity auth
 * middleware (an `sk_` api-key validator maps a raw key → a concrete tenant
 * principal) so the guarantees hold end-to-end at the network edge:
 *
 *  1. PATH-TRAVERSAL / LFI — POST /retrieval/ingest MUST NOT accept a
 *     caller-supplied filesystem `path` (it flows to readFile with no
 *     containment). A doc carrying only a `path` is rejected at the boundary
 *     (400) and the retrieval port's `ingest` NEVER runs (so readFile is never
 *     reached); a doc carrying both `text` and `path` ingests with the `path`
 *     STRIPPED (only inline text reaches the engine).
 *
 *  2. CROSS-TENANT RETRIEVAL — the caller-supplied `collection` MUST be bound to
 *     the request principal (mirrors the MCP `rt__<ns>__<sub>` scheme) so tenant
 *     B can never read/write an index tenant A ingested to. A non-privileged
 *     caller's requested collection is confined UNDER its own subject; an
 *     admin/internal caller may target a RAW collection (service-on-behalf).
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildRetrievalRouter } from './retrieval.routes.js';
import type { RetrievalPort, SearchResult, IngestResult, IngestOpts, SearchOpts } from '../ports/retrieval.port.js';
import type { IngestDoc } from '../types.js';
import { PrincipalService } from '../../identity/principal.service.js';
import { createAuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AuthSessionVerifier } from '../../identity/adapters/better-auth.adapter.js';
import type { ApiKeyValidator, ApiKeyValidation } from '../../identity/ports/api-key.port.js';
import type { IdentityConfig } from '../../identity/config.js';

const identityConfig: IdentityConfig = {
  betterAuthSecretPresent: true,
  authDatabaseUrl: 'postgres://x',
  cookieDomain: '.recoder.xyz',
  strictAuth: false,
  internalServiceKey: null,
  internalServiceKeyPresent: false,
  isProduction: false,
  deviceCodeTtlSeconds: 900,
  devicePollIntervalSeconds: 5,
  apiKeyDefaultTtlDays: null,
  apiKeyPrefixLength: 12,
};

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

const stubAdapter: AuthSessionVerifier = {
  extractToken: () => null,
  verifyToken: vi.fn(async () => null),
};

/** Map `sk_<tenant>[:admin]` → a concrete tenant principal (no DB needed). */
const apiKeyValidator: ApiKeyValidator = {
  validate: vi.fn(async (rawKey: string): Promise<ApiKeyValidation | null> => {
    if (!rawKey.startsWith('sk_')) return null;
    const body = rawKey.slice(3);
    const [userId, flag] = body.split(':');
    if (!userId) return null;
    const scopes = flag === 'admin' ? ['read', 'write', 'admin'] : ['read', 'write'];
    return { keyId: `key_${userId}`, userId, scopes };
  }),
};

interface CapturedIngest {
  readonly docs: readonly IngestDoc[];
  readonly opts?: IngestOpts;
}
interface CapturedSearch {
  readonly query: string;
  readonly opts?: SearchOpts;
}

interface Harness {
  base: string;
  close: () => Promise<void>;
  ingestCalls: CapturedIngest[];
  searchCalls: CapturedSearch[];
}

function buildHarness(): Promise<Harness> {
  const ingestCalls: CapturedIngest[] = [];
  const searchCalls: CapturedSearch[] = [];

  const okIngest: IngestResult = { status: 'ingested', collection: 'x', docId: 'd1', chunks: 1, upserted: 1 };
  const okSearch: SearchResult = { status: 'ok', query: 'q', passages: [], reranker: 'identity' };

  const retrieval: RetrievalPort = {
    configured: () => true,
    async ingest(docs, opts) {
      ingestCalls.push({ docs, ...(opts ? { opts } : {}) });
      return [okIngest];
    },
    async search(query, opts) {
      searchCalls.push({ query, ...(opts ? { opts } : {}) });
      return okSearch;
    },
  };

  const principal = new PrincipalService({
    config: identityConfig,
    logger: silentLogger,
    authSession: stubAdapter,
    apiKeyValidator,
  });
  const middleware = createAuthMiddleware({ verifier: principal, principal, config: identityConfig, logger: silentLogger });

  const app = express();
  app.use(express.json());
  app.use('/api/agent-os', buildRetrievalRouter({ retrieval, middleware }));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        ingestCalls,
        searchCalls,
      });
    });
  });
}

function request(
  base: string,
  path: string,
  init: { method?: string; apiKey?: string; body?: unknown } = {},
): Promise<{ status: number; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}/api/agent-os${path}`);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (init.apiKey) headers['x-api-key'] = init.apiKey;
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: init.method ?? 'GET', headers },
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
    if (init.body !== undefined) req.write(JSON.stringify(init.body));
    req.end();
  });
}

// ── Defect 1: path-traversal / LFI ──────────────────────────────────────────

describe('POST /retrieval/ingest — filesystem path is not accepted at the network edge', () => {
  it('rejects a doc carrying only a filesystem `path` (400) and NEVER reaches the retrieval port', async () => {
    const h = await buildHarness();
    try {
      const res = await request(h.base, '/retrieval/ingest', {
        method: 'POST',
        apiKey: 'sk_owner_1',
        body: { docs: [{ path: '/root/.env', docId: 'x' }] },
      });
      expect(res.status).toBe(400);
      // The boundary rejected it BEFORE ingest ran, so readFile is never reached.
      expect(h.ingestCalls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('rejects an absolute-path doc even when nested among valid docs (all-or-nothing at the boundary)', async () => {
    const h = await buildHarness();
    try {
      const res = await request(h.base, '/retrieval/ingest', {
        method: 'POST',
        apiKey: 'sk_owner_1',
        body: { docs: [{ text: 'ok' }, { path: '/etc/passwd' }] },
      });
      expect(res.status).toBe(400);
      expect(h.ingestCalls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('ingests a doc with inline text but STRIPS any accompanying `path` (path never reaches the engine)', async () => {
    const h = await buildHarness();
    try {
      const res = await request(h.base, '/retrieval/ingest', {
        method: 'POST',
        apiKey: 'sk_owner_1',
        body: { docs: [{ text: 'safe inline content', path: '/root/.env', docId: 'd1' }] },
      });
      expect(res.status).toBe(201);
      expect(h.ingestCalls).toHaveLength(1);
      const doc = h.ingestCalls[0]!.docs[0]!;
      expect(doc.text).toBe('safe inline content');
      expect(doc.path).toBeUndefined();
    } finally {
      await h.close();
    }
  });
});

// ── Defect 2: cross-tenant retrieval (principal-scoped collection) ───────────

describe('retrieval collection is bound to the request principal (cross-tenant defence)', () => {
  it('search: a caller-named `recoder_mem0` is confined UNDER the caller subject, never reaching the raw name', async () => {
    const h = await buildHarness();
    try {
      const res = await request(h.base, '/retrieval/search', {
        method: 'POST',
        apiKey: 'sk_owner_1',
        body: { query: 'secrets', collection: 'recoder_mem0' },
      });
      expect(res.status).toBe(200);
      expect(h.searchCalls).toHaveLength(1);
      expect(h.searchCalls[0]!.opts?.collection).toBe('rt__owner_1__recoder_mem0');
      expect(h.searchCalls[0]!.opts?.collection).not.toBe('recoder_mem0');
    } finally {
      await h.close();
    }
  });

  it("search: tenant B cannot reach tenant A's index — the name is re-namespaced under B", async () => {
    const h = await buildHarness();
    try {
      // Attacker names the exact collection owner_1 would write to.
      const res = await request(h.base, '/retrieval/search', {
        method: 'POST',
        apiKey: 'sk_attacker_1',
        body: { query: 'q', collection: 'rt__owner_1__default' },
      });
      expect(res.status).toBe(200);
      expect(h.searchCalls[0]!.opts?.collection).toBe('rt__attacker_1__rt__owner_1__default');
      expect(h.searchCalls[0]!.opts?.collection).not.toBe('rt__owner_1__default');
    } finally {
      await h.close();
    }
  });

  it('search: no collection still confines the caller to its own namespace', async () => {
    const h = await buildHarness();
    try {
      await request(h.base, '/retrieval/search', { method: 'POST', apiKey: 'sk_owner_1', body: { query: 'q' } });
      expect(h.searchCalls[0]!.opts?.collection).toBe('rt__owner_1__default');
    } finally {
      await h.close();
    }
  });

  it('ingest: the caller-named collection is bound under the caller subject (write isolation)', async () => {
    const h = await buildHarness();
    try {
      const res = await request(h.base, '/retrieval/ingest', {
        method: 'POST',
        apiKey: 'sk_owner_1',
        body: { docs: [{ text: 'hello' }], collection: 'recoder_retrieval' },
      });
      expect(res.status).toBe(201);
      expect(h.ingestCalls[0]!.opts?.collection).toBe('rt__owner_1__recoder_retrieval');
      expect(h.ingestCalls[0]!.opts?.collection).not.toBe('recoder_retrieval');
    } finally {
      await h.close();
    }
  });

  it('admin/internal caller MAY target a RAW collection (service-on-behalf)', async () => {
    const h = await buildHarness();
    try {
      await request(h.base, '/retrieval/search', {
        method: 'POST',
        apiKey: 'sk_ops_1:admin',
        body: { query: 'q', collection: 'recoder_mem0' },
      });
      expect(h.searchCalls[0]!.opts?.collection).toBe('recoder_mem0');
    } finally {
      await h.close();
    }
  });
});
