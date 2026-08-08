/**
 * Tests for the `recoder.browser-use.ext` MCP binder: the four deep tools are
 * registered on the router, their handlers parse args and call the injected port,
 * the `InvokeResult` is unwrapped onto the MCP envelope (a failure throws the real
 * reason), audit `requestedBy` is threaded from the authorized caller for the
 * side-effecting ops, boundary validation throws, and an unbound port (null) still
 * registers callable handlers that report unavailability instead of 404-ing.
 */
import { describe, it, expect } from 'vitest';
import { McpRegistry, McpToolRouter } from '@recoder/agent-mcp';
import { ok, fail, type InvokeResult } from '../types.js';
import type { BrowserExtPort } from '../adapters/sidecar/browser-ext.client.js';
import {
  browserExtMcpServer,
  browserExtEngineBinder,
  BROWSER_EXT_SERVER_ID,
} from './browser-ext-engine.js';

/** A spy port recording the last input per method, answering with a fixed result. */
function spyPort(result: InvokeResult<unknown> = ok({ done: true })) {
  const seen: Record<string, unknown> = {};
  const port: BrowserExtPort = {
    async extractStructured(input) {
      seen.extractStructured = input;
      return result;
    },
    async runTask(input) {
      seen.runTask = input;
      return result;
    },
    async screenshotAnnotate(input) {
      seen.screenshotAnnotate = input;
      return result;
    },
    async fillForm(input) {
      seen.fillForm = input;
      return result;
    },
  };
  return { port, seen };
}

function router(port: BrowserExtPort | null): McpToolRouter {
  const r = new McpToolRouter(new McpRegistry());
  browserExtEngineBinder(port)(r);
  return r;
}

function call(r: McpToolRouter, toolName: string, args: Record<string, unknown>, caller?: { userId: string }) {
  return r.call({
    server: browserExtMcpServer,
    toolName,
    actor: { agentId: 'agent-1' } as never,
    args,
    ...(caller ? { caller } : {}),
  } as never);
}

describe('browserExtMcpServer descriptor', () => {
  it('advertises the four deep tools under the ext server id', () => {
    expect(browserExtMcpServer.serverId).toBe(BROWSER_EXT_SERVER_ID);
    expect(browserExtMcpServer.toolNames).toEqual([
      'browser.extract_structured',
      'browser.run_task',
      'browser.screenshot_annotate',
      'browser.fill_form',
    ]);
  });
});

describe('deep tool handlers', () => {
  it('extract_structured parses url + fields and returns the value envelope', async () => {
    const { port, seen } = spyPort(ok({ data: { t: 'Hi' } }));
    const res = await call(router(port), 'browser.extract_structured', {
      url: 'https://x',
      fields: { t: 'h1' },
    });
    expect(seen.extractStructured).toEqual({ url: 'https://x', fields: { t: 'h1' } });
    expect(res.content).toEqual({ data: { t: 'Hi' } });
    expect(res.metadata).toMatchObject({ engine: 'browser-use', tool: 'browser.extract_structured' });
  });

  it('run_task threads maxSteps + the authorized caller as requestedBy', async () => {
    const { port, seen } = spyPort(ok({ done: true }));
    const res = await call(
      router(port),
      'browser.run_task',
      { task: 'summarize', max_steps: 7 },
      { userId: 'user-42' },
    );
    expect(seen.runTask).toEqual({ task: 'summarize', maxSteps: 7 });
    expect(res.metadata).toMatchObject({ requestedBy: 'user-42' });
  });

  it('run_task falls back to actor.agentId when no edge caller is bound', async () => {
    const { port } = spyPort(ok({ done: true }));
    const res = await call(router(port), 'browser.run_task', { task: 'x' });
    expect(res.metadata).toMatchObject({ requestedBy: 'agent-1' });
  });

  it('fill_form parses the fields array and optional submit', async () => {
    const { port, seen } = spyPort(ok({ submitted: true }));
    await call(router(port), 'browser.fill_form', {
      url: 'https://x',
      fields: [{ selector: '#q', value: 'hi', type: 'text' }],
      submit: '#go',
    });
    expect(seen.fillForm).toEqual({
      url: 'https://x',
      fields: [{ selector: '#q', value: 'hi', type: 'text' }],
      submit: '#go',
    });
  });

  it('screenshot_annotate maps full_page + max_elements', async () => {
    const { port, seen } = spyPort(ok({ annotations: [] }));
    await call(router(port), 'browser.screenshot_annotate', {
      url: 'https://x',
      full_page: true,
      max_elements: 5,
    });
    expect(seen.screenshotAnnotate).toEqual({ url: 'https://x', fullPage: true, maxElements: 5 });
  });
});

describe('truthful degrade + validation', () => {
  it('throws the real reason when the port returns a failure', async () => {
    const { port } = spyPort(fail('no live sidecar', 'unavailable'));
    await expect(call(router(port), 'browser.run_task', { task: 'x' })).rejects.toThrow(/no live sidecar/);
  });

  it('throws a truthful "not bound" when the port is null (no 404)', async () => {
    await expect(
      call(router(null), 'browser.extract_structured', { url: 'https://x', fields: { t: 'h1' } }),
    ).rejects.toThrow(/not bound/);
  });

  it('rejects extract_structured without fields at the boundary', async () => {
    const { port } = spyPort();
    await expect(call(router(port), 'browser.extract_structured', { url: 'https://x' })).rejects.toThrow(
      /args\.fields/,
    );
  });

  it('rejects fill_form when a field is missing a selector', async () => {
    const { port } = spyPort();
    await expect(
      call(router(port), 'browser.fill_form', { url: 'https://x', fields: [{ value: 'v' }] }),
    ).rejects.toThrow(/selector/);
  });
});

describe('deep tool handlers — SSRF guard on caller URLs (recoder-qfmh)', () => {
  const BLOCKED = [
    'http://169.254.169.254/latest/meta-data/', // cloud metadata
    'http://127.0.0.1:5432',                     // loopback
    'http://10.0.0.1/',                          // private
    'http://192.168.1.1/',                       // private
    'file:///etc/passwd',                        // non-http scheme
  ];

  for (const url of BLOCKED) {
    it(`extract_structured refuses an SSRF target and never forwards it: ${url}`, async () => {
      const { port, seen } = spyPort(ok({ data: {} }));
      await expect(call(router(port), 'browser.extract_structured', { url, fields: { t: 'h1' } })).rejects.toThrow();
      expect(seen.extractStructured).toBeUndefined();
    });
  }

  it('screenshot_annotate and fill_form also refuse a private/localhost URL', async () => {
    const { port } = spyPort(ok({ data: {} }));
    await expect(call(router(port), 'browser.screenshot_annotate', { url: 'http://192.168.0.5/' })).rejects.toThrow();
    await expect(
      call(router(port), 'browser.fill_form', { url: 'http://localhost/', fields: [{ selector: '#a', value: 'x' }] }),
    ).rejects.toThrow();
  });

  it('a PUBLIC url still passes through to the port', async () => {
    const { port, seen } = spyPort(ok({ data: { ok: true } }));
    await call(router(port), 'browser.extract_structured', { url: 'https://example.com/', fields: { t: 'h1' } });
    expect(seen.extractStructured?.url).toBe('https://example.com/');
  });
});
