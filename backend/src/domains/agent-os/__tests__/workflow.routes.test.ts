/**
 * `/api/agent-os/workflows` — CRUD + dispatch edge. Covers create → list → get →
 * delete, boundary validation (400 on a bad node kind), unknown-id 404s, truthful
 * dispatch degrade (`not_configured` with no driver), and a wired-driver dispatch.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { WorkflowDefinition, WorkflowDriver, WorkflowRun } from '@recoder/agent-workflows';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { buildWorkflowRouter } from '../routes/workflow.routes.js';
import { WorkflowService, InMemoryWorkflowDefinitionStore } from '../services/workflow.service.js';

const passthrough: RequestHandler = (_req, _res, next) => next();
const middleware = {
  authenticate: passthrough,
  authenticateMutating: passthrough,
  requireAdmin: passthrough,
  requireInternal: passthrough,
  requirePermission: () => passthrough,
  verifyOrgAccess: () => passthrough,
} as AuthMiddleware;

interface Harness {
  base: string;
  close: () => Promise<void>;
}

function serve(svc: WorkflowService): Promise<Harness> {
  const app = express();
  app.use(express.json());
  app.use('/api/agent-os', buildWorkflowRouter({ workflows: svc, middleware }));
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

const definition: WorkflowDefinition = {
  workflowId: 'wf-1',
  name: 'Verify then ship',
  version: '1.0.0',
  nodes: [{ nodeId: 'verify', kind: 'verification', label: 'Verify', config: {} }],
};

describe('/api/agent-os/workflows', () => {
  it('creates, lists, gets and deletes a definition', async () => {
    const harness = await serve(new WorkflowService({ store: new InMemoryWorkflowDefinitionStore() }));
    try {
      const created = await request(harness.base, 'POST', '/api/agent-os/workflows', definition);
      expect(created.status).toBe(200);
      expect((created.body() as { data: { workflowId: string } }).data.workflowId).toBe('wf-1');

      const listed = await request(harness.base, 'GET', '/api/agent-os/workflows');
      const listData = (listed.body() as { data: { dispatchConfigured: boolean; workflows: unknown[] } }).data;
      expect(listData.dispatchConfigured).toBe(false);
      expect(listData.workflows).toHaveLength(1);

      const got = await request(harness.base, 'GET', '/api/agent-os/workflows/wf-1');
      expect((got.body() as { data: { name: string } }).data.name).toBe('Verify then ship');

      const removed = await request(harness.base, 'DELETE', '/api/agent-os/workflows/wf-1');
      expect((removed.body() as { data: { deleted: boolean } }).data.deleted).toBe(true);

      const gone = await request(harness.base, 'GET', '/api/agent-os/workflows/wf-1');
      expect(gone.status).toBe(404);
    } finally {
      await harness.close();
    }
  });

  it('rejects an invalid node kind at the boundary (400)', async () => {
    const harness = await serve(new WorkflowService({ store: new InMemoryWorkflowDefinitionStore() }));
    try {
      const res = await request(harness.base, 'POST', '/api/agent-os/workflows', {
        ...definition,
        nodes: [{ nodeId: 'x', kind: 'not-a-kind', label: 'X', config: {} }],
      });
      expect(res.status).toBe(400);
      expect((res.body() as { success: boolean }).success).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it('404s dispatch of an unknown workflow', async () => {
    const harness = await serve(new WorkflowService({ store: new InMemoryWorkflowDefinitionStore() }));
    try {
      const res = await request(harness.base, 'POST', '/api/agent-os/workflows/ghost/dispatch');
      expect(res.status).toBe(404);
    } finally {
      await harness.close();
    }
  });

  it('dispatch degrades truthfully to not_configured with no driver', async () => {
    const svc = new WorkflowService({ store: new InMemoryWorkflowDefinitionStore() });
    await svc.save(definition);
    const harness = await serve(svc);
    try {
      const res = await request(harness.base, 'POST', '/api/agent-os/workflows/wf-1/dispatch');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: { dispatched: boolean; status: string } }).data;
      expect(data.dispatched).toBe(false);
      expect(data.status).toBe('not_configured');
    } finally {
      await harness.close();
    }
  });

  it('dispatch runs through a wired WorkflowDriver', async () => {
    const run: WorkflowRun = {
      workflowRunId: 'run-1',
      workflowId: 'wf-1',
      status: 'running',
      startedAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z',
    };
    const driver: WorkflowDriver = {
      async start() {
        return run;
      },
      async signal() {},
      async cancel() {},
    };
    const svc = new WorkflowService({ store: new InMemoryWorkflowDefinitionStore(), driver });
    await svc.save(definition);
    const harness = await serve(svc);
    try {
      const res = await request(harness.base, 'POST', '/api/agent-os/workflows/wf-1/dispatch');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: { dispatched: boolean; run: { workflowRunId: string } } }).data;
      expect(data.dispatched).toBe(true);
      expect(data.run.workflowRunId).toBe('run-1');
    } finally {
      await harness.close();
    }
  });
});
