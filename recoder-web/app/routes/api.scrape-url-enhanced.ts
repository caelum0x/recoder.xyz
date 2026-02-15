/**
 * Enhanced URL Scraping API with caching
 *
 * Features:
 * - 500% faster with maxAge caching
 * - Smart quote sanitization for better AI parsing
 * - Screenshot capture
 * - Structured content extraction
 *
 * Based on open-lovable's scrape-url-enhanced implementation
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { firecrawlDisabledError, isFirecrawlEnabled } from '~/lib/.server/firecrawl-control';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ScrapeUrlEnhanced');

// ============================================================================
// Types
// ============================================================================

interface EnhancedScrapeRequest {
  url: string;
  maxAge?: number;  // Cache age in ms (default: 1 hour)
  takeScreenshot?: boolean;
  waitFor?: number;
  timeout?: number;
}

interface EnhancedScrapeResponse {
  success: boolean;
  url: string;
  content: string;
  screenshot?: string | null;
  structured: {
    title: string;
    description: string;
    content: string;
    url: string;
    screenshot?: string | null;
  };
  metadata: {
    scraper: string;
    timestamp: string;
    contentLength: number;
    cached: boolean;
    [key: string]: unknown;
  };
  message: string;
  error?: string;
}

// ============================================================================
// Quote Sanitization
// ============================================================================

/**
 * Sanitize smart quotes and other problematic characters for AI parsing
 * This prevents issues with LLM tokenization and code generation
 */
function sanitizeQuotes(text: string): string {
  return text
    // Replace smart single quotes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    // Replace smart double quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // Replace guillemets (French quotes)
    .replace(/[\u00AB\u00BB]/g, '"')
    // Replace single guillemets
    .replace(/[\u2039\u203A]/g, "'")
    // Replace en dash and em dash
    .replace(/[\u2013\u2014]/g, '-')
    // Replace ellipsis character
    .replace(/[\u2026]/g, '...')
    // Replace non-breaking space
    .replace(/[\u00A0]/g, ' ')
    // Replace other quote-like characters
    .replace(/[\u0060\u00B4]/g, "'")
    // Remove zero-width characters
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
}

/**
 * Clean HTML entities that might cause issues
 */
function cleanHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '-')
    .replace(/&ndash;/g, '-')
    .replace(/&hellip;/g, '...');
}

// ============================================================================
// API Handler
// ============================================================================

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  if (!isFirecrawlEnabled(context)) {
    return json(firecrawlDisabledError(), { status: 403 });
  }

  try {
    const body = (await request.json()) as EnhancedScrapeRequest;
    const {
      url,
      maxAge = 3600000, // 1 hour default for 500% faster performance
      takeScreenshot = true,
      waitFor = 3000,
      timeout = 30000,
    } = body;

    if (!url) {
      return json(
        { success: false, error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    logger.info('[scrape-url-enhanced] Scraping with caching:', url);

    // Get API key from environment
    const env = (context as any)?.cloudflare?.env || process.env;
    const apiKey = env.FIRECRAWL_API_KEY;

    if (!apiKey) {
      return json({
        success: false,
        error: 'FIRECRAWL_API_KEY environment variable is not set',
      }, { status: 503 });
    }

    // Build Firecrawl request with caching
    const formats = ['markdown', 'html'];
    if (takeScreenshot) {
      formats.push('screenshot');
    }

    const firecrawlPayload: Record<string, unknown> = {
      url,
      formats,
      waitFor,
      timeout,
      blockAds: true,
      maxAge, // Use cached data if less than maxAge old (500% faster!)
    };

    // Add screenshot action if requested
    if (takeScreenshot) {
      firecrawlPayload.actions = [
        {
          type: 'wait',
          milliseconds: Math.min(waitFor, 2000),
        },
        {
          type: 'screenshot',
          fullPage: false, // Just visible viewport for performance
        },
      ];
    }

    // Make request to Firecrawl API
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(firecrawlPayload),
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      logger.error('[scrape-url-enhanced] Firecrawl API error:', firecrawlResponse.status, errorText);
      return json({
        success: false,
        error: `Firecrawl API error: ${errorText}`,
      }, { status: 500 });
    }

    const data = await firecrawlResponse.json() as {
      success: boolean;
      data?: {
        markdown?: string;
        html?: string;
        screenshot?: string;
        metadata?: {
          title?: string;
          description?: string;
          [key: string]: unknown;
        };
        actions?: {
          screenshots?: string[];
        };
        cached?: boolean;
      };
      error?: string;
    };

    if (!data.success || !data.data) {
      return json({
        success: false,
        error: data.error || 'Failed to scrape content',
      }, { status: 500 });
    }

    const { markdown, metadata, screenshot, actions } = data.data;

    // Get screenshot from either direct field or actions result
    const screenshotUrl = screenshot || actions?.screenshots?.[0] || null;

    // Sanitize the markdown content
    const sanitizedMarkdown = sanitizeQuotes(cleanHtmlEntities(markdown || ''));

    // Extract structured data
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

    const response: EnhancedScrapeResponse = {
      success: true,
      url,
      content: formattedContent,
      screenshot: screenshotUrl,
      structured: {
        title,
        description,
        content: sanitizedMarkdown,
        url,
        screenshot: screenshotUrl,
      },
      metadata: {
        scraper: 'firecrawl-enhanced',
        timestamp: new Date().toISOString(),
        contentLength: formattedContent.length,
        cached: data.data.cached || false,
        ...metadata,
      },
      message: `URL scraped successfully with Firecrawl${data.data.cached ? ' (from cache - 500% faster)' : ''}`,
    };

    logger.info('[scrape-url-enhanced] Success:', {
      url,
      title,
      contentLength: formattedContent.length,
      cached: data.data.cached || false,
      hasScreenshot: !!screenshotUrl,
    });

    return json(response);
  } catch (error) {
    logger.error('[scrape-url-enhanced] Error:', error);
    return json({
      success: false,
      error: 'URL scraping failed',
    }, { status: 500 });
  }
}

/**
 * GET handler for endpoint documentation
 */
export async function loader() {
  return json({
    status: 'ok',
    service: 'scrape-url-enhanced',
    description: 'Enhanced URL scraping with caching for 500% faster performance',
    methods: ['POST'],
    usage: {
      endpoint: '/api/scrape-url-enhanced',
      body: {
        url: 'string (required) - The URL to scrape',
        maxAge: 'number (optional) - Cache age in ms, default: 3600000 (1 hour)',
        takeScreenshot: 'boolean (optional) - Whether to capture screenshot, default: true',
        waitFor: 'number (optional) - Wait time for dynamic content in ms, default: 3000',
        timeout: 'number (optional) - Request timeout in ms, default: 30000',
      },
      response: {
        success: 'boolean',
        url: 'string - The scraped URL',
        content: 'string - Formatted content for AI',
        screenshot: 'string | null - Screenshot URL if requested',
        structured: {
          title: 'string',
          description: 'string',
          content: 'string - Sanitized markdown',
          url: 'string',
          screenshot: 'string | null',
        },
        metadata: {
          scraper: 'string',
          timestamp: 'string',
          contentLength: 'number',
          cached: 'boolean - Whether data came from cache',
        },
        message: 'string',
      },
    },
    features: [
      'Smart quote sanitization for better AI parsing',
      'Caching for 500% faster repeated requests',
      'Screenshot capture',
      'HTML entity cleaning',
      'Structured content extraction',
    ],
  });
}
