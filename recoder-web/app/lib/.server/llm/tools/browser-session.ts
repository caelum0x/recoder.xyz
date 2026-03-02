/**
 * Browser Session Manager for Puppeteer automation
 * Manages headless browser state for web scraping and testing
 */

export interface BrowserActionResult {
  success: boolean;
  screenshot?: string;  // base64 data URL
  logs?: string[];      // console output
  currentUrl?: string;
  extractedContent?: string;
  error?: string;
}

export interface BrowserSessionConfig {
  headless?: boolean;
  timeout?: number;
  viewport?: { width: number; height: number };
}

// Session state stored per project
const sessions = new Map<string, BrowserSessionState>();

interface BrowserSessionState {
  browser: any;  // Puppeteer Browser
  page: any;     // Puppeteer Page
  consoleLogs: string[];
  lastUrl?: string;
}

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/**
 * Launch a browser session and navigate to URL
 */
export async function browserLaunch(
  projectId: string,
  url: string,
  config?: BrowserSessionConfig
): Promise<BrowserActionResult> {
  try {
    // Dynamic import of puppeteer (only available in Docker container)
    // @ts-expect-error optional runtime dependency; not required for all builds
    const puppeteer = await import('puppeteer');

    // Close existing session if any
    await browserClose(projectId);

    const browser = await puppeteer.default.launch({
      headless: config?.headless !== false ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    });

    const page = await browser.newPage();
    const consoleLogs: string[] = [];

    // Set viewport
    const viewport = config?.viewport || DEFAULT_VIEWPORT;
    await page.setViewport(viewport);

    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Capture console logs
    page.on('console', (msg: any) => {
      const type = msg.type();
      const text = msg.text();
      consoleLogs.push(`[${type}] ${text}`);
      // Keep only last 100 logs
      if (consoleLogs.length > 100) {
        consoleLogs.shift();
      }
    });

    // Navigate to URL
    const timeout = config?.timeout || DEFAULT_TIMEOUT;
    await page.goto(url, {
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout,
    });

    // Store session
    sessions.set(projectId, {
      browser,
      page,
      consoleLogs,
      lastUrl: url,
    });

    // Take initial screenshot
    const screenshot = await captureScreenshot(page);

    return {
      success: true,
      screenshot,
      logs: consoleLogs.slice(-20),
      currentUrl: page.url(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to launch browser',
    };
  }
}

/**
 * Click an element by selector
 */
export async function browserClick(
  projectId: string,
  selector: string
): Promise<BrowserActionResult> {
  const session = sessions.get(projectId);
  if (!session) {
    return { success: false, error: 'No browser session. Call launch first.' };
  }

  try {
    const { page, consoleLogs } = session;

    // Wait for element and click
    await page.waitForSelector(selector, { timeout: 10000 });
    await page.click(selector);

    // Wait for potential navigation or network activity
    await waitForNetworkIdle(page);

    const screenshot = await captureScreenshot(page);

    return {
      success: true,
      screenshot,
      logs: consoleLogs.slice(-20),
      currentUrl: page.url(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Click failed',
    };
  }
}

/**
 * Type text into an element
 */
export async function browserType(
  projectId: string,
  selector: string,
  text: string
): Promise<BrowserActionResult> {
  const session = sessions.get(projectId);
  if (!session) {
    return { success: false, error: 'No browser session. Call launch first.' };
  }

  try {
    const { page, consoleLogs } = session;

    await page.waitForSelector(selector, { timeout: 10000 });
    await page.click(selector);
    await page.type(selector, text, { delay: 50 });

    const screenshot = await captureScreenshot(page);

    return {
      success: true,
      screenshot,
      logs: consoleLogs.slice(-20),
      currentUrl: page.url(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Type failed',
    };
  }
}

/**
 * Take a screenshot of the current page
 */
export async function browserScreenshot(
  projectId: string
): Promise<BrowserActionResult> {
  const session = sessions.get(projectId);
  if (!session) {
    return { success: false, error: 'No browser session. Call launch first.' };
  }

  try {
    const { page, consoleLogs } = session;
    const screenshot = await captureScreenshot(page);

    return {
      success: true,
      screenshot,
      logs: consoleLogs.slice(-20),
      currentUrl: page.url(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Screenshot failed',
    };
  }
}

/**
 * Extract text content from elements matching selector
 */
export async function browserExtract(
  projectId: string,
  selector: string
): Promise<BrowserActionResult> {
  const session = sessions.get(projectId);
  if (!session) {
    return { success: false, error: 'No browser session. Call launch first.' };
  }

  try {
    const { page, consoleLogs } = session;

    const content = await page.evaluate((sel: string) => {
      const elements = document.querySelectorAll(sel);
      return Array.from(elements)
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .join('\n');
    }, selector);

    const screenshot = await captureScreenshot(page);

    return {
      success: true,
      screenshot,
      extractedContent: content || 'No content found',
      logs: consoleLogs.slice(-20),
      currentUrl: page.url(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Extract failed',
    };
  }
}

/**
 * Execute JavaScript in the page context
 */
export async function browserExecute(
  projectId: string,
  script: string
): Promise<BrowserActionResult> {
  const session = sessions.get(projectId);
  if (!session) {
    return { success: false, error: 'No browser session. Call launch first.' };
  }

  try {
    const { page, consoleLogs } = session;

    const result = await page.evaluate((code: string) => {
      try {
        // Use Function constructor instead of eval - no access to enclosing scope
        const fn = new Function(code);
        const fnResult = fn();
        return { success: true, result: String(fnResult) };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }, script);

    const screenshot = await captureScreenshot(page);

    if (!result.success) {
      return {
        success: false,
        screenshot,
        error: result.error,
        logs: consoleLogs.slice(-20),
      };
    }

    return {
      success: true,
      screenshot,
      extractedContent: result.result,
      logs: consoleLogs.slice(-20),
      currentUrl: page.url(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Execute failed',
    };
  }
}

/**
 * Scroll the page
 */
export async function browserScroll(
  projectId: string,
  direction: 'up' | 'down'
): Promise<BrowserActionResult> {
  const session = sessions.get(projectId);
  if (!session) {
    return { success: false, error: 'No browser session. Call launch first.' };
  }

  try {
    const { page, consoleLogs } = session;

    const scrollAmount = direction === 'down' ? 500 : -500;
    await page.evaluate((amount: number) => {
      window.scrollBy(0, amount);
    }, scrollAmount);

    // Wait for any lazy-loaded content
    await page.waitForTimeout(300);

    const screenshot = await captureScreenshot(page);

    return {
      success: true,
      screenshot,
      logs: consoleLogs.slice(-20),
      currentUrl: page.url(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Scroll failed',
    };
  }
}

/**
 * Close the browser session
 */
export async function browserClose(projectId: string): Promise<BrowserActionResult> {
  const session = sessions.get(projectId);
  if (!session) {
    return { success: true }; // Already closed
  }

  try {
    await session.browser.close();
    sessions.delete(projectId);

    return { success: true };
  } catch (error) {
    sessions.delete(projectId);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Close failed',
    };
  }
}

/**
 * Check if a session exists
 */
export function hasSession(projectId: string): boolean {
  return sessions.has(projectId);
}

/**
 * Get all active session IDs
 */
export function getActiveSessions(): string[] {
  return Array.from(sessions.keys());
}

// Helper functions

async function captureScreenshot(page: any): Promise<string> {
  try {
    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: 75,
      fullPage: false,
    });
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

async function waitForNetworkIdle(page: any): Promise<void> {
  try {
    await page.waitForNetworkIdle({ timeout: 5000, idleTime: 500 });
  } catch {
    // Timeout is fine, continue anyway
  }
}
