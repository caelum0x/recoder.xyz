/**
 * `GET /api/conductor/workspaces/:id/preview-verification` — the READ edge that
 * projects a workspace's persisted preview-verification summary (the write-back
 * the awaited `verifyPreview` + `setPreviewUrl` auto-verify seal onto
 * `metadata.previewVerification`). Proves the route:
 *
 *  - returns the projected summary in the `sendSuccess` envelope (200) once a
 *    verification has been persisted;
 *  - is a TRUTHFUL 404 when the workspace exists but was never verified
 *    ("preview not verified") — never a fabricated pass;
 *  - is a 404 when the workspace id is unknown ("workspace not found");
 *  - is guarded by `authenticate` (a real non-anonymous principal) — an
 *    unauthenticated request is a 401 before the module is ever consulted;
 *  - never exposes a fetchable screenshot: `screenshotRef` is always `null`.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { Workspace } from '@recoder/agent-os';
import type { Principal } from '../identity/types.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { PreviewVerificationView } from './ports/preview-verify.port.js';
import type { ConductorModule } from './index.js';
import { buildConductorRoutes } from './routes/conductor.routes.js';

// A privileged (admin) principal: this suite exercises the preview-verification
// READ, not the workspace-ownership guard (recoder-tf68), so it uses the operator
// path to reach any workspace. Ownership itself is covered by
// workspace-ownership-idor.test.ts.
const PRINCIPAL: Principal = {
  userId: 'user_test',
  actorId: 'user_test',
  actorType: 'user',
  scopes: ['admin'],
} as unknown as Principal;

/** An `authenticate` that stamps a principal ONLY when an auth header is present (else 401). */
const authenticate: RequestHandler = (req, res, next) => {
  if (req.headers['authorization']) {
    (req as { principal?: Principal }).principal = PRINCIPAL;
    next();
    return;
  }
  res.status(401).json({ success: false, error: { message: 'unauthenticated' } });
};
const passthrough: RequestHandler = (_req, _res, next) => next();
const middleware = {
  authenticate,
  authenticateMutating: authenticate,
  requireAdmin: passthrough,
  requireInternal: passthrough,
  requirePermission: () => passthrough,
  verifyOrgAccess: () => passthrough,
} as unknown as AuthMiddleware;

interface StubState {
  view?: PreviewVerificationView | null;
  workspace?: Workspace | null;
}

/** A stub module implementing only the two reads the GET edge hits. */
function stubModule(state: StubState): ConductorModule {
  return {
    async getPreviewVerification() {
      return state.view ?? null;
    },
    async getWorkspace() {
      // The ownership guard resolves the workspace before the handler. When a test
      // does not pin `workspace`, default to a present record so the guard admits
      // (the privileged PRINCIPAL then passes) and the handler's own logic runs;
      // a test that pins `workspace: null` still models a missing workspace.
      if ('workspace' in state) return state.workspace ?? null;
      return { workspaceId: 'ws-1', createdBy: 'user_test' } as Workspace;
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
  path: string,
  opts: { auth?: boolean } = {},
): Promise<{ status: number; body: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${path}`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: opts.auth === false ? {} : { authorization: 'Bearer test' },
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
    req.end();
  });
}

const view: PreviewVerificationView = {
  workspaceId: 'ws-1',
  status: 'passed',
  checkedAt: '2026-07-21T00:00:00.000Z',
  summary: 'preview opened; assertions passed',
  degraded: false,
  checks: [{ tool: 'navigate', status: 'passed' }],
  screenshotRef: null,
};

describe('GET /api/conductor/workspaces/:id/preview-verification', () => {
  it('projects the persisted verification summary in the success envelope (200)', async () => {
    const harness = await serve(stubModule({ view }));
    try {
      const res = await request(harness.base, '/api/conductor/workspaces/ws-1/preview-verification');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: { verification: PreviewVerificationView } }).data;
      expect(data.verification.status).toBe('passed');
      expect(data.verification.summary).toContain('assertions passed');
      // The screenshot is never a fetchable image in this cut — always null.
      expect(data.verification.screenshotRef).toBeNull();
    } finally {
      await harness.close();
    }
  });

  it('is a truthful 404 when the workspace exists but was never verified', async () => {
    // Projection null (unverified) but the workspace itself exists.
    const harness = await serve(stubModule({ view: null, workspace: { workspaceId: 'ws-1' } as Workspace }));
    try {
      const res = await request(harness.base, '/api/conductor/workspaces/ws-1/preview-verification');
      expect(res.status).toBe(404);
      const envelope = res.body() as { success: boolean; error: { message: string } };
      expect(envelope.success).toBe(false);
      expect(envelope.error.message).toContain('preview not verified');
    } finally {
      await harness.close();
    }
  });

  it('is a 404 when the workspace id is unknown', async () => {
    const harness = await serve(stubModule({ view: null, workspace: null }));
    try {
      const res = await request(harness.base, '/api/conductor/workspaces/ws-missing/preview-verification');
      expect(res.status).toBe(404);
      const envelope = res.body() as { error: { message: string } };
      expect(envelope.error.message).toContain('workspace not found');
    } finally {
      await harness.close();
    }
  });

  it('is a 401 when unauthenticated (the module is never consulted)', async () => {
    let consulted = false;
    const module = {
      async getPreviewVerification() {
        consulted = true;
        return view;
      },
      async getWorkspace() {
        consulted = true;
        return null;
      },
    } as unknown as ConductorModule;
    const harness = await serve(module);
    try {
      const res = await request(harness.base, '/api/conductor/workspaces/ws-1/preview-verification', {
        auth: false,
      });
      expect(res.status).toBe(401);
      expect(consulted).toBe(false);
    } finally {
      await harness.close();
    }
  });
});
