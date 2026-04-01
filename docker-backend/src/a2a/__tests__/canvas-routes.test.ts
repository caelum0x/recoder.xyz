import http from 'http';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const publishMock = vi.fn();
const broadcastToWorkspaceMock = vi.fn();

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../a2a-event-bus', () => ({
  A2AEventType: {
    CanvasUpdate: 'canvas.update',
  },
  getA2AEventBus: () => ({
    publish: publishMock,
  }),
}));

vi.mock('../agent-bridge.service', () => ({
  getAgentBridgeService: () => ({
    broadcastToWorkspace: broadcastToWorkspaceMock,
  }),
}));

import { createCanvasRouter } from '../canvas.routes';

function createTestApp(router = createCanvasRouter()) {
  const app = express();
  app.use(express.json());
  app.use('/api/a2a/canvas-update', router);
  return app;
}

function request(
  app: express.Express,
  method: string,
  path: string,
  options?: { headers?: Record<string, string>; body?: unknown },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
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
          headers: {
            'content-type': 'application/json',
            ...options?.headers,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            server.close();
            let body: any = data;
            try {
              body = JSON.parse(data);
            } catch {
              // leave as text
            }
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
          });
        },
      );

      req.on('error', (error) => {
        server.close();
        reject(error);
      });

      if (options?.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  });
}

describe('canvas.routes', () => {
  beforeEach(() => {
    publishMock.mockReset();
    broadcastToWorkspaceMock.mockReset();
  });

  it('rejects requests without a projectId', async () => {
    const app = createTestApp();

    const response = await request(app, 'POST', '/api/a2a/canvas-update', {
      body: { elements: [] },
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'projectId is required',
    });
    expect(publishMock).not.toHaveBeenCalled();
    expect(broadcastToWorkspaceMock).not.toHaveBeenCalled();
  });

  it('publishes and broadcasts canvas updates without relay when no threadId is provided', async () => {
    const app = createTestApp();
    const elements = [{ id: 'shape-1', type: 'rectangle', x: 10, y: 20, width: 120, height: 80 }];

    const response = await request(app, 'POST', '/api/a2a/canvas-update', {
      body: { projectId: 'project-123', elements },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        projectId: 'project-123',
        threadId: null,
        elementCount: 1,
        relayed: false,
      },
    });
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock.mock.calls[0]?.[0]).toMatchObject({
      type: 'canvas.update',
      workspaceId: 'project-123',
      data: {
        projectId: 'project-123',
        threadId: null,
        elements,
        elementCount: 1,
      },
    });
    expect(broadcastToWorkspaceMock).toHaveBeenCalledWith(
      'project-123',
      expect.objectContaining({
        type: 'canvas_update',
        projectId: 'project-123',
        threadId: '',
        elements,
      }),
    );
  });

  it('relays thread-scoped updates to recoder-agents when configured', async () => {
    const relayFetch = vi.fn().mockResolvedValue({ ok: true });
    const app = createTestApp(
      createCanvasRouter({
        canvasHandlerUrl: 'https://agents.recoder.xyz/api/canvas/push',
        internalServiceKey: 'internal-key',
        relayFetch,
      }),
    );

    const elements = [{ id: 'shape-2', type: 'ellipse', x: 0, y: 0, width: 64, height: 64 }];

    const response = await request(app, 'POST', '/api/a2a/canvas-update', {
      body: {
        projectId: 'project-456',
        threadId: 'thread-789',
        elements,
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        projectId: 'project-456',
        threadId: 'thread-789',
        elementCount: 1,
        relayed: true,
      },
    });
    expect(relayFetch).toHaveBeenCalledWith(
      'https://agents.recoder.xyz/api/canvas/push',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer internal-key',
        }),
        body: JSON.stringify({
          projectId: 'project-456',
          threadId: 'thread-789',
          elements,
        }),
      }),
    );
  });

  it('keeps the canvas update successful when relay delivery fails', async () => {
    const relayFetch = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    const app = createTestApp(
      createCanvasRouter({
        canvasHandlerUrl: 'https://agents.recoder.xyz/api/canvas/push',
        internalServiceKey: 'internal-key',
        relayFetch,
      }),
    );

    const response = await request(app, 'POST', '/api/a2a/canvas-update', {
      body: {
        projectId: 'project-999',
        threadId: 'thread-999',
        elements: [{ id: 'shape-3', type: 'diamond', x: 5, y: 5, width: 80, height: 80 }],
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        projectId: 'project-999',
        threadId: 'thread-999',
        elementCount: 1,
        relayed: false,
      },
    });
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(broadcastToWorkspaceMock).toHaveBeenCalledTimes(1);
  });
});
