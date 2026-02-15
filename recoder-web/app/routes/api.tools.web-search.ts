import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { webSearch } from '~/lib/.server/llm/tools/simple-wrappers';
import { providerNativeSearch } from '~/lib/.server/llm/provider-native-search';
import { logToolAuditEvent } from '~/lib/.server/audit/tool-audit';
import { fetchUrlWithGiselleWebSearch } from '~/lib/.server/web/giselle-web-search';
import { parseDomainList, validateWebUrlWithDns } from '~/lib/.server/web/web-safety';
import { verifySession } from '~/lib/auth/session.server';
import { JsonResponse } from '~/lib/http/json-response';
import { getWebProviderOrder, getWebToolProviderCapability } from '~/lib/modes/types';
import { buildToolSet } from '~/lib/services/language-model-registry/tools/build-tool-set';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebSearchTool');

interface ToolsWebSearchRequest {
  query?: string;
  maxResults?: number;
  providerHint?: string;
  allowedDomains?: string[] | string;
  blockedDomains?: string[] | string;
  maxUses?: number;
  includePageContext?: boolean;
}

const MAX_ENRICHED_RESULTS = 2;
const MAX_CONTEXT_CHARS = 260;
const MAX_HTML_CHARS_FOR_SNIPPET = 250_000;
const MAX_QUERY_LENGTH = 500;
const MAX_DOMAIN_RULES = 20;
const SEARCH_RATE_WINDOW_MS = 60_000;
const SEARCH_RATE_LIMIT = 30;
const PAGE_CONTEXT_CACHE_TTL_MS = 10 * 60_000;
const PAGE_CONTEXT_CACHE_MAX_ENTRIES = 500;
const searchRateLimiter = new Map<string, number[]>();
const pageContextCache = new Map<string, { context: string; expiresAt: number; lastAccessAt: number }>();

function htmlToTextSnippet(html: string): string {
  return html
    .slice(0, MAX_HTML_CHARS_FOR_SNIPPET)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCachedPageContext(cacheKey: string): string | null {
  const now = Date.now();
  const entry = pageContextCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    pageContextCache.delete(cacheKey);
    return null;
  }
  entry.lastAccessAt = now;
  pageContextCache.set(cacheKey, entry);
  return entry.context;
}

function setCachedPageContext(cacheKey: string, context: string): void {
  const now = Date.now();
  pageContextCache.set(cacheKey, {
    context,
    expiresAt: now + PAGE_CONTEXT_CACHE_TTL_MS,
    lastAccessAt: now,
  });

  if (pageContextCache.size <= PAGE_CONTEXT_CACHE_MAX_ENTRIES) return;

  // Trim oldest entries first to bound memory usage.
  const evictable = Array.from(pageContextCache.entries())
    .sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt);
  const overflow = pageContextCache.size - PAGE_CONTEXT_CACHE_MAX_ENTRIES;
  for (let i = 0; i < overflow; i += 1) {
    const key = evictable[i]?.[0];
    if (key) {
      pageContextCache.delete(key);
    }
  }
}

async function enrichWithPageContext(
  results: Array<{ title: string; url: string; snippet: string }>,
  policy: { allowedDomains?: string[]; blockedDomains?: string[] },
  enabled: boolean,
): Promise<{
  results: Array<{ title: string; url: string; snippet: string }>;
  cacheHits: number;
  cacheMisses: number;
}> {
  if (!enabled) return { results, cacheHits: 0, cacheMisses: 0 };

  const enriched = [...results];
  const limit = Math.min(results.length, MAX_ENRICHED_RESULTS);
  let cacheHits = 0;
  let cacheMisses = 0;

  for (let i = 0; i < limit; i += 1) {
    const item = results[i];
    if (!item?.url) continue;

    const allowed = await validateWebUrlWithDns(item.url, {
      allowedDomains: policy.allowedDomains,
      blockedDomains: policy.blockedDomains,
      allowHttp: false,
    });
    if (!allowed.valid || !allowed.normalizedUrl) continue;

    const cacheKey = allowed.normalizedUrl;
    const cached = getCachedPageContext(cacheKey);
    if (cached) {
      cacheHits += 1;
      enriched[i] = {
        ...item,
        snippet: `${item.snippet}\n\nPage context: ${cached}`,
      };
      continue;
    }

    cacheMisses += 1;
    const scraped = await fetchUrlWithGiselleWebSearch(allowed.normalizedUrl, ['html']);
    if (!scraped?.html) continue;
    const context = htmlToTextSnippet(scraped.html).slice(0, MAX_CONTEXT_CHARS);
    if (!context) continue;
    setCachedPageContext(cacheKey, context);

    enriched[i] = {
      ...item,
      snippet: `${item.snippet}\n\nPage context: ${context}`,
    };
  }

  return { results: enriched, cacheHits, cacheMisses };
}

function enforceSearchRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const windowStart = now - SEARCH_RATE_WINDOW_MS;
  const recent = (searchRateLimiter.get(userId) || []).filter((ts) => ts > windowStart);

  if (recent.length >= SEARCH_RATE_LIMIT) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + SEARCH_RATE_WINDOW_MS - now) / 1000));
    searchRateLimiter.set(userId, recent);
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  searchRateLimiter.set(userId, recent);
  return { allowed: true };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return JsonResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const session = await verifySession(request);
  if (!session?.user?.id) {
    return JsonResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const userId = session.user.id;

  const limit = enforceSearchRateLimit(userId);
  if (!limit.allowed) {
    logToolAuditEvent({
      route: '/api/tools/web-search',
      action: 'web_search',
      userId,
      status: 'blocked',
      reason: 'rate_limit',
    });
    const headers = new Headers();
    headers.set('Retry-After', String(limit.retryAfterSeconds || 1));
    return JsonResponse.json({ error: 'Rate limit exceeded for web search' }, { status: 429, headers });
  }

  try {
    const body = await request.json() as ToolsWebSearchRequest;
    const query = (body.query || '').trim();
    const maxResults = Math.min(Math.max(body.maxResults || 5, 1), 10);
    const includePageContext = body.includePageContext !== false;
    const requestedAllowedDomains = parseDomainList(body.allowedDomains);
    const requestedBlockedDomains = parseDomainList(body.blockedDomains);
    const capability = getWebToolProviderCapability(body.providerHint);
    const warnings: string[] = [];

    const allowedDomains = capability.supportsAllowedDomains ? requestedAllowedDomains : undefined;
    const blockedDomains = capability.supportsBlockedDomains ? requestedBlockedDomains : undefined;
    if (!capability.supportsAllowedDomains && (requestedAllowedDomains?.length || 0) > 0) {
      warnings.push(`provider "${capability.provider}" does not support allowedDomains; rule ignored`);
    }
    if (!capability.supportsBlockedDomains && (requestedBlockedDomains?.length || 0) > 0) {
      warnings.push(`provider "${capability.provider}" does not support blockedDomains; rule ignored`);
    }
    if (!capability.supportsMaxUses && typeof body.maxUses === 'number') {
      warnings.push(`provider "${capability.provider}" does not support maxUses semantics`);
    }

    if (!query) {
      logToolAuditEvent({
        route: '/api/tools/web-search',
        action: 'web_search',
        userId,
        status: 'blocked',
        reason: 'missing_query',
      });
      return JsonResponse.json({ error: 'query is required' }, { status: 400 });
    }
    if (query.length > MAX_QUERY_LENGTH) {
      logToolAuditEvent({
        route: '/api/tools/web-search',
        action: 'web_search',
        userId,
        status: 'blocked',
        reason: 'query_too_long',
        meta: { queryLength: query.length },
      });
      return JsonResponse.json({ error: `query exceeds max length of ${MAX_QUERY_LENGTH}` }, { status: 400 });
    }
    if ((requestedAllowedDomains?.length || 0) > MAX_DOMAIN_RULES || (requestedBlockedDomains?.length || 0) > MAX_DOMAIN_RULES) {
      logToolAuditEvent({
        route: '/api/tools/web-search',
        action: 'web_search',
        userId,
        status: 'blocked',
        reason: 'too_many_domain_rules',
        meta: {
          allowedDomains: requestedAllowedDomains?.length || 0,
          blockedDomains: requestedBlockedDomains?.length || 0,
        },
      });
      return JsonResponse.json({ error: `Too many domain rules (max ${MAX_DOMAIN_RULES} each for allowedDomains/blockedDomains)` }, { status: 400 });
    }

    // Resolve tool-set to determine if provider-native search would be available
    const toolSet = buildToolSet({
      provider: body.providerHint,
      webSearchConfig: {
        maxUses: body.maxUses,
        allowedDomains: allowedDomains,
        blockedDomains: blockedDomains,
      },
    });

    // Try provider-native search first (Anthropic/OpenAI/Google).
    // Falls through to free-fallback if native is unavailable or fails.
    let retrievalMode: 'provider-native' | 'free-fallback' = 'free-fallback';
    let result: { success: boolean; results: Array<{ title: string; url: string; snippet: string }>; error?: string };

    if (toolSet.webSearch.nativeSearchAvailable) {
      try {
        const nativeResult = await providerNativeSearch(
          toolSet.webSearch.provider,
          query,
          toolSet.webSearch.nativeConfig,
          request,
          context,
        );
        if (nativeResult.success && nativeResult.results.length > 0) {
          result = nativeResult;
          retrievalMode = 'provider-native';
        } else {
          // Native returned no results or failed — fall through to free-fallback
          result = await webSearch(query, { maxResults, allowedDomains, blockedDomains });
        }
      } catch {
        // Native threw — fall through to free-fallback
        result = await webSearch(query, { maxResults, allowedDomains, blockedDomains });
      }
    } else {
      result = await webSearch(query, { maxResults, allowedDomains, blockedDomains });
    }

    if (!result.success) {
      logToolAuditEvent({
        route: '/api/tools/web-search',
        action: 'web_search',
        userId,
        status: 'error',
        reason: result.error || 'search_failed',
        meta: { queryLength: query.length, retrievalMode },
      });
      return JsonResponse.json({
        results: [],
        summary: result.error || 'Web search failed',
        retrievalMode,
      }, { status: 200 });
    }

    const enrichment = await enrichWithPageContext(
      result.results,
      { allowedDomains, blockedDomains },
      includePageContext,
    );
    const enrichedResults = enrichment.results;

    const summary = enrichedResults.length > 0
      ? `Found ${enrichedResults.length} result${enrichedResults.length === 1 ? '' : 's'} for "${query}".`
      : `No results found for "${query}".`;

    logToolAuditEvent({
      route: '/api/tools/web-search',
      action: 'web_search',
      userId,
      status: 'success',
      meta: {
        queryLength: query.length,
        results: enrichedResults.length,
        includePageContext,
        retrievalMode,
        pageContextCacheHits: enrichment.cacheHits,
        pageContextCacheMisses: enrichment.cacheMisses,
      },
    });

    return JsonResponse.json({
      results: enrichedResults,
      summary,
      warnings,
      retrievalMode,
      provider: capability.provider,
      capabilities: capability,
      toolSet: {
        resolvedProvider: toolSet.webSearch.provider,
        nativeSearchAvailable: toolSet.webSearch.nativeSearchAvailable,
      },
      effectivePolicy: {
        allowedDomains: allowedDomains || [],
        blockedDomains: blockedDomains || [],
      },
      enrichment: {
        cacheHits: enrichment.cacheHits,
        cacheMisses: enrichment.cacheMisses,
      },
      providerStrategy: getWebProviderOrder(),
    });
  } catch (error) {
    logToolAuditEvent({
      route: '/api/tools/web-search',
      action: 'web_search',
      userId,
      status: 'error',
      reason: error instanceof Error ? error.message : 'search_failed',
    });
    logger.error('[api.tools.web-search] Error:', error);
    return JsonResponse.json({
      results: [],
      summary: 'Search failed',
    }, { status: 500 });
  }
}
