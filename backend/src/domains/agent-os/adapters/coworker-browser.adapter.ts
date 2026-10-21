/**
 * `coworker-browser.adapter.ts` — the Coworker's browser tool, composed over the
 * SAME owned `@recoder/agent-browser` engine + SSRF egress guard the
 * `engines/browser-use-engine.ts` MCP skin uses (`guardBrowserDriver` +
 * `parseAllowedDomains`), so a coworker action cannot reach loopback, RFC-1918,
 * or cloud-metadata space any more than the existing browser-use tool can.
 *
 * Deliberate reuse, not parallel plumbing: this file wires no new browser
 * backend. With no `puppeteer` installed and no `BROWSER_USE_URL` configured it
 * degrades to a truthful `not_configured` result — never a throw, never a
 * fabricated page — exactly like the rest of the browser surface.
 */
import { lookup } from 'node:dns/promises';
import { createBrowserEngine, createDefaultBrowserDriver } from '@recoder/agent-browser';
import type { BrowserEngine, BrowserEnv } from '@recoder/agent-browser';
import type { HostResolver } from '../../../shared/egress-guard.js';
import { guardBrowserDriver, parseAllowedDomains } from '../../engines/browser-guard.js';

const dnsResolver: HostResolver = async (host) => {
  const records = await lookup(host, { all: true });
  return records.map((r) => r.address);
};

/** Build the Coworker's guarded browser tool. One instance is shared per process. */
export function createCoworkerBrowserEngine(env: BrowserEnv = process.env as BrowserEnv): BrowserEngine {
  const driver = createDefaultBrowserDriver({ env });
  const guarded = guardBrowserDriver(driver, {
    allowedDomains: parseAllowedDomains(env),
    resolve: dnsResolver,
  });
  return createBrowserEngine({ driver: guarded });
}
