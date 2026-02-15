import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockVerifySession } = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

import { loader } from './api.github.documents.status';
import {
  __getGitHubIngestionStatusForTests,
  __resetGitHubIngestionStatusForTests,
} from './api.github.documents';

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

function getData(response: any): any {
  return response?.data;
}

describe('api.github.documents.status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetGitHubIngestionStatusForTests();
  });

  it('returns 401 when unauthenticated', async () => {
    mockVerifySession.mockResolvedValueOnce(null);

    const response: any = await loader({
      request: { method: 'GET', url: 'http://localhost/api/github/documents/status?ingestionId=test' } as any,
      context: {} as any,
      params: {},
    } as any);

    expect(getStatus(response)).toBe(401);
  });

  it('returns 404 when ingestion id is missing or unknown', async () => {
    mockVerifySession.mockResolvedValue({ user: { id: 'user_1' } });

    const missingResponse: any = await loader({
      request: { method: 'GET', url: 'http://localhost/api/github/documents/status' } as any,
      context: {} as any,
      params: {},
    } as any);
    expect(getStatus(missingResponse)).toBe(400);

    const unknownResponse: any = await loader({
      request: { method: 'GET', url: 'http://localhost/api/github/documents/status?ingestionId=unknown' } as any,
      context: {} as any,
      params: {},
    } as any);
    expect(getStatus(unknownResponse)).toBe(404);
  });

  it('returns ingestion status for owner user only', async () => {
    const statuses = __getGitHubIngestionStatusForTests();
    statuses.set('ing_1', {
      id: 'ing_1',
      userId: 'owner_user',
      owner: 'acme',
      repo: 'sample',
      sourceType: 'issues',
      state: 'succeeded',
      provider: 'github-tool',
      count: 3,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    } as any);

    mockVerifySession.mockResolvedValueOnce({ user: { id: 'not_owner' } });
    const forbiddenResponse: any = await loader({
      request: { method: 'GET', url: 'http://localhost/api/github/documents/status?ingestionId=ing_1' } as any,
      context: {} as any,
      params: {},
    } as any);
    expect(getStatus(forbiddenResponse)).toBe(404);

    mockVerifySession.mockResolvedValueOnce({ user: { id: 'owner_user' } });
    const okResponse: any = await loader({
      request: { method: 'GET', url: 'http://localhost/api/github/documents/status?ingestionId=ing_1' } as any,
      context: {} as any,
      params: {},
    } as any);

    expect(getStatus(okResponse)).toBe(200);
    expect(getData(okResponse)?.success).toBe(true);
    expect(getData(okResponse)?.ingestion?.id).toBe('ing_1');
    expect(getData(okResponse)?.ingestion?.provider).toBe('github-tool');
  });
});
