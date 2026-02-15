import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockVerifySession,
  mockDockerFetchJson,
  mockGetSessionTokenFromRequest,
  MockDockerHttpError,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockDockerFetchJson: vi.fn(),
  mockGetSessionTokenFromRequest: vi.fn(),
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

vi.mock('@remix-run/cloudflare', () => ({
  json: (data: unknown, init?: number | ResponseInit) => {
    const normalizedInit: ResponseInit =
      typeof init === 'number'
        ? { status: init }
        : {
            status: init?.status,
            headers: init?.headers,
            statusText: init?.statusText,
          };

    const headers = new Headers(normalizedInit.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json; charset=utf-8');
    }

    return new Response(JSON.stringify(data), {
      ...normalizedInit,
      headers,
    });
  },
}));

vi.mock('~/lib/http/docker-server', () => ({
  DockerHttpError: MockDockerHttpError,
  dockerFetchJson: mockDockerFetchJson,
  getDockerBackendUrl: vi.fn(() => 'http://docker'),
  getSessionTokenFromRequest: mockGetSessionTokenFromRequest,
}));

import { action as runCommandAction } from './api.run-command';

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

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

describe('api.run-command route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionTokenFromRequest.mockReturnValue(null);
  });

  it('requires authentication', async () => {
    mockVerifySession.mockResolvedValueOnce(null);

    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1', command: 'pwd' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = await runCommandAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(401);
  });

  it('maps DockerHttpError payload exitCode on non-streaming command failures', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1', email: 'u1@example.com' } });
    mockDockerFetchJson.mockRejectedValueOnce(
      new MockDockerHttpError('Command failed', 400, {
        error: 'command not found',
        exitCode: 127,
      }),
    );

    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1', command: 'not-a-real-command' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = (await runCommandAction({
      request,
      context: {} as any,
      params: {},
    } as any)) as Response;
    const payload = await readJsonBody(response);

    expect(getStatus(response)).toBe(500);
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('command not found');
    expect(payload.exitCode).toBe(127);
    expect(mockDockerFetchJson).toHaveBeenCalledTimes(1);
  });

  it('returns success payload for non-streaming command execution', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1', email: 'u1@example.com' } });
    mockDockerFetchJson.mockResolvedValueOnce({
      success: true,
      output: 'hello',
      exitCode: 0,
    });

    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1', command: 'echo hello', stream: false }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = (await runCommandAction({
      request,
      context: {} as any,
      params: {},
    } as any)) as Response;
    const payload = await readJsonBody(response);

    expect(getStatus(response)).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.output).toBe('hello');
    expect(payload.exitCode).toBe(0);
    expect(mockDockerFetchJson).toHaveBeenCalledTimes(1);
  });
});
