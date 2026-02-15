import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { logToolAuditEvent } from '~/lib/.server/audit/tool-audit';
import { fetchUrlWithGiselleWebSearch } from '~/lib/.server/web/giselle-web-search';
import {
  parseDomainList,
  safeFetchWithRedirects,
  validateWebUrlWithDns,
} from '~/lib/.server/web/web-safety';
import { verifySession } from '~/lib/auth/session.server';
import { createDockerProxyHeaders, dockerFetchJson, getDockerBackendUrl } from '~/lib/http/docker-server';
import { JsonResponse } from '~/lib/http/json-response';
import { getWebToolProviderCapability } from '~/lib/modes/types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebCrawlTool');

interface WebCrawlRequest {
  url?: string;
  projectId?: string;
  includeScreenshot?: boolean;
  providerHint?: string;
  allowedDomains?: string[] | string;
  blockedDomains?: string[] | string;
  maxUses?: number;
  maxRedirects?: number;
}

interface WebCrawlResponse {
  rootUrl: string;
  html?: string;
  markdown?: string;
  screenshot?: string;
  provider?: string;
  warnings?: string[];
  capabilities?: {
    supportsWebSearch: boolean;
    supportsWebCrawl: boolean;
    supportsAllowedDomains: boolean;
    supportsBlockedDomains: boolean;
    supportsMaxUses: boolean;
  };
  effectivePolicy?: {
    allowedDomains: string[];
    blockedDomains: string[];
  };
}

const MAX_HTML_LENGTH = 200_000;
const MAX_MARKDOWN_LENGTH = 24_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const BROWSER_TIMEOUT_MS = 20_000;
const MAX_URL_LENGTH = 2048;
const MAX_PROJECT_ID_LENGTH = 120;
const CRAWL_RATE_WINDOW_MS = 60_000;
const CRAWL_RATE_LIMIT = 20;
const crawlRateLimiter = new Map<string, number[]>();

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function extractTagContent(html: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = html.match(regex);
  if (!match || !match[1]) {
    return '';
  }

  return decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : '';
}

function htmlToMarkdown(html: string): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  cleaned = cleaned
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/section>/gi, '\n')
    .replace(/<\/article>/gi, '\n');

  cleaned = cleaned
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return decodeHtmlEntities(cleaned).substring(0, MAX_MARKDOWN_LENGTH);
}

async function captureScreenshotWithDocker(
  dockerUrl: string,
  request: Request,
  projectId: string,
  url: string,
): Promise<string | undefined> {
  const headers = createDockerProxyHeaders(request);
  const endpoint = `${dockerUrl}/api/browser/${encodeURIComponent(projectId)}`;

  try {
    const launchResult = await dockerFetchJson<{ screenshot?: string }>(
      endpoint,
      {
        method: 'POST',
        signal: AbortSignal.timeout(BROWSER_TIMEOUT_MS),
        body: JSON.stringify({ action: 'launch', url }),
      },
      headers,
    );
    if (launchResult?.screenshot) {
      return launchResult.screenshot;
    }

    const screenshotResult = await dockerFetchJson<{ screenshot?: string }>(
      endpoint,
      {
        method: 'POST',
        signal: AbortSignal.timeout(BROWSER_TIMEOUT_MS),
        body: JSON.stringify({ action: 'screenshot' }),
      },
      headers,
    );
    return screenshotResult?.screenshot;
  } catch {
    return undefined;
  } finally {
    // Best effort cleanup of browser session in docker-backend.
    dockerFetchJson(endpoint, {
      method: 'POST',
      body: JSON.stringify({ action: 'close' }),
    }, headers).catch(() => {});
  }
}

function enforceCrawlRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const windowStart = now - CRAWL_RATE_WINDOW_MS;
  const recent = (crawlRateLimiter.get(userId) || []).filter((ts) => ts > windowStart);

  if (recent.length >= CRAWL_RATE_LIMIT) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + CRAWL_RATE_WINDOW_MS - now) / 1000));
    crawlRateLimiter.set(userId, recent);
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  crawlRateLimiter.set(userId, recent);
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

  const limit = enforceCrawlRateLimit(userId);
  if (!limit.allowed) {
    logToolAuditEvent({
      route: '/api/tools/web-crawl',
      action: 'web_crawl',
      userId,
      status: 'blocked',
      reason: 'rate_limit',
    });
    const headers = new Headers();
    headers.set('Retry-After', String(limit.retryAfterSeconds || 1));
    return JsonResponse.json({ error: 'Rate limit exceeded for web crawl' }, { status: 429, headers });
  }

  try {
    const body = await request.json() as WebCrawlRequest;
    const requestedCapability = getWebToolProviderCapability(body.providerHint);
    const warnings: string[] = [];
    const capability = requestedCapability.supportsWebCrawl
      ? requestedCapability
      : getWebToolProviderCapability('free-fallback');
    if (!requestedCapability.supportsWebCrawl) {
      warnings.push(`provider "${requestedCapability.provider}" does not support web_crawl; falling back to "${capability.provider}"`);
    }

    const requestedAllowedDomains = parseDomainList(body.allowedDomains);
    const requestedBlockedDomains = parseDomainList(body.blockedDomains);
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
    const maxRedirects = Math.min(Math.max(body.maxRedirects || 3, 0), 5);

    const rawUrl = (body.url || '').trim();
    if (!rawUrl) {
      logToolAuditEvent({
        route: '/api/tools/web-crawl',
        action: 'web_crawl',
        userId,
        status: 'blocked',
        reason: 'missing_url',
      });
      return JsonResponse.json({ error: 'url is required' }, { status: 400 });
    }
    if (rawUrl.length > MAX_URL_LENGTH) {
      logToolAuditEvent({
        route: '/api/tools/web-crawl',
        action: 'web_crawl',
        userId,
        status: 'blocked',
        reason: 'url_too_long',
        meta: { urlLength: rawUrl.length },
      });
      return JsonResponse.json({ error: `url exceeds max length of ${MAX_URL_LENGTH}` }, { status: 400 });
    }
    const validation = await validateWebUrlWithDns(rawUrl, {
      allowedDomains,
      blockedDomains,
      allowHttp: false,
    });
    if (!validation.valid || !validation.normalizedUrl) {
      logToolAuditEvent({
        route: '/api/tools/web-crawl',
        action: 'web_crawl',
        userId,
        status: 'blocked',
        reason: validation.reason || 'blocked_url',
      });
      return JsonResponse.json({ error: validation.reason || 'Blocked URL' }, { status: 400 });
    }
    const normalizedUrl = validation.normalizedUrl;
    const includeScreenshot = body.includeScreenshot !== false;
    const projectId = (body.projectId || '').trim();
    if (projectId.length > MAX_PROJECT_ID_LENGTH) {
      return JsonResponse.json({ error: `projectId exceeds max length of ${MAX_PROJECT_ID_LENGTH}` }, { status: 400 });
    }

    const giselleScrape = await fetchUrlWithGiselleWebSearch(normalizedUrl, ['html']);

    let htmlRaw: string;
    let markdownFromProvider: string | undefined;

    if (giselleScrape?.html && giselleScrape?.markdown) {
      htmlRaw = giselleScrape.html;
      markdownFromProvider = giselleScrape.markdown;
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await safeFetchWithRedirects(normalizedUrl, {
        signal: controller.signal,
        maxRedirects,
        headers: {
          'User-Agent': 'Recoder-Web-Crawler/1.0',
          'Accept': 'text/html,application/xhtml+xml,text/plain,text/markdown',
        },
        allowedDomains,
        blockedDomains,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return JsonResponse.json({ error: `Failed to fetch URL: HTTP ${response.status}` }, { status: 400 });
      }
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const isTextual = contentType.includes('text/html')
        || contentType.includes('text/plain')
        || contentType.includes('text/markdown')
        || contentType.includes('application/xhtml+xml');
      if (!isTextual) {
        return JsonResponse.json({ error: `Unsupported content type: ${contentType || 'unknown'}` }, { status: 400 });
      }

      const contentLength = Number.parseInt(response.headers.get('content-length') || '0', 10);
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        return JsonResponse.json({ error: 'Response too large to crawl safely' }, { status: 413 });
      }

      htmlRaw = await response.text();
    }

    if (htmlRaw.length > MAX_RESPONSE_BYTES) {
      return JsonResponse.json({ error: 'Response too large to crawl safely' }, { status: 413 });
    }
    const html = htmlRaw.substring(0, MAX_HTML_LENGTH);

    const title = extractTagContent(html, 'title');
    const description = extractMetaDescription(html);
    const markdownBody = markdownFromProvider || htmlToMarkdown(html);

    const markdown = [
      title ? `# ${title}` : '',
      description ? `> ${description}` : '',
      markdownBody,
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    let screenshot: string | undefined;
    if (includeScreenshot && projectId) {
      screenshot = await captureScreenshotWithDocker(
        getDockerBackendUrl(context),
        request,
        projectId,
        normalizedUrl,
      );
    }

    const payload: WebCrawlResponse = {
      rootUrl: normalizedUrl,
      html,
      markdown,
      screenshot,
      provider: capability.provider,
      warnings,
      capabilities: {
        supportsWebSearch: capability.supportsWebSearch,
        supportsWebCrawl: capability.supportsWebCrawl,
        supportsAllowedDomains: capability.supportsAllowedDomains,
        supportsBlockedDomains: capability.supportsBlockedDomains,
        supportsMaxUses: capability.supportsMaxUses,
      },
      effectivePolicy: {
        allowedDomains: allowedDomains || [],
        blockedDomains: blockedDomains || [],
      },
    };

    logToolAuditEvent({
      route: '/api/tools/web-crawl',
      action: 'web_crawl',
      userId,
      status: 'success',
      meta: {
        url: normalizedUrl,
        includeScreenshot,
        screenshotCaptured: Boolean(screenshot),
      },
    });

    return JsonResponse.json(payload);
  } catch (error) {
    logToolAuditEvent({
      route: '/api/tools/web-crawl',
      action: 'web_crawl',
      userId,
      status: 'error',
      reason: error instanceof Error ? error.message : 'web_crawl_failed',
    });
    logger.error('[api.tools.web-crawl] Error:', error);
    return JsonResponse.json({ error: 'Web crawl failed' }, { status: 500 });
  }
}
