import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRunAgent,
  mockVerifySession,
  mockApplyRateLimit,
  mockCreateRateLimitResponse,
  mockDockerPost,
} = vi.hoisted(() => ({
  mockRunAgent: vi.fn(),
  mockVerifySession: vi.fn(),
  mockApplyRateLimit: vi.fn(),
  mockCreateRateLimitResponse: vi.fn(),
  mockDockerPost: vi.fn(),
}));

vi.mock('~/lib/.server/llm/agent-orchestrator', () => ({
  runAgent: mockRunAgent,
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

vi.mock('~/lib/.server/middleware/rate-limiter', () => ({
  chatRateLimiter: {},
  applyRateLimit: mockApplyRateLimit,
  createRateLimitResponse: mockCreateRateLimitResponse,
}));

vi.mock('~/lib/services/docker-api', () => ({
  dockerPost: mockDockerPost,
}));

import { action as agentAction } from './api.agent';

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

describe('api.agent route', () => {
  function makeRequest(body: unknown): any {
    return {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => body,
      signal: new AbortController().signal,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyRateLimit.mockResolvedValue({
      allowed: true,
      headers: {},
      error: undefined,
    });
    mockVerifySession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCreateRateLimitResponse.mockReturnValue(
      new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 }),
    );
  });

  it('returns 401 when unauthenticated', async () => {
    mockVerifySession.mockResolvedValueOnce(null);

    const request = makeRequest({ projectId: 'proj-1', action: 'revert-file' });

    const response = await agentAction({ request, context: {}, params: {} } as any);

    expect(getStatus(response)).toBe(401);
  });

  it('revert-file requires path', async () => {
    const request = makeRequest({
      action: 'revert-file',
      projectId: 'proj-1',
      content: 'old file content',
    });

    const response = await agentAction({ request, context: {}, params: {} } as any);

    expect(getStatus(response)).toBe(400);
    expect(mockDockerPost).not.toHaveBeenCalled();
  });

  it('revert-file requires content', async () => {
    const request = makeRequest({
      action: 'revert-file',
      projectId: 'proj-1',
      path: 'src/file.ts',
    });

    const response = await agentAction({ request, context: {}, params: {} } as any);

    expect(getStatus(response)).toBe(400);
    expect(mockDockerPost).not.toHaveBeenCalled();
  });

  it('revert-file writes old content back to docker backend', async () => {
    mockDockerPost.mockResolvedValueOnce({ ok: true });

    const request = makeRequest({
      action: 'revert-file',
      projectId: 'proj-1',
      path: 'src/file.ts',
      content: 'old file content',
    });

    const response = await agentAction({ request, context: {}, params: {} } as any);

    expect(getStatus(response)).toBe(200);
    expect(mockDockerPost).toHaveBeenCalledWith('/api/file/proj-1', {
      filePath: 'src/file.ts',
      content: 'old file content',
    });
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it('revert-file returns 500 when docker write fails', async () => {
    mockDockerPost.mockRejectedValueOnce(new Error('docker write failed'));

    const request = makeRequest({
      action: 'revert-file',
      projectId: 'proj-1',
      path: 'src/file.ts',
      content: 'old file content',
    });

    const response = await agentAction({ request, context: {}, params: {} } as any);

    expect(getStatus(response)).toBe(500);
  });
});
