/**
 * cockpit-static.routes.ts — contract tests.
 *
 * Real HTTP against a real express app + a real temp dist fixture (no mocks;
 * node:http is used because the vitest setup globally mocks global.fetch):
 *   - serves index.html at /cockpit/ and hashed assets at /cockpit/<file>
 *   - SPA fallback: unknown GET paths under /cockpit serve index.html
 *   - path traversal outside the dist dir is rejected (no file leak)
 *   - degrade-safe: 503 with a truthful reason when no dist build exists
 *   - the served HTML carries no injected secrets (static shell contract)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createCockpitStaticRouter, resolveCockpitDistDir } from './cockpit-static.routes.js';

const INDEX_HTML =
  '<!DOCTYPE html><html><body><div id="cockpit-root"></div><script src="./cockpit-abc123.js"></script></body></html>';
const ASSET_JS = 'console.log("cockpit bundle");';

interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function httpGet(baseUrl: string, requestPath: string): Promise<HttpResult> {
  const { hostname, port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: hostname, port, path: requestPath, method: 'GET' }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: raw }));
    });
    req.on('error', reject);
    req.end();
  });
}

function listen(app: express.Express): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      resolve({ server: srv, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

let distDir: string;
let outsideSecretPath: string;
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-static-'));
  distDir = path.join(root, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), INDEX_HTML);
  fs.writeFileSync(path.join(distDir, 'cockpit-abc123.js'), ASSET_JS);
  outsideSecretPath = path.join(root, 'secret.txt');
  fs.writeFileSync(outsideSecretPath, 'sk_super_secret');

  const app = express();
  app.use('/cockpit', createCockpitStaticRouter({ distDir }));
  ({ server, baseUrl } = await listen(app));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('cockpit-static: serving', () => {
  it('serves index.html at /cockpit/', async () => {
    const res = await httpGet(baseUrl, '/cockpit/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toBe(INDEX_HTML);
  });

  it('redirects /cockpit to /cockpit/ so relative asset hrefs resolve', async () => {
    const res = await httpGet(baseUrl, '/cockpit');
    expect([301, 302]).toContain(res.status);
    expect(res.headers.location).toContain('/cockpit/');
  });

  it('serves the hashed bundle asset', async () => {
    const res = await httpGet(baseUrl, '/cockpit/cockpit-abc123.js');
    expect(res.status).toBe(200);
    expect(res.body).toBe(ASSET_JS);
  });

  it('SPA fallback: unknown GET path serves index.html', async () => {
    const res = await httpGet(baseUrl, '/cockpit/board/deep/link');
    expect(res.status).toBe(200);
    expect(res.body).toBe(INDEX_HTML);
  });

  it('index responses are marked no-cache (hashed assets stay cacheable)', async () => {
    const res = await httpGet(baseUrl, '/cockpit/');
    expect(res.headers['cache-control']).toContain('no-cache');
  });

  it('never leaks files outside the dist dir via traversal', async () => {
    const res = await httpGet(baseUrl, '/cockpit/' + encodeURIComponent('../secret.txt'));
    expect(res.body).not.toContain('sk_super_secret');
    expect(fs.existsSync(outsideSecretPath)).toBe(true);
  });

  it('serves a static shell with no secrets in the HTML', async () => {
    const res = await httpGet(baseUrl, '/cockpit/');
    expect(res.body).not.toMatch(/sk_[A-Za-z0-9]/);
    expect(res.body).not.toContain('__RECODER_COCKPIT__');
  });
});

describe('cockpit-static: degrade-safe when no build exists', () => {
  it('returns a truthful 503 (never a blank fake page)', async () => {
    const missing = path.join(os.tmpdir(), 'cockpit-static-does-not-exist', 'dist');
    const app = express();
    app.use('/cockpit', createCockpitStaticRouter({ distDir: missing }));
    const { server: srv, baseUrl: url } = await listen(app);
    try {
      const res = await httpGet(url, '/cockpit/');
      expect(res.status).toBe(503);
      const body = JSON.parse(res.body) as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain('COCKPIT_DIST_DIR');
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });
});

describe('resolveCockpitDistDir', () => {
  it('resolves an explicit dir containing index.html', () => {
    expect(resolveCockpitDistDir(distDir)).toBe(path.resolve(distDir));
  });

  it('an explicit dir is authoritative: missing build means null, no fallback', () => {
    expect(resolveCockpitDistDir(path.join(os.tmpdir(), 'nope-cockpit', 'dist'))).toBeNull();
  });

  it('resolves via COCKPIT_DIST_DIR when no explicit dir is given', () => {
    const saved = process.env.COCKPIT_DIST_DIR;
    process.env.COCKPIT_DIST_DIR = distDir;
    try {
      expect(resolveCockpitDistDir()).toBe(path.resolve(distDir));
    } finally {
      if (saved !== undefined) process.env.COCKPIT_DIST_DIR = saved;
      else delete process.env.COCKPIT_DIST_DIR;
    }
  });

  it('ignores an explicit directory without an index.html', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-empty-'));
    expect(resolveCockpitDistDir(empty)).toBeNull();
  });
});
