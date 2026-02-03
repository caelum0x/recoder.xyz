import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

/**
 * POST /api/web-search
 * Search the web using Firecrawl (primary) or DuckDuckGo (fallback)
 *
 * Features:
 * - Firecrawl search with markdown content and screenshots
 * - DuckDuckGo fallback when Firecrawl is not configured
 * - Structured results for AI consumption
 *
 * Based on open-lovable's search implementation
 */

// ============================================================================
// Types
// ============================================================================

interface WebSearchRequest {
  query: string;
  numResults?: number;
  limit?: number; // Alias for numResults
  includeMarkdown?: boolean;
  includeScreenshot?: boolean;
  provider?: 'firecrawl' | 'duckduckgo' | 'auto';
}

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  markdown?: string;
  screenshot?: string | null;
  score?: number;
}

interface DDGResponse {
  Abstract?: string;
  Heading?: string;
  AbstractURL?: string;
  AbstractSource?: string;
  RelatedTopics?: Array<{
    Text?: string;
    FirstURL?: string;
  }>;
  Infobox?: {
    content?: Array<{
      label?: string;
      value?: string;
    }>;
  };
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: Array<{
    url: string;
    title?: string;
    description?: string;
    screenshot?: string;
    markdown?: string;
    score?: number;
  }>;
  error?: string;
}

// ============================================================================
// Search Providers
// ============================================================================

/**
 * Search using Firecrawl API
 */
async function searchWithFirecrawl(
  query: string,
  options: {
    limit: number;
    includeMarkdown: boolean;
    includeScreenshot: boolean;
    apiKey: string;
  }
): Promise<{ success: boolean; results: SearchResult[]; error?: string }> {
  const formats: string[] = [];
  if (options.includeMarkdown) formats.push('markdown');
  if (options.includeScreenshot) formats.push('screenshot');

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit: options.limit,
        scrapeOptions: {
          formats: formats.length > 0 ? formats : ['markdown'],
          onlyMainContent: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[web-search] Firecrawl error:', response.status, errorText);
      return { success: false, results: [], error: `Firecrawl error: ${errorText}` };
    }

    const data = (await response.json()) as FirecrawlSearchResponse;

    if (data.success === false || !data.data) {
      return { success: false, results: [], error: data.error || 'No results' };
    }

    const results: SearchResult[] = data.data.map((item) => ({
      title: item.title || item.url,
      snippet: item.description || item.markdown?.substring(0, 200) || '',
      url: item.url,
      source: 'Firecrawl',
      markdown: item.markdown,
      screenshot: item.screenshot || null,
      score: item.score,
    }));

    return { success: true, results };
  } catch (error) {
    console.error('[web-search] Firecrawl request failed:', error);
    return { success: false, results: [], error: (error as Error).message };
  }
}

/**
 * Search using DuckDuckGo Instant Answer API (free, no key needed)
 */
async function searchWithDuckDuckGo(
  query: string,
  limit: number
): Promise<{ success: boolean; results: SearchResult[]; error?: string }> {
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

    const response = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Recoder.xyz/1.0',
      },
    });

    if (!response.ok) {
      return { success: false, results: [], error: 'DuckDuckGo request failed' };
    }

    const data = (await response.json()) as DDGResponse;
    const results: SearchResult[] = [];

    // Add abstract if available
    if (data.Abstract) {
      results.push({
        title: data.Heading || query,
        snippet: data.Abstract,
        url: data.AbstractURL || '',
        source: data.AbstractSource || 'DuckDuckGo',
      });
    }

    // Add related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, limit - results.length)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
            snippet: topic.Text,
            url: topic.FirstURL,
            source: 'DuckDuckGo',
          });
        }
      }
    }

    // Add infobox if available
    if (data.Infobox?.content) {
      for (const item of data.Infobox.content.slice(0, 3)) {
        if (item.label && item.value) {
          results.push({
            title: item.label,
            snippet: item.value,
            url: '',
            source: 'Infobox',
          });
        }
      }
    }

    return { success: true, results: results.slice(0, limit) };
  } catch (error) {
    console.error('[web-search] DuckDuckGo request failed:', error);
    return { success: false, results: [], error: (error as Error).message };
  }
}

// ============================================================================
// API Handler
// ============================================================================

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = (await request.json()) as WebSearchRequest;
    const {
      query,
      numResults = 10,
      limit,
      includeMarkdown = true,
      includeScreenshot = false,
      provider = 'auto',
    } = body;

    const resultLimit = limit || numResults;

    if (!query) {
      return json({ error: 'Query is required' }, { status: 400 });
    }

    console.log('[web-search] Searching:', query, 'provider:', provider, 'limit:', resultLimit);

    // Get Firecrawl API key from environment
    const env = (context as any)?.cloudflare?.env || process.env;
    const firecrawlApiKey = env.FIRECRAWL_API_KEY;

    let searchResult: { success: boolean; results: SearchResult[]; error?: string };
    let usedProvider: string;

    // Determine which provider to use
    if (provider === 'firecrawl' || (provider === 'auto' && firecrawlApiKey)) {
      if (!firecrawlApiKey) {
        return json({
          success: false,
          error: 'FIRECRAWL_API_KEY not configured',
        }, { status: 503 });
      }

      searchResult = await searchWithFirecrawl(query, {
        limit: resultLimit,
        includeMarkdown,
        includeScreenshot,
        apiKey: firecrawlApiKey,
      });
      usedProvider = 'firecrawl';

      // Fall back to DuckDuckGo if Firecrawl fails
      if (!searchResult.success && provider === 'auto') {
        console.log('[web-search] Firecrawl failed, falling back to DuckDuckGo');
        searchResult = await searchWithDuckDuckGo(query, resultLimit);
        usedProvider = 'duckduckgo';
      }
    } else {
      searchResult = await searchWithDuckDuckGo(query, resultLimit);
      usedProvider = 'duckduckgo';
    }

    if (!searchResult.success) {
      return json({
        success: false,
        error: searchResult.error || 'Search failed',
      }, { status: 500 });
    }

    console.log('[web-search] Success:', {
      query,
      provider: usedProvider,
      resultCount: searchResult.results.length,
    });

    return json({
      success: true,
      query,
      provider: usedProvider,
      results: searchResult.results,
      totalResults: searchResult.results.length,
    });
  } catch (error) {
    console.error('[web-search] Error:', error);
    return json({ success: false, error: 'Search failed' }, { status: 500 });
  }
}

/**
 * GET handler for endpoint documentation
 */
export async function loader() {
  return json({
    status: 'ok',
    service: 'web-search',
    description: 'Web search using Firecrawl (with markdown/screenshots) or DuckDuckGo fallback',
    methods: ['POST'],
    usage: {
      endpoint: '/api/web-search',
      body: {
        query: 'string (required) - The search query',
        numResults: 'number (optional) - Max results, default: 10',
        limit: 'number (optional) - Alias for numResults',
        includeMarkdown: 'boolean (optional) - Include markdown content (Firecrawl only), default: true',
        includeScreenshot: 'boolean (optional) - Include screenshots (Firecrawl only), default: false',
        provider: "string (optional) - 'firecrawl' | 'duckduckgo' | 'auto', default: 'auto'",
      },
      response: {
        success: 'boolean',
        query: 'string - The original query',
        provider: 'string - Which provider was used',
        results: [{
          title: 'string',
          snippet: 'string - Description or excerpt',
          url: 'string',
          source: 'string',
          markdown: 'string (optional) - Full content',
          screenshot: 'string | null (optional)',
          score: 'number (optional)',
        }],
        totalResults: 'number',
      },
    },
    notes: [
      'Uses Firecrawl when FIRECRAWL_API_KEY is configured',
      'Falls back to DuckDuckGo when Firecrawl is not available',
      'Firecrawl provides richer results with markdown and screenshots',
      'DuckDuckGo is free but provides less detailed results',
    ],
  });
}
