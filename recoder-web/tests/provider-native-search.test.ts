import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before any imports
const { mockGetUserApiKey, mockGetSessionCookie, mockFetch } = vi.hoisted(() => ({
  mockGetUserApiKey: vi.fn(),
  mockGetSessionCookie: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('~/lib/.server/llm/user-api-key', () => ({
  getUserApiKey: mockGetUserApiKey,
  getSessionCookie: mockGetSessionCookie,
}));

// Mock global fetch
vi.stubGlobal('fetch', mockFetch);

import { providerNativeSearch } from '~/lib/.server/llm/provider-native-search';

describe('providerNativeSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  it('returns error for free-fallback provider', async () => {
    const result = await providerNativeSearch('free-fallback', 'test query');
    expect(result.success).toBe(false);
    expect(result.provider).toBe('free-fallback');
    expect(result.error).toContain('free-fallback');
  });

  it('returns error when no API key is available', async () => {
    mockGetSessionCookie.mockReturnValue(null);
    mockGetUserApiKey.mockResolvedValue(null);

    const request = new Request('http://localhost/test', { method: 'POST' });
    const result = await providerNativeSearch('anthropic', 'test query', undefined, request);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No API key available');
  });

  it('uses env API key when user has no BYOK key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
    mockGetSessionCookie.mockReturnValue(null);
    mockGetUserApiKey.mockResolvedValue(null);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'web_search_tool_result',
            content: [
              {
                type: 'web_search_result',
                title: 'Test Result',
                url: 'https://example.com',
                encrypted_content: 'Test snippet',
              },
            ],
          },
        ],
      }),
    });

    const result = await providerNativeSearch('anthropic', 'test query');
    expect(result.success).toBe(true);
    expect(result.provider).toBe('anthropic');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      title: 'Test Result',
      url: 'https://example.com',
      snippet: 'Test snippet',
    });
  });

  it('parses Anthropic web_search_tool_result blocks correctly', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'web_search_tool_result',
            content: [
              {
                type: 'web_search_result',
                title: 'Result 1',
                url: 'https://example.com/1',
                encrypted_content: 'Snippet 1',
              },
              {
                type: 'web_search_result',
                title: 'Result 2',
                url: 'https://example.com/2',
                encrypted_content: 'Snippet 2',
              },
            ],
          },
          {
            type: 'text',
            text: 'Summary of results',
          },
        ],
      }),
    });

    const result = await providerNativeSearch('anthropic', 'test query');
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.title).toBe('Result 1');
    expect(result.results[1]!.title).toBe('Result 2');
  });

  it('parses OpenAI annotations correctly', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Here are results...',
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://example.com/openai',
                  title: 'OpenAI Result',
                  text: 'Cited text',
                },
              ],
            },
          },
        ],
      }),
    });

    const result = await providerNativeSearch('openai', 'test query');
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      title: 'OpenAI Result',
      url: 'https://example.com/openai',
      snippet: 'Cited text',
    });
  });

  it('parses Google grounding chunks correctly', async () => {
    process.env.GOOGLE_API_KEY = 'AItest-google';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: 'https://example.com/google', title: 'Google Result' } },
              ],
            },
            content: {
              parts: [{ text: 'Summary text' }],
            },
          },
        ],
      }),
    });

    const result = await providerNativeSearch('google', 'test query');
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.title).toBe('Google Result');
    expect(result.results[0]!.url).toBe('https://example.com/google');
  });

  it('handles API errors gracefully', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    });

    const result = await providerNativeSearch('anthropic', 'test query');
    expect(result.success).toBe(false);
    expect(result.error).toContain('429');
  });

  it('passes config to Anthropic native search', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [] }),
    });

    await providerNativeSearch('anthropic', 'test', {
      maxUses: 3,
      allowedDomains: ['example.com'],
      blockedDomains: ['spam.com'],
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tools[0].max_uses).toBe(3);
    expect(body.tools[0].allowed_domains).toEqual(['example.com']);
    expect(body.tools[0].blocked_domains).toEqual(['spam.com']);
  });
});
