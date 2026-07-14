/**
 * browser-use-engine — backend's concrete binding for the
 * `recoder.browser-use` MCP server. It composes the OWNED `@recoder/agent-browser`
 * engine over the default, degrade-safe driver (a lazily dynamic-imported
 * puppeteer, or a `browser-use` HTTP service when `BROWSER_USE_URL` is set), then
 * registers the package's real `browser.navigate` / `browser.extract` /
 * `browser.screenshot` handlers behind the interop gate.
 *
 * This is DISTINCT from `browser-engine.ts` (the older `recoder.browser`
 * open/snapshot/verify session server backed by browser-automation.ts). This is
 * the Phase-2-style owned engine mirror of `retrieval-engine.ts`.
 *
 * Nothing here fakes success. With no puppeteer installed and no `BROWSER_USE_URL`,
 * the default driver reports not-configured and every tool returns a truthful
 * `status: 'not_configured'` — the desktop boots and the tools stay callable with
 * zero external browser present.
 */
import { registerBrowserEngineMcpTools } from '@recoder/agent-mcp';
import { createBrowserEngine, createDefaultBrowserDriver } from '@recoder/agent-browser';
import type { McpToolRouter } from '@recoder/agent-mcp';
import type { BrowserDriver, BrowserEnv, BrowserFetch } from '@recoder/agent-browser';

export type BrowserUseEngineDeps = {
  /** Injectable driver (defaults to the env-selected default driver). */
  driver?: BrowserDriver;
  /** Injectable fetch for the HTTP `browser-use` driver (defaults to global fetch). */
  fetch?: BrowserFetch;
  /** Env subset read by the composition root. Defaults to process.env. */
  env?: BrowserEnv;
};

/**
 * Register the REAL browser handlers on the router. The driver comes from
 * `@recoder/agent-browser`'s composition root (`createDefaultBrowserDriver`): the
 * HTTP `browser-use` driver when `BROWSER_USE_URL` is set, else the lazily-imported
 * puppeteer driver — both degrade-safe to `not_configured`.
 */
export function registerBrowserUseMcpTools(
  router: McpToolRouter,
  deps: BrowserUseEngineDeps = {},
): void {
  const env = deps.env ?? (process.env as BrowserEnv);
  const driver =
    deps.driver ?? createDefaultBrowserDriver({ env, fetch: deps.fetch });
  const engine = createBrowserEngine({ driver });
  registerBrowserEngineMcpTools(router, engine);
}

export { browserEngineMcpServer } from '@recoder/agent-mcp';
