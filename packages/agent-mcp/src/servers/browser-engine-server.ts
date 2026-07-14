import type { McpToolRouter } from '../host/tool-router';
import type { McpServerRegistration } from '../registry';

/**
 * `recoder.browser-use` — the MCP skin over the Browser engine (RECODER-ENGINES
 * E9 browser-use). Three tools: `browser.navigate` (open a URL → status/title/url),
 * `browser.extract` (extract a page's visible text) and `browser.screenshot`
 * (base64 PNG, optional/heavy).
 *
 * This is DISTINCT from the older `recoder.browser` server (open/snapshot/verify,
 * a puppeteer session an agent verifies its own work in). This one is the owned,
 * Phase-2-style engine: the package owns NO engine logic and assumes no backing
 * browser. The host (backend) injects a concrete `BrowserEnginePort` built
 * over `@recoder/agent-browser` (puppeteer, lazily imported; or a browser-use HTTP
 * service). Every handler degrades truthfully — the engine returns a
 * `not_configured` status (never throws, never fabricates) when no driver is wired.
 */
export const browserEngineMcpServer: McpServerRegistration = {
  serverId: 'recoder.browser-use',
  // `custom` keeps the runtime-agnostic package decoupled from the registry's
  // built-in kind union; the host still routes it through the interop gate.
  kind: 'custom',
  displayName: 'Recoder Browser (browser-use)',
  transport: 'http',
  enabled: true,
  toolNames: ['browser.navigate', 'browser.extract', 'browser.screenshot'],
  metadata: { engine: 'browser-use' },
};

/**
 * The host-injected browser engine. Structurally satisfied by
 * `@recoder/agent-browser`'s `BrowserEngine`; typed loosely (`unknown` results) so
 * this package needs no dependency on the engine implementation.
 */
export type BrowserEnginePort = {
  navigate(url: string): Promise<unknown>;
  extractText(url?: string): Promise<unknown>;
  screenshot(url?: string): Promise<unknown>;
};

export function registerBrowserEngineMcpTools(
  router: McpToolRouter,
  port: BrowserEnginePort,
): void {
  router.register(browserEngineMcpServer, 'browser.navigate', async (input) => {
    const url = readRequiredString(input.args.url, 'url');
    const result = await port.navigate(url);
    return { content: result, metadata: { engine: 'browser-use' } };
  });

  router.register(browserEngineMcpServer, 'browser.extract', async (input) => {
    const url = readString(input.args.url);
    const result = await port.extractText(url);
    return { content: result, metadata: { engine: 'browser-use' } };
  });

  router.register(browserEngineMcpServer, 'browser.screenshot', async (input) => {
    const url = readString(input.args.url);
    const result = await port.screenshot(url);
    return { content: result, metadata: { engine: 'browser-use' } };
  });
}

function readRequiredString(value: unknown, field: string): string {
  const result = readString(value);
  if (!result) {
    throw new Error(`${field} is required`);
  }
  return result;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
