/**
 * browser-guard tests — the SSRF/allowlist trust boundary on the browser driver
 * (W8-D2). A fake driver + fake resolver prove, with zero network:
 *  - EGRESS: loopback / metadata / private-range targets never reach the inner
 *    driver; the thrown reason is truthful (the engine maps it to
 *    `status: 'error'`, never a fabricated page).
 *  - DNS REBIND: a public-looking hostname that resolves into private space is
 *    blocked via the injected resolver (assertEgressAllowedResolved path).
 *  - ALLOWLIST: `BROWSER_ALLOWED_DOMAINS` restricts hosts to exact or
 *    '.'-boundary subdomain matches — 'evil-recoder.xyz' must NOT match
 *    'recoder.xyz'. Absent/empty allowlist ⇒ egress guard only.
 *  - DEGRADE CONTRACT INTACT: an inner BrowserNotConfiguredError still
 *    propagates unchanged; URL-less calls (current page) pass through untouched.
 */
import { describe, it, expect } from 'vitest';
import {
  McpRegistry,
  McpToolRouter,
  type McpToolCallInput,
} from '@recoder/agent-mcp';
import { BrowserNotConfiguredError } from '@recoder/agent-browser';
import type { BrowserDriver, BrowserEnv } from '@recoder/agent-browser';
import type { HostResolver } from '../../shared/egress-guard.js';
import { guardBrowserDriver, parseAllowedDomains } from './browser-guard.js';
import { browserEngineMcpServer, registerBrowserUseMcpTools } from './browser-use-engine.js';

type DriverCall = { method: 'navigate' | 'extractText' | 'screenshot'; url?: string };

/** A fake driver that records every call and never touches a network. */
function fakeDriver(): { driver: BrowserDriver; calls: DriverCall[] } {
  const calls: DriverCall[] = [];
  return {
    calls,
    driver: {
      kind: 'fake',
      async navigate(url: string) {
        calls.push({ method: 'navigate', url });
        return { url, title: 'fake page' };
      },
      async extractText(url?: string) {
        calls.push({ method: 'extractText', ...(url === undefined ? {} : { url }) });
        return { text: 'fake text' };
      },
      async screenshot(url?: string) {
        calls.push({ method: 'screenshot', ...(url === undefined ? {} : { url }) });
        return { imageBase64: 'ZmFrZQ==' };
      },
    },
  };
}

/** A fake resolver over a fixed host→addresses table (no DNS, ever). */
function fakeResolver(table: Record<string, string[]>): HostResolver {
  return async (host: string) => table[host] ?? [];
}

describe('guardBrowserDriver — egress guard (always on)', () => {
  it('blocks navigate to the cloud metadata address without calling the inner driver', async () => {
    const { driver, calls } = fakeDriver();
    const guarded = guardBrowserDriver(driver, {});

    await expect(guarded.navigate('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /egress blocked.*metadata/,
    );
    expect(calls).toEqual([]);
  });

  it('blocks navigate to loopback and RFC-1918 targets', async () => {
    const { driver, calls } = fakeDriver();
    const guarded = guardBrowserDriver(driver, {});

    await expect(guarded.navigate('http://127.0.0.1:3100')).rejects.toThrow(/egress blocked.*loopback/);
    await expect(guarded.navigate('http://10.0.0.5')).rejects.toThrow(/egress blocked.*private/);
    expect(calls).toEqual([]);
  });

  it('blocks a public hostname whose resolution is private (DNS-rebind path)', async () => {
    const { driver, calls } = fakeDriver();
    const guarded = guardBrowserDriver(driver, {
      resolve: fakeResolver({ 'rebind.example.com': ['10.0.0.5'] }),
    });

    await expect(guarded.navigate('https://rebind.example.com/')).rejects.toThrow(
      /egress blocked.*resolves to blocked address 10\.0\.0\.5/,
    );
    expect(calls).toEqual([]);
  });

  it('passes a public URL through to the inner driver when no allowlist is configured', async () => {
    const { driver, calls } = fakeDriver();
    const guarded = guardBrowserDriver(driver, {
      resolve: fakeResolver({ 'example.com': ['93.184.216.34'] }),
    });

    const nav = await guarded.navigate('https://example.com/page');
    expect(nav).toEqual({ url: 'https://example.com/page', title: 'fake page' });
    expect(calls).toEqual([{ method: 'navigate', url: 'https://example.com/page' }]);
  });

  it('preserves the inner driver kind', () => {
    const { driver } = fakeDriver();
    expect(guardBrowserDriver(driver, {}).kind).toBe('fake');
  });
});

describe('guardBrowserDriver — domain allowlist', () => {
  const resolve = fakeResolver({
    'recoder.xyz': ['93.184.216.34'],
    'app.recoder.xyz': ['93.184.216.34'],
    'evil.com': ['93.184.216.34'],
    'evil-recoder.xyz': ['93.184.216.34'],
  });

  it('allows an exact allowlisted host and its subdomains', async () => {
    const { driver, calls } = fakeDriver();
    const guarded = guardBrowserDriver(driver, { allowedDomains: ['recoder.xyz'], resolve });

    await guarded.navigate('https://recoder.xyz/x');
    await guarded.navigate('https://app.recoder.xyz/y');
    expect(calls).toEqual([
      { method: 'navigate', url: 'https://recoder.xyz/x' },
      { method: 'navigate', url: 'https://app.recoder.xyz/y' },
    ]);
  });

  it('blocks hosts outside the allowlist — including suffix look-alikes', async () => {
    const { driver, calls } = fakeDriver();
    const guarded = guardBrowserDriver(driver, { allowedDomains: ['recoder.xyz'], resolve });

    await expect(guarded.navigate('https://evil.com/')).rejects.toThrow(/domain/);
    // '.'-boundary matters: 'evil-recoder.xyz' is NOT a subdomain of 'recoder.xyz'.
    await expect(guarded.navigate('https://evil-recoder.xyz/')).rejects.toThrow(/domain/);
    expect(calls).toEqual([]);
  });
});

describe('guardBrowserDriver — degrade contract + URL-less calls', () => {
  it('propagates an inner BrowserNotConfiguredError unchanged', async () => {
    const inner: BrowserDriver = {
      kind: 'none',
      async navigate() {
        throw new BrowserNotConfiguredError('no puppeteer installed');
      },
      async extractText() {
        throw new BrowserNotConfiguredError('no puppeteer installed');
      },
      async screenshot() {
        throw new BrowserNotConfiguredError('no puppeteer installed');
      },
    };
    const guarded = guardBrowserDriver(inner, {
      resolve: fakeResolver({ 'example.com': ['93.184.216.34'] }),
    });

    await expect(guarded.navigate('https://example.com/')).rejects.toBeInstanceOf(
      BrowserNotConfiguredError,
    );
  });

  it('passes URL-less extractText/screenshot through untouched (current page)', async () => {
    const { driver, calls } = fakeDriver();
    const guarded = guardBrowserDriver(driver, { allowedDomains: ['recoder.xyz'] });

    await guarded.extractText();
    await guarded.screenshot();
    expect(calls).toEqual([{ method: 'extractText' }, { method: 'screenshot' }]);
  });

  it('refuses extractText/screenshot given a blocked URL', async () => {
    const { driver, calls } = fakeDriver();
    const guarded = guardBrowserDriver(driver, {});

    await expect(guarded.extractText('http://169.254.169.254/')).rejects.toThrow(/egress blocked/);
    await expect(guarded.screenshot('http://127.0.0.1/')).rejects.toThrow(/egress blocked/);
    expect(calls).toEqual([]);
  });
});

describe('parseAllowedDomains', () => {
  it('returns undefined for absent/empty/whitespace values', () => {
    expect(parseAllowedDomains(undefined)).toBeUndefined();
    expect(parseAllowedDomains({} as BrowserEnv)).toBeUndefined();
    expect(parseAllowedDomains({ BROWSER_ALLOWED_DOMAINS: '' } as BrowserEnv)).toBeUndefined();
    expect(parseAllowedDomains({ BROWSER_ALLOWED_DOMAINS: '   ' } as BrowserEnv)).toBeUndefined();
  });

  it('splits on commas, trims, and lowercases', () => {
    expect(parseAllowedDomains({ BROWSER_ALLOWED_DOMAINS: 'A.com, b.io' } as BrowserEnv)).toEqual([
      'a.com',
      'b.io',
    ]);
  });
});

describe('registerBrowserUseMcpTools — guard wired through the real engine mapping', () => {
  function call(toolName: string, args: Record<string, unknown>): McpToolCallInput {
    return {
      server: browserEngineMcpServer,
      toolName,
      actor: { agentId: 'test-agent' },
      args,
    } as unknown as McpToolCallInput;
  }

  it('surfaces a blocked navigate as a truthful { status: "error", reason }', async () => {
    const { driver, calls } = fakeDriver();
    const router = new McpToolRouter(new McpRegistry());
    registerBrowserUseMcpTools(router, { driver, env: {} });

    const result = await router.call(call('browser.navigate', { url: 'http://169.254.169.254/' }));
    expect(result.content).toMatchObject({
      status: 'error',
      reason: expect.stringMatching(/egress blocked.*metadata/),
    });
    expect(calls).toEqual([]);
  });

  it('honors BROWSER_ALLOWED_DOMAINS from env on the injected driver too', async () => {
    const { driver, calls } = fakeDriver();
    const router = new McpToolRouter(new McpRegistry());
    registerBrowserUseMcpTools(router, {
      driver,
      env: { BROWSER_ALLOWED_DOMAINS: 'recoder.xyz' } as BrowserEnv,
    });

    // Literal public IP: no DNS needed, blocked purely by the allowlist.
    const result = await router.call(call('browser.navigate', { url: 'http://93.184.216.34/' }));
    expect(result.content).toMatchObject({
      status: 'error',
      reason: expect.stringMatching(/domain/),
    });
    expect(calls).toEqual([]);
  });
});
