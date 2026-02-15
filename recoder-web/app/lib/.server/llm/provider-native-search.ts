/**
 * Provider-Native Web Search Executor
 *
 * Executes web search queries via Anthropic, OpenAI, or Google native APIs
 * instead of the free-fallback (DuckDuckGo/Tavily/scraping).
 *
 * Used by api.tools.web-search when the resolved tool-set indicates
 * that a provider-native search tool is available.
 */

import type { WebToolProvider } from '~/lib/modes/types';
import { getUserApiKey, getSessionCookie } from './user-api-key';

export interface NativeSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface NativeSearchResponse {
  success: boolean;
  results: NativeSearchResult[];
  provider: WebToolProvider;
  error?: string;
}

export interface NativeSearchConfig {
  maxUses?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
}

// --------------- Anthropic ---------------

interface AnthropicContentBlock {
  type: string;
  source?: string;
  title?: string;
  url?: string;
  encrypted_content?: string;
  content?: string | AnthropicContentBlock[];
  text?: string;
  // web_search_results content block
  search_results?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    page_content?: string;
  }>;
}

async function searchWithAnthropic(
  apiKey: string,
  query: string,
  config?: NativeSearchConfig,
): Promise<NativeSearchResponse> {
  const toolConfig: Record<string, unknown> = {
    type: 'web_search_20250305',
    name: 'web_search',
  };

  if (config?.maxUses != null) {
    toolConfig.max_uses = config.maxUses;
  }
  if (config?.allowedDomains?.length) {
    toolConfig.allowed_domains = config.allowedDomains;
  }
  if (config?.blockedDomains?.length) {
    toolConfig.blocked_domains = config.blockedDomains;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 1024,
      tools: [toolConfig],
      messages: [{ role: 'user', content: `Search the web for: ${query}` }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    return { success: false, results: [], provider: 'anthropic', error: `Anthropic API error: ${response.status} ${errorText}` };
  }

  const data = await response.json() as { content?: AnthropicContentBlock[] };
  const results: NativeSearchResult[] = [];

  for (const block of data.content || []) {
    // Handle web_search_tool_result blocks that contain search_results
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const inner of block.content) {
        if (inner.type === 'web_search_result' && inner.url && inner.title) {
          results.push({
            title: inner.title || '',
            url: inner.url || '',
            snippet: inner.encrypted_content || inner.content as string || '',
          });
        }
      }
    }
  }

  return { success: true, results, provider: 'anthropic' };
}

// --------------- OpenAI ---------------

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
        title?: string;
        text?: string;
      }>;
    };
  }>;
}

async function searchWithOpenAI(
  apiKey: string,
  query: string,
  _config?: NativeSearchConfig,
): Promise<NativeSearchResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-search-preview',
      web_search_options: {},
      messages: [{ role: 'user', content: query }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    return { success: false, results: [], provider: 'openai', error: `OpenAI API error: ${response.status} ${errorText}` };
  }

  const data = await response.json() as OpenAIChatResponse;
  const results: NativeSearchResult[] = [];

  const message = data.choices?.[0]?.message;
  if (message?.annotations) {
    for (const annotation of message.annotations) {
      if (annotation.type === 'url_citation' && annotation.url) {
        results.push({
          title: annotation.title || annotation.url,
          url: annotation.url,
          snippet: annotation.text || '',
        });
      }
    }
  }

  return { success: true, results, provider: 'openai' };
}

// --------------- Google ---------------

interface GoogleGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GoogleGenerateContentResponse {
  candidates?: Array<{
    groundingMetadata?: {
      groundingChunks?: GoogleGroundingChunk[];
      webSearchQueries?: string[];
    };
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

async function searchWithGoogle(
  apiKey: string,
  query: string,
  _config?: NativeSearchConfig,
): Promise<NativeSearchResponse> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    return { success: false, results: [], provider: 'google', error: `Google API error: ${response.status} ${errorText}` };
  }

  const data = await response.json() as GoogleGenerateContentResponse;
  const results: NativeSearchResult[] = [];

  const candidate = data.candidates?.[0];
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const textParts = candidate?.content?.parts || [];
  const summaryText = textParts.map((p) => p.text || '').join(' ').trim();

  for (const chunk of chunks) {
    if (chunk.web?.uri) {
      results.push({
        title: chunk.web.title || chunk.web.uri,
        url: chunk.web.uri,
        snippet: summaryText.slice(0, 200),
      });
    }
  }

  return { success: true, results, provider: 'google' };
}

// --------------- Public API ---------------

/**
 * Execute a web search using the provider's native API.
 *
 * Resolves the API key from the user's session (BYOK) or environment vars,
 * then dispatches to the provider-specific implementation.
 */
export async function providerNativeSearch(
  provider: WebToolProvider,
  query: string,
  config?: NativeSearchConfig,
  request?: Request,
  _context?: unknown,
): Promise<NativeSearchResponse> {
  if (provider === 'free-fallback') {
    return { success: false, results: [], provider, error: 'free-fallback does not support native search' };
  }

  // Resolve API key: user BYOK (via session cookie) → environment variable
  let apiKey: string | null = null;

  if (request) {
    const sessionCookie = getSessionCookie(request);
    apiKey = await getUserApiKey(sessionCookie, provider);
  }

  if (!apiKey) {
    // Fall back to environment variables
    const envKeys: Record<string, string | undefined> = {
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      google: process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    };
    apiKey = envKeys[provider] || null;
  }

  if (!apiKey) {
    return { success: false, results: [], provider, error: `No API key available for ${provider}` };
  }

  switch (provider) {
    case 'anthropic':
      return searchWithAnthropic(apiKey, query, config);
    case 'openai':
      return searchWithOpenAI(apiKey, query, config);
    case 'google':
      return searchWithGoogle(apiKey, query, config);
    default:
      return { success: false, results: [], provider, error: `Unsupported provider: ${provider}` };
  }
}
