/**
 * browser-engine — open / snapshot / verify, driven with injected browser deps
 * (no real puppeteer launch needed).
 */
import { describe, expect, it, vi } from 'vitest';
import { McpRegistry, McpToolRouter, browserMcpServer } from '@recoder/agent-mcp';
import type { AgentProfile } from '@recoder/agent-os';
import { registerBrowserMcpTools, type BrowserEngineDeps } from './browser-engine';

const actor = { agentId: 'a', permissions: { toolRules: [] } } as unknown as AgentProfile;

function router(deps: Partial<BrowserEngineDeps>): McpToolRouter {
  const full: BrowserEngineDeps = {
    launch: vi.fn(async () => ({ success: true, currentUrl: 'https://x/', screenshot: 'data:...' })),
    extract: vi.fn(async () => ({ success: true, extractedContent: 'Hello Recoder', currentUrl: 'https://x/' })),
    close: vi.fn(async () => ({ success: true })),
    ...deps,
  } as BrowserEngineDeps;
  const r = new McpToolRouter(new McpRegistry());
  registerBrowserMcpTools(r, full);
  return r;
}

describe('registerBrowserMcpTools', () => {
  it('browser.open navigates and reports the loaded url', async () => {
    const launch = vi.fn(async () => ({ success: true, currentUrl: 'https://site/', screenshot: 'data:x' }));
    const r = router({ launch });
    const out = await r.call({ server: browserMcpServer, toolName: 'browser.open', actor, args: { url: 'https://site/' } });
    expect((out.content as { opened: boolean }).opened).toBe(true);
    expect((out.content as { url: string }).url).toBe('https://site/');
    expect(launch).toHaveBeenCalledOnce();
  });

  it('browser.open requires a url', async () => {
    const r = router({});
    await expect(
      r.call({ server: browserMcpServer, toolName: 'browser.open', actor, args: {} }),
    ).rejects.toThrow(/url is required/i);
  });

  it('browser.snapshot returns the extracted page text', async () => {
    const r = router({ extract: vi.fn(async () => ({ success: true, extractedContent: 'the page body' })) });
    const out = await r.call({ server: browserMcpServer, toolName: 'browser.snapshot', actor, args: {} });
    expect((out.content as { text: string }).text).toBe('the page body');
  });

  it('browser.verify asserts content presence truthfully', async () => {
    const r = router({ extract: vi.fn(async () => ({ success: true, extractedContent: 'Order #123 confirmed' })) });
    const yes = await r.call({ server: browserMcpServer, toolName: 'browser.verify', actor, args: { contains: 'confirmed' } });
    expect((yes.content as { present: boolean }).present).toBe(true);
    const no = await r.call({ server: browserMcpServer, toolName: 'browser.verify', actor, args: { contains: 'error' } });
    expect((no.content as { present: boolean }).present).toBe(false);
  });

  it('surfaces the automation error truthfully (degrade-safe)', async () => {
    const r = router({ launch: vi.fn(async () => ({ success: false, error: 'no browser installed' })) });
    await expect(
      r.call({ server: browserMcpServer, toolName: 'browser.open', actor, args: { url: 'https://x/' } }),
    ).rejects.toThrow(/no browser installed/i);
  });
});
