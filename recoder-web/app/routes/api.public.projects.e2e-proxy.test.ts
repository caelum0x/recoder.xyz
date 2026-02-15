import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockVerifySession, mockFetch } = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

import { action as promptAction } from './api.public.projects.prompt';
import { loader as taskLoader } from './api.public.projects.task';
import { loader as taskStreamLoader } from './api.public.projects.task-stream';

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

describe('public project e2e proxy routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('rejects prompt proxy without session', async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1', prompt: 'hello', apiKey: 'sk_test' }),
    } as any;

    const response = await promptAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(401);
  });

  it('forwards prompt proxy to docker public API', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      headers: new Headers({
        'RateLimit-Limit': '20',
        'RateLimit-Remaining': '19',
        'RateLimit-Reset': '1739000000',
        'RateLimit-Policy': '20;w=60',
        'X-RateLimit-Limit': '30',
      }),
      json: async () => ({ success: true, data: { taskId: 't1', status: 'queued' } }),
    } as Response);

    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1', prompt: 'build app', apiKey: 'sk_test', model: 'openai/gpt-4o-mini' }),
    } as any;

    const response = await promptAction({
      request,
      context: { cloudflare: { env: { DOCKER_BACKEND_URL: 'http://docker' } } } as any,
      params: {},
    } as any);

    expect(getStatus(response)).toBe(202);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/projects/p1/prompt');
  });

  it('forwards task status loader to docker public API', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'RateLimit-Limit': '120',
        'RateLimit-Remaining': '119',
        'RateLimit-Reset': '1739000000',
      }),
      json: async () => ({
        success: true,
        data: { task: { id: 't1', status: 'running' } },
      }),
    } as Response);

    const request = new Request('http://localhost/api/public/projects/task?projectId=p1&taskId=t1&apiKey=sk_test');
    const response = await taskLoader({
      request,
      context: { cloudflare: { env: { DOCKER_BACKEND_URL: 'http://docker' } } } as any,
      params: {},
    } as any);

    expect(getStatus(response)).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/projects/p1/tasks/t1');
  });

  it('forwards task stream loader to docker public API', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: connected\ndata: {"taskId":"t1"}\n\n'));
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'Content-Type': 'text/event-stream',
        'RateLimit-Limit': '10',
        'RateLimit-Remaining': '9',
        'RateLimit-Reset': '1739000000',
        'RateLimit-Policy': '10;w=60',
      }),
      body: stream,
    } as unknown as Response);

    const request = new Request('http://localhost/api/public/projects/task-stream?projectId=p1&taskId=t1&apiKey=sk_test');
    const response = await taskStreamLoader({
      request,
      context: { cloudflare: { env: { DOCKER_BACKEND_URL: 'http://docker' } } } as any,
      params: {},
    } as any);

    expect(getStatus(response)).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/projects/p1/tasks/t1/stream');
  });
});
