/**
 * Binding tests for the `recoder.browser` MCP binder — the fix for the
 * "browser.open/snapshot/verify advertised in the catalog but 404 on call" gap:
 *  - COVERAGE: the binder registers a handler for EVERY tool the catalog
 *    advertises on `recoder.browser` (verified through the real
 *    `assertWiringComplete` guard, the same one that runs at boot).
 *  - EXECUTION: an authorized call through a real `McpToolRouter` reaches the
 *    (mocked) browser-use sidecar client; a down sidecar surfaces a truthful
 *    error / degraded verify result, never a fabricated page.
 */
import { describe, it, expect } from 'vitest';
import {
  McpRegistry,
  McpToolRouter,
  browserMcpServer,
  type McpServerRegistration,
  type McpToolCallInput,
} from '@recoder/agent-mcp';
import type { BrowserVerificationResult } from '@recoder/browser-verification';
import { assertWiringComplete } from '../../mcp/engine-registry.js';
import type { EngineCall, EngineClientPort } from '../../ports/engine-client.port.js';
import { fail, ok, up, type InvokeResult } from '../../types.js';
import { browserSessionEngineBinder } from './browser-session.binder.js';

type OpHandler = (input: Record<string, unknown>) => InvokeResult<unknown>;

function fakeClient(handlers: Partial<Record<'navigate' | 'extract' | 'screenshot', OpHandler>>): EngineClientPort {
  return {
    id: 'browser-use',
    transport: 'sidecar',
    async start() {},
    async stop() {},
    async invoke(call: EngineCall<unknown>) {
      const handler = handlers[call.op as 'navigate' | 'extract' | 'screenshot'];
      if (!handler) return fail(`no handler for op '${call.op}'`);
      return handler((call.input ?? {}) as Record<string, unknown>);
    },
    async health() {
      return up('browser-use', 'sidecar');
    },
  };
}

const healthySidecar = fakeClient({
  navigate: (input) => ok({ status: 'ok', url: String(input.url), title: 'Example', driver: 'http' }),
  extract: () => ok({ status: 'ok', text: 'deploy succeeded', driver: 'http' }),
  screenshot: () => ok({ status: 'ok', imageBase64: 'aGk=', driver: 'http' }),
});

const downSidecar = fakeClient({
  navigate: () => fail('no BROWSER_USE_URL sidecar and puppeteer not installed', 'unavailable'),
  extract: () => fail('no BROWSER_USE_URL sidecar and puppeteer not installed', 'unavailable'),
  screenshot: () => fail('no BROWSER_USE_URL sidecar and puppeteer not installed', 'unavailable'),
});

function call(server: McpServerRegistration, toolName: string, args: Record<string, unknown>): McpToolCallInput {
  return { server, toolName, actor: { agentId: 'test-agent' }, args } as unknown as McpToolCallInput;
}

function router(client: EngineClientPort | null): McpToolRouter {
  const built = new McpToolRouter(new McpRegistry());
  browserSessionEngineBinder(client)(built);
  return built;
}

describe('binder coverage (the boot wiring guard passes for recoder.browser)', () => {
  it('registers a handler for every advertised browser.* tool', () => {
    const keys = new Set<string>();
    const capture = {
      register: (server: McpServerRegistration, toolName: string) => {
        keys.add(`${server.serverId}:${toolName}`);
      },
    } as unknown as McpToolRouter;

    browserSessionEngineBinder(healthySidecar)(capture);

    // The SAME guard the host runs at boot: no missing server, no missing tool.
    expect(() =>
      assertWiringComplete({
        inProcServers: [browserMcpServer],
        engineServers: [browserMcpServer],
        handlerKeys: keys,
      }),
    ).not.toThrow();
  });
});

describe('browser.open', () => {
  it('navigates over the mocked sidecar and returns the page result', async () => {
    const result = await router(healthySidecar).call(
      call(browserMcpServer, 'browser.open', { url: 'https://example.com' }),
    );
    expect(result.content).toMatchObject({ status: 'ok', url: 'https://example.com', title: 'Example' });
    expect(result.metadata).toMatchObject({ engine: 'browser-use', tool: 'browser.open' });
  });

  it('surfaces the sidecar-down reason truthfully (no fabricated page)', async () => {
    await expect(
      router(downSidecar).call(call(browserMcpServer, 'browser.open', { url: 'https://example.com' })),
    ).rejects.toThrow(/browser\.open failed: no BROWSER_USE_URL sidecar/);
  });

  it('rejects a missing url at the boundary', async () => {
    await expect(
      router(healthySidecar).call(call(browserMcpServer, 'browser.open', {})),
    ).rejects.toThrow(/requires args\.url/);
  });
});

describe('browser.snapshot', () => {
  it('captures a screenshot over the mocked sidecar', async () => {
    const result = await router(healthySidecar).call(
      call(browserMcpServer, 'browser.snapshot', { url: 'https://example.com' }),
    );
    expect(result.content).toMatchObject({ status: 'ok', imageBase64: 'aGk=' });
    expect(result.metadata).toMatchObject({ engine: 'browser-use', tool: 'browser.snapshot' });
  });

  it('surfaces the sidecar-down reason truthfully', async () => {
    await expect(
      router(downSidecar).call(call(browserMcpServer, 'browser.snapshot', { url: 'https://example.com' })),
    ).rejects.toThrow(/browser\.snapshot failed/);
  });
});

describe('browser.verify', () => {
  it('runs the verification executor: navigate + assert + evidence artifacts', async () => {
    const result = await router(healthySidecar).call(
      call(browserMcpServer, 'browser.verify', {
        url: 'https://example.com',
        taskId: 'task-9',
        expectText: 'deploy succeeded',
      }),
    );
    const content = result.content as BrowserVerificationResult;
    expect(content.status).toBe('passed');
    expect(content.taskId).toBe('task-9');
    expect(content.artifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining(['screenshot', 'verification_summary']),
    );
    expect(result.metadata).toMatchObject({ status: 'passed', degraded: false });
  });

  it('supports structured assertions and fails truthfully on a wrong page', async () => {
    const result = await router(healthySidecar).call(
      call(browserMcpServer, 'browser.verify', {
        url: 'https://example.com',
        assertions: [{ expected: 'not on the page', target: 'hero heading' }],
      }),
    );
    const content = result.content as BrowserVerificationResult;
    expect(content.status).toBe('failed');
    expect(result.metadata).toMatchObject({ status: 'failed' });
  });

  it('resolves to a degraded skipped result when the sidecar is down (never a fake verdict)', async () => {
    const result = await router(downSidecar).call(
      call(browserMcpServer, 'browser.verify', { url: 'https://example.com', expectText: 'anything' }),
    );
    const content = result.content as BrowserVerificationResult;
    expect(content.status).toBe('skipped');
    expect(content.checks.every((check) => check.status === 'skipped')).toBe(true);
    expect(result.metadata).toMatchObject({ status: 'skipped', degraded: true });
    expect(String(result.metadata?.reason)).toContain('no BROWSER_USE_URL sidecar');
  });

  it('boundary-validates malformed assertions', async () => {
    await expect(
      router(healthySidecar).call(
        call(browserMcpServer, 'browser.verify', { url: 'https://example.com', assertions: [{}] }),
      ),
    ).rejects.toThrow(/requires a non-empty string `expected`/);
  });
});

describe('unbound engine', () => {
  it('throws a truthful not-bound error instead of a silent 404', async () => {
    await expect(
      router(null).call(call(browserMcpServer, 'browser.open', { url: 'https://example.com' })),
    ).rejects.toThrow(/browser-use engine not bound/);
  });
});
