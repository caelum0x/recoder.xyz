import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { webSearch } from '~/lib/.server/llm/tools/simple-wrappers';
import { parseDomainList } from '~/lib/.server/web/web-safety';
import { verifySession } from '~/lib/auth/session.server';

interface WebSearchRequest {
  query?: string;
  numResults?: number;
  limit?: number;
  provider?: 'firecrawl' | 'duckduckgo' | 'auto' | 'internal';
  allowedDomains?: string[] | string;
  blockedDomains?: string[] | string;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  const session = await verifySession(request);
  if (!session?.user?.id) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as WebSearchRequest;
    const query = (body.query || '').trim();
    const resultLimit = Math.min(Math.max(body.limit || body.numResults || 10, 1), 10);
    const requestedProvider = body.provider || 'auto';
    const warnings: string[] = [];

    if (!query) {
      return json({ success: false, error: 'Query is required' }, { status: 400 });
    }

    if (requestedProvider === 'firecrawl') {
      warnings.push('firecrawl provider is not enabled on this endpoint; using internal search');
    }

    const allowedDomains = parseDomainList(body.allowedDomains);
    const blockedDomains = parseDomainList(body.blockedDomains);
    const result = await webSearch(query, {
      maxResults: resultLimit,
      allowedDomains,
      blockedDomains,
    });

    if (!result.success) {
      return json({
        success: false,
        error: result.error || 'Search failed',
        provider: 'internal',
        warnings,
      }, { status: 500 });
    }

    return json({
      success: true,
      query,
      provider: 'internal',
      warnings,
      results: result.results,
      totalResults: result.results.length,
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: 'Search failed',
      },
      { status: 500 },
    );
  }
}

export async function loader() {
  return json({
    status: 'ok',
    service: 'web-search',
    description: 'Compatibility web search endpoint backed by internal zero-vendor search stack',
    methods: ['POST'],
    usage: {
      body: {
        query: 'string (required)',
        numResults: 'number (optional, max 10)',
        limit: 'number (optional alias of numResults)',
        provider: 'auto | internal | duckduckgo | firecrawl (firecrawl coerced to internal)',
        allowedDomains: 'string[] | comma-separated string (optional)',
        blockedDomains: 'string[] | comma-separated string (optional)',
      },
    },
  });
}
