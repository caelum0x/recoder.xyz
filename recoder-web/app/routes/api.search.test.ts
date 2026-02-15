import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockVerifySession,
  mockDockerFetchJson,
  mockCreateDockerProxyHeaders,
  MockDockerHttpError,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockDockerFetchJson: vi.fn(),
  mockCreateDockerProxyHeaders: vi.fn(() => ({ Authorization: 'Bearer t', 'Content-Type': 'application/json' })),
  MockDockerHttpError: class extends Error {
    public readonly status: number;
    public readonly payload: unknown;

    constructor(message: string, status: number, payload: unknown) {
      super(message);
      this.name = 'DockerHttpError';
      this.status = status;
      this.payload = payload;
    }
  },
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

vi.mock('~/lib/http/docker-server', () => ({
  DockerHttpError: MockDockerHttpError,
  createDockerProxyHeaders: mockCreateDockerProxyHeaders,
  dockerFetchJson: mockDockerFetchJson,
  getDockerBackendUrl: vi.fn(() => 'http://docker'),
}));

import { action as searchAction } from './api.search';

async function readJsonBody(response: any): Promise<any> {
  if (response && typeof response.json === 'function') {
    return await response.json();
  }

  if (response && typeof response.data !== 'undefined') {
    return response.data;
  }

  if (response && typeof response.body === 'string') {
    try {
      return JSON.parse(response.body);
    } catch {
      return response.body;
    }
  }

  return null;
}

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

describe('api.search route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1', query: 'hello' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = await searchAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(401);
  });

  it('maps docker 404 to container not found error', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1', email: 'u1@example.com' } });
    mockDockerFetchJson.mockRejectedValueOnce(new MockDockerHttpError('not found', 404, { error: 'not found' }));

    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1', query: 'hello' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = await searchAction({ request, context: {} as any, params: {} } as any);
    const payload = await readJsonBody(response);

    expect(getStatus(response)).toBe(404);
    expect(payload.code).toBe('CONTAINER_NOT_FOUND');
  });

  it('returns search response and truncation metadata', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1', email: 'u1@example.com' } });
    mockDockerFetchJson.mockResolvedValueOnce({
      results: [
        { file: 'a.ts', line: 1, column: 1, text: 'x', matchStart: 0, matchEnd: 1 },
        { file: 'b.ts', line: 2, column: 1, text: 'x', matchStart: 0, matchEnd: 1 },
      ],
      total: 2,
    });

    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1', query: 'x', maxResults: 1 }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = await searchAction({ request, context: {} as any, params: {} } as any);
    const payload = await readJsonBody(response);

    expect(getStatus(response)).toBe(200);
    expect(payload.results).toHaveLength(1);
    expect(payload.truncated).toBe(true);
    expect(payload.total).toBe(1);
    expect(mockDockerFetchJson).toHaveBeenCalledTimes(1);
  });
});
