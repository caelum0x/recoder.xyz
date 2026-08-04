/**
 * `POST /api/conductor/workspaces` — the HTTP sibling-awareness opt-out (recoder-i499).
 *
 * Proves the route forwards `sibling_awareness` into
 * `CreateConductorWorkspaceInput.siblingAwareness` ONLY when it is a real boolean
 * (anything else is dropped — never trusts arbitrary input), and — composed with the
 * REAL `stampSiblingAwareness` the module runs at launch — that an explicit `false`
 * lands as `metadata.siblingAwareness:false` while an ABSENT field keeps the default
 * behavior (grouped launch ⇒ `true`; ungrouped ⇒ metadata untouched).
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { ConductorModule } from '../index.js';
import type { CreateConductorWorkspaceInput } from '../conductor-module.js';
import { buildConductorRoutes } from './conductor.routes.js';
import { stampSiblingAwareness } from '../adapters/sibling-awareness.adapter.js';

const passthrough: RequestHandler = (req, _res, next) => {
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
        value: { workspaceId: 'ws-1' },
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

describe('POST /api/conductor/workspaces — sibling_awareness opt-out', () => {
  it('forwards sibling_awareness:false → metadata.siblingAwareness false at launch', async () => {
    const harness = await serve();
    try {
      const res = await post(harness.base, '/api/conductor/workspaces', {
        ...baseBody,
        taskGroup: 'grp-1',
        sibling_awareness: false,
      });
      expect(res.status).toBe(201);
      const input = harness.lastInput()!;
      expect(input.siblingAwareness).toBe(false);
      // Composed with the REAL launch-time stamp: the opt-out beats the grouped default.
      expect(stampSiblingAwareness(input.metadata, input.siblingAwareness)).toMatchObject({
        taskGroup: 'grp-1',
        siblingAwareness: false,
      });
    } finally {
      await harness.close();
    }
  });

  it('an ABSENT field keeps the default behavior (grouped ⇒ true, ungrouped ⇒ untouched)', async () => {
    const harness = await serve();
    try {
      const res = await post(harness.base, '/api/conductor/workspaces', {
        ...baseBody,
        taskGroup: 'grp-1',
      });
      expect(res.status).toBe(201);
      const input = harness.lastInput()!;
      expect(input.siblingAwareness).toBeUndefined();
      // Grouped launch: the module's default stamps TRUE.
      expect(stampSiblingAwareness(input.metadata, input.siblingAwareness)).toMatchObject({
        siblingAwareness: true,
      });
      // Ungrouped launch: metadata stays byte-identical (no stamp at all).
      expect(stampSiblingAwareness(undefined, input.siblingAwareness)).toBeUndefined();
    } finally {
      await harness.close();
    }
  });

  it('drops a non-boolean value (never trusts arbitrary input)', async () => {
    const harness = await serve();
    try {
      const res = await post(harness.base, '/api/conductor/workspaces', {
        ...baseBody,
        sibling_awareness: 'false',
      });
      expect(res.status).toBe(201);
      expect(harness.lastInput()?.siblingAwareness).toBeUndefined();
    } finally {
      await harness.close();
    }
  });
});
