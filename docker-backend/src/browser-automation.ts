/**
 * Browser Automation Service for docker-backend
 * Real Puppeteer implementation running inside Docker containers
 * Note: puppeteer is lazily imported so the server can start without it installed.
 */

type Browser = any;
type Page = any;

let _puppeteer: any | undefined;
async function getPuppeteer() {
  if (!_puppeteer) {
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
    _puppeteer = await dynamicImport('puppeteer');
  }
  return _puppeteer.default || _puppeteer;
}

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

interface BrowserSessionState {
  browser: Browser;
  page: Page;
  consoleLogs: string[];
  lastUrl?: string;
  createdAt: number;
}

// Session state stored per project
const sessions = new Map<string, BrowserSessionState>();

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const SESSION_MAX_AGE = 30 * 60 * 1000; // 30 minutes

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [projectId, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_MAX_AGE) {
      console.log(`[Browser] Cleaning up stale session for ${projectId}`);
      session.browser.close().catch((err: unknown) => {
        console.warn(`[Browser] Failed to close stale session for ${projectId}:`, err);
      });
      sessions.delete(projectId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

/**
 * Launch a browser session and navigate to URL
 */
export async function browserLaunch(
  projectId: string,
  url: string,
  config?: BrowserSessionConfig
): Promise<BrowserActionResult> {
  try {
    console.log(`[Browser] Launching browser for ${projectId} -> ${url}`);

    // Close existing session if any
    await browserClose(projectId);

    const puppeteer = await getPuppeteer();
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
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
      createdAt: Date.now(),
    });

    // Take initial screenshot
    const screenshot = await captureScreenshot(page);

    console.log(`[Browser] Session created for ${projectId}`);

    return {
      success: true,
      screenshot,
      logs: consoleLogs.slice(-20),
      currentUrl: page.url(),
    };
  } catch (error) {
    console.error(`[Browser] Launch failed for ${projectId}:`, error);
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

    // =========================================================================
    // SECURITY -- TRUST BOUNDARY (hardened after root compromise)
    //
    // `script` is CALLER-SUPPLIED JavaScript that is evaluated via
    // `new Function(code)` inside the page context below. This is an
    // intentional capability (arbitrary in-page JS execution) that cannot be
    // removed without breaking the feature, so callers of browserExecute() MUST
    // be treated as TRUSTED. The guards below are defense-in-depth only -- they
    // reject the most obviously dangerous payloads and cap the input size; they
    // are NOT a sandbox. Do NOT rely on them as the sole control: enforce
    // authn/authz, work-locks, and approval gates at the call site. The Function
    // constructor runs in the page's (not Node's) scope and has no access to the
    // enclosing closure, but it still has full access to the page DOM, cookies,
    // local/session storage, and any network the page can reach.
    // =========================================================================
    if (typeof script !== 'string') {
      return { success: false, error: 'Execute failed: script must be a string' };
    }

    const MAX_SCRIPT_LENGTH = 100_000; // 100 KB guard against abusive payloads
    if (script.length === 0) {
      return { success: false, error: 'Execute failed: script must not be empty' };
    }
    if (script.length > MAX_SCRIPT_LENGTH) {
      return {
        success: false,
        error: `Execute failed: script exceeds maximum length of ${MAX_SCRIPT_LENGTH} characters`,
      };
    }

    // Reject obviously dangerous patterns. This is a coarse blocklist, not a
    // parser -- it stops casual misuse and known exfiltration/escape primitives.
    const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\bimport\s*\(/, label: 'dynamic import()' },
      { pattern: /\brequire\s*\(/, label: 'require()' },
      { pattern: /\bprocess\b/, label: 'process access' },
      { pattern: /\bglobalThis\b/, label: 'globalThis access' },
      { pattern: /\b(eval|Function)\s*\(/, label: 'nested eval/Function' },
      { pattern: /\bnew\s+Function\b/, label: 'nested Function constructor' },
      { pattern: /\bdebugger\b/, label: 'debugger statement' },
    ];
    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
      if (pattern.test(script)) {
        return { success: false, error: `Execute failed: forbidden pattern (${label})` };
      }
    }

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
    await new Promise(resolve => setTimeout(resolve, 300));

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
 * Navigate to a new URL
 */
export async function browserNavigate(
  projectId: string,
  url: string
): Promise<BrowserActionResult> {
  const session = sessions.get(projectId);
  if (!session) {
    return { success: false, error: 'No browser session. Call launch first.' };
  }

  try {
    const { page, consoleLogs } = session;

    await page.goto(url, {
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout: DEFAULT_TIMEOUT,
    });

    session.lastUrl = url;
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
      error: error instanceof Error ? error.message : 'Navigate failed',
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
    console.log(`[Browser] Session closed for ${projectId}`);

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

async function captureScreenshot(page: Page): Promise<string> {
  try {
    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: 75,
      fullPage: false,
    });
    // Handle both Buffer and Uint8Array
    const base64 = Buffer.isBuffer(buffer)
      ? buffer.toString('base64')
      : Buffer.from(buffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return '';
  }
}

async function waitForNetworkIdle(page: Page): Promise<void> {
  try {
    await page.waitForNetworkIdle({ timeout: 5000, idleTime: 500 });
  } catch {
    // Timeout is fine, continue anyway
  }
}
