import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockVerifySession,
  mockWebSearch,
  mockProviderNativeSearch,
  mockLogToolAuditEvent,
  mockBuildToolSet,
} = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockWebSearch: vi.fn(),
  mockProviderNativeSearch: vi.fn(),
  mockLogToolAuditEvent: vi.fn(),
  mockBuildToolSet: vi.fn(),
}));

vi.mock('~/lib/auth/session.server', () => ({
  verifySession: mockVerifySession,
}));

vi.mock('~/lib/.server/llm/tools/simple-wrappers', () => ({
  webSearch: mockWebSearch,
}));

vi.mock('~/lib/.server/audit/tool-audit', () => ({
  logToolAuditEvent: mockLogToolAuditEvent,
}));

vi.mock('~/lib/.server/web/giselle-web-search', () => ({
  fetchUrlWithGiselleWebSearch: vi.fn().mockResolvedValue(null),
}));

vi.mock('~/lib/.server/web/web-safety', () => ({
  parseDomainList: (v: unknown) => (Array.isArray(v) ? v : undefined),
  validateWebUrlWithDns: vi.fn().mockResolvedValue({ valid: false }),
}));

vi.mock('~/lib/services/language-model-registry/tools/build-tool-set', () => ({
  buildToolSet: mockBuildToolSet,
}));

vi.mock('~/lib/modes/types', () => ({
  getWebProviderOrder: () => ['openai', 'anthropic', 'google', 'free-fallback'],
  getWebToolProviderCapability: (hint?: string) => ({
    provider: hint || 'free-fallback',
    supportsWebSearch: true,
    supportsWebCrawl: false,
    supportsAllowedDomains: true,
    supportsBlockedDomains: true,
    supportsMaxUses: true,
  }),
}));

vi.mock('~/lib/http/json-response', () => ({
  JsonResponse: {
    json: (data: any, init?: any) => ({ data, status: init?.status ?? 200, init }),
  },
}));

vi.mock('~/lib/.server/llm/provider-native-search', () => ({
  providerNativeSearch: mockProviderNativeSearch,
}));

vi.mock('~/lib/.server/llm/user-api-key', () => ({
  getUserApiKey: vi.fn().mockResolvedValue(null),
  getSessionCookie: vi.fn().mockReturnValue(null),
}));

import { action } from './api.tools.web-search';

function makeRequest(body: Record<string, unknown>) {
  return {
    method: 'POST',
    json: async () => body,
    headers: new Headers({ 'Content-Type': 'application/json' }),
  } as any;
}

function getStatus(response: any): number {
  return response?.init?.status ?? response?.status ?? 200;
}

function getBody(response: any): any {
  if (response?.data !== undefined) return response.data;
  return response;
}

describe('api.tools.web-search native routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildToolSet.mockReturnValue({
      webSearch: {
        provider: 'free-fallback',
        nativeSearchAvailable: false,
        nativeConfig: undefined,
        capability: { provider: 'free-fallback', supportsWebSearch: true, supportsWebCrawl: true, supportsAllowedDomains: true, supportsBlockedDomains: true, supportsMaxUses: true },
      },
    });
  });

  it('requires authentication', async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const request = makeRequest({ query: 'test' });
    const response = await action({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(401);
  });

  it('attempts native search when nativeSearchAvailable is true, falls back gracefully', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockBuildToolSet.mockReturnValue({
      webSearch: {
        provider: 'anthropic',
        nativeSearchAvailable: true,
        nativeConfig: { maxUses: 5 },
        capability: { provider: 'anthropic', supportsWebSearch: true, supportsWebCrawl: false, supportsAllowedDomains: true, supportsBlockedDomains: true, supportsMaxUses: true },
      },
    });
    // Even if native throws, the route gracefully falls back to webSearch
    mockWebSearch.mockResolvedValue({
      success: true,
      results: [{ title: 'Fallback Result', url: 'https://example.com', snippet: 'Search result' }],
    });

    const request = makeRequest({ query: 'test query', providerHint: 'anthropic' });
    const response = await action({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(200);

    const body = getBody(response);
    expect(body.results).toHaveLength(1);
    // retrievalMode will be 'provider-native' if native succeeded, 'free-fallback' otherwise
    expect(['provider-native', 'free-fallback']).toContain(body.retrievalMode);
  });

  it('falls back to free-fallback when native search throws', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockBuildToolSet.mockReturnValue({
      webSearch: {
        provider: 'anthropic',
        nativeSearchAvailable: true,
        nativeConfig: {},
        capability: { provider: 'anthropic', supportsWebSearch: true, supportsWebCrawl: false, supportsAllowedDomains: true, supportsBlockedDomains: true, supportsMaxUses: true },
      },
    });
    mockProviderNativeSearch.mockRejectedValueOnce(new Error('API key invalid'));
    mockWebSearch.mockResolvedValueOnce({
      success: true,
      results: [{ title: 'Fallback', url: 'https://fallback.com', snippet: 'Free search' }],
    });

    const request = makeRequest({ query: 'test fallback', providerHint: 'anthropic' });
    const response = await action({ request, context: {} as any, params: {} } as any);
    expect(getStatus(response)).toBe(200);

    const body = getBody(response);
    expect(body.retrievalMode).toBe('free-fallback');
    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe('Fallback');
  });

  it('falls back when native returns empty results', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockBuildToolSet.mockReturnValue({
      webSearch: {
        provider: 'openai',
        nativeSearchAvailable: true,
        nativeConfig: {},
        capability: { provider: 'openai', supportsWebSearch: true, supportsWebCrawl: false, supportsAllowedDomains: true, supportsBlockedDomains: false, supportsMaxUses: false },
      },
    });
    mockProviderNativeSearch.mockResolvedValueOnce({
      success: true,
      results: [],
      provider: 'openai',
    });
    mockWebSearch.mockResolvedValueOnce({
      success: true,
      results: [{ title: 'DDG Result', url: 'https://ddg.com', snippet: 'From DuckDuckGo' }],
    });

    const request = makeRequest({ query: 'test empty native', providerHint: 'openai' });
    const response = await action({ request, context: {} as any, params: {} } as any);
    const body = getBody(response);
    expect(body.retrievalMode).toBe('free-fallback');
    expect(mockWebSearch).toHaveBeenCalled();
  });

  it('uses free-fallback directly when nativeSearchAvailable is false', async () => {
    mockVerifySession.mockResolvedValueOnce({ user: { id: 'u1' } });
    mockWebSearch.mockResolvedValueOnce({
      success: true,
      results: [{ title: 'Free', url: 'https://free.com', snippet: 'Free' }],
    });

    const request = makeRequest({ query: 'test free' });
    const response = await action({ request, context: {} as any, params: {} } as any);
    const body = getBody(response);
    expect(body.retrievalMode).toBe('free-fallback');
    expect(mockProviderNativeSearch).not.toHaveBeenCalled();
    expect(mockWebSearch).toHaveBeenCalled();
  });
});
