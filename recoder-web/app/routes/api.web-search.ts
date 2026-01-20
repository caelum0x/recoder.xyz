import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

/**
 * POST /api/web-search
 * Search the web using DuckDuckGo or SearXNG
 */
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

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json() as { query?: string; numResults?: number };
    const { query, numResults = 5 } = body;

    if (!query) {
      return json({ error: 'Query is required' }, { status: 400 });
    }

    // Try DuckDuckGo Instant Answer API (free, no key needed)
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

    const response = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Recoder.xyz/1.0',
      },
    });

    if (!response.ok) {
      return json({ error: 'Search failed' }, { status: 500 });
    }

    const data = await response.json() as DDGResponse;

    // Format results
    const results = [];

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
      for (const topic of data.RelatedTopics.slice(0, numResults - results.length)) {
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

    return json({
      success: true,
      query,
      results: results.slice(0, numResults),
      raw: data, // Include raw data for debugging
    });
  } catch (error) {
    console.error('[web-search] Error:', error);
    return json({ error: 'Search failed' }, { status: 500 });
  }
}
