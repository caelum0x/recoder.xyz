import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { firecrawlDisabledError, isFirecrawlEnabled } from '~/lib/.server/firecrawl-control';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ScrapeUrl');

/**
 * POST /api/scrape-url
 * Scrape and parse content from any URL using Firecrawl API
 * Supports markdown, HTML, and screenshot formats with caching
 */

interface FirecrawlResponse {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    screenshot?: string;
    cached?: boolean;
    metadata?: {
      title?: string;
      description?: string;
      language?: string;
      sourceURL?: string;
      [key: string]: unknown;
    };
    actions?: {
      screenshots?: string[];
    };
  };
  error?: string;
}

interface ScrapeRequestBody {
  url: string;
  formats?: ('markdown' | 'html' | 'screenshot')[];
  maxAge?: number;
  waitFor?: number;
  timeout?: number;
  fullPageScreenshot?: boolean;
}

/**
 * Sanitize smart quotes and other problematic characters
 * Converts typographic characters to their ASCII equivalents
 */
function sanitizeQuotes(text: string): string {
  return text
    // Replace smart single quotes (', ', ‚, ‛)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    // Replace smart double quotes (", ", „, ‟)
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // Replace guillemets (« »)
    .replace(/[\u00AB\u00BB]/g, '"')
    // Replace single guillemets (‹ ›)
    .replace(/[\u2039\u203A]/g, "'")
    // Replace en dash and em dash (– —)
    .replace(/[\u2013\u2014]/g, '-')
    // Replace horizontal ellipsis (…)
    .replace(/[\u2026]/g, '...')
    // Replace non-breaking space
    .replace(/[\u00A0]/g, ' ');
}

/**
 * Validate URL format and reject internal/private addresses.
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const h = url.hostname.toLowerCase();
    if (
      h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' ||
      h === '::1' || h === '[::1]' ||
      h.startsWith('10.') || h.startsWith('172.') || h.startsWith('192.168.') ||
      h === '169.254.169.254' || h.endsWith('.internal') || h.endsWith('.local')
    ) return false;
    return true;
  } catch {
    return false;
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  if (!isFirecrawlEnabled(context)) {
    return json(firecrawlDisabledError(), { status: 403 });
  }

  try {
    const body = await request.json() as ScrapeRequestBody;
    const {
      url,
      formats = ['markdown', 'html', 'screenshot'],
      maxAge = 3600000, // 1 hour cache by default (500% faster)
      waitFor = 3000,
      timeout = 30000,
      fullPageScreenshot = false
    } = body;

    // Validate URL
    if (!url) {
      return json({
        success: false,
        error: 'URL is required'
      }, { status: 400 });
    }

    if (!isValidUrl(url)) {
      return json({
        success: false,
        error: 'Invalid URL format. Must be a valid HTTP or HTTPS URL.'
      }, { status: 400 });
    }

    logger.info('[scrape-url] Scraping with Firecrawl:', url);

    // Get Firecrawl API key from environment
    const env = (context as any)?.cloudflare?.env || process.env;
    const FIRECRAWL_API_KEY = env.FIRECRAWL_API_KEY;

    if (!FIRECRAWL_API_KEY) {
      logger.error('[scrape-url] FIRECRAWL_API_KEY not configured');
      return json({
        success: false,
        error: 'Scraping service not configured. Please set FIRECRAWL_API_KEY.'
      }, { status: 500 });
    }

    // Build Firecrawl request with optimal settings
    const firecrawlPayload = {
      url,
      formats,
      waitFor,
      timeout,
      blockAds: true,
      maxAge, // Use cached data if within maxAge milliseconds
      actions: [
        {
          type: 'wait',
          milliseconds: 2000
        },
        {
          type: 'screenshot',
          fullPage: fullPageScreenshot
        }
      ]
    };

    // Make request to Firecrawl API
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(firecrawlPayload)
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      logger.error('[scrape-url] Firecrawl API error:', firecrawlResponse.status, errorText);

      // Parse error for better messaging
      let errorMessage = 'Failed to scrape URL';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return json({
        success: false,
        error: `Firecrawl API error: ${errorMessage}`
      }, { status: firecrawlResponse.status >= 400 && firecrawlResponse.status < 500 ? 400 : 500 });
    }

    const data = await firecrawlResponse.json() as FirecrawlResponse;

    if (!data.success || !data.data) {
      logger.error('[scrape-url] Firecrawl returned unsuccessful:', data);
      return json({
        success: false,
        error: data.error || 'Failed to scrape content from URL'
      }, { status: 500 });
    }

    const { markdown, html, metadata, screenshot, actions } = data.data;

    // Get screenshot from either direct field or actions result
    const screenshotUrl = screenshot || actions?.screenshots?.[0] || null;

    // Sanitize the markdown content
    const sanitizedMarkdown = sanitizeQuotes(markdown || '');
    const sanitizedHtml = html ? sanitizeQuotes(html) : undefined;

    // Extract and sanitize metadata
    const title = sanitizeQuotes(metadata?.title || '');
    const description = sanitizeQuotes(metadata?.description || '');

    // Format content for AI consumption
    const formattedContent = `
Title: ${title}
Description: ${description}
URL: ${url}

Main Content:
${sanitizedMarkdown}
    `.trim();

    // Build response
    const response = {
      success: true,
      url,
      content: formattedContent,
      screenshot: screenshotUrl,
      structured: {
        title,
        description,
        content: sanitizedMarkdown,
        html: sanitizedHtml,
        url,
        screenshot: screenshotUrl
      },
      metadata: {
        scraper: 'firecrawl',
        timestamp: new Date().toISOString(),
        contentLength: formattedContent.length,
        cached: data.data.cached || false,
        language: metadata?.language,
        sourceURL: metadata?.sourceURL,
        ...metadata
      },
      message: data.data.cached
        ? 'URL scraped successfully (from cache - faster response)'
        : 'URL scraped successfully with Firecrawl'
    };

    logger.info('[scrape-url] Success:', {
      url,
      contentLength: formattedContent.length,
      hasScreenshot: !!screenshotUrl,
      cached: data.data.cached
    });

    return json(response);

  } catch (error) {
    logger.error('[scrape-url] Error:', error);

    // Handle specific error types
    if (error instanceof SyntaxError) {
      return json({
        success: false,
        error: 'Invalid JSON in request body'
      }, { status: 400 });
    }

    return json({
      success: false,
      error: 'Failed to scrape URL'
    }, { status: 500 });
  }
}

/**
 * GET handler for health check
 */
export async function loader() {
  return json({
    status: 'ok',
    service: 'scrape-url',
    description: 'URL scraping endpoint using Firecrawl API',
    methods: ['POST'],
    usage: {
      endpoint: '/api/scrape-url',
      body: {
        url: 'string (required) - The URL to scrape',
        formats: "array (optional) - ['markdown', 'html', 'screenshot']",
        maxAge: 'number (optional) - Cache age in ms (default: 3600000 = 1 hour)',
        waitFor: 'number (optional) - Wait time for page load in ms (default: 3000)',
        timeout: 'number (optional) - Request timeout in ms (default: 30000)',
        fullPageScreenshot: 'boolean (optional) - Capture full page screenshot (default: false)'
      }
    }
  });
}
