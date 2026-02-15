import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockVerifySession,
  mockDockerFetchJson,
  MockDockerHttpError,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockDockerFetchJson: vi.fn(),
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
  createDockerAuthHeaders: vi.fn(() => ({ 'Content-Type': 'application/json' })),
  dockerFetchJson: mockDockerFetchJson,
  getDockerBackendUrl: vi.fn(() => 'http://docker'),
}));

import { action as killSandboxAction } from './api.kill-sandbox';

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

describe('api.kill-sandbox route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    mockVerifySession.mockResolvedValueOnce(null);

    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = await killSandboxAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(401);
  });

  it('returns no-sandbox success when docker returns 404', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1', email: 'u1@example.com' } });
    mockDockerFetchJson.mockRejectedValueOnce(new MockDockerHttpError('not found', 404, { error: 'not found' }));

    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = await killSandboxAction({ request, context: {} as any, params: {} } as any);
    const payload = await readJsonBody(response);

    expect(getStatus(response)).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.sandboxKilled).toBe(false);
    expect(payload.message).toBe('No active sandbox found for this project');
    expect(mockDockerFetchJson).toHaveBeenCalledTimes(1);
  });

  it('returns success when docker delete succeeds', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1', email: 'u1@example.com' } });
    mockDockerFetchJson.mockResolvedValueOnce({ success: true });

    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = await killSandboxAction({ request, context: {} as any, params: {} } as any);
    const payload = await readJsonBody(response);

    expect(getStatus(response)).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.sandboxKilled).toBe(true);
    expect(mockDockerFetchJson).toHaveBeenCalledTimes(1);
  });

  it('maps docker errors to failure response', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1', email: 'u1@example.com' } });
    mockDockerFetchJson.mockRejectedValueOnce(
      new MockDockerHttpError('permission denied', 403, { error: 'permission denied' }),
    );

    const request = {
      method: 'POST',
      json: async () => ({ projectId: 'p1' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = await killSandboxAction({ request, context: {} as any, params: {} } as any);
    const payload = await readJsonBody(response);

    expect(getStatus(response)).toBe(500);
    expect(payload.success).toBe(false);
    expect(payload.sandboxKilled).toBe(false);
    expect(payload.error).toBe('permission denied');
    expect(payload.message).toBe('Failed to stop sandbox');
    expect(mockDockerFetchJson).toHaveBeenCalledTimes(1);
  });
});
