/**
 * `POST /api/conductor/workspaces/:id/preview-verify` — the manual/agent trigger
 * for the (C2-activated) preview verification. Proves the route:
 *
 *  - drives `module.verifyPreview` behind `authenticateMutating` and returns the
 *    AWAITED verification in the `finishWrite`/`sendSuccess` envelope (200);
 *  - forwards the OPTIONAL body options (assertions / screenshot / timeoutMs) into
 *    the module, ignoring junk (never trusted), and works for a bare `POST`;
 *  - maps a governance DENY onto a truthful 403 (never a faked 200);
 *  - surfaces a degrade-truthful `skipped` verification as a 200 with the real
 *    outcome (no fabricated pass).
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { Principal } from '../identity/types.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { GateVerdict } from './ports/index.js';
import type { PreviewVerifyOptions, PreviewVerifyResult } from './services/preview-verify.service.js';
import type { PreviewVerification } from './ports/preview-verify.port.js';
import type { ConductorModule } from './index.js';
import { buildConductorRoutes } from './routes/conductor.routes.js';

// A privileged (admin) principal: this suite exercises the preview-verify WRITE,
// not the workspace-ownership guard (recoder-tf68), so it uses the operator path
// to reach any workspace. Ownership is covered by workspace-ownership-idor.test.ts.
const PRINCIPAL: Principal = {
  userId: 'user_test',
  actorId: 'user_test',
  actorType: 'user',
  scopes: ['admin'],
} as unknown as Principal;

/** A passthrough auth middleware that stamps a real (non-anonymous) principal. */
const mutating: RequestHandler = (req, _res, next) => {
  (req as { principal?: Principal }).principal = PRINCIPAL;
  next();
};
const passthrough: RequestHandler = (_req, _res, next) => next();
const middleware = {
  authenticate: passthrough,
  authenticateMutating: mutating,
  requireAdmin: passthrough,
  requireInternal: passthrough,
  requirePermission: () => passthrough,
  verifyOrgAccess: () => passthrough,
} as unknown as AuthMiddleware;

function verdict(effect: GateVerdict['effect']): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect,
    tier: 'low',
    reason: effect === 'allow' ? 'allowed' : 'deny by policy',
    degraded: false,
    engine: 'ts',
    createdAt: new Date().toISOString(),
  } as unknown as GateVerdict;
}

interface Recorder {
  workspaceId?: string;
  principal?: Principal;
  options?: PreviewVerifyOptions;
}

/** A stub module that only implements `verifyPreview` (the only method the route hits). */
function stubModule(
  result: PreviewVerifyResult,
  recorder: Recorder = {},
): ConductorModule {
  return {
    // The ownership guard resolves the workspace before the handler; return a
    // present record so the guard admits the privileged PRINCIPAL (recoder-tf68).
    async getWorkspace(workspaceId: string) {
      return { workspaceId, createdBy: 'user_test' };
    },
    async verifyPreview(workspaceId: string, principal: Principal, options?: PreviewVerifyOptions) {
      recorder.workspaceId = workspaceId;
      recorder.principal = principal;
      recorder.options = options;
      return result;
    },
  } as unknown as ConductorModule;
}

interface Harness {
  base: string;
  close: () => Promise<void>;
}

function serve(module: ConductorModule): Promise<Harness> {
  const app = express();
  app.use(express.json());
  app.use('/api/conductor', buildConductorRoutes({ module, middleware }));
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

function request(
  base: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${path}`);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: payload
          ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, body: () => (text ? JSON.parse(text) : null) });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const passed: PreviewVerification = {
  status: 'passed',
  degraded: false,
  summary: 'preview opened; assertions passed',
  checks: [],
  artifacts: [{ artifactId: 'art_1', kind: 'screenshot', summary: 'shot' }],
};

describe('POST /api/conductor/workspaces/:id/preview-verify', () => {
  it('returns the awaited verification in the success envelope (200)', async () => {
    const recorder: Recorder = {};
    const module = stubModule({ ok: true, verdict: verdict('allow'), value: passed }, recorder);
    const harness = await serve(module);
    try {
      const res = await request(harness.base, 'POST', '/api/conductor/workspaces/ws-1/preview-verify');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: { verification: PreviewVerification; verdict: { effect: string } } }).data;
      expect(data.verification.status).toBe('passed');
      expect(data.verdict.effect).toBe('allow');
      // Actor comes from the resolved principal, workspace from the path param.
      expect(recorder.workspaceId).toBe('ws-1');
      expect(recorder.principal?.actorId).toBe('user_test');
    } finally {
      await harness.close();
    }
  });

  it('forwards well-typed body options and drops junk', async () => {
    const recorder: Recorder = {};
    const module = stubModule({ ok: true, verdict: verdict('allow'), value: passed }, recorder);
    const harness = await serve(module);
    try {
      const res = await request(harness.base, 'POST', '/api/conductor/workspaces/ws-1/preview-verify', {
        assertions: [{ expected: 'Preview App', target: 'h1' }, { expected: '' }, 42, null],
        screenshot: false,
        timeoutMs: 3000,
        bogus: 'ignored',
      });
      expect(res.status).toBe(200);
      // Only the valid assertion survives; screenshot + timeoutMs pass through.
      expect(recorder.options?.assertions).toEqual([{ expected: 'Preview App', target: 'h1' }]);
      expect(recorder.options?.screenshot).toBe(false);
      expect(recorder.options?.timeoutMs).toBe(3000);
      expect((recorder.options as Record<string, unknown>).bogus).toBeUndefined();
    } finally {
      await harness.close();
    }
  });

  it('maps a governance deny onto a truthful 403 (never a faked 200)', async () => {
    const module = stubModule({ ok: false, verdict: verdict('deny'), reason: 'deny by policy' });
    const harness = await serve(module);
    try {
      const res = await request(harness.base, 'POST', '/api/conductor/workspaces/ws-1/preview-verify');
      expect(res.status).toBe(403);
      const envelope = res.body() as { success: boolean; error: { message: string } };
      expect(envelope.success).toBe(false);
      expect(envelope.error.message).toContain('deny by policy');
    } finally {
      await harness.close();
    }
  });

  it('surfaces a degrade-truthful skipped verification as a 200 (no fabricated pass)', async () => {
    const skipped: PreviewVerification = {
      status: 'skipped',
      degraded: true,
      reason: 'browser-use client not wired',
      summary: 'preview verification skipped (no driver)',
      checks: [],
      artifacts: [],
    };
    const module = stubModule({ ok: true, verdict: verdict('allow'), value: skipped });
    const harness = await serve(module);
    try {
      const res = await request(harness.base, 'POST', '/api/conductor/workspaces/ws-1/preview-verify');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: { verification: PreviewVerification } }).data;
      expect(data.verification.status).toBe('skipped');
      expect(data.verification.degraded).toBe(true);
      expect(data.verification.reason).toContain('not wired');
    } finally {
      await harness.close();
    }
  });
});
