/**
 * `POST /api/conductor/workspaces` — substrate validation at the route boundary.
 *
 * Proves the route forwards a client-selected `substrate` to the module ONLY when
 * it is a member of the canonical {@link WorkspaceSubstrate} union, and drops
 * anything else (never trusts arbitrary input). Regression guard for the bug where
 * the route's private allowlist omitted `'acp'`, so `substrate:'acp'` was silently
 * stripped and the create degraded to the default `tmux_worktree` instead of the
 * caller's choice. The ACP substrate itself still degrades truthfully downstream
 * (its adapter throws `acp unavailable` when `claude-code-acp` is absent), so
 * allowing selection here loses no gating.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { ConductorModule } from './index.js';
import type { CreateConductorWorkspaceInput } from './conductor-module.js';
import { buildConductorRoutes } from './routes/conductor.routes.js';

const passthrough: RequestHandler = (req, _res, next) => {
  // The create route reads `req.principal!`; a bare object is enough for the stub.
  (req as unknown as { principal: unknown }).principal = { id: 'tester' };
  next();
};
const middleware = {
  authenticate: passthrough,
  authenticateMutating: passthrough,
  requireAdmin: passthrough,
  requireInternal: passthrough,
  requirePermission: () => passthrough,
  verifyOrgAccess: () => passthrough,
} as unknown as AuthMiddleware;

interface Harness {
  base: string;
  close: () => Promise<void>;
  /** The input the route handed to `module.createWorkspace` (null if never called). */
  lastInput: () => CreateConductorWorkspaceInput | null;
}

function serve(): Promise<Harness> {
  let captured: CreateConductorWorkspaceInput | null = null;
  const module = {
    createWorkspace: async (input: CreateConductorWorkspaceInput) => {
      captured = input;
      return {
        ok: true,
        verdict: { effect: 'allow', tier: 'standard', degraded: false, engine: 'test' },
        value: { workspaceId: 'ws-1', substrate: input.substrate ?? 'tmux_worktree' },
      };
    },
  } as unknown as ConductorModule;

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
        lastInput: () => captured,
      });
    });
  });
}

function post(base: string, path: string, body: unknown): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${path}`);
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

const baseBody = {
  spaceId: 's1',
  projectId: 'p1',
  taskId: 't1',
  repoPath: '/tmp/repo',
  runtimeId: 'claude',
};

describe('POST /api/conductor/workspaces — substrate validation', () => {
  it("forwards substrate:'acp' to the module (not silently dropped to the default)", async () => {
    const harness = await serve();
    try {
      const res = await post(harness.base, '/api/conductor/workspaces', {
        ...baseBody,
        substrate: 'acp',
      });
      expect(res.status).toBe(201);
      expect(harness.lastInput()?.substrate).toBe('acp');
    } finally {
      await harness.close();
    }
  });

  it('drops an unknown substrate value (never trusts arbitrary input)', async () => {
    const harness = await serve();
    try {
      const res = await post(harness.base, '/api/conductor/workspaces', {
        ...baseBody,
        substrate: 'not-a-real-substrate',
      });
      expect(res.status).toBe(201);
      // Bogus value is not forwarded → the field is absent, and the module falls
      // back to its own default rather than accepting the untrusted string.
      expect(harness.lastInput()?.substrate).toBeUndefined();
    } finally {
      await harness.close();
    }
  });
});
