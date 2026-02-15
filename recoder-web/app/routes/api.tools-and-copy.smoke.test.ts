import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockVerifySession, mockWebSearch, mockFetchUrlWithGiselleWebSearch } = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockWebSearch: vi.fn(),
  mockFetchUrlWithGiselleWebSearch: vi.fn(),
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

vi.mock('~/lib/.server/llm/tools/simple-wrappers', () => ({
  webSearch: mockWebSearch,
}));

vi.mock('~/lib/.server/web/giselle-web-search', () => ({
  fetchUrlWithGiselleWebSearch: mockFetchUrlWithGiselleWebSearch,
}));

import { action as copyProjectAction } from './api.projects.copy';
import { action as webSearchAction } from './api.tools.web-search';
import { action as webCrawlAction } from './api.tools.web-crawl';

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

describe('tool and copy route smoke tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchUrlWithGiselleWebSearch.mockResolvedValue(null);
  });

  it('returns 405 for non-POST copy_project requests', async () => {
    const request = { method: 'GET' } as any;
    const response = await copyProjectAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(405);
  });

  it('returns 401 for copy_project when session is missing', async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ sourceProjectId: 'p1' }),
    } as any;
    const response = await copyProjectAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(401);
  });

  it('returns 400 for web_search when query is missing', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({}),
    } as any;
    const response = await webSearchAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(400);
  });

  it('returns search results for web_search when wrapper succeeds', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockWebSearch.mockResolvedValueOnce({
      success: true,
      results: [{ title: 'Doc', url: 'https://example.com', snippet: 'Example snippet' }],
    });

    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ query: 'example query' }),
    } as any;

    const response = await webSearchAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(200);
    expect(mockWebSearch).toHaveBeenCalledTimes(1);
  });

  it('enriches web_search results with page context when available', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockWebSearch.mockResolvedValueOnce({
      success: true,
      results: [{ title: 'Doc', url: 'https://example.com', snippet: 'Example snippet' }],
    });
    mockFetchUrlWithGiselleWebSearch.mockResolvedValueOnce({
      url: 'https://example.com',
      title: 'Example',
      html: '<html></html>',
      markdown: '# Example markdown context',
    });

    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ query: 'example query' }),
    } as any;
    const response: any = await webSearchAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(200);
    expect(mockFetchUrlWithGiselleWebSearch).toHaveBeenCalledTimes(1);
  });

  it('reuses cached page context on repeated web_search enrichments', async () => {
    mockVerifySession.mockResolvedValue({ user: { id: 'u1' } });
    mockWebSearch.mockResolvedValue({
      success: true,
      results: [{ title: 'Doc', url: 'https://example.com', snippet: 'Example snippet' }],
    });
    mockFetchUrlWithGiselleWebSearch.mockResolvedValue({
      url: 'https://example.com',
      title: 'Example',
      html: '<html><body><main>Cached context body</main></body></html>',
      markdown: null,
    });

    const requestA = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ query: 'repeatable query' }),
    } as any;
    const requestB = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ query: 'repeatable query' }),
    } as any;

    const responseA: any = await webSearchAction({ request: requestA, context: {} as any, params: {} } as any);
    const responseB: any = await webSearchAction({ request: requestB, context: {} as any, params: {} } as any);

    expect(getStatus(responseA)).toBe(200);
    expect(getStatus(responseB)).toBe(200);
    expect(mockFetchUrlWithGiselleWebSearch).toHaveBeenCalledTimes(1);
    expect(responseB?.data?.enrichment?.cacheHits ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('passes domain policy to web_search wrapper', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockWebSearch.mockResolvedValueOnce({
      success: true,
      results: [{ title: 'Doc', url: 'https://example.com', snippet: 'Example snippet' }],
    });

    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        query: 'example query',
        allowedDomains: ['example.com'],
        blockedDomains: ['blocked.example.com'],
        maxUses: 1,
      }),
    } as any;

    await webSearchAction({ request, context: {} as any, params: {} } as any);
    expect(mockWebSearch).toHaveBeenCalledWith(
      'example query',
      expect.objectContaining({
        allowedDomains: ['example.com'],
        blockedDomains: ['blocked.example.com'],
      })
    );
  });

  it('drops unsupported blockedDomains for provider-specific web_search capability', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockWebSearch.mockResolvedValueOnce({
      success: true,
      results: [{ title: 'Doc', url: 'https://example.com', snippet: 'Example snippet' }],
    });

    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        query: 'provider constrained query',
        providerHint: 'openai',
        allowedDomains: ['example.com'],
        blockedDomains: ['blocked.example.com'],
      }),
    } as any;

    const response: any = await webSearchAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(200);
    expect(response.data?.provider).toBe('openai');
    expect(response.data?.warnings?.length).toBeGreaterThan(0);
    expect(mockWebSearch).toHaveBeenCalledWith(
      'provider constrained query',
      expect.objectContaining({
        allowedDomains: ['example.com'],
        blockedDomains: undefined,
      }),
    );
  });

  it('returns 405 for non-POST web_crawl requests', async () => {
    const request = { method: 'GET' } as any;
    const response = await webCrawlAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(405);
  });

  it('blocks localhost URLs for web_crawl', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    const request = {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ url: 'http://localhost:3000' }),
    } as any;
    const response = await webCrawlAction({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(400);
  });
});
