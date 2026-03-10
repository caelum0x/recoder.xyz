import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { firecrawlDisabledError, isFirecrawlEnabled } from '~/lib/.server/firecrawl-control';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ScrapeWebsite');

/**
 * POST /api/scrape-website
 * Scrape a website using Firecrawl API
 * Returns markdown, HTML, and screenshot data
 * Returns an error if Firecrawl is not configured
 */

interface FirecrawlScrapeResult {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    screenshot?: string;
    links?: Array<{ url: string; text?: string }>;
    metadata?: {
      title?: string;
      description?: string;
      language?: string;
      sourceURL?: string;
      statusCode?: number;
      [key: string]: unknown;
    };
  };
  error?: string;
}

interface ScrapeWebsiteRequest {
  url: string;
  formats?: ('markdown' | 'html' | 'screenshot' | 'links')[];
  options?: {
    onlyMainContent?: boolean;
    waitFor?: number;
    timeout?: number;
    [key: string]: unknown;
  };
}

interface ScrapeWebsiteResponse {
  success: boolean;
  data?: {
    title: string;
    content: string;
    description: string;
    markdown: string;
    html: string;
    metadata: Record<string, unknown>;
    screenshot?: string | null;
    links?: Array<{ url: string; text?: string }>;
    raw?: unknown;
  };
  error?: string;
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

/**
 * Generate error fallback data
 */
function getErrorFallbackData(url: string, errorMessage: string): ScrapeWebsiteResponse {
  return {
    success: false,
    error: errorMessage,
    data: {
      title: 'Error',
      content: 'This is fallback content due to an error. Please check your configuration.',
      description: 'Error occurred while scraping',
      markdown: `# Error\n\n${errorMessage}`,
      html: `<h1>Error</h1><p>${errorMessage}</p>`,
      metadata: {
        title: 'Error',
        description: 'Failed to scrape website',
        sourceURL: url,
        statusCode: 500,
      },
      screenshot: null,
      links: [],
    },
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  // Only allow POST method
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  if (!isFirecrawlEnabled(context)) {
    return json(firecrawlDisabledError(), { status: 403 });
  }

  try {
    const body = (await request.json()) as ScrapeWebsiteRequest;
    const { url, formats = ['markdown', 'html'], options = {} } = body;

    // Validate URL is provided
    if (!url) {
      return json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    if (!isValidUrl(url)) {
      return json(
        { success: false, error: 'Invalid URL format. Must be a valid HTTP or HTTPS URL.' },
        { status: 400 }
      );
    }

    // Get Firecrawl API key from environment
    const env = (context as any)?.cloudflare?.env || process.env;
    const apiKey = env.FIRECRAWL_API_KEY;

    // Return error if API key is not configured
    if (!apiKey) {
      logger.warn('[scrape-website] FIRECRAWL_API_KEY not configured');
      return json(
        { success: false, error: 'Website scraping is not configured. Set FIRECRAWL_API_KEY to enable this feature.' },
        { status: 503 },
      );
    }

    logger.info('[scrape-website] Scraping with Firecrawl:', url, 'formats:', formats);

    // Build Firecrawl request payload
    const firecrawlPayload = {
      url,
      formats,
      onlyMainContent: options.onlyMainContent !== false, // Default to true for cleaner content
      waitFor: options.waitFor || 2000, // Wait for dynamic content
      timeout: options.timeout || 30000,
      ...options,
    };

    // Make request to Firecrawl API
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(firecrawlPayload),
    });

    // Handle API errors
    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      logger.error('[scrape-website] Firecrawl API error:', firecrawlResponse.status, errorText);

      let errorMessage = 'Failed to scrape website';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return json(
        getErrorFallbackData(url, `Firecrawl API error: ${errorMessage}`),
        { status: 500 }
      );
    }

    const scrapeResult = (await firecrawlResponse.json()) as FirecrawlScrapeResult;

    // Handle unsuccessful scrape result
    if (scrapeResult.success === false || !scrapeResult.data) {
      const errorMessage = scrapeResult.error || 'Failed to scrape website';
      logger.error('[scrape-website] Firecrawl returned unsuccessful:', scrapeResult);
      return json(
        getErrorFallbackData(url, errorMessage),
        { status: 500 }
      );
    }

    const data = scrapeResult.data;

    // Build successful response
    const response: ScrapeWebsiteResponse = {
      success: true,
      data: {
        title: data.metadata?.title || 'Untitled',
        content: data.markdown || data.html || '',
        description: data.metadata?.description || '',
        markdown: data.markdown || '',
        html: data.html || '',
        metadata: data.metadata || {},
        screenshot: data.screenshot || null,
        links: data.links || [],
        raw: data,
      },
    };

    logger.info('[scrape-website] Success:', {
      url,
      title: response.data?.title,
      contentLength: response.data?.content.length,
      hasScreenshot: !!response.data?.screenshot,
      linksCount: response.data?.links?.length || 0,
    });

    return json(response);
  } catch (error) {
    logger.error('[scrape-website] Error:', error);

    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      return json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    return json(
      getErrorFallbackData('', 'Failed to scrape website'),
      { status: 500 }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight requests
 */
export async function options() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * GET handler for endpoint documentation
 */
export async function loader() {
  return json({
    status: 'ok',
    service: 'scrape-website',
    description: 'Website scraping endpoint using Firecrawl API',
    methods: ['POST'],
    usage: {
      endpoint: '/api/scrape-website',
      body: {
        url: 'string (required) - The URL to scrape',
        formats: "array (optional) - ['markdown', 'html', 'screenshot', 'links'] - default: ['markdown', 'html']",
        options: {
          onlyMainContent: 'boolean (optional) - Extract only main content, default: true',
          waitFor: 'number (optional) - Wait time for page load in ms, default: 2000',
          timeout: 'number (optional) - Request timeout in ms, default: 30000',
        },
      },
      response: {
        success: 'boolean - Whether the scrape was successful',
        data: {
          title: 'string - Page title',
          content: 'string - Main content (markdown or html)',
          description: 'string - Page description',
          markdown: 'string - Markdown content',
          html: 'string - HTML content',
          metadata: 'object - Page metadata',
          screenshot: 'string | null - Screenshot URL if requested',
          links: 'array - Links found on the page',
          raw: 'object - Raw Firecrawl response',
        },
        error: 'string (optional) - Error message if failed',
      },
    },
    notes: [
      'Returns an error if FIRECRAWL_API_KEY is not configured',
      'Returns fallback error data on scraping failures for graceful degradation',
      'Screenshot format must be included in formats array to receive screenshot',
    ],
  });
}
