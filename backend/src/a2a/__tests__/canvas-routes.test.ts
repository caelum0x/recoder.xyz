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
          headers: {
            'content-type': 'application/json',
            connection: 'close',
            ...options?.headers,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            let body: any = data;
            try {
              body = JSON.parse(data);
            } catch {
              // leave as text
            }
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
            });
          });
        },
      );

      req.on('error', (error) => {
        server.close(() => reject(error));
      });

      if (options?.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
    server.on('error', reject);
  });
}

function requestToPort(
  port: number,
  method: string,
  path: string,
  options?: { headers?: Record<string, string>; body?: unknown },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'content-type': 'application/json',
          connection: 'close',
          ...options?.headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
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

    req.on('error', reject);

    if (options?.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
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
        persisted: false,
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
        persisted: false,
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
        persisted: false,
      },
    });
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(broadcastToWorkspaceMock).toHaveBeenCalledTimes(1);
  });

  it('persists elements to sandbox file when sandboxId and filePath are provided', async () => {
    const existingScene = JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'https://agents.recoder.xyz',
      elements: [{ id: 'old-1', type: 'rectangle', x: 0, y: 0, width: 50, height: 50 }],
      appState: {},
      files: {},
    });

    const readFile = vi.fn().mockResolvedValue(existingScene);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const app = createTestApp(createCanvasRouter({ readFile, writeFile }));

    const newElements = [{ id: 'new-1', type: 'ellipse', x: 100, y: 100, width: 60, height: 60 }];

    const response = await request(app, 'POST', '/api/a2a/canvas-update', {
      body: {
        projectId: 'project-persist',
        elements: newElements,
        sandboxId: 'sandbox-abc',
        filePath: 'canvases/board.excalidraw',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.persisted).toBe(true);
    expect(readFile).toHaveBeenCalledWith('sandbox-abc', 'canvases/board.excalidraw');
    expect(writeFile).toHaveBeenCalledWith(
      'sandbox-abc',
      'canvases/board.excalidraw',
      expect.any(String),
    );

    // Verify merged content
    const writtenScene = JSON.parse(writeFile.mock.calls[0][2]);
    expect(writtenScene.elements).toHaveLength(2);
    const ids = writtenScene.elements.map((e: any) => e.id);
    expect(ids).toContain('old-1');
    expect(ids).toContain('new-1');
  });

  it('creates new file when sandbox file does not exist', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('not found'));
    const writeFile = vi.fn().mockResolvedValue(undefined);

    const app = createTestApp(createCanvasRouter({ readFile, writeFile }));

    const response = await request(app, 'POST', '/api/a2a/canvas-update', {
      body: {
        projectId: 'project-new',
        elements: [{ id: 'first-1', type: 'text', x: 0, y: 0, width: 100, height: 30 }],
        sandboxId: 'sandbox-new',
        filePath: 'canvases/new-board.excalidraw',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.persisted).toBe(true);
    expect(writeFile).toHaveBeenCalled();
    const writtenScene = JSON.parse(writeFile.mock.calls[0][2]);
    expect(writtenScene.type).toBe('excalidraw');
    expect(writtenScene.elements).toHaveLength(1);
    expect(writtenScene.elements[0].id).toBe('first-1');
  });

  it('serializes parallel writes to the same canvas file', async () => {
    let storedScene = JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'https://agents.recoder.xyz',
      elements: [{ id: 'base-1', type: 'rectangle', x: 0, y: 0, width: 50, height: 50 }],
      appState: {},
      files: {},
    });

    let writeCount = 0;
    const readFile = vi.fn(async () => storedScene);
    const writeFile = vi.fn(async (_sandboxId: string, _filePath: string, content: string) => {
      writeCount += 1;
      if (writeCount === 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      storedScene = content;
    });

    const app = createTestApp(createCanvasRouter({ readFile, writeFile }));
    const server = await new Promise<http.Server>((resolve, reject) => {
      const nextServer = app.listen(0, '127.0.0.1', () => resolve(nextServer));
      nextServer.on('error', reject);
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      throw new Error('Could not determine server address');
    }

    const first = requestToPort(addr.port, 'POST', '/api/a2a/canvas-update', {
      body: {
        projectId: 'project-parallel',
        elements: [{ id: 'parallel-1', type: 'ellipse', x: 10, y: 10, width: 20, height: 20 }],
        sandboxId: 'sandbox-parallel',
        filePath: 'canvases/board.excalidraw',
      },
    });
    const second = requestToPort(addr.port, 'POST', '/api/a2a/canvas-update', {
      body: {
        projectId: 'project-parallel',
        elements: [{ id: 'parallel-2', type: 'diamond', x: 30, y: 30, width: 20, height: 20 }],
        sandboxId: 'sandbox-parallel',
        filePath: 'canvases/board.excalidraw',
      },
    });

    const responses = await Promise.all([first, second]);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(writeFile).toHaveBeenCalledTimes(2);
    const finalScene = JSON.parse(storedScene);
    expect(finalScene.elements.map((element: any) => element.id).sort()).toEqual([
      'base-1',
      'parallel-1',
      'parallel-2',
    ]);
  });

  it('reads current board state from sandbox via GET /read', async () => {
    const scene = JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'https://agents.recoder.xyz',
      elements: [
        { id: 'a', type: 'rectangle', x: 0, y: 0, width: 100, height: 100 },
        { id: 'b', type: 'ellipse', x: 50, y: 50, width: 60, height: 60 },
      ],
      appState: { theme: 'dark' },
      files: {},
    });

    const readFile = vi.fn().mockResolvedValue(scene);
    const app = createTestApp(createCanvasRouter({ readFile }));

    const response = await request(
      app,
      'GET',
      '/api/a2a/canvas-update/read?sandboxId=sandbox-read&filePath=canvases/board.excalidraw',
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.elementCount).toBe(2);
    expect(response.body.data.elements).toHaveLength(2);
    expect(readFile).toHaveBeenCalledWith('sandbox-read', 'canvases/board.excalidraw');
  });

  it('returns 404 when board file does not exist', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('file not found'));
    const app = createTestApp(createCanvasRouter({ readFile }));

    const response = await request(
      app,
      'GET',
      '/api/a2a/canvas-update/read?sandboxId=sandbox-missing&filePath=canvases/nope.excalidraw',
    );

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
