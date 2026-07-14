/**
 * Tests for opencode-connector.routes.ts lifecycle endpoints.
 *
 * Covers: /status, /start, /stop, /restart, /task/:taskId,
 *         /task/:taskId/cancel, /approval/:approvalId
 *
 * (/execute is covered in opencode-connector-routes.test.ts)
 */

import http from 'http';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runtime: {
    isRunning: vi.fn(() => false),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    restart: vi.fn(async () => undefined),
    getState: vi.fn(() => ({ status: 'stopped', pid: null, startedAt: null, lastActivity: null, error: null, activeTasks: 0 })),
    getTaskStatus: vi.fn(async () => ({ status: 'running', taskId: 't1' })),
    cancelTask: vi.fn(async () => ({ taskId: 't1', cancelled: true })),
    respondToApproval: vi.fn(async () => ({ approvalId: 'a1', supported: true, approved: true })),
    executeTask: vi.fn(),
  },
}));

vi.mock('../opencode-connector-runtime.service', () => ({
  getOpencodeConnectorRuntime: () => mocks.runtime,
}));

vi.mock('../opencode-service-adapter', () => ({
  promptProject: vi.fn(),
  setProviderKey: vi.fn(async () => true),
  getOrCreateSession: vi.fn(),
  getActiveProjects: vi.fn(() => []),
  disposeProjectSession: vi.fn(),
  getProjectDiff: vi.fn(),
  getProjectMessages: vi.fn(),
  shellInProject: vi.fn(),
  abortProject: vi.fn(),
  isServiceHealthy: vi.fn(),
}));

async function makeApp() {
  const { opencodeConnectorRouter } = await import('../opencode-connector.routes');
  const app = express();
  app.use(express.json());
  app.use('/api/a2a/connectors/opencode', opencodeConnectorRouter);
  return app;
}

function request(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> | string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
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
          headers: { 'content-type': 'application/json' },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            server.close();
            let parsed: Record<string, unknown> | string = data;
            try { parsed = JSON.parse(data); } catch { /* leave as text */ }
            resolve({ status: res.statusCode ?? 0, body: parsed });
          });
        },
      );

      req.on('error', (error) => {
        server.close();
        reject(error);
      });

      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe('opencode-connector.routes lifecycle endpoints', () => {
  beforeEach(() => {
    Object.values(mocks.runtime).forEach((fn) => {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    });
    mocks.runtime.isRunning.mockReturnValue(false);
    mocks.runtime.getState.mockReturnValue({
      status: 'stopped', pid: null, startedAt: null, lastActivity: null, error: null, activeTasks: 0,
    });
    mocks.runtime.start.mockImplementation(async () => undefined);
    mocks.runtime.stop.mockImplementation(async () => undefined);
    mocks.runtime.restart.mockImplementation(async () => undefined);
    mocks.runtime.getTaskStatus.mockImplementation(async () => ({ status: 'running', taskId: 't1' }));
    mocks.runtime.cancelTask.mockImplementation(async () => ({ taskId: 't1', cancelled: true }));
    mocks.runtime.respondToApproval.mockImplementation(async () => ({ approvalId: 'a1', supported: true, approved: true }));
  });

  describe('GET /status', () => {
    it('returns connector state', async () => {
      mocks.runtime.getState.mockReturnValueOnce({
        status: 'running',
        pid: 12345,
        startedAt: '2026-04-04T00:00:00Z',
        lastActivity: '2026-04-04T00:01:00Z',
        error: null,
        activeTasks: 2,
      });

      const app = await makeApp();
      const res = await request(app, 'GET', '/api/a2a/connectors/opencode/status');

      expect(res.status).toBe(200);
      const body = res.body as { success: boolean; data: { connector: string; status: string } };
      expect(body.success).toBe(true);
      expect(body.data.connector).toBe('opencode-cli');
      expect(body.data.status).toBe('running');
    });

    it('returns 500 on runtime error', async () => {
      mocks.runtime.getState.mockImplementationOnce(() => {
        throw new Error('runtime exploded');
      });

      const app = await makeApp();
      const res = await request(app, 'GET', '/api/a2a/connectors/opencode/status');

      expect(res.status).toBe(500);
      expect((res.body as { success: boolean }).success).toBe(false);
    });
  });

  describe('POST /start', () => {
    it('starts the connector and returns 201', async () => {
      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/start');

      expect(res.status).toBe(201);
      const body = res.body as { success: boolean; data: { message: string } };
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('started successfully');
      expect(mocks.runtime.start).toHaveBeenCalledOnce();
    });

    it('returns 200 when already running (idempotent)', async () => {
      mocks.runtime.isRunning.mockReturnValue(true);

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/start');

      expect(res.status).toBe(200);
      const body = res.body as { success: boolean; data: { message: string } };
      expect(body.data.message).toContain('already running');
      expect(mocks.runtime.start).not.toHaveBeenCalled();
    });

    it('returns 500 on start failure', async () => {
      mocks.runtime.start.mockRejectedValueOnce(new Error('port in use'));

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/start');

      expect(res.status).toBe(500);
      const body = res.body as { success: boolean; error: { code: string; message: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONNECTOR_ERROR');
      expect(body.error.message).toContain('port in use');
    });
  });

  describe('POST /stop', () => {
    it('stops a running connector', async () => {
      mocks.runtime.isRunning.mockReturnValue(true);

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/stop');

      expect(res.status).toBe(200);
      expect((res.body as { data: { message: string } }).data.message).toContain('stopped successfully');
      expect(mocks.runtime.stop).toHaveBeenCalledOnce();
    });

    it('is idempotent when already stopped', async () => {
      mocks.runtime.isRunning.mockReturnValue(false);

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/stop');

      expect(res.status).toBe(200);
      expect((res.body as { data: { message: string } }).data.message).toContain('already stopped');
      expect(mocks.runtime.stop).not.toHaveBeenCalled();
    });

    it('returns 500 on stop failure', async () => {
      mocks.runtime.isRunning.mockReturnValue(true);
      mocks.runtime.stop.mockRejectedValueOnce(new Error('process stuck'));

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/stop');

      expect(res.status).toBe(500);
      expect((res.body as { error: { message: string } }).error.message).toContain('process stuck');
    });
  });

  describe('POST /restart', () => {
    it('restarts the connector', async () => {
      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/restart');

      expect(res.status).toBe(200);
      expect((res.body as { data: { message: string } }).data.message).toContain('restarted successfully');
      expect(mocks.runtime.restart).toHaveBeenCalledOnce();
    });

    it('returns 500 on restart failure', async () => {
      mocks.runtime.restart.mockRejectedValueOnce(new Error('restart failed'));

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/restart');

      expect(res.status).toBe(500);
      expect((res.body as { error: { message: string } }).error.message).toContain('restart failed');
    });
  });

  describe('GET /task/:taskId', () => {
    it('returns task status', async () => {
      mocks.runtime.getTaskStatus.mockResolvedValueOnce({
        status: 'completed',
        taskId: 'task_123',
      });

      const app = await makeApp();
      const res = await request(app, 'GET', '/api/a2a/connectors/opencode/task/task_123');

      expect(res.status).toBe(200);
      const body = res.body as { data: { status: string; taskId: string } };
      expect(body.data.status).toBe('completed');
      expect(body.data.taskId).toBe('task_123');
      expect(mocks.runtime.getTaskStatus).toHaveBeenCalledWith('task_123');
    });

    it('returns 500 on runtime error', async () => {
      mocks.runtime.getTaskStatus.mockRejectedValueOnce(new Error('task not found'));

      const app = await makeApp();
      const res = await request(app, 'GET', '/api/a2a/connectors/opencode/task/task_bad');

      expect(res.status).toBe(500);
      expect((res.body as { error: { message: string } }).error.message).toContain('task not found');
    });
  });

  describe('POST /task/:taskId/cancel', () => {
    it('cancels a task with reason', async () => {
      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/task/task_456/cancel', {
        reason: 'user requested',
      });

      expect(res.status).toBe(200);
      expect(mocks.runtime.cancelTask).toHaveBeenCalledWith('task_456', 'user requested');
    });

    it('cancels a task without reason', async () => {
      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/task/task_789/cancel', {});

      expect(res.status).toBe(200);
      expect(mocks.runtime.cancelTask).toHaveBeenCalledWith('task_789', undefined);
    });

    it('returns 500 on cancel failure', async () => {
      mocks.runtime.cancelTask.mockRejectedValueOnce(new Error('task already done'));

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/task/task_bad/cancel', {});

      expect(res.status).toBe(500);
      expect((res.body as { error: { message: string } }).error.message).toContain('task already done');
    });
  });

  describe('POST /approval/:approvalId', () => {
    it('approves a request with reason', async () => {
      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/approval/app_1', {
        approved: true,
        reason: 'looks safe',
      });

      expect(res.status).toBe(200);
      expect(mocks.runtime.respondToApproval).toHaveBeenCalledWith('app_1', true, 'looks safe');
    });

    it('denies a request', async () => {
      mocks.runtime.respondToApproval.mockResolvedValueOnce({
        approvalId: 'app_2',
        supported: true,
        approved: false,
      });

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/approval/app_2', {
        approved: false,
      });

      expect(res.status).toBe(200);
      expect(mocks.runtime.respondToApproval).toHaveBeenCalledWith('app_2', false, undefined);
    });

    it('treats missing approved field as deny', async () => {
      const app = await makeApp();
      await request(app, 'POST', '/api/a2a/connectors/opencode/approval/app_3', {});
      expect(mocks.runtime.respondToApproval).toHaveBeenCalledWith('app_3', false, undefined);
    });

    it('returns 500 on runtime error', async () => {
      mocks.runtime.respondToApproval.mockRejectedValueOnce(new Error('approval expired'));

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/approval/app_bad', {
        approved: true,
      });

      expect(res.status).toBe(500);
      expect((res.body as { error: { message: string } }).error.message).toContain('approval expired');
    });
  });
});
