/**
 * Browser Automation System
 * Copied from Kilocode - Provides browser automation capabilities
 * for web scraping, screenshot capture, and UI interaction
 */

import { z } from 'zod';
import { atom, map } from 'nanostores';

// =============================================================================
// Schemas
// =============================================================================

export const BrowserActionTypeSchema = z.enum([
  'launch',
  'navigate',
  'click',
  'type',
  'scroll',
  'screenshot',
  'get_content',
  'wait',
  'close',
]);

export const BrowserStateSchema = z.enum([
  'idle',
  'launching',
  'ready',
  'navigating',
  'executing',
  'error',
  'closed',
]);

export const ElementSelectorSchema = z.object({
  type: z.enum(['css', 'xpath', 'text', 'role']),
  value: z.string(),
});

export const BrowserActionSchema = z.object({
  type: BrowserActionTypeSchema,
  url: z.string().optional(),
  selector: ElementSelectorSchema.optional(),
  text: z.string().optional(),
  timeout: z.number().optional(),
  options: z.record(z.unknown()).optional(),
});

export const BrowserActionResultSchema = z.object({
  success: z.boolean(),
  action: BrowserActionTypeSchema,
  data: z.unknown().optional(),
  screenshot: z.string().optional(), // Base64 encoded
  error: z.string().optional(),
  timing: z.object({
    startedAt: z.string(),
    completedAt: z.string(),
    durationMs: z.number(),
  }),
});

export const PageInfoSchema = z.object({
  url: z.string(),
  title: z.string(),
  content: z.string().optional(),
  html: z.string().optional(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }),
});

export const BrowserSessionSchema = z.object({
  id: z.string(),
  state: BrowserStateSchema,
  pageInfo: PageInfoSchema.optional(),
  history: z.array(z.string()),
  screenshots: z.array(z.object({
    id: z.string(),
    url: z.string(),
    timestamp: z.string(),
    data: z.string(), // Base64
  })),
  error: z.string().optional(),
  createdAt: z.string(),
  lastActivityAt: z.string(),
});

export const BrowserConfigSchema = z.object({
  headless: z.boolean().default(true),
  viewport: z.object({
    width: z.number().default(1280),
    height: z.number().default(720),
  }).default({}),
  timeout: z.number().default(30000),
  userAgent: z.string().optional(),
  ignoreHTTPSErrors: z.boolean().default(false),
});

// =============================================================================
// Types
// =============================================================================

export type BrowserActionType = z.infer<typeof BrowserActionTypeSchema>;
export type BrowserState = z.infer<typeof BrowserStateSchema>;
export type ElementSelector = z.infer<typeof ElementSelectorSchema>;
export type BrowserAction = z.infer<typeof BrowserActionSchema>;
export type BrowserActionResult = z.infer<typeof BrowserActionResultSchema>;
export type PageInfo = z.infer<typeof PageInfoSchema>;
export type BrowserSession = z.infer<typeof BrowserSessionSchema>;
export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;

// =============================================================================
// State
// =============================================================================

export const browserSessionsStore = map<Record<string, BrowserSession>>({});
export const activeBrowserSessionId = atom<string | null>(null);
export const browserConfig = atom<BrowserConfig>({
  headless: true,
  viewport: { width: 1280, height: 720 },
  timeout: 30000,
  ignoreHTTPSErrors: false,
});

// =============================================================================
// Session Management
// =============================================================================

/**
 * Create a browser session ID
 */
export function createBrowserSessionId(): string {
  return `browser_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a new browser session
 */
export function createBrowserSession(): BrowserSession {
  const id = createBrowserSessionId();
  const now = new Date().toISOString();

  const session: BrowserSession = {
    id,
    state: 'idle',
    history: [],
    screenshots: [],
    createdAt: now,
    lastActivityAt: now,
  };

  browserSessionsStore.setKey(id, session);
  activeBrowserSessionId.set(id);

  return session;
}

/**
 * Update browser session state
 */
export function updateBrowserSessionState(
  sessionId: string,
  state: BrowserState,
  updates?: Partial<BrowserSession>
): void {
  const session = browserSessionsStore.get()[sessionId];
  if (!session) return;

  browserSessionsStore.setKey(sessionId, {
    ...session,
    state,
    lastActivityAt: new Date().toISOString(),
    ...updates,
  });
}

/**
 * Update browser session page info
 */
export function updateBrowserSessionPageInfo(
  sessionId: string,
  pageInfo: PageInfo
): void {
  const session = browserSessionsStore.get()[sessionId];
  if (!session) return;

  const history = [...session.history];
  if (!history.includes(pageInfo.url)) {
    history.push(pageInfo.url);
  }

  browserSessionsStore.setKey(sessionId, {
    ...session,
    pageInfo,
    history,
    lastActivityAt: new Date().toISOString(),
  });
}

/**
 * Add screenshot to session
 */
export function addBrowserScreenshot(
  sessionId: string,
  data: string
): string {
  const session = browserSessionsStore.get()[sessionId];
  if (!session) throw new Error('Session not found');

  const screenshotId = `ss_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const screenshot = {
    id: screenshotId,
    url: session.pageInfo?.url || 'unknown',
    timestamp: new Date().toISOString(),
    data,
  };

  browserSessionsStore.setKey(sessionId, {
    ...session,
    screenshots: [...session.screenshots, screenshot],
    lastActivityAt: new Date().toISOString(),
  });

  return screenshotId;
}

/**
 * Get browser session
 */
export function getBrowserSession(sessionId: string): BrowserSession | undefined {
  return browserSessionsStore.get()[sessionId];
}

/**
 * Get active browser session
 */
export function getActiveBrowserSession(): BrowserSession | null {
  const id = activeBrowserSessionId.get();
  if (!id) return null;
  return browserSessionsStore.get()[id] || null;
}

/**
 * Close browser session
 */
export function closeBrowserSession(sessionId: string): void {
  updateBrowserSessionState(sessionId, 'closed');

  if (activeBrowserSessionId.get() === sessionId) {
    activeBrowserSessionId.set(null);
  }
}

/**
 * Remove browser session
 */
export function removeBrowserSession(sessionId: string): void {
  const sessions = { ...browserSessionsStore.get() };
  delete sessions[sessionId];
  browserSessionsStore.set(sessions);

  if (activeBrowserSessionId.get() === sessionId) {
    activeBrowserSessionId.set(null);
  }
}

// =============================================================================
// Action Helpers
// =============================================================================

/**
 * Create a browser action result
 */
export function createActionResult(
  action: BrowserActionType,
  success: boolean,
  startTime: Date,
  options?: Partial<BrowserActionResult>
): BrowserActionResult {
  const completedAt = new Date();

  return {
    success,
    action,
    timing: {
      startedAt: startTime.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startTime.getTime(),
    },
    ...options,
  };
}

/**
 * Parse selector string to ElementSelector
 */
export function parseSelector(selectorStr: string): ElementSelector {
  // XPath detection
  if (selectorStr.startsWith('//') || selectorStr.startsWith('(//')) {
    return { type: 'xpath', value: selectorStr };
  }

  // Role-based selector: role=button[name="Submit"]
  if (selectorStr.startsWith('role=')) {
    return { type: 'role', value: selectorStr.slice(5) };
  }

  // Text-based selector: text="Click me"
  if (selectorStr.startsWith('text=')) {
    return { type: 'text', value: selectorStr.slice(5).replace(/^["']|["']$/g, '') };
  }

  // Default to CSS selector
  return { type: 'css', value: selectorStr };
}

/**
 * Format selector for display
 */
export function formatSelector(selector: ElementSelector): string {
  switch (selector.type) {
    case 'xpath':
      return `xpath: ${selector.value}`;
    case 'role':
      return `role: ${selector.value}`;
    case 'text':
      return `text: "${selector.value}"`;
    case 'css':
    default:
      return selector.value;
  }
}

// =============================================================================
// Content Extraction
// =============================================================================

/**
 * Extract readable text content from HTML
 */
export function extractTextContent(html: string): string {
  // Simple HTML to text conversion
  return html
    // Remove script and style tags
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove all tags
    .replace(/<[^>]+>/g, ' ')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract links from HTML
 */
export function extractLinks(html: string, baseUrl: string): Array<{
  href: string;
  text: string;
}> {
  const links: Array<{ href: string; text: string }> = [];
  const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const [_, href, text] = match;
    const cleanText = extractTextContent(text);

    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      try {
        const fullUrl = new URL(href, baseUrl).href;
        links.push({ href: fullUrl, text: cleanText });
      } catch {
        // Invalid URL, skip
      }
    }
  }

  return links;
}

/**
 * Extract images from HTML
 */
export function extractImages(html: string, baseUrl: string): Array<{
  src: string;
  alt: string;
}> {
  const images: Array<{ src: string; alt: string }> = [];
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;

  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const [_, src, alt] = match;

    if (src) {
      try {
        const fullUrl = new URL(src, baseUrl).href;
        images.push({ src: fullUrl, alt: alt || '' });
      } catch {
        // Invalid URL, skip
      }
    }
  }

  return images;
}

/**
 * Extract metadata from HTML
 */
export function extractMetadata(html: string): Record<string, string> {
  const metadata: Record<string, string> = {};

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    metadata.title = titleMatch[1].trim();
  }

  // Meta tags
  const metaRegex = /<meta[^>]*(?:name|property)=["']([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = metaRegex.exec(html)) !== null) {
    const [_, name, content] = match;
    metadata[name] = content;
  }

  return metadata;
}

// =============================================================================
// Action Validation
// =============================================================================

/**
 * Validate a browser action before execution
 */
export function validateBrowserAction(action: BrowserAction): {
  valid: boolean;
  error?: string;
} {
  switch (action.type) {
    case 'launch':
      // No validation needed
      return { valid: true };

    case 'navigate':
      if (!action.url) {
        return { valid: false, error: 'URL is required for navigate action' };
      }
      try {
        new URL(action.url);
        return { valid: true };
      } catch {
        return { valid: false, error: 'Invalid URL format' };
      }

    case 'click':
    case 'scroll':
      if (!action.selector) {
        return { valid: false, error: 'Selector is required for click/scroll action' };
      }
      return { valid: true };

    case 'type':
      if (!action.selector) {
        return { valid: false, error: 'Selector is required for type action' };
      }
      if (action.text === undefined) {
        return { valid: false, error: 'Text is required for type action' };
      }
      return { valid: true };

    case 'wait':
      if (!action.selector && !action.timeout) {
        return { valid: false, error: 'Either selector or timeout is required for wait action' };
      }
      return { valid: true };

    case 'screenshot':
    case 'get_content':
    case 'close':
      return { valid: true };

    default:
      return { valid: false, error: `Unknown action type: ${action.type}` };
  }
}

// =============================================================================
// Action Description
// =============================================================================

/**
 * Get human-readable description of a browser action
 */
export function describeBrowserAction(action: BrowserAction): string {
  switch (action.type) {
    case 'launch':
      return 'Launch browser';

    case 'navigate':
      return `Navigate to ${action.url}`;

    case 'click':
      return `Click on ${action.selector ? formatSelector(action.selector) : 'element'}`;

    case 'type':
      return `Type "${action.text}" into ${action.selector ? formatSelector(action.selector) : 'element'}`;

    case 'scroll':
      return `Scroll to ${action.selector ? formatSelector(action.selector) : 'element'}`;

    case 'screenshot':
      return 'Take screenshot';

    case 'get_content':
      return 'Get page content';

    case 'wait':
      if (action.selector) {
        return `Wait for ${formatSelector(action.selector)}`;
      }
      return `Wait ${action.timeout}ms`;

    case 'close':
      return 'Close browser';

    default:
      return `Unknown action: ${action.type}`;
  }
}

// =============================================================================
// UI Helpers
// =============================================================================

/**
 * Get state color for browser
 */
export function getBrowserStateColor(state: BrowserState): string {
  switch (state) {
    case 'ready':
      return 'text-green-500';
    case 'launching':
    case 'navigating':
    case 'executing':
      return 'text-yellow-500';
    case 'error':
      return 'text-red-500';
    case 'closed':
    case 'idle':
    default:
      return 'text-gray-500';
  }
}

/**
 * Get state icon for browser
 */
export function getBrowserStateIcon(state: BrowserState): string {
  switch (state) {
    case 'ready':
      return 'i-ph:check-circle-fill';
    case 'launching':
    case 'navigating':
    case 'executing':
      return 'i-ph:spinner animate-spin';
    case 'error':
      return 'i-ph:warning-circle-fill';
    case 'closed':
      return 'i-ph:x-circle';
    case 'idle':
    default:
      return 'i-ph:browser';
  }
}

/**
 * Get action icon
 */
export function getBrowserActionIcon(type: BrowserActionType): string {
  switch (type) {
    case 'launch':
      return 'i-ph:rocket';
    case 'navigate':
      return 'i-ph:globe';
    case 'click':
      return 'i-ph:cursor-click';
    case 'type':
      return 'i-ph:keyboard';
    case 'scroll':
      return 'i-ph:arrows-down-up';
    case 'screenshot':
      return 'i-ph:camera';
    case 'get_content':
      return 'i-ph:file-text';
    case 'wait':
      return 'i-ph:hourglass';
    case 'close':
      return 'i-ph:x';
    default:
      return 'i-ph:question';
  }
}
