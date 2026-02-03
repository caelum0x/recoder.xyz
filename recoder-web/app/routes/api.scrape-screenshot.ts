import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

/**
 * POST /api/scrape-screenshot
 * Capture screenshots of any URL using Firecrawl API
 * Supports full-page and viewport screenshots with configurable wait actions
 */

interface WaitAction {
  type: 'wait';
  milliseconds: number;
}

interface ClickAction {
  type: 'click';
  selector: string;
}

interface ScrollAction {
  type: 'scroll';
  direction?: 'up' | 'down';
  amount?: number;
}

interface TypeAction {
  type: 'type';
  selector: string;
  text: string;
}

type ScreenshotAction = WaitAction | ClickAction | ScrollAction | TypeAction;

interface ScreenshotRequestBody {
  url: string;
  fullPage?: boolean;
  waitFor?: number;
  timeout?: number;
  actions?: ScreenshotAction[];
  format?: 'base64' | 'url';
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  mobile?: boolean;
  darkMode?: boolean;
}

interface FirecrawlScreenshotResponse {
  success: boolean;
  data?: {
    screenshot?: string;
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
      [key: string]: unknown;
    };
    actions?: {
      screenshots?: string[];
    };
  };
  screenshot?: string;
  metadata?: {
    title?: string;
    description?: string;
    sourceURL?: string;
    [key: string]: unknown;
  };
  error?: string;
}

/**
 * Validate URL format
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Convert URL to base64 data URL
 */
async function urlToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);
    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('[scrape-screenshot] Failed to convert URL to base64:', error);
    return null;
  }
}

/**
 * Check if string is a base64 data URL
 */
function isBase64DataUrl(str: string): boolean {
  return str.startsWith('data:');
}

/**
 * Convert base64 data URL to raw base64
 */
function extractBase64FromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : dataUrl;
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json() as ScreenshotRequestBody;
    const {
      url,
      fullPage = false,
      waitFor = 3000,
      timeout = 30000,
      actions = [],
      format = 'url',
      width,
      height,
      deviceScaleFactor,
      mobile = false,
      darkMode = false
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

    // Validate format
    if (format !== 'base64' && format !== 'url') {
      return json({
        success: false,
        error: 'Invalid format. Must be "base64" or "url".'
      }, { status: 400 });
    }

    console.log('[scrape-screenshot] Capturing screenshot for:', url, { fullPage, format });

    // Get Firecrawl API key from environment
    const env = (context as any)?.cloudflare?.env || process.env;
    const FIRECRAWL_API_KEY = env.FIRECRAWL_API_KEY;

    if (!FIRECRAWL_API_KEY) {
      console.error('[scrape-screenshot] FIRECRAWL_API_KEY not configured');
      return json({
        success: false,
        error: 'Screenshot service not configured. Please set FIRECRAWL_API_KEY.'
      }, { status: 500 });
    }

    // Build actions array for Firecrawl
    const firecrawlActions: Array<Record<string, unknown>> = [
      // Initial wait for page load
      {
        type: 'wait',
        milliseconds: waitFor
      }
    ];

    // Add user-provided actions
    for (const action of actions) {
      switch (action.type) {
        case 'wait':
          firecrawlActions.push({
            type: 'wait',
            milliseconds: action.milliseconds || 1000
          });
          break;
        case 'click':
          firecrawlActions.push({
            type: 'click',
            selector: action.selector
          });
          break;
        case 'scroll':
          firecrawlActions.push({
            type: 'scroll',
            direction: action.direction || 'down',
            amount: action.amount || 500
          });
          break;
        case 'type':
          firecrawlActions.push({
            type: 'type',
            selector: action.selector,
            text: action.text
          });
          break;
        default:
          console.warn('[scrape-screenshot] Unknown action type:', (action as any).type);
      }
    }

    // Add screenshot action at the end
    firecrawlActions.push({
      type: 'screenshot',
      fullPage
    });

    // Build Firecrawl request payload
    const firecrawlPayload: Record<string, unknown> = {
      url,
      formats: ['screenshot'],
      waitFor,
      timeout,
      blockAds: true,
      onlyMainContent: false,
      actions: firecrawlActions
    };

    // Add viewport settings if specified
    if (width || height || deviceScaleFactor || mobile || darkMode) {
      const viewport: Record<string, unknown> = {};
      if (width) viewport.width = width;
      if (height) viewport.height = height;
      if (deviceScaleFactor) viewport.deviceScaleFactor = deviceScaleFactor;
      if (mobile) viewport.isMobile = mobile;

      // Note: Firecrawl may not support all these options, but we include them for compatibility
      firecrawlPayload.viewport = viewport;

      if (darkMode) {
        firecrawlPayload.colorScheme = 'dark';
      }
    }

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
      console.error('[scrape-screenshot] Firecrawl API error:', firecrawlResponse.status, errorText);

      let errorMessage = 'Failed to capture screenshot';
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

    const data = await firecrawlResponse.json() as FirecrawlScreenshotResponse;

    console.log('[scrape-screenshot] Full scrape result keys:', data ? Object.keys(data) : 'null');

    // Extract screenshot from various possible response formats
    let screenshotResult: string | null = null;
    let metadata: Record<string, unknown> = {};

    // Try different response structures
    if (data.data?.screenshot) {
      screenshotResult = data.data.screenshot;
      metadata = data.data.metadata || {};
    } else if (data.data?.actions?.screenshots?.[0]) {
      screenshotResult = data.data.actions.screenshots[0];
      metadata = data.data.metadata || {};
    } else if (data.screenshot) {
      screenshotResult = data.screenshot;
      metadata = data.metadata || {};
    }

    if (!screenshotResult) {
      console.error('[scrape-screenshot] No screenshot in response:', JSON.stringify(data, null, 2));
      return json({
        success: false,
        error: 'Screenshot not available in response'
      }, { status: 500 });
    }

    // Process screenshot based on requested format
    let finalScreenshot: string;
    let screenshotFormat: 'base64' | 'url';

    if (format === 'base64') {
      // User wants base64
      if (isBase64DataUrl(screenshotResult)) {
        // Already a data URL, extract base64 if they want raw base64
        finalScreenshot = screenshotResult;
        screenshotFormat = 'base64';
      } else if (screenshotResult.startsWith('http')) {
        // It's a URL, need to convert to base64
        const base64Result = await urlToBase64(screenshotResult);
        if (!base64Result) {
          // Fallback to returning the URL
          finalScreenshot = screenshotResult;
          screenshotFormat = 'url';
          console.warn('[scrape-screenshot] Could not convert to base64, returning URL instead');
        } else {
          finalScreenshot = base64Result;
          screenshotFormat = 'base64';
        }
      } else {
        // Assume it's raw base64, wrap it
        finalScreenshot = `data:image/png;base64,${screenshotResult}`;
        screenshotFormat = 'base64';
      }
    } else {
      // User wants URL
      if (screenshotResult.startsWith('http')) {
        finalScreenshot = screenshotResult;
        screenshotFormat = 'url';
      } else if (isBase64DataUrl(screenshotResult)) {
        // It's a data URL, return as-is (can be used in img src)
        finalScreenshot = screenshotResult;
        screenshotFormat = 'base64';
      } else {
        // Raw base64, wrap as data URL
        finalScreenshot = `data:image/png;base64,${screenshotResult}`;
        screenshotFormat = 'base64';
      }
    }

    const response = {
      success: true,
      screenshot: finalScreenshot,
      format: screenshotFormat,
      url,
      metadata: {
        title: metadata.title || null,
        description: metadata.description || null,
        sourceURL: metadata.sourceURL || url,
        capturedAt: new Date().toISOString(),
        fullPage,
        width: width || null,
        height: height || null,
        mobile
      }
    };

    console.log('[scrape-screenshot] Success:', {
      url,
      format: screenshotFormat,
      fullPage,
      screenshotLength: finalScreenshot.length
    });

    return json(response);

  } catch (error) {
    console.error('[scrape-screenshot] Error:', error);

    if (error instanceof SyntaxError) {
      return json({
        success: false,
        error: 'Invalid JSON in request body'
      }, { status: 400 });
    }

    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}

/**
 * GET handler for health check and documentation
 */
export async function loader() {
  return json({
    status: 'ok',
    service: 'scrape-screenshot',
    description: 'Screenshot capture endpoint using Firecrawl API',
    methods: ['POST'],
    usage: {
      endpoint: '/api/scrape-screenshot',
      body: {
        url: 'string (required) - The URL to capture',
        fullPage: 'boolean (optional) - Capture full page or viewport only (default: false)',
        waitFor: 'number (optional) - Initial wait time in ms for page load (default: 3000)',
        timeout: 'number (optional) - Request timeout in ms (default: 30000)',
        format: 'string (optional) - "base64" or "url" (default: "url")',
        width: 'number (optional) - Viewport width in pixels',
        height: 'number (optional) - Viewport height in pixels',
        deviceScaleFactor: 'number (optional) - Device scale factor (e.g., 2 for retina)',
        mobile: 'boolean (optional) - Simulate mobile device (default: false)',
        darkMode: 'boolean (optional) - Use dark mode color scheme (default: false)',
        actions: 'array (optional) - Actions to perform before capture'
      },
      actions: {
        wait: '{ type: "wait", milliseconds: number }',
        click: '{ type: "click", selector: string }',
        scroll: '{ type: "scroll", direction: "up"|"down", amount: number }',
        type: '{ type: "type", selector: string, text: string }'
      },
      response: {
        success: 'boolean',
        screenshot: 'string - Base64 data URL or URL depending on format parameter',
        format: '"base64" | "url" - The actual format returned',
        url: 'string - The original URL',
        metadata: {
          title: 'string | null - Page title',
          description: 'string | null - Page description',
          sourceURL: 'string - Source URL',
          capturedAt: 'string - ISO timestamp',
          fullPage: 'boolean',
          width: 'number | null',
          height: 'number | null',
          mobile: 'boolean'
        }
      }
    },
    examples: [
      {
        description: 'Basic screenshot',
        request: {
          url: 'https://example.com'
        }
      },
      {
        description: 'Full page screenshot with base64 output',
        request: {
          url: 'https://example.com',
          fullPage: true,
          format: 'base64'
        }
      },
      {
        description: 'Mobile screenshot with custom viewport',
        request: {
          url: 'https://example.com',
          mobile: true,
          width: 375,
          height: 812,
          deviceScaleFactor: 2
        }
      },
      {
        description: 'Screenshot after waiting and scrolling',
        request: {
          url: 'https://example.com',
          actions: [
            { type: 'wait', milliseconds: 2000 },
            { type: 'scroll', direction: 'down', amount: 500 },
            { type: 'wait', milliseconds: 1000 }
          ]
        }
      }
    ]
  });
}
