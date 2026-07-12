/**
 * browser-engine — the concrete executor behind the `recoder.browser` MCP
 * server. Gives an AGENT a real browser so it can VERIFY its own work: open a
 * page, snapshot its text, and assert content is present. Backed by the
 * puppeteer automation already in docker-backend (browser-automation.ts). Runs
 * behind the interop gate like every capability.
 *
 * Session-keyed per agent (open → snapshot → verify reuse the same page).
 * Degrade-safe: the underlying automation returns a truthful error (e.g. no
 * browser installed / launch failed) which is surfaced, never a fake result.
 * Screenshots (base64) are NOT returned inline — too large for a text tool; the
 * snapshot notes one was captured and returns the page's extracted text.
 */
import { browserMcpServer } from '@recoder/agent-mcp';
import type { McpToolRouter, McpToolCallInput } from '@recoder/agent-mcp';
import {
  browserLaunch,
  browserExtract,
  browserClose,
  type BrowserActionResult,
} from '../../browser-automation.js';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** A stable per-agent browser session key (so a turn's calls share the page). */
function sessionKey(input: McpToolCallInput): string {
  const agent = input.actor?.agentId || 'agent';
  const task = input.task?.taskId || 'session';
  return `mcp-browser:${agent}:${task}`;
}

/** Deps injectable for testing without launching a real browser. */
export interface BrowserEngineDeps {
  launch: typeof browserLaunch;
  extract: typeof browserExtract;
  close: typeof browserClose;
}

const realDeps: BrowserEngineDeps = {
  launch: browserLaunch,
  extract: browserExtract,
  close: browserClose,
};

function ensureOk(r: BrowserActionResult): BrowserActionResult {
  if (!r.success) throw new Error(r.error || 'browser action failed');
  return r;
}

export function registerBrowserMcpTools(
  router: McpToolRouter,
  deps: BrowserEngineDeps = realDeps,
): void {
  router.register(browserMcpServer, 'browser.open', async (input) => {
    const url = str(input.args.url);
    if (!url) throw new Error('url is required');
    const r = ensureOk(await deps.launch(sessionKey(input), url));
    return { content: { url: r.currentUrl ?? url, opened: true, screenshotCaptured: Boolean(r.screenshot) } };
  });

  router.register(browserMcpServer, 'browser.snapshot', async (input) => {
    const selector = str(input.args.selector) ?? 'body';
    const r = ensureOk(await deps.extract(sessionKey(input), selector));
    const text = (r.extractedContent ?? '').slice(0, 20_000);
    return {
      content: {
        selector,
        text,
        truncated: (r.extractedContent ?? '').length > 20_000,
        screenshotCaptured: Boolean(r.screenshot),
        currentUrl: r.currentUrl,
      },
    };
  });

  router.register(browserMcpServer, 'browser.verify', async (input) => {
    const contains = str(input.args.contains) ?? str(input.args.text);
    if (!contains) throw new Error('`contains` (text to assert) is required');
    const selector = str(input.args.selector) ?? 'body';
    const r = ensureOk(await deps.extract(sessionKey(input), selector));
    const haystack = r.extractedContent ?? '';
    const present = haystack.includes(contains);
    return { content: { contains, present, currentUrl: r.currentUrl } };
  });
}
