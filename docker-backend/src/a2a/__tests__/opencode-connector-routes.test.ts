/**
 * Tests for opencode-connector.routes.ts — the REST endpoint that dispatches
 * coding tasks through the A2A gateway.
 *
 * Covers both execution paths:
 *   - Centralized service path (OPENCODE_SERVICE_URL set) — calls
 *     opencode-service-adapter.promptProject()
 *   - Legacy localhost fallback — self-fetches /api/opencode/:projectId
 */

import http from 'http';
import express from 'express';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  promptProject: vi.fn(),
  setProviderKey: vi.fn(async () => true),
  opencodeRuntime: {
    isRunning: vi.fn(() => false),
    executeTask: vi.fn(async () => ({ taskId: 't1', success: true, resultText: 'ok' })),
  },
  sloMetrics: {
    recordConnectorExecution: vi.fn(),
  },
}));

vi.mock('../opencode-service-adapter', () => ({
  promptProject: mocks.promptProject,
  setProviderKey: mocks.setProviderKey,
  getOrCreateSession: vi.fn(),
  getActiveProjects: vi.fn(() => []),
  disposeProjectSession: vi.fn(),
  getProjectDiff: vi.fn(),
  getProjectMessages: vi.fn(),
  shellInProject: vi.fn(),
  abortProject: vi.fn(),
  isServiceHealthy: vi.fn(),
}));

vi.mock('../opencode-connector-runtime.service', () => ({
  getOpencodeConnectorRuntime: () => mocks.opencodeRuntime,
}));

vi.mock('../slo-metrics', () => ({
  getA2ASloMetrics: () => mocks.sloMetrics,
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

describe('opencode-connector.routes /execute', () => {
  const ORIGINAL_URL = process.env.OPENCODE_SERVICE_URL;

  beforeEach(() => {
    mocks.promptProject.mockReset();
    mocks.setProviderKey.mockReset();
    mocks.setProviderKey.mockImplementation(async () => true);
    mocks.opencodeRuntime.isRunning.mockReturnValue(false);
    mocks.sloMetrics.recordConnectorExecution.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.OPENCODE_SERVICE_URL;
    else process.env.OPENCODE_SERVICE_URL = ORIGINAL_URL;
    vi.unstubAllGlobals();
  });

  it('rejects requests without a prompt', async () => {
    const app = await makeApp();
    const res = await request(app, 'POST', '/api/a2a/connectors/opencode/execute', { projectId: 'proj_1' });

    expect(res.status).toBe(400);
    expect((res.body as { success: boolean }).success).toBe(false);
    expect(((res.body as { error: { code: string } }).error).code).toBe('MISSING_ENVELOPE_FIELD');
  });

  describe('centralized service path (OPENCODE_SERVICE_URL set)', () => {
    beforeEach(() => {
      process.env.OPENCODE_SERVICE_URL = 'http://opencode-test:4096';
    });

    it('routes through promptProject() when projectId is provided', async () => {
      mocks.promptProject.mockResolvedValueOnce({
        info: { id: 'msg_1', sessionID: 'sess_centralized', role: 'assistant', time: { created: 1000 } },
        parts: [
          { id: 'p1', sessionID: 'sess_centralized', messageID: 'msg_1', type: 'text', text: 'Hello from service' },
        ],
      });

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/execute', {
        prompt: 'Fix the bug',
        projectId: 'proj_centralized',
        requester: { id: 'test-caller', name: 'Test', platform: 'recoder_web' },
      });

      expect(res.status).toBe(200);
      const body = res.body as { success: boolean; data: { sessionId?: string; resultText?: string } };
      expect(body.success).toBe(true);
      expect(body.data.sessionId).toBe('sess_centralized');
      expect(body.data.resultText).toContain('Hello from service');

      expect(mocks.promptProject).toHaveBeenCalledOnce();
      const [projectId, input] = mocks.promptProject.mock.calls[0];
      expect(projectId).toBe('proj_centralized');
      expect(input.content).toBe('Fix the bug');
    });

    it('forwards provider keys via setProviderKey', async () => {
      mocks.promptProject.mockResolvedValueOnce({
        info: { id: 'msg_1', sessionID: 'sess_1', role: 'assistant', time: { created: 1000 } },
        parts: [],
      });

      const app = await makeApp();
      await request(app, 'POST', '/api/a2a/connectors/opencode/execute', {
        prompt: 'test',
        projectId: 'proj_byok',
        providerKeys: {
          openrouter: 'sk-or-test',
          anthropic: 'sk-ant-test',
        },
      });

      expect(mocks.setProviderKey).toHaveBeenCalledWith('openrouter', 'sk-or-test');
      expect(mocks.setProviderKey).toHaveBeenCalledWith('anthropic', 'sk-ant-test');
    });

    it('returns 500 on service adapter errors', async () => {
      mocks.promptProject.mockRejectedValueOnce(new Error('service unreachable'));

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/execute', {
        prompt: 'test',
        projectId: 'proj_err',
      });

      expect(res.status).toBe(500);
      const body = res.body as { success: boolean; error: { code: string; message: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONNECTOR_ERROR');
      expect(body.error.message).toContain('service unreachable');
    });

    it('records connector execution metrics', async () => {
      mocks.promptProject.mockResolvedValueOnce({
        info: { id: 'msg_1', sessionID: 'sess_1', role: 'assistant', time: { created: 1000 } },
        parts: [],
      });

      const app = await makeApp();
      await request(app, 'POST', '/api/a2a/connectors/opencode/execute', {
        prompt: 'test',
        projectId: 'proj_metrics',
      });

      expect(mocks.sloMetrics.recordConnectorExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorId: 'opencode',
          success: true,
        }),
      );
    });
  });

  describe('legacy sandbox path (no OPENCODE_SERVICE_URL)', () => {
    beforeEach(() => {
      delete process.env.OPENCODE_SERVICE_URL;
    });

    it('self-fetches /api/opencode/:projectId as fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          success: true,
          sessionId: 'sess_sandbox',
          text: 'Sandbox result',
          output: '',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
      vi.stubGlobal('fetch', mockFetch);

      const app = await makeApp();
      const res = await request(app, 'POST', '/api/a2a/connectors/opencode/execute', {
        prompt: 'test',
        projectId: 'proj_sandbox',
      });

      expect(res.status).toBe(200);
      const body = res.body as { data: { sessionId?: string; resultText?: string } };
      expect(body.data.sessionId).toBe('sess_sandbox');
      expect(body.data.resultText).toContain('Sandbox result');

      // Verify the fallback path was taken (fetch to localhost), not the service adapter
      expect(mockFetch).toHaveBeenCalled();
      expect(mocks.promptProject).not.toHaveBeenCalled();

      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('/api/opencode/proj_sandbox');
    });
  });
});
