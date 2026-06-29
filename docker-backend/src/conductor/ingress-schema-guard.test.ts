/**
 * Ingress schema-guard tests.
 *
 * Proves the `@recoder/agent-schemas` canonical guards are enforced IN-PROCESS
 * at the docker-backend ingress (the same `validateBody` middleware mounted on
 * the real /api/agent-os and /api/conductor routers): an invalid body is
 * rejected with a clear 400 before any handler runs, a valid body passes
 * through unchanged, optional sub-fields are skipped, and a throwing guard
 * degrades safely instead of crashing the request.
 */
import http from 'http';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { taskSpecSchema, type SchemaGuard } from '@recoder/agent-schemas';
import { validateBody } from '../agent-os/middleware/schema-guard.middleware';

function request(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Could not determine server address'));
        return;
      }
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path,
          method,
          headers: { 'content-type': 'application/json', connection: 'close' },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            let parsed: any = data;
            try {
              parsed = JSON.parse(data);
            } catch {
              // leave as text
            }
            server.close(() => resolve({ status: res.statusCode ?? 0, body: parsed }));
          });
        },
      );
      req.on('error', (error) => server.close(() => reject(error)));
      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
    server.on('error', reject);
  });
}

const validTaskSpec = {
  taskId: 'task-1',
  title: 'Wire ingress guards',
  intent: 'feature',
  goal: 'Enforce canonical schemas at the boundary',
  spaceId: 'space-1',
  targetPaths: ['src/'],
  forbiddenPaths: [],
  acceptanceCriteria: ['guard rejects invalid body'],
  approvalRequired: [],
  artifactRequired: [],
};

describe('agent-os ingress schema guard', () => {
  it('rejects an invalid TaskSpec body with a clear 400 before the handler runs', async () => {
    let handlerRan = false;
    const app = express();
    app.use(express.json());
    app.post('/tasks', validateBody(taskSpecSchema), (_req, res) => {
      handlerRan = true;
      res.status(201).json({ success: true });
    });

    // Missing required fields (title, intent, goal, spaceId, arrays, …).
    const res = await request(app, 'POST', '/tasks', { taskId: 'task-1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Invalid TaskSpec request body');
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);
    // Fail fast: the persisting handler must NOT have executed.
    expect(handlerRan).toBe(false);
  });

  it('lets a valid TaskSpec body through unchanged (success shape preserved)', async () => {
    const app = express();
    app.use(express.json());
    app.post('/tasks', validateBody(taskSpecSchema), (req, res) => {
      res.status(201).json({ success: true, data: req.body });
    });

    const res = await request(app, 'POST', '/tasks', validTaskSpec);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.taskId).toBe('task-1');
  });

  it('skips validation when an optional selected sub-field is absent (conductor plan by taskId)', async () => {
    let handlerRan = false;
    const app = express();
    app.use(express.json());
    app.post(
      '/workspaces/plan',
      validateBody(taskSpecSchema, { select: (b) => (b as { task?: unknown })?.task }),
      (_req, res) => {
        handlerRan = true;
        res.json({ success: true });
      },
    );

    // taskId-only body: no inline `task`, so the guard defers to the handler.
    const res = await request(app, 'POST', '/workspaces/plan', { taskId: 'task-1' });

    expect(res.status).toBe(200);
    expect(handlerRan).toBe(true);
  });

  it('validates an INLINE task sub-field and rejects when it is malformed', async () => {
    const app = express();
    app.use(express.json());
    app.post(
      '/workspaces/plan',
      validateBody(taskSpecSchema, { select: (b) => (b as { task?: unknown })?.task }),
      (_req, res) => res.json({ success: true }),
    );

    const res = await request(app, 'POST', '/workspaces/plan', { task: { taskId: 'task-1' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid TaskSpec request body');
  });

  it('degrades safely (passes through) when the guard itself throws', async () => {
    let handlerRan = false;
    const throwingGuard: SchemaGuard<unknown> = {
      name: 'Exploding',
      parse() {
        throw new Error('boom');
      },
    };
    const app = express();
    app.use(express.json());
    app.post('/x', validateBody(throwingGuard), (_req, res) => {
      handlerRan = true;
      res.json({ success: true });
    });

    const res = await request(app, 'POST', '/x', { anything: true });

    // A guard failure must never block the request or 500 it.
    expect(res.status).toBe(200);
    expect(handlerRan).toBe(true);
  });
});
