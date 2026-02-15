import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockVerifySession, mockWebSearch } = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockWebSearch: vi.fn(),
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

vi.mock('~/lib/.server/llm/tools/simple-wrappers', () => ({
  webSearch: mockWebSearch,
}));

import { action as webSearchAction } from './api.web-search';

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

describe('api.web-search compatibility route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    mockVerifySession.mockResolvedValueOnce(null);

    const request = {
      method: 'POST',
      json: async () => ({ query: 'test' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = await webSearchAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(401);
  });

  it('uses internal search and returns results', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockWebSearch.mockResolvedValueOnce({
      success: true,
      results: [{ title: 'T', url: 'https://example.com', snippet: 'S' }],
    });

    const request = {
      method: 'POST',
      json: async () => ({ query: 'hello', numResults: 3, provider: 'firecrawl' }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as any;

    const response = await webSearchAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(200);
    expect(mockWebSearch).toHaveBeenCalledWith('hello', expect.objectContaining({ maxResults: 3 }));
  });
});
